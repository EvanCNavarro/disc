import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-route";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface UserRow {
	id: string;
}

/** POST /api/queue/cancel — cancel all queued playlists and mark active job as cancelled */
export const POST = apiRoute(async function POST() {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const users = await queryD1<UserRow>(
		"SELECT id FROM users WHERE spotify_user_id = ? LIMIT 1",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}
	const userId = users[0].id;

	// Cancel all queued and processing playlists
	await queryD1(
		`UPDATE playlists
		 SET status = 'idle', progress_data = NULL, updated_at = datetime('now')
		 WHERE user_id = ? AND status IN ('queued', 'processing') AND deleted_at IS NULL`,
		[userId],
	);

	// Mark pending/processing generations as cancelled
	await queryD1(
		`UPDATE generations
		 SET status = 'cancelled'
		 WHERE playlist_id IN (
			SELECT id FROM playlists WHERE user_id = ? AND deleted_at IS NULL
		 ) AND status IN ('pending', 'processing')`,
		[userId],
	);

	// Mark active job as cancelled
	await queryD1(
		`UPDATE jobs
		 SET status = 'cancelled', completed_at = datetime('now')
		 WHERE user_id = ? AND status = 'processing'`,
		[userId],
	);

	return NextResponse.json({ success: true });
});
