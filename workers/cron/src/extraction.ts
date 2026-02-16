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
	name: string;
	artist: string;
	album: string;
	lyrics: string | null;
	lyricsFound: boolean;
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
): Promise<{
	extractions: TrackExtraction[];
	inputTokens: number;
	outputTokens: number;
}> {
	const CONCURRENCY = 5;
	const extractions: (TrackExtraction | null)[] = new Array(tracks.length).fill(
		null,
	);
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let index = 0;

	async function worker(): Promise<void> {
		while (index < tracks.length) {
			const i = index++;
			const track = tracks[i];

			try {
				const result = await extractSingleTrack(track, apiKey);
				extractions[i] = result.extraction;
				totalInputTokens += result.inputTokens;
				totalOutputTokens += result.outputTokens;
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

	const workers = Array.from(
		{ length: Math.min(CONCURRENCY, tracks.length) },
		() => worker(),
	);
	await Promise.all(workers);

	return {
		extractions: extractions.filter((e): e is TrackExtraction => e !== null),
		inputTokens: totalInputTokens,
		outputTokens: totalOutputTokens,
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

	const exclusionList =
		exclusions.length > 0
			? exclusions
					.map((e) => `- "${e.object_name}" (used by another playlist)`)
					.join("\n")
			: "None — this is the first playlist being analyzed.";

	return `Playlist: "${playlistName}"

Per-track extracted objects:
${objectSummary}

Objects already claimed by other playlists (DO NOT reuse these):
${exclusionList}

Select the best symbolic object for this playlist's cover art.`;
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
