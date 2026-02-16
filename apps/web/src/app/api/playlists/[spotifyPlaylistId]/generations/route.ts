import type { GenerationVersion } from "@disc/shared";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

/** GET /api/playlists/[spotifyPlaylistId]/generations — list generation history for a playlist */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ spotifyPlaylistId: string }> },
) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { spotifyPlaylistId } = await params;

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ generations: [] });
	}
	const userId = users[0].id;

	const playlists = await queryD1<{ id: string }>(
		"SELECT id FROM playlists WHERE spotify_playlist_id = ? AND user_id = ?",
		[spotifyPlaylistId, userId],
	);
	if (playlists.length === 0) {
		return NextResponse.json({ generations: [] });
	}

	const generations = await queryD1<GenerationVersion>(
		`SELECT
			g.id,
			g.r2_key,
			COALESCE(s.name, g.style_id) AS style_name,
			g.symbolic_object,
			g.prompt,
			g.trigger_type,
			g.created_at,
			g.duration_ms,
			g.analysis_id
		 FROM generations g
		 LEFT JOIN styles s ON g.style_id = s.id
		 WHERE g.playlist_id = ?
		   AND g.status = 'completed'
		   AND g.r2_key IS NOT NULL
		 ORDER BY g.created_at ASC
		 LIMIT 20`,
		[playlists[0].id],
	);

	return NextResponse.json({ generations });
}
