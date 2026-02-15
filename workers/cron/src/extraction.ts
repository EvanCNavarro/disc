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
// Call 1: Batch extraction
// ──────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a music analyst. Given a list of songs (with lyrics or metadata), extract symbolic objects that represent each song's themes.

For each track, identify 1-3 concrete, visual objects (nouns) that capture the song's essence. These should be things that could appear in cover art — not abstract concepts.

Tier each object:
- "high": directly referenced in lyrics or strongly evoked
- "medium": thematically implied
- "low": loosely connected, creative interpretation

Respond with JSON:
{
  "extractions": [
    {
      "trackName": "...",
      "artist": "...",
      "lyricsFound": true/false,
      "objects": [
        { "object": "...", "tier": "high"|"medium"|"low", "reasoning": "..." }
      ]
    }
  ]
}`;

function buildExtractionPrompt(tracks: TrackWithLyrics[]): string {
	const trackEntries = tracks.map((t, i) => {
		const context = t.lyrics
			? `Lyrics (truncated):\n${t.lyrics}`
			: createFallbackContext(t);
		return `Track ${i + 1}: "${t.name}" by ${t.artist}\n${context}`;
	});

	return `Analyze these ${tracks.length} tracks and extract symbolic objects for each:\n\n${trackEntries.join("\n\n---\n\n")}`;
}

export async function extractThemes(
	tracks: TrackWithLyrics[],
	apiKey: string,
): Promise<{
	extractions: TrackExtraction[];
	inputTokens: number;
	outputTokens: number;
}> {
	const result = await chatCompletionJSON<{ extractions: TrackExtraction[] }>(
		apiKey,
		EXTRACTION_SYSTEM_PROMPT,
		buildExtractionPrompt(tracks),
		{ temperature: 0.6, maxTokens: 2000 },
	);

	return {
		extractions: result.parsed.extractions,
		inputTokens: result.inputTokens,
		outputTokens: result.outputTokens,
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
	const objectSummary = extractions
		.map((t) => {
			const objs = t.objects
				.map((o) => `  - ${o.object} (${o.tier}: ${o.reasoning})`)
				.join("\n");
			return `"${t.trackName}" by ${t.artist}:\n${objs}`;
		})
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
	const llmResult = await chatCompletionJSON<ConvergenceResult>(
		apiKey,
		CONVERGENCE_SYSTEM_PROMPT,
		buildConvergencePrompt(playlistName, extractions, exclusions),
		{ temperature: 0.7, maxTokens: 1500 },
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
