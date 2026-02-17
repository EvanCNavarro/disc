import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";
import { generateThumbnail } from "@/lib/generate-thumbnail";

/** POST /api/styles/[id]/thumbnail — generate canonical thumbnail for a style */
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}

	const { id } = await params;

	// Verify ownership (allow built-in styles)
	const styles = await queryD1<{ user_id: string; is_default: number }>(
		"SELECT user_id, is_default FROM styles WHERE id = ?",
		[id],
	);
	if (styles.length === 0) {
		return NextResponse.json({ error: "Style not found" }, { status: 404 });
	}
	if (styles[0].user_id !== users[0].id && styles[0].is_default !== 1) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const thumbnailUrl = await generateThumbnail(id);

	if (!thumbnailUrl) {
		return NextResponse.json(
			{ error: "Thumbnail generation failed" },
			{ status: 502 },
		);
	}

	return NextResponse.json({ thumbnailUrl });
}
