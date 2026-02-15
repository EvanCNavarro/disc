/**
 * Lyrics Fetching Module
 *
 * Fetches lyrics from lyrics.ovh (free, no auth).
 * Parallel batch fetching with concurrency limiter.
 */

import { CONFIG } from "@disc/shared";

interface LyricsResult {
	lyrics: string | null;
	found: boolean;
}

/**
 * Fetches lyrics for a single track from lyrics.ovh.
 * Returns null if not found or on timeout.
 */
export async function fetchLyrics(
	artist: string,
	title: string,
): Promise<LyricsResult> {
	const encodedArtist = encodeURIComponent(artist.split(",")[0].trim());
	const encodedTitle = encodeURIComponent(title);

	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		CONFIG.LYRICS_TIMEOUT_MS,
	);

	try {
		const response = await fetch(
			`https://api.lyrics.ovh/v1/${encodedArtist}/${encodedTitle}`,
			{ signal: controller.signal },
		);

		if (!response.ok) {
			return { lyrics: null, found: false };
		}

		const data = (await response.json()) as { lyrics?: string };

		if (!data.lyrics || data.lyrics.trim().length === 0) {
			return { lyrics: null, found: false };
		}

		// Truncate to configured limit
		const truncated =
			data.lyrics.length > CONFIG.LYRICS_TRUNCATE_CHARS
				? data.lyrics.slice(0, CONFIG.LYRICS_TRUNCATE_CHARS)
				: data.lyrics;

		return { lyrics: truncated, found: true };
	} catch {
		return { lyrics: null, found: false };
	} finally {
		clearTimeout(timeout);
	}
}

interface TrackInfo {
	name: string;
	artist: string;
	album: string;
}

interface BatchLyricsResult {
	trackName: string;
	artist: string;
	lyrics: string | null;
	found: boolean;
}

/**
 * Fetches lyrics for multiple tracks in parallel with concurrency limit.
 */
export async function fetchLyricsBatch(
	tracks: TrackInfo[],
): Promise<BatchLyricsResult[]> {
	const concurrency = CONFIG.LYRICS_CONCURRENCY;
	const results: BatchLyricsResult[] = [];
	let index = 0;

	async function worker(): Promise<void> {
		while (index < tracks.length) {
			const i = index++;
			const track = tracks[i];
			const result = await fetchLyrics(track.artist, track.name);
			results[i] = {
				trackName: track.name,
				artist: track.artist,
				lyrics: result.lyrics,
				found: result.found,
			};
		}
	}

	const workers = Array.from(
		{ length: Math.min(concurrency, tracks.length) },
		() => worker(),
	);
	await Promise.all(workers);

	return results;
}

/**
 * Creates a fallback context string when lyrics aren't available.
 * Uses track name, artist, and album as context.
 */
export function createFallbackContext(track: TrackInfo): string {
	return `Track: "${track.name}" by ${track.artist} from album "${track.album}"`;
}
