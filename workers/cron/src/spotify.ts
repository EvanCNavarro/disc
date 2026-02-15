/**
 * Spotify Service (Worker)
 *
 * Token refresh via encrypted refresh token + cover image upload + track fetching.
 * Handles PKCE refresh token rotation.
 */

import { CONFIG } from "@disc/shared";
import { decrypt, encrypt } from "./crypto";

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

	const data = (await response.json()) as {
		access_token: string;
		refresh_token?: string;
	};

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

	console.log(`[Spotify] Cover uploaded for playlist ${playlistId}`);
}

export interface PlaylistTrack {
	name: string;
	artist: string;
	album: string;
}

/**
 * Fetches tracks for a Spotify playlist.
 * Uses fields param to minimize response size.
 */
export async function fetchPlaylistTracks(
	spotifyPlaylistId: string,
	accessToken: string,
	limit: number = CONFIG.MAX_TRACKS_PER_PLAYLIST,
): Promise<PlaylistTrack[]> {
	// Feb 2026 Spotify API: items (not tracks)
	const fields = "items(item(name,artists(name),album(name)))";
	const url = `https://api.spotify.com/v1/playlists/${spotifyPlaylistId}?fields=${encodeURIComponent(fields)}&limit=${limit}`;

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
		items?: Array<{
			item: {
				name: string;
				artists: Array<{ name: string }>;
				album: { name: string };
			};
		}>;
		// Legacy field name fallback
		tracks?: {
			items: Array<{
				track: {
					name: string;
					artists: Array<{ name: string }>;
					album: { name: string };
				};
			}>;
		};
	};

	// Handle both Feb 2026 (items) and legacy (tracks) field names
	if (data.items) {
		return data.items.slice(0, limit).map((item) => ({
			name: item.item.name,
			artist: item.item.artists.map((a) => a.name).join(", "),
			album: item.item.album.name,
		}));
	}

	if (data.tracks?.items) {
		return data.tracks.items.slice(0, limit).map((item) => ({
			name: item.track.name,
			artist: item.track.artists.map((a) => a.name).join(", "),
			album: item.track.album.name,
		}));
	}

	return [];
}
