import type { GenerationStatus, GenerationVersion } from "@disc/shared";
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
		"SELECT id FROM playlists WHERE spotify_playlist_id = ? AND user_id = ? AND deleted_at IS NULL",
		[spotifyPlaylistId, userId],
	);
	if (playlists.length === 0) {
		return NextResponse.json({ generations: [] });
	}

	const rows = await queryD1<{
		id: string;
		r2_key: string | null;
		status: GenerationStatus;
		error_message: string | null;
		style_name: string;
		symbolic_object: string;
		prompt: string;
		trigger_type: string;
		created_at: string;
		duration_ms: number | null;
		analysis_id: string | null;
	}>(
		`SELECT
			g.id,
			g.r2_key,
			g.status,
			g.error_message,
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
		   AND g.status IN ('completed', 'failed')
		   AND g.deleted_at IS NULL
		 ORDER BY g.created_at ASC
		 LIMIT 20`,
		[playlists[0].id],
	);

	const generations: GenerationVersion[] = rows.map((r) => ({
		id: r.id,
		r2_key: r.r2_key,
		status: r.status,
		errorMessage: r.error_message,
		style_name: r.style_name,
		symbolic_object: r.symbolic_object,
		prompt: r.prompt,
		trigger_type: r.trigger_type,
		created_at: r.created_at,
		duration_ms: r.duration_ms,
		analysis_id: r.analysis_id,
	}));

	return NextResponse.json({ generations });
}
