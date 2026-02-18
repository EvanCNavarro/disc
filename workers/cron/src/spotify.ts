/**
 * Spotify Service (Worker)
 *
 * Token refresh via encrypted refresh token + cover image upload + track fetching.
 * Handles PKCE refresh token rotation.
 */

import { CONFIG } from "@disc/shared";
import { decrypt, encrypt } from "./crypto";
import { withRetry } from "./retry";

/**
 * Decrypts a stored refresh token, exchanges it for a fresh access token,
 * and persists any rotated refresh token back to D1.
 */
export async function refreshAccessToken(
	encryptedRefreshToken: string,
	encryptionKey: string,
	clientId: string,
	clientSecret: string,
	db: D1Database,
	userId: string,
): Promise<string> {
	const refreshToken = await decrypt(encryptedRefreshToken, encryptionKey);
	if (!refreshToken) {
		throw new Error("Failed to decrypt refresh token");
	}

	const data = await withRetry(
		async () => {
			const response = await fetch("https://accounts.spotify.com/api/token", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
				},
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: refreshToken,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Spotify token refresh failed (${response.status}): ${errorText}`,
				);
			}

			return (await response.json()) as {
				access_token: string;
				refresh_token?: string;
			};
		},
		{
			maxAttempts: CONFIG.SPOTIFY_RETRY_ATTEMPTS,
			onRetry: (attempt, error, delayMs) => {
				console.warn(
					`[Spotify] refreshAccessToken retry ${attempt}/${CONFIG.SPOTIFY_RETRY_ATTEMPTS} after ${Math.round(delayMs)}ms:`,
					error instanceof Error ? error.message : error,
				);
			},
		},
	);

	// Handle PKCE token rotation
	if (data.refresh_token && data.refresh_token !== refreshToken) {
		console.log("[Spotify] Refresh token rotated, persisting new token to D1");
		const newEncrypted = await encrypt(data.refresh_token, encryptionKey);
		await db
			.prepare(
				"UPDATE users SET encrypted_refresh_token = ?, updated_at = datetime('now') WHERE id = ?",
			)
			.bind(newEncrypted, userId)
			.run();
	}

	return data.access_token;
}

/**
 * Uploads a base64-encoded JPEG as a playlist cover image.
 */
export async function uploadPlaylistCover(
	playlistId: string,
	base64Jpeg: string,
	accessToken: string,
): Promise<void> {
	await withRetry(
		async () => {
			const response = await fetch(
				`https://api.spotify.com/v1/playlists/${playlistId}/images`,
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						"Content-Type": "image/jpeg",
					},
					body: base64Jpeg,
				},
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Spotify cover upload failed (${response.status}): ${errorText}`,
				);
			}
		},
		{
			maxAttempts: CONFIG.SPOTIFY_RETRY_ATTEMPTS,
			onRetry: (attempt, error, delayMs) => {
				console.warn(
					`[Spotify] uploadPlaylistCover retry ${attempt}/${CONFIG.SPOTIFY_RETRY_ATTEMPTS} after ${Math.round(delayMs)}ms:`,
					error instanceof Error ? error.message : error,
				);
			},
		},
	);

	console.log(`[Spotify] Cover uploaded for playlist ${playlistId}`);
}

// ──────────────────────────────────────────────
// Playlist list (for watcher)
// ──────────────────────────────────────────────

export interface SpotifyPlaylistSummary {
	id: string;
	name: string;
	collaborative: boolean;
	ownerId: string;
	snapshotId: string;
	trackCount: number;
	imageUrl: string | null;
}

/**
 * Fetches all playlists for the authenticated user (paginated).
 * Used by the watcher cron to detect new playlists.
 */
export async function fetchUserPlaylists(
	accessToken: string,
): Promise<SpotifyPlaylistSummary[]> {
	const all: SpotifyPlaylistSummary[] = [];
	let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

	while (url) {
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(
				`Spotify playlists fetch failed (${response.status}): ${text}`,
			);
		}

		const page = (await response.json()) as {
			items: Array<{
				id: string;
				name: string;
				collaborative?: boolean;
				snapshot_id: string;
				owner: { id: string };
				images?: Array<{ url: string; width: number; height: number }>;
				// Feb 2026: "tracks" renamed to "items"
				items?: { total: number };
				tracks?: { total: number };
			}>;
			next: string | null;
		};

		for (const raw of page.items) {
			all.push({
				id: raw.id,
				name: raw.name,
				collaborative: raw.collaborative ?? false,
				ownerId: raw.owner.id,
				snapshotId: raw.snapshot_id,
				trackCount: raw.items?.total ?? raw.tracks?.total ?? 0,
				imageUrl: raw.images?.[0]?.url ?? null,
			});
		}

		url = page.next;
	}

	return all;
}

// ──────────────────────────────────────────────
// Track fetching (for pipeline)
// ──────────────────────────────────────────────

export interface PlaylistTrack {
	spotifyTrackId: string;
	name: string;
	artist: string;
	album: string;
	albumImageUrl: string | null;
	durationMs: number;
	addedAt: string | null;
	addedBy: string | null;
	explicit: boolean;
	releaseDate: string | null;
	isLocal: boolean;
}

/**
 * Fetches tracks for a Spotify playlist.
 * Uses the /tracks sub-resource for paginated track access.
 */
export async function fetchPlaylistTracks(
	spotifyPlaylistId: string,
	accessToken: string,
	limit: number = CONFIG.MAX_TRACKS_PER_PLAYLIST,
): Promise<PlaylistTrack[]> {
	return withRetry(
		async () => {
			const fields =
				"items(added_at,added_by(id),is_local,track(id,name,explicit,artists(name),album(name,images,release_date),duration_ms))";
			const url = `https://api.spotify.com/v1/playlists/${spotifyPlaylistId}/tracks?fields=${encodeURIComponent(fields)}&limit=${limit}`;

			const response = await fetch(url, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Spotify playlist tracks fetch failed (${response.status}): ${errorText}`,
				);
			}

			const data = (await response.json()) as {
				items: Array<{
					added_at: string | null;
					added_by: { id: string } | null;
					is_local: boolean;
					track: {
						id: string;
						name: string;
						explicit: boolean;
						artists: Array<{ name: string }>;
						album: {
							name: string;
							images?: Array<{ url: string; width: number; height: number }>;
							release_date: string | null;
						};
						duration_ms: number;
					} | null;
				}>;
			};

			if (!data.items) {
				return [];
			}

			return data.items
				.filter(
					(
						item,
					): item is typeof item & {
						track: NonNullable<(typeof item)["track"]>;
					} => item.track !== null,
				)
				.slice(0, limit)
				.map((item) => ({
					spotifyTrackId: item.track.id,
					name: item.track.name,
					artist: item.track.artists.map((a) => a.name).join(", "),
					album: item.track.album.name,
					albumImageUrl: item.track.album.images?.[0]?.url ?? null,
					durationMs: item.track.duration_ms,
					addedAt: item.added_at ?? null,
					addedBy: item.added_by?.id ?? null,
					explicit: item.track.explicit ?? false,
					releaseDate: item.track.album.release_date ?? null,
					isLocal: item.is_local ?? false,
				}));
		},
		{
			maxAttempts: CONFIG.SPOTIFY_RETRY_ATTEMPTS,
			onRetry: (attempt, error, delayMs) => {
				console.warn(
					`[Spotify] fetchPlaylistTracks retry ${attempt}/${CONFIG.SPOTIFY_RETRY_ATTEMPTS} after ${Math.round(delayMs)}ms:`,
					error instanceof Error ? error.message : error,
				);
			},
		},
	);
}
