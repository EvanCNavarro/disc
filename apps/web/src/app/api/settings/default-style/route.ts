import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-route";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

/** PUT /api/settings/default-style — update user's style_preference */
export const PUT = apiRoute(async function PUT(request) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as { styleId?: string };
	if (!body.styleId) {
		return NextResponse.json({ error: "styleId is required" }, { status: 400 });
	}

	// Verify style exists
	const styles = await queryD1<{ id: string }>(
		"SELECT id FROM styles WHERE id = ?",
		[body.styleId],
	);
	if (styles.length === 0) {
		return NextResponse.json({ error: "Style not found" }, { status: 404 });
	}

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}

	await queryD1(
		"UPDATE users SET style_preference = ?, updated_at = datetime('now') WHERE id = ?",
		[body.styleId, users[0].id],
	);

	return NextResponse.json({ success: true });
});
