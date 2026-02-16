/**
 * Theme Extraction + Collision Resolution
 *
 * THE CORE MODULE. Two LLM calls total:
 * 1. Batch extraction: all tracks → per-track tiered objects
 * 2. Collision-aware convergence: per-track objects + exclusions → 3 ranked candidates
 */

import type {
	ConvergenceResult,
	DbClaimedObject,
	TrackExtraction,
} from "@disc/shared";
import { createFallbackContext } from "./lyrics";
import { chatCompletionJSON } from "./openai";

interface TrackWithLyrics {
	spotifyTrackId: string;
	name: string;
	artist: string;
	album: string;
	lyrics: string | null;
	lyricsFound: boolean;
}

interface CachedExtraction {
	spotify_track_id: string;
	extraction_json: string;
	input_tokens: number;
	output_tokens: number;
}

// ──────────────────────────────────────────────
// Call 1: Per-track parallel extraction
// ──────────────────────────────────────────────

const SINGLE_TRACK_SYSTEM_PROMPT = `You are a music analyst. Given a single song (with lyrics or metadata), extract symbolic objects that represent the song's themes.

Identify 1-3 concrete, visual objects (nouns) that capture the song's essence. These should be things that could appear in cover art — not abstract concepts.

Tier each object:
- "high": directly referenced in lyrics or strongly evoked
- "medium": thematically implied
- "low": loosely connected, creative interpretation

Respond with JSON:
{
  "trackName": "...",
  "artist": "...",
  "lyricsFound": true/false,
  "objects": [
    { "object": "...", "tier": "high"|"medium"|"low", "reasoning": "..." }
  ]
}`;

function buildSingleTrackPrompt(track: TrackWithLyrics): string {
	const context = track.lyrics
		? `Lyrics (truncated):\n${track.lyrics}`
		: createFallbackContext(track);
	return `Analyze this track and extract symbolic objects:\n\n"${track.name}" by ${track.artist}\n${context}`;
}

/**
 * Extract themes for a single track via LLM.
 */
async function extractSingleTrack(
	track: TrackWithLyrics,
	apiKey: string,
): Promise<{
	extraction: TrackExtraction;
	inputTokens: number;
	outputTokens: number;
}> {
	const result = await chatCompletionJSON<TrackExtraction>(
		apiKey,
		SINGLE_TRACK_SYSTEM_PROMPT,
		buildSingleTrackPrompt(track),
		{ temperature: 0.6, maxTokens: 500 },
	);

	return {
		extraction: result.parsed,
		inputTokens: result.inputTokens,
		outputTokens: result.outputTokens,
	};
}

/**
 * Extract themes for all tracks in parallel (concurrency-limited).
 * When a D1 database is provided, checks/populates the song_extractions cache.
 * Accepts an optional onProgress callback for real-time updates.
 */
export async function extractThemes(
	tracks: TrackWithLyrics[],
	apiKey: string,
	onProgress?: (
		completed: number,
		total: number,
		extractions: TrackExtraction[],
		tokensUsed: number,
	) => Promise<void> | void,
	db?: D1Database,
): Promise<{
	extractions: TrackExtraction[];
	inputTokens: number;
	outputTokens: number;
	cacheHits: number;
}> {
	const CONCURRENCY = 5;
	const extractions: (TrackExtraction | null)[] = new Array(tracks.length).fill(
		null,
	);
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let cacheHits = 0;

	// ── Cache lookup ──
	const uncachedIndices: number[] = [];

	if (db && tracks.length > 0) {
		try {
			const ids = tracks.map((t) => t.spotifyTrackId);
			const placeholders = ids.map(() => "?").join(",");
			const cached = await db
				.prepare(
					`SELECT spotify_track_id, extraction_json, input_tokens, output_tokens
					 FROM song_extractions WHERE spotify_track_id IN (${placeholders})`,
				)
				.bind(...ids)
				.all<CachedExtraction>();

			const cacheMap = new Map(
				cached.results.map((r) => [r.spotify_track_id, r]),
			);

			for (let i = 0; i < tracks.length; i++) {
				const hit = cacheMap.get(tracks[i].spotifyTrackId);
				if (hit) {
					extractions[i] = JSON.parse(hit.extraction_json);
					totalInputTokens += hit.input_tokens;
					totalOutputTokens += hit.output_tokens;
					cacheHits++;
				} else {
					uncachedIndices.push(i);
				}
			}

			if (cacheHits > 0) {
				console.log(
					`[Extraction] Cache: ${cacheHits} hits, ${uncachedIndices.length} misses`,
				);
			}
		} catch (err) {
			console.warn("[Extraction] Cache lookup failed, extracting all:", err);
			uncachedIndices.length = 0;
			for (let i = 0; i < tracks.length; i++) {
				if (!extractions[i]) uncachedIndices.push(i);
			}
		}
	} else {
		for (let i = 0; i < tracks.length; i++) uncachedIndices.push(i);
	}

	// ── Extract uncached tracks via LLM ──
	const newlyExtracted: Array<{
		index: number;
		extraction: TrackExtraction;
		inputTokens: number;
		outputTokens: number;
	}> = [];
	let fetchIdx = 0;

	async function worker(): Promise<void> {
		while (fetchIdx < uncachedIndices.length) {
			const fi = fetchIdx++;
			const i = uncachedIndices[fi];
			const track = tracks[i];

			try {
				const result = await extractSingleTrack(track, apiKey);
				extractions[i] = result.extraction;
				totalInputTokens += result.inputTokens;
				totalOutputTokens += result.outputTokens;
				newlyExtracted.push({
					index: i,
					extraction: result.extraction,
					inputTokens: result.inputTokens,
					outputTokens: result.outputTokens,
				});
			} catch (error) {
				console.warn(`[Extraction] Failed for "${track.name}":`, error);
				extractions[i] = {
					trackName: track.name,
					artist: track.artist,
					lyricsFound: track.lyricsFound,
					objects: [],
				};
			}

			// Report progress after each track — await to avoid floating promises
			const completed = extractions.filter((e) => e !== null);
			try {
				await onProgress?.(
					completed.length,
					tracks.length,
					completed as TrackExtraction[],
					totalInputTokens + totalOutputTokens,
				);
			} catch {
				// Non-critical — don't fail extraction over progress reporting
			}
		}
	}

	if (uncachedIndices.length > 0) {
		const workers = Array.from(
			{ length: Math.min(CONCURRENCY, uncachedIndices.length) },
			() => worker(),
		);
		await Promise.all(workers);
	}

	// ── Populate cache with newly extracted tracks ──
	if (db && newlyExtracted.length > 0) {
		try {
			const stmts = newlyExtracted.map((item) =>
				db
					.prepare(
						`INSERT OR IGNORE INTO song_extractions
						 (spotify_track_id, track_name, artist_name, extraction_json, model_name, input_tokens, output_tokens)
						 VALUES (?, ?, ?, ?, ?, ?, ?)`,
					)
					.bind(
						tracks[item.index].spotifyTrackId,
						tracks[item.index].name,
						tracks[item.index].artist,
						JSON.stringify(item.extraction),
						"gpt-4o-mini",
						item.inputTokens,
						item.outputTokens,
					),
			);
			await db.batch(stmts);
			console.log(
				`[Extraction] Cached ${newlyExtracted.length} new extractions`,
			);
		} catch (err) {
			console.warn("[Extraction] Cache write failed:", err);
		}
	}

	// Report final progress for cached tracks
	if (cacheHits > 0) {
		const completed = extractions.filter((e) => e !== null);
		try {
			await onProgress?.(
				completed.length,
				tracks.length,
				completed as TrackExtraction[],
				totalInputTokens + totalOutputTokens,
			);
		} catch {
			// Non-critical
		}
	}

	return {
		extractions: extractions.filter((e): e is TrackExtraction => e !== null),
		inputTokens: totalInputTokens,
		outputTokens: totalOutputTokens,
		cacheHits,
	};
}

// ──────────────────────────────────────────────
// Call 2: Collision-aware convergence
// ──────────────────────────────────────────────

const CONVERGENCE_SYSTEM_PROMPT = `You are a creative director selecting a single symbolic object to represent a music playlist's cover art.

Given per-track extracted objects and a list of objects already claimed by other playlists (exclusion list), select the best object that:
1. Represents the playlist's overall mood/theme
2. Does NOT duplicate any object in the exclusion list
3. Has strong visual potential for cover art
4. Is specific enough to be distinctive, not generic

Return 3 ranked candidates with aesthetic context (how the object should look/feel in the art).

Respond with JSON:
{
  "candidates": [
    {
      "object": "...",
      "aestheticContext": "A description of how this object should appear — mood, lighting, composition, texture",
      "reasoning": "Why this object represents the playlist",
      "rank": 1
    }
  ],
  "selectedIndex": 0,
  "collisionNotes": "Any notes about collisions avoided or creative pivots made"
}`;

// ──────────────────────────────────────────────
// Object scoring
// ──────────────────────────────────────────────

const TIER_SCORES: Record<string, number> = { high: 3, medium: 2, low: 1 };

export interface ObjectScore {
	object: string;
	score: number;
	trackCount: number;
}

/** Aggregate scores across all tracks for each unique object. */
export function scoreObjects(extractions: TrackExtraction[]): ObjectScore[] {
	const scores = new Map<string, { score: number; tracks: Set<string> }>();

	for (const track of extractions) {
		for (const obj of track.objects) {
			const key = obj.object.toLowerCase();
			const entry = scores.get(key) ?? { score: 0, tracks: new Set() };
			entry.score += TIER_SCORES[obj.tier] ?? 0;
			entry.tracks.add(`${track.trackName}|||${track.artist}`);
			scores.set(key, entry);
		}
	}

	return Array.from(scores.entries())
		.map(([object, { score, tracks }]) => ({
			object,
			score,
			trackCount: tracks.size,
		}))
		.sort((a, b) => b.score - a.score);
}

function buildConvergencePrompt(
	playlistName: string,
	extractions: TrackExtraction[],
	exclusions: DbClaimedObject[],
): string {
	// Only include high/medium tier objects — low tier adds noise without value
	const objectSummary = extractions
		.map((t) => {
			const relevantObjs = t.objects.filter(
				(o) => o.tier === "high" || o.tier === "medium",
			);
			if (relevantObjs.length === 0) return null;
			const objs = relevantObjs
				.map((o) => `  - ${o.object} (${o.tier})`)
				.join("\n");
			return `"${t.trackName}" by ${t.artist}:\n${objs}`;
		})
		.filter(Boolean)
		.join("\n\n");

	// Aggregate scores to help the LLM prioritize recurring objects
	const scores = scoreObjects(extractions);
	const scoreSummary = scores
		.slice(0, 10)
		.map(
			(s) =>
				`- "${s.object}" — ${s.score}pts across ${s.trackCount} track${s.trackCount !== 1 ? "s" : ""}`,
		)
		.join("\n");

	const exclusionList =
		exclusions.length > 0
			? exclusions
					.map((e) => `- "${e.object_name}" (used by another playlist)`)
					.join("\n")
			: "None — this is the first playlist being analyzed.";

	return `Playlist: "${playlistName}"

Per-track extracted objects:
${objectSummary}

Aggregate object scores (higher = more prominent across playlist):
${scoreSummary}

Objects already claimed by other playlists (DO NOT reuse these):
${exclusionList}

Select the best symbolic object for this playlist's cover art. Prefer objects with higher aggregate scores.`;
}

export async function convergeAndSelect(
	playlistName: string,
	extractions: TrackExtraction[],
	exclusions: DbClaimedObject[],
	apiKey: string,
): Promise<{
	result: ConvergenceResult;
	inputTokens: number;
	outputTokens: number;
}> {
	const userPrompt = buildConvergencePrompt(
		playlistName,
		extractions,
		exclusions,
	);
	console.log(
		`[Convergence] Prompt built: ${userPrompt.length} chars, ${extractions.length} tracks, ${exclusions.length} exclusions`,
	);

	const llmResult = await chatCompletionJSON<ConvergenceResult>(
		apiKey,
		CONVERGENCE_SYSTEM_PROMPT,
		userPrompt,
		{ temperature: 0.7, maxTokens: 1500 },
	);

	console.log(
		`[Convergence] Got ${llmResult.parsed.candidates?.length ?? 0} candidates, selectedIndex=${llmResult.parsed.selectedIndex}`,
	);

	return {
		result: llmResult.parsed,
		inputTokens: llmResult.inputTokens,
		outputTokens: llmResult.outputTokens,
	};
}

// ──────────────────────────────────────────────
// Change detection + regeneration threshold
// ──────────────────────────────────────────────

interface ChangeDetectionResult {
	tracksAdded: string[];
	tracksRemoved: string[];
	outlierCount: number;
	threshold: number;
	shouldRegenerate: boolean;
}

/**
 * Compares current tracks against a previous analysis snapshot.
 * Returns change detection results with tiered threshold.
 *
 * Threshold tiers:
 * - 2 tracks: 50% (1 new = regen)
 * - 3 tracks: ~33% (1 new = regen)
 * - 4+ tracks: 25% flat
 */
export function detectChanges(
	currentTracks: Array<{ name: string; artist: string }>,
	previousSnapshot: Array<{ name: string; artist: string }>,
): ChangeDetectionResult {
	const currentSet = new Set(
		currentTracks.map((t) => `${t.name}|||${t.artist}`),
	);
	const previousSet = new Set(
		previousSnapshot.map((t) => `${t.name}|||${t.artist}`),
	);

	const tracksAdded: string[] = [];
	const tracksRemoved: string[] = [];

	for (const key of currentSet) {
		if (!previousSet.has(key)) {
			const [name, artist] = key.split("|||");
			tracksAdded.push(`${name} - ${artist}`);
		}
	}

	for (const key of previousSet) {
		if (!currentSet.has(key)) {
			const [name, artist] = key.split("|||");
			tracksRemoved.push(`${name} - ${artist}`);
		}
	}

	const outlierCount = tracksAdded.length;
	const totalTracks = currentTracks.length;

	// Tiered threshold
	let threshold: number;
	if (totalTracks <= 2) {
		threshold = 0.5;
	} else if (totalTracks === 3) {
		threshold = 1 / 3;
	} else {
		threshold = 0.25;
	}

	const shouldRegenerate =
		totalTracks > 0 && outlierCount / totalTracks >= threshold;

	return {
		tracksAdded,
		tracksRemoved,
		outlierCount,
		threshold,
		shouldRegenerate,
	};
}
