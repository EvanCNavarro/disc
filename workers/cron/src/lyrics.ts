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

export interface TrackInfo {
	name: string;
	artist: string;
	album: string;
	spotifyTrackId: string;
}

interface BatchLyricsResult {
	trackName: string;
	artist: string;
	lyrics: string | null;
	found: boolean;
}

interface CachedLyrics {
	spotify_track_id: string;
	lyrics_snippet: string;
}

/**
 * Fetches lyrics for multiple tracks in parallel with concurrency limit.
 * When a D1 database is provided, checks/populates the track_lyrics cache.
 */
export async function fetchLyricsBatch(
	tracks: TrackInfo[],
	db?: D1Database,
): Promise<BatchLyricsResult[]> {
	const results: BatchLyricsResult[] = new Array(tracks.length);

	// ── Cache lookup ──
	const uncachedIndices: number[] = [];

	if (db && tracks.length > 0) {
		try {
			const ids = tracks.map((t) => t.spotifyTrackId);
			const placeholders = ids.map(() => "?").join(",");
			const cached = await db
				.prepare(
					`SELECT spotify_track_id, lyrics_snippet FROM track_lyrics WHERE spotify_track_id IN (${placeholders})`,
				)
				.bind(...ids)
				.all<CachedLyrics>();

			const cacheMap = new Map(
				cached.results.map((r) => [r.spotify_track_id, r.lyrics_snippet]),
			);

			for (let i = 0; i < tracks.length; i++) {
				const hit = cacheMap.get(tracks[i].spotifyTrackId);
				if (hit !== undefined) {
					results[i] = {
						trackName: tracks[i].name,
						artist: tracks[i].artist,
						lyrics: hit,
						found: true,
					};
				} else {
					uncachedIndices.push(i);
				}
			}
		} catch (err) {
			console.warn("[Lyrics] Cache lookup failed, fetching all:", err);
			// Fall through to fetch everything
			uncachedIndices.length = 0;
			for (let i = 0; i < tracks.length; i++) {
				if (!results[i]) uncachedIndices.push(i);
			}
		}
	} else {
		for (let i = 0; i < tracks.length; i++) uncachedIndices.push(i);
	}

	if (uncachedIndices.length > 0) {
		console.log(
			`[Lyrics] Cache: ${tracks.length - uncachedIndices.length} hits, ${uncachedIndices.length} misses`,
		);
	}

	// ── Fetch uncached from lyrics.ovh ──
	const concurrency = CONFIG.LYRICS_CONCURRENCY;
	let fetchIdx = 0;

	async function worker(): Promise<void> {
		while (fetchIdx < uncachedIndices.length) {
			const fi = fetchIdx++;
			const i = uncachedIndices[fi];
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
		{ length: Math.min(concurrency, uncachedIndices.length) },
		() => worker(),
	);
	await Promise.all(workers);

	// ── Populate cache with newly fetched lyrics ──
	if (db) {
		const toCache = uncachedIndices.filter(
			(i) => results[i].found && results[i].lyrics,
		);
		if (toCache.length > 0) {
			try {
				const stmts = toCache.map((i) =>
					db
						.prepare(
							`INSERT OR IGNORE INTO track_lyrics (spotify_track_id, track_name, artist_name, lyrics_snippet) VALUES (?, ?, ?, ?)`,
						)
						.bind(
							tracks[i].spotifyTrackId,
							tracks[i].name,
							tracks[i].artist,
							results[i].lyrics,
						),
				);
				await db.batch(stmts);
			} catch (err) {
				console.warn("[Lyrics] Cache write failed:", err);
			}
		}
	}

	return results;
}

/**
 * Creates a fallback context string when lyrics aren't available.
 * Uses track name, artist, and album as context.
 */
export function createFallbackContext(
	track: Pick<TrackInfo, "name" | "artist" | "album">,
): string {
	return `Track: "${track.name}" by ${track.artist} from album "${track.album}"`;
}
