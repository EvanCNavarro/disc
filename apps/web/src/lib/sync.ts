import type { DbPlaylist, SpotifyPlaylist } from "@disc/shared";
import { queryD1 } from "./db";

/** Upsert playlists from Spotify into D1. */
export async function syncPlaylistsToD1(
	spotifyUserId: string,
	playlists: SpotifyPlaylist[],
) {
	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[spotifyUserId],
	);
	if (users.length === 0) return;
	const userId = users[0].id;

	const existing = await queryD1<
		Pick<DbPlaylist, "id" | "spotify_playlist_id">
	>("SELECT id, spotify_playlist_id FROM playlists WHERE user_id = ?", [
		userId,
	]);
	const existingMap = new Map(
		existing.map((p) => [p.spotify_playlist_id, p.id]),
	);

	for (const playlist of playlists) {
		const coverUrl = playlist.images[0]?.url ?? null;
		const trackCount = playlist.items.total;

		if (existingMap.has(playlist.id)) {
			await queryD1(
				"UPDATE playlists SET name = ?, description = ?, track_count = ?, spotify_cover_url = ?, updated_at = datetime('now') WHERE user_id = ? AND spotify_playlist_id = ?",
				[
					playlist.name,
					playlist.description,
					trackCount,
					coverUrl,
					userId,
					playlist.id,
				],
			);
		} else {
			await queryD1(
				"INSERT INTO playlists (user_id, spotify_playlist_id, name, description, track_count, spotify_cover_url) VALUES (?, ?, ?, ?, ?, ?)",
				[
					userId,
					playlist.id,
					playlist.name,
					playlist.description,
					trackCount,
					coverUrl,
				],
			);
		}
	}
}
