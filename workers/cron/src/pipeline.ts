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

import type {
	DbClaimedObject,
	DbStyle,
	GenerationResult,
	PipelineProgress,
	PipelineStepName,
	StepData,
	UsageTriggerSource,
} from "@disc/shared";
import {
	calculateImageCost,
	calculateLLMCost,
	IMAGE_PRICING,
	LLM_MODEL,
	MODEL_PRICING,
} from "@disc/shared";
import {
	convergeAndSelect,
	detectChanges,
	extractThemes,
	lightExtract,
} from "./extraction";
import { compressForSpotify } from "./image";
import { fetchLyricsBatch } from "./lyrics";
import { generateImage } from "./replicate";
import { fetchPlaylistTracks, uploadPlaylistCover } from "./spotify";
import { insertUsageEvent } from "./usage";

interface PlaylistRow {
	id: string;
	spotify_playlist_id: string;
	name: string;
	user_id: string;
}

class ProgressTracker {
	private steps: StepData = {};

	constructor(
		private db: D1Database,
		private playlistId: string,
		private generationId: string,
		private startedAt: string,
	) {}

	async advance(step: PipelineStepName, data?: StepData[typeof step]) {
		if (data) {
			(this.steps as Record<string, unknown>)[step] = data;
		}
		const progress: PipelineProgress = {
			currentStep: step,
			generationId: this.generationId,
			startedAt: this.startedAt,
			steps: this.steps,
		};
		try {
			await this.db
				.prepare(
					`UPDATE playlists SET status = 'processing', progress_data = ? WHERE id = ?`,
				)
				.bind(JSON.stringify(progress), this.playlistId)
				.run();
		} catch {
			// Non-critical — don't fail pipeline over progress tracking
		}
	}
}

export interface PipelineEnv {
	DB: D1Database;
	IMAGES: R2Bucket;
	REPLICATE_API_TOKEN: string;
	OPENAI_API_KEY: string;
}

export interface PipelineOptions {
	triggerType?: "manual" | "cron" | "auto";
	jobId?: string;
	revisionNotes?: string;
	customObject?: string;
	lightExtractionText?: string;
}

/**
 * Generates cover art for a single playlist using the enhanced pipeline.
 */
export async function generateForPlaylist(
	playlist: PlaylistRow,
	style: DbStyle,
	accessToken: string,
	env: PipelineEnv,
	options: PipelineOptions = {},
): Promise<GenerationResult> {
	const PIPELINE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes hard limit
	const generationId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
	const analysisId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
	const startTime = Date.now();
	const triggerType = options.triggerType ?? "cron";
	const usedLightExtraction = !!options?.lightExtractionText;
	const triggerSource: UsageTriggerSource =
		options?.triggerType === "cron"
			? "cron"
			: options?.triggerType === "auto"
				? "auto_detect"
				: "user";

	const checkTimeout = () => {
		if (Date.now() - startTime > PIPELINE_TIMEOUT_MS) {
			throw new Error(
				`Pipeline timed out after ${Math.round(PIPELINE_TIMEOUT_MS / 60000)} minutes`,
			);
		}
	};

	const tracker = new ProgressTracker(
		env.DB,
		playlist.id,
		generationId,
		new Date().toISOString().replace("T", " ").slice(0, 19),
	);

	// Hoist token counts so the error path can persist partial cost data
	// when the pipeline fails after LLM calls that consumed API credits
	let extractTokensIn = 0;
	let extractTokensOut = 0;
	let convTokensIn = 0;
	let convTokensOut = 0;
	let imageGenerated = false;

	try {
		// ── Step 1: Create generation record ──
		await env.DB.prepare(
			`INSERT INTO generations (id, user_id, playlist_id, style_id, symbolic_object, prompt, status, trigger_type, created_at)
			 VALUES (?, ?, ?, ?, '', '', 'processing', ?, datetime('now'))`,
		)
			.bind(generationId, playlist.user_id, playlist.id, style.id, triggerType)
			.run();

		// ── Step 2: Fetch playlist tracks ──
		await tracker.advance("fetch_tracks");
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

		await tracker.advance("fetch_tracks", {
			trackCount: tracks.length,
			trackNames: tracks.map((t) => `${t.name} — ${t.artist}`),
		});

		// When a custom object is provided, skip lyrics/extraction/convergence
		// and jump straight to image generation with the user-supplied subject.
		let subject: string;
		let chosenObject: string;
		let chosenAestheticContext: string;
		let extractions: Awaited<ReturnType<typeof extractThemes>>["extractions"] =
			[];
		let convergenceResult: unknown = null;
		let lyricsFoundCount = 0;

		if (options.customObject) {
			console.log(
				`[Pipeline] Custom object override: "${options.customObject}"`,
			);
			chosenObject = options.customObject;
			chosenAestheticContext = "user-specified";
			// Fast-forward progress through skipped steps
			await tracker.advance("fetch_lyrics");
			await tracker.advance("fetch_lyrics", {
				found: 0,
				total: tracks.length,
				tracks: [],
			});
			await tracker.advance("extract_themes");
			await tracker.advance("extract_themes", {
				completed: 0,
				total: 0,
				objectCount: 0,
				topObjects: [],
				tokensUsed: 0,
				perTrack: [],
			});
			await tracker.advance("select_theme");
			await tracker.advance("select_theme", {
				chosenObject: options.customObject,
				aestheticContext: "user-specified",
				collisionNotes: "",
				candidates: [
					{
						object: options.customObject,
						aestheticContext: "user-specified",
						reasoning: "Custom object override",
						rank: 1,
					},
				],
			});
			await tracker.advance("generate_image");

			const revisionPrefix = options.revisionNotes
				? `Revision guidance: ${options.revisionNotes}. `
				: "";
			subject = `${revisionPrefix}${options.customObject}`;
		} else if (options.lightExtractionText) {
			// Light extraction: one LLM call to derive object + mood from user text
			console.log(
				`[Pipeline] Light extraction from: "${options.lightExtractionText}"`,
			);

			// Load exclusions (same as full pipeline)
			const claimedResult = await env.DB.prepare(
				`SELECT id, user_id, playlist_id, object_name, aesthetic_context, source_generation_id, superseded_at, created_at
				 FROM claimed_objects
				 WHERE user_id = ? AND playlist_id != ? AND superseded_at IS NULL`,
			)
				.bind(playlist.user_id, playlist.id)
				.all<DbClaimedObject>();

			const extracted = await lightExtract(
				options.lightExtractionText,
				playlist.name,
				claimedResult.results,
				env.OPENAI_API_KEY,
			);

			chosenObject = extracted.object;
			chosenAestheticContext = extracted.aestheticContext;
			convTokensIn = extracted.inputTokens;
			convTokensOut = extracted.outputTokens;

			// Fast-forward progress through skipped steps
			await tracker.advance("fetch_lyrics");
			await tracker.advance("fetch_lyrics", {
				found: 0,
				total: tracks.length,
				tracks: [],
			});
			await tracker.advance("extract_themes");
			await tracker.advance("extract_themes", {
				completed: 0,
				total: 0,
				objectCount: 0,
				topObjects: [],
				tokensUsed: 0,
				perTrack: [],
			});
			await tracker.advance("select_theme");
			await tracker.advance("select_theme", {
				chosenObject: extracted.object,
				aestheticContext: extracted.aestheticContext,
				collisionNotes: `Light extraction from user text: "${options.lightExtractionText}"`,
				candidates: [
					{
						object: extracted.object,
						aestheticContext: extracted.aestheticContext,
						reasoning: extracted.reasoning,
						rank: 1,
					},
				],
			});
			await tracker.advance("generate_image");

			const revisionPrefix = options.revisionNotes
				? `Revision guidance: ${options.revisionNotes}. `
				: "";
			subject = `${revisionPrefix}${extracted.object}, ${extracted.aestheticContext}`;
		} else {
			checkTimeout();
			// ── Step 4: Fetch lyrics (parallel, non-blocking failures) ──
			await tracker.advance("fetch_lyrics");
			console.log("[Pipeline] Fetching lyrics...");
			const lyricsResults = await fetchLyricsBatch(tracks, env.DB);
			lyricsFoundCount = lyricsResults.filter((r) => r.found).length;
			console.log(
				`[Pipeline] Lyrics found for ${lyricsFoundCount}/${tracks.length} tracks`,
			);

			checkTimeout();
			// ── Step 5: Extract tiered objects via LLM (parallel per-track) ──
			await tracker.advance("fetch_lyrics", {
				found: lyricsFoundCount,
				total: tracks.length,
				tracks: lyricsResults.map((r) => ({
					name: r.trackName,
					artist: r.artist,
					found: r.found,
					snippet: r.lyrics ? r.lyrics.slice(0, 120) : null,
				})),
			});
			await tracker.advance("extract_themes");
			console.log("[Pipeline] Extracting themes (parallel per-track)...");
			const tracksWithLyrics = tracks.map((t, i) => ({
				...t,
				lyrics: lyricsResults[i].lyrics,
				lyricsFound: lyricsResults[i].found,
			}));

			const extractResult = await extractThemes(
				tracksWithLyrics,
				env.OPENAI_API_KEY,
				// Real-time progress callback — fires after each track completes
				async (completed, total, completedExtractions, tokensUsed) => {
					await tracker.advance("extract_themes", {
						completed,
						total,
						objectCount: completedExtractions.flatMap((e) => e.objects).length,
						topObjects: completedExtractions
							.flatMap((e) => e.objects)
							.filter((o) => o.tier === "high")
							.slice(0, 8)
							.map((o) => o.object),
						tokensUsed,
						perTrack: completedExtractions.map((e) => ({
							trackName: e.trackName,
							artist: e.artist,
							objects: e.objects.map((o) => ({
								object: o.object,
								tier: o.tier,
								reasoning: o.reasoning.slice(0, 80),
							})),
						})),
					});
				},
				env.DB,
			);
			extractions = extractResult.extractions;
			extractTokensIn = extractResult.inputTokens;
			extractTokensOut = extractResult.outputTokens;
			if (extractResult.cacheHits > 0) {
				console.log(
					`[Pipeline] Extraction cache: ${extractResult.cacheHits} hits, ${extractions.length - extractResult.cacheHits} fresh`,
				);
			}
			console.log(
				`[Pipeline] Extracted objects for ${extractions.length} tracks (${extractTokensIn}+${extractTokensOut} tokens)`,
			);

			checkTimeout();
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
			await tracker.advance("extract_themes", {
				completed: extractions.length,
				total: tracks.length,
				objectCount: extractions.flatMap((e) => e.objects).length,
				topObjects: extractions
					.flatMap((e) => e.objects)
					.filter((o) => o.tier === "high")
					.slice(0, 8)
					.map((o) => o.object),
				tokensUsed: extractTokensIn + extractTokensOut,
				perTrack: extractions.map((e) => ({
					trackName: e.trackName,
					artist: e.artist,
					objects: e.objects.map((o) => ({
						object: o.object,
						tier: o.tier,
						reasoning: o.reasoning.slice(0, 80),
					})),
				})),
			});
			await tracker.advance("select_theme");
			const totalObjects = extractions.flatMap((e) => e.objects).length;
			console.log(
				`[Pipeline] Running convergence... (${extractions.length} tracks, ${totalObjects} objects, ${exclusions.length} exclusions)`,
			);

			let convergence: Awaited<ReturnType<typeof convergeAndSelect>>["result"];

			try {
				const convResult = await convergeAndSelect(
					playlist.name,
					extractions,
					exclusions,
					env.OPENAI_API_KEY,
				);
				convergence = convResult.result;
				convergenceResult = convergence;
				convTokensIn = convResult.inputTokens;
				convTokensOut = convResult.outputTokens;
			} catch (convError) {
				const msg =
					convError instanceof Error ? convError.message : String(convError);
				console.error(`[Pipeline] Convergence FAILED: ${msg}`);
				throw new Error(`Convergence failed: ${msg}`);
			}

			if (
				!convergence.candidates?.length ||
				convergence.selectedIndex < 0 ||
				convergence.selectedIndex >= convergence.candidates.length
			) {
				console.error(
					`[Pipeline] Convergence invalid response:`,
					JSON.stringify(convergence).slice(0, 500),
				);
				throw new Error(
					`Convergence invalid: ${convergence.candidates?.length ?? 0} candidates, selectedIndex=${convergence.selectedIndex}`,
				);
			}
			const selected = convergence.candidates[convergence.selectedIndex];
			chosenObject = selected.object;
			chosenAestheticContext = selected.aestheticContext;

			console.log(
				`[Pipeline] Selected: "${selected.object}" — ${selected.aestheticContext.slice(0, 80)}...`,
			);
			console.log(
				`[Pipeline] LLM tokens: extract=${extractTokensIn}+${extractTokensOut}, converge=${convTokensIn}+${convTokensOut}`,
			);

			// ── Step 8: Build enriched prompt and generate image ──
			await tracker.advance("select_theme", {
				chosenObject: selected.object,
				aestheticContext: selected.aestheticContext,
				collisionNotes: convergence.collisionNotes,
				candidates: convergence.candidates.map((c) => ({
					object: c.object,
					aestheticContext: c.aestheticContext,
					reasoning: c.reasoning,
					rank: c.rank,
				})),
			});
			await tracker.advance("generate_image");
			const revisionPrefix = options.revisionNotes
				? `Revision guidance: ${options.revisionNotes}. `
				: "";
			subject = `${revisionPrefix}${selected.object}, ${selected.aestheticContext}`;
		}
		console.log(
			`[Pipeline] Generating image for "${playlist.name}" with style "${style.name}"`,
		);
		const { imageUrl, predictionId, prompt } = await generateImage(
			style,
			subject,
			env.REPLICATE_API_TOKEN,
		);
		imageGenerated = true;

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
				chosenObject: chosenObject,
			},
		});

		// ── Step 11: Compress + upload to Spotify ──
		await tracker.advance("generate_image", {
			prompt,
			styleName: style.name,
			predictionId,
			subject,
			styleTemplate: style.prompt_template,
		});
		await tracker.advance("upload");
		const base64Jpeg = await compressForSpotify(imageBytes);
		await uploadPlaylistCover(
			playlist.spotify_playlist_id,
			base64Jpeg,
			accessToken,
		);

		await tracker.advance("upload", { r2Key });

		// ── Step 12: Persist everything ──
		const durationMs = Date.now() - startTime;

		// 12a. Playlist analysis report
		await env.DB.prepare(
			`INSERT INTO playlist_analyses (
				id, user_id, playlist_id, track_snapshot, track_extractions,
				convergence_result, chosen_object, aesthetic_context, style_id,
				tracks_added, tracks_removed, outlier_count, outlier_threshold,
				regeneration_triggered, status, trigger_type
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
			.bind(
				analysisId,
				playlist.user_id,
				playlist.id,
				JSON.stringify(tracks),
				JSON.stringify(extractions),
				JSON.stringify(convergenceResult),
				chosenObject,
				chosenAestheticContext,
				style.id,
				changeDetection ? JSON.stringify(changeDetection.tracksAdded) : null,
				changeDetection ? JSON.stringify(changeDetection.tracksRemoved) : null,
				changeDetection?.outlierCount ?? 0,
				changeDetection?.threshold ?? 0.25,
				changeDetection?.shouldRegenerate ? 1 : 0,
				lyricsFoundCount < tracks.length ? "partial" : "completed",
				triggerType,
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
				chosenObject,
				chosenAestheticContext,
				generationId,
			)
			.run();

		// 12d. Update generation record (including cost tracking)
		const costBreakdown = {
			steps: [
				{
					step: "extract_themes",
					model: LLM_MODEL,
					input_tokens: extractTokensIn,
					output_tokens: extractTokensOut,
					cost_usd: calculateLLMCost(
						LLM_MODEL,
						extractTokensIn,
						extractTokensOut,
					),
				},
				{
					step: "convergence",
					model: LLM_MODEL,
					input_tokens: convTokensIn,
					output_tokens: convTokensOut,
					cost_usd: calculateLLMCost(LLM_MODEL, convTokensIn, convTokensOut),
				},
				{
					step: "image_generation",
					model: style.replicate_model,
					cost_usd: calculateImageCost(style.replicate_model),
				},
			],
			total_usd: 0,
		};
		costBreakdown.total_usd = costBreakdown.steps.reduce(
			(sum, s) => sum + s.cost_usd,
			0,
		);

		await env.DB.prepare(
			`UPDATE generations
			 SET symbolic_object = ?,
				 prompt = ?,
				 replicate_prediction_id = ?,
				 r2_key = ?,
				 analysis_id = ?,
				 claimed_object_id = ?,
				 status = 'completed',
				 duration_ms = ?,
				 model_name = ?,
				 llm_input_tokens = ?,
				 llm_output_tokens = ?,
				 image_model = ?,
				 cost_usd = ?,
				 cost_breakdown = ?
			 WHERE id = ?`,
		)
			.bind(
				chosenObject,
				prompt,
				predictionId,
				r2Key,
				analysisId,
				claimedObjectId,
				durationMs,
				LLM_MODEL,
				extractTokensIn + convTokensIn,
				extractTokensOut + convTokensOut,
				style.replicate_model,
				costBreakdown.total_usd,
				JSON.stringify(costBreakdown),
				generationId,
			)
			.run();

		// 12d-ii. Record usage events for billing

		// LLM extraction events (one per pipeline run, aggregated tokens)
		if (extractTokensIn > 0 || extractTokensOut > 0) {
			await insertUsageEvent(env.DB, {
				userId: playlist.user_id,
				actionType: "llm_extraction",
				model: LLM_MODEL,
				costUsd: costBreakdown.steps[0].cost_usd,
				generationId,
				playlistId: playlist.id,
				styleId: style.id,
				jobId: options?.jobId,
				tokensIn: extractTokensIn,
				tokensOut: extractTokensOut,
				modelUnitCost: MODEL_PRICING[LLM_MODEL]?.inputPerMillion,
				triggerSource,
			});
		}

		// LLM convergence / light extraction event
		if (convTokensIn > 0 || convTokensOut > 0) {
			await insertUsageEvent(env.DB, {
				userId: playlist.user_id,
				actionType: usedLightExtraction
					? "llm_light_extraction"
					: "llm_convergence",
				model: LLM_MODEL,
				costUsd: costBreakdown.steps[1].cost_usd,
				generationId,
				playlistId: playlist.id,
				styleId: style.id,
				jobId: options?.jobId,
				tokensIn: convTokensIn,
				tokensOut: convTokensOut,
				modelUnitCost: MODEL_PRICING[LLM_MODEL]?.inputPerMillion,
				triggerSource,
			});
		}

		// Image generation event
		await insertUsageEvent(env.DB, {
			userId: playlist.user_id,
			actionType: "image_generation",
			model: style.replicate_model,
			costUsd: costBreakdown.steps[2].cost_usd,
			generationId,
			playlistId: playlist.id,
			styleId: style.id,
			jobId: options?.jobId,
			durationMs: durationMs,
			modelUnitCost: IMAGE_PRICING[style.replicate_model] ?? 0.04,
			triggerSource,
		});

		// 12e. Update playlist tracking + clear progress
		await env.DB.prepare(
			`UPDATE playlists
			 SET status = 'generated',
				 last_generated_at = datetime('now'),
				 generation_count = generation_count + 1,
				 progress_data = NULL,
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

		// Record failed generation — persist partial cost data if LLM calls were made
		const totalTokensIn = extractTokensIn + convTokensIn;
		const totalTokensOut = extractTokensOut + convTokensOut;
		const hasPartialCost =
			totalTokensIn > 0 || totalTokensOut > 0 || imageGenerated;

		let partialCostBreakdown: string | null = null;
		let partialCostUsd = 0;
		if (hasPartialCost) {
			const steps: Array<Record<string, unknown>> = [];
			if (extractTokensIn > 0 || extractTokensOut > 0) {
				const cost = calculateLLMCost(
					LLM_MODEL,
					extractTokensIn,
					extractTokensOut,
				);
				steps.push({
					step: "extract_themes",
					model: LLM_MODEL,
					input_tokens: extractTokensIn,
					output_tokens: extractTokensOut,
					cost_usd: cost,
				});
				partialCostUsd += cost;
			}
			if (convTokensIn > 0 || convTokensOut > 0) {
				const cost = calculateLLMCost(LLM_MODEL, convTokensIn, convTokensOut);
				steps.push({
					step: "convergence",
					model: LLM_MODEL,
					input_tokens: convTokensIn,
					output_tokens: convTokensOut,
					cost_usd: cost,
				});
				partialCostUsd += cost;
			}
			if (imageGenerated) {
				const cost = calculateImageCost(style.replicate_model);
				steps.push({
					step: "image_generation",
					model: style.replicate_model,
					cost_usd: cost,
				});
				partialCostUsd += cost;
			}
			partialCostBreakdown = JSON.stringify({
				steps,
				total_usd: partialCostUsd,
			});
		}

		try {
			await env.DB.prepare(
				`UPDATE generations
				 SET symbolic_object = ?,
					 prompt = ?,
					 status = 'failed',
					 error_message = ?,
					 duration_ms = ?,
					 model_name = ?,
					 llm_input_tokens = ?,
					 llm_output_tokens = ?,
					 cost_usd = ?,
					 cost_breakdown = ?
				 WHERE id = ?`,
			)
				.bind(
					playlist.name,
					style.prompt_template.replace("{subject}", playlist.name),
					errorMessage,
					Date.now() - startTime,
					hasPartialCost ? LLM_MODEL : null,
					hasPartialCost ? totalTokensIn : null,
					hasPartialCost ? totalTokensOut : null,
					hasPartialCost ? partialCostUsd : null,
					partialCostBreakdown,
					generationId,
				)
				.run();

			// Record partial usage events for billing (even on failure)
			if (extractTokensIn > 0 || extractTokensOut > 0) {
				await insertUsageEvent(env.DB, {
					userId: playlist.user_id,
					actionType: "llm_extraction",
					model: LLM_MODEL,
					costUsd: calculateLLMCost(
						LLM_MODEL,
						extractTokensIn,
						extractTokensOut,
					),
					generationId,
					playlistId: playlist.id,
					styleId: style.id,
					jobId: options?.jobId,
					tokensIn: extractTokensIn,
					tokensOut: extractTokensOut,
					modelUnitCost: MODEL_PRICING[LLM_MODEL]?.inputPerMillion,
					triggerSource,
					status: "failed",
					errorMessage: errorMessage.slice(0, 500),
				});
			}

			if (convTokensIn > 0 || convTokensOut > 0) {
				await insertUsageEvent(env.DB, {
					userId: playlist.user_id,
					actionType: usedLightExtraction
						? "llm_light_extraction"
						: "llm_convergence",
					model: LLM_MODEL,
					costUsd: calculateLLMCost(LLM_MODEL, convTokensIn, convTokensOut),
					generationId,
					playlistId: playlist.id,
					styleId: style.id,
					jobId: options?.jobId,
					tokensIn: convTokensIn,
					tokensOut: convTokensOut,
					modelUnitCost: MODEL_PRICING[LLM_MODEL]?.inputPerMillion,
					triggerSource,
					status: "failed",
					errorMessage: errorMessage.slice(0, 500),
				});
			}

			// Record image cost if generation succeeded before failure
			if (imageGenerated) {
				await insertUsageEvent(env.DB, {
					userId: playlist.user_id,
					actionType: "image_generation",
					model: style.replicate_model,
					costUsd: calculateImageCost(style.replicate_model),
					generationId,
					playlistId: playlist.id,
					styleId: style.id,
					jobId: options?.jobId,
					modelUnitCost: IMAGE_PRICING[style.replicate_model] ?? 0.04,
					triggerSource,
					status: "failed",
					errorMessage: errorMessage.slice(0, 500),
				});
			}

			await env.DB.prepare(
				`UPDATE playlists SET status = 'failed', progress_data = NULL WHERE id = ?`,
			)
				.bind(playlist.id)
				.run();
		} catch (dbError) {
			console.error("[Pipeline] Failed to record generation failure:", dbError);
		}

		return { success: false, generationId, error: errorMessage };
	}
}
