/**
 * Spotify Web API helpers.
 *
 * Feb 2026 compliance: playlist.tracks → playlist.items
 */

import type { SpotifyPlaylist } from "@disc/shared";

const SPOTIFY_API = "https://api.spotify.com/v1";

interface SpotifyPaginatedResponse {
	items: RawPlaylistItem[];
	total: number;
	limit: number;
	offset: number;
	next: string | null;
}

/** Raw playlist shape from /v1/me/playlists (Feb 2026 field names) */
interface RawPlaylistItem {
	id: string;
	name: string;
	description: string | null;
	images: Array<{ url: string; width: number; height: number }>;
	// Feb 2026: "tracks" renamed to "items" — handle both
	tracks?: { total: number };
	items?: { total: number };
	owner: { id: string; display_name: string };
	collaborative?: boolean;
	snapshot_id: string;
	public: boolean | null;
}

async function spotifyFetch<T>(url: string, accessToken: string): Promise<T> {
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Spotify API error (${response.status}): ${text}`);
	}

	return response.json() as Promise<T>;
}

/**
 * Fetch all of the authenticated user's playlists (paginated).
 * Returns SpotifyPlaylist[] with items.items as empty array (list view only).
 */
export async function fetchUserPlaylists(
	accessToken: string,
): Promise<SpotifyPlaylist[]> {
	const allPlaylists: SpotifyPlaylist[] = [];
	let url: string | null = `${SPOTIFY_API}/me/playlists?limit=50`;

	while (url) {
		const page: SpotifyPaginatedResponse =
			await spotifyFetch<SpotifyPaginatedResponse>(url, accessToken);

		for (const raw of page.items) {
			const trackTotal = raw.items?.total ?? raw.tracks?.total ?? 0;
			allPlaylists.push({
				id: raw.id,
				name: raw.name,
				description: raw.description,
				images: raw.images,
				items: { total: trackTotal, items: [] },
				owner: raw.owner,
				collaborative: raw.collaborative ?? false,
				snapshot_id: raw.snapshot_id,
				public: raw.public ?? null,
			});
		}

		url = page.next;
	}

	return allPlaylists;
}
