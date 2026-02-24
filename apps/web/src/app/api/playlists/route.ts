import type { DbPlaylist } from "@disc/shared";
import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-route";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";
import { fetchUserPlaylists } from "@/lib/spotify";
import { syncPlaylistsToD1 } from "@/lib/sync";

const STALE_PROCESSING_MINUTES = 15;

/** GET /api/playlists — fetch user's playlists from D1 */
export const GET = apiRoute(async function GET() {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({
			playlists: [],
			counts: { total: 0, completed: 0, processing: 0, pending: 0, failed: 0 },
		});
	}

	const userId = users[0].id;

	// Reset stale processing playlists (stuck > 15 minutes)
	// Normalize ISO timestamps (T separator → space, strip Z/ms) for SQLite datetime comparison
	// Handles both new format ($.startedAt) and old format ($.started_at)
	await queryD1(
		`UPDATE playlists
		 SET status = 'idle', progress_data = NULL, job_id = NULL
		 WHERE user_id = ? AND status = 'processing'
		   AND progress_data IS NOT NULL
		   AND replace(replace(substr(
		     COALESCE(json_extract(progress_data, '$.startedAt'), json_extract(progress_data, '$.started_at')),
		     1, 19), 'T', ' '), 'Z', '') < datetime('now', ?)`,
		[userId, `-${STALE_PROCESSING_MINUTES} minutes`],
	);

	// Reset stale queued playlists (stuck > 15 minutes — worker likely crashed)
	await queryD1(
		`UPDATE playlists
		 SET status = 'idle', progress_data = NULL, job_id = NULL
		 WHERE user_id = ? AND status = 'queued'
		   AND progress_data IS NOT NULL
		   AND replace(replace(substr(
		     json_extract(progress_data, '$.queuedAt'),
		     1, 19), 'T', ' '), 'Z', '') < datetime('now', ?)`,
		[userId, `-${STALE_PROCESSING_MINUTES} minutes`],
	);

	// Also clean up orphaned generation records (worker crashed before error handler ran)
	await queryD1(
		`UPDATE generations
		 SET status = 'failed', error_message = 'Generation timed out — worker did not respond within ${STALE_PROCESSING_MINUTES} minutes'
		 WHERE user_id = ? AND status = 'processing'
		   AND created_at < datetime('now', ?)`,
		[userId, `-${STALE_PROCESSING_MINUTES} minutes`],
	);

	const playlists = await queryD1<
		DbPlaylist & {
			latest_r2_key: string | null;
			latest_error_message: string | null;
		}
	>(
		`SELECT p.*,
			(SELECT g.r2_key FROM generations g
			 WHERE g.playlist_id = p.id AND g.status = 'completed' AND g.deleted_at IS NULL
			 ORDER BY g.created_at DESC LIMIT 1) AS latest_r2_key,
			(SELECT g.error_message FROM generations g
			 WHERE g.playlist_id = p.id AND g.status = 'failed' AND g.deleted_at IS NULL
			 ORDER BY g.created_at DESC LIMIT 1) AS latest_error_message
		 FROM playlists p
		 WHERE p.user_id = ? AND p.deleted_at IS NULL ORDER BY p.name ASC`,
		[userId],
	);

	// Compute status counts (collaborative playlists excluded from eligible/pending)
	const counts = {
		total: playlists.length,
		completed: 0,
		processing: 0,
		pending: 0,
		failed: 0,
		collaborative: 0,
	};
	for (const p of playlists) {
		if (p.contributor_count > 1) {
			counts.collaborative++;
			continue;
		}
		if (p.status === "generated") counts.completed++;
		else if (p.status === "processing" || p.status === "queued")
			counts.processing++;
		else if (p.status === "failed") counts.failed++;
		else counts.pending++;
	}

	return NextResponse.json({ playlists, counts });
});

/** POST /api/playlists — sync playlists from Spotify to D1 */
export const POST = apiRoute(async function POST() {
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
});
