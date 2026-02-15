import type { DbPlaylist } from "@disc/shared";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";
import { fetchUserPlaylists } from "@/lib/spotify";
import { syncPlaylistsToD1 } from "@/lib/sync";

/** GET /api/playlists — fetch user's playlists from D1 */
export async function GET() {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ playlists: [] });
	}

	const playlists = await queryD1<DbPlaylist>(
		"SELECT * FROM playlists WHERE user_id = ? ORDER BY name ASC",
		[users[0].id],
	);

	return NextResponse.json({ playlists });
}

/** POST /api/playlists — sync playlists from Spotify to D1 */
export async function POST() {
	const session = await auth();
	if (!session?.accessToken || !session.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const playlists = await fetchUserPlaylists(session.accessToken);
		await syncPlaylistsToD1(session.spotifyId, playlists);
		return NextResponse.json({ synced: playlists.length });
	} catch (error) {
		console.error("Playlist sync failed:", error);
		return NextResponse.json({ error: "Sync failed" }, { status: 500 });
	}
}
