/**
 * Enhanced Generation Pipeline
 *
 * Orchestrates the full flow for a single playlist:
 * 1. Fetch tracks from Spotify
 * 2. Fetch lyrics (parallel, non-blocking)
 * 3. Extract tiered objects via LLM
 * 4. Collision-aware convergence via LLM
 * 5. Generate image via Replicate
 * 6. Archive to R2
 * 7. Compress + upload to Spotify
 * 8. Persist analysis report, generation, and claimed object
 */

import type { DbClaimedObject, DbStyle, GenerationResult } from "@disc/shared";
import { convergeAndSelect, detectChanges, extractThemes } from "./extraction";
import { compressForSpotify } from "./image";
import { fetchLyricsBatch } from "./lyrics";
import { generateImage } from "./replicate";
import { fetchPlaylistTracks, uploadPlaylistCover } from "./spotify";

interface PlaylistRow {
	id: string;
	spotify_playlist_id: string;
	name: string;
	user_id: string;
}

export interface PipelineEnv {
	DB: D1Database;
	IMAGES: R2Bucket;
	REPLICATE_API_TOKEN: string;
	OPENAI_API_KEY: string;
}

/**
 * Generates cover art for a single playlist using the enhanced pipeline.
 */
export async function generateForPlaylist(
	playlist: PlaylistRow,
	style: DbStyle,
	accessToken: string,
	env: PipelineEnv,
): Promise<GenerationResult> {
	const generationId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
	const analysisId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
	const startTime = Date.now();

	try {
		// ── Step 1: Create generation record ──
		await env.DB.prepare(
			`INSERT INTO generations (id, user_id, playlist_id, style_id, symbolic_object, dall_e_prompt, status, trigger_type, created_at)
			 VALUES (?, ?, ?, ?, '', '', 'processing', 'cron', datetime('now'))`,
		)
			.bind(generationId, playlist.user_id, playlist.id, style.id)
			.run();

		// ── Step 2: Fetch playlist tracks ──
		console.log(`[Pipeline] Fetching tracks for "${playlist.name}"`);
		const tracks = await fetchPlaylistTracks(
			playlist.spotify_playlist_id,
			accessToken,
		);
		console.log(`[Pipeline] Got ${tracks.length} tracks`);

		if (tracks.length === 0) {
			throw new Error("Playlist has no tracks");
		}

		// ── Step 3: Check for previous analysis (change detection) ──
		const previousAnalysis = await env.DB.prepare(
			`SELECT track_snapshot FROM playlist_analyses
			 WHERE playlist_id = ? ORDER BY created_at DESC LIMIT 1`,
		)
			.bind(playlist.id)
			.first<{ track_snapshot: string }>();

		let changeDetection = null;
		if (previousAnalysis) {
			const previousTracks = JSON.parse(
				previousAnalysis.track_snapshot,
			) as Array<{ name: string; artist: string }>;
			changeDetection = detectChanges(tracks, previousTracks);
			console.log(
				`[Pipeline] Change detection: ${changeDetection.outlierCount} new tracks, threshold ${(changeDetection.threshold * 100).toFixed(0)}%, regen=${changeDetection.shouldRegenerate}`,
			);
		}

		// ── Step 4: Fetch lyrics (parallel, non-blocking failures) ──
		console.log("[Pipeline] Fetching lyrics...");
		const lyricsResults = await fetchLyricsBatch(tracks);
		const lyricsFoundCount = lyricsResults.filter((r) => r.found).length;
		console.log(
			`[Pipeline] Lyrics found for ${lyricsFoundCount}/${tracks.length} tracks`,
		);

		// ── Step 5: Extract tiered objects via LLM ──
		console.log("[Pipeline] Extracting themes...");
		const tracksWithLyrics = tracks.map((t, i) => ({
			...t,
			lyrics: lyricsResults[i].lyrics,
			lyricsFound: lyricsResults[i].found,
		}));

		const {
			extractions,
			inputTokens: extractTokensIn,
			outputTokens: extractTokensOut,
		} = await extractThemes(tracksWithLyrics, env.OPENAI_API_KEY);
		console.log(
			`[Pipeline] Extracted objects for ${extractions.length} tracks (${extractTokensIn}+${extractTokensOut} tokens)`,
		);

		// ── Step 6: Load claimed objects for collision detection ──
		const claimedResult = await env.DB.prepare(
			`SELECT id, user_id, playlist_id, object_name, aesthetic_context, source_generation_id, superseded_at, created_at
			 FROM claimed_objects
			 WHERE user_id = ? AND playlist_id != ? AND superseded_at IS NULL`,
		)
			.bind(playlist.user_id, playlist.id)
			.all<DbClaimedObject>();

		const exclusions = claimedResult.results;
		console.log(`[Pipeline] ${exclusions.length} claimed objects to avoid`);

		// ── Step 7: Convergence + selection ──
		console.log("[Pipeline] Running convergence...");
		const {
			result: convergence,
			inputTokens: convTokensIn,
			outputTokens: convTokensOut,
		} = await convergeAndSelect(
			playlist.name,
			extractions,
			exclusions,
			env.OPENAI_API_KEY,
		);

		const selected = convergence.candidates[convergence.selectedIndex];
		if (!selected) {
			throw new Error("Convergence returned no candidates");
		}

		console.log(
			`[Pipeline] Selected: "${selected.object}" — ${selected.aestheticContext.slice(0, 80)}...`,
		);
		console.log(
			`[Pipeline] LLM tokens: extract=${extractTokensIn}+${extractTokensOut}, converge=${convTokensIn}+${convTokensOut}`,
		);

		// ── Step 8: Build enriched prompt and generate image ──
		const subject = `${selected.object}, ${selected.aestheticContext}`;
		console.log(
			`[Pipeline] Generating image for "${playlist.name}" with style "${style.name}"`,
		);
		const { imageUrl, predictionId, prompt } = await generateImage(
			style,
			subject,
			env.REPLICATE_API_TOKEN,
		);

		// ── Step 9: Download generated image ──
		const imageResponse = await fetch(imageUrl);
		if (!imageResponse.ok) {
			throw new Error(
				`Failed to download Replicate output: ${imageResponse.status}`,
			);
		}
		const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());

		// ── Step 10: Archive to R2 ──
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const r2Key = `generations/${playlist.user_id}/${playlist.spotify_playlist_id}/${timestamp}.png`;
		await env.IMAGES.put(r2Key, imageBytes, {
			httpMetadata: { contentType: "image/png" },
			customMetadata: {
				playlistName: playlist.name,
				styleName: style.name,
				predictionId,
				chosenObject: selected.object,
			},
		});

		// ── Step 11: Compress + upload to Spotify ──
		const base64Jpeg = await compressForSpotify(imageBytes);
		await uploadPlaylistCover(
			playlist.spotify_playlist_id,
			base64Jpeg,
			accessToken,
		);

		// ── Step 12: Persist everything ──
		const durationMs = Date.now() - startTime;

		// 12a. Playlist analysis report
		await env.DB.prepare(
			`INSERT INTO playlist_analyses (
				id, user_id, playlist_id, track_snapshot, track_extractions,
				convergence_result, chosen_object, aesthetic_context, style_id,
				tracks_added, tracks_removed, outlier_count, outlier_threshold,
				regeneration_triggered, status, trigger_type
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cron')`,
		)
			.bind(
				analysisId,
				playlist.user_id,
				playlist.id,
				JSON.stringify(tracks),
				JSON.stringify(extractions),
				JSON.stringify(convergence),
				selected.object,
				selected.aestheticContext,
				style.id,
				changeDetection ? JSON.stringify(changeDetection.tracksAdded) : null,
				changeDetection ? JSON.stringify(changeDetection.tracksRemoved) : null,
				changeDetection?.outlierCount ?? 0,
				changeDetection?.threshold ?? 0.25,
				changeDetection?.shouldRegenerate ? 1 : 0,
				lyricsFoundCount < tracks.length ? "partial" : "completed",
			)
			.run();

		// 12b. Supersede old claimed object for this playlist
		await env.DB.prepare(
			`UPDATE claimed_objects
			 SET superseded_at = datetime('now')
			 WHERE playlist_id = ? AND superseded_at IS NULL`,
		)
			.bind(playlist.id)
			.run();

		// 12c. Insert new claimed object
		const claimedObjectId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
		await env.DB.prepare(
			`INSERT INTO claimed_objects (id, user_id, playlist_id, object_name, aesthetic_context, source_generation_id)
			 VALUES (?, ?, ?, ?, ?, ?)`,
		)
			.bind(
				claimedObjectId,
				playlist.user_id,
				playlist.id,
				selected.object,
				selected.aestheticContext,
				generationId,
			)
			.run();

		// 12d. Update generation record
		await env.DB.prepare(
			`UPDATE generations
			 SET symbolic_object = ?,
				 dall_e_prompt = ?,
				 replicate_prediction_id = ?,
				 r2_key = ?,
				 analysis_id = ?,
				 claimed_object_id = ?,
				 status = 'completed',
				 duration_ms = ?
			 WHERE id = ?`,
		)
			.bind(
				selected.object,
				prompt,
				predictionId,
				r2Key,
				analysisId,
				claimedObjectId,
				durationMs,
				generationId,
			)
			.run();

		// 12e. Update playlist tracking
		await env.DB.prepare(
			`UPDATE playlists
			 SET status = 'generated',
				 last_generated_at = datetime('now'),
				 generation_count = generation_count + 1,
				 updated_at = datetime('now')
			 WHERE id = ?`,
		)
			.bind(playlist.id)
			.run();

		console.log(
			`[Pipeline] Completed for "${playlist.name}" in ${durationMs}ms`,
		);
		return { success: true, generationId };
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		console.error(`[Pipeline] Failed for "${playlist.name}":`, errorMessage);

		// Record failed generation — nested try/catch to avoid double-fault
		try {
			await env.DB.prepare(
				`UPDATE generations
				 SET symbolic_object = ?,
					 dall_e_prompt = ?,
					 status = 'failed',
					 error_message = ?,
					 duration_ms = ?
				 WHERE id = ?`,
			)
				.bind(
					playlist.name,
					style.prompt_template.replace("{subject}", playlist.name),
					errorMessage,
					Date.now() - startTime,
					generationId,
				)
				.run();
		} catch (dbError) {
			console.error("[Pipeline] Failed to record generation failure:", dbError);
		}

		return { success: false, generationId, error: errorMessage };
	}
}
