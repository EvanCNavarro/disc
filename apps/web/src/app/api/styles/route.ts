import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface StyleRow {
	id: string;
	name: string;
	description: string | null;
	is_default: number;
}

/** GET /api/styles — list all available styles */
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
		return NextResponse.json({ styles: [] });
	}

	const styles = await queryD1<StyleRow>(
		`SELECT id, name, description, is_default FROM styles
		 WHERE (user_id = ? OR is_default = 1)
		   AND (status = 'active' OR status IS NULL)
		 ORDER BY is_default DESC, name ASC`,
		[users[0].id],
	);

	return NextResponse.json({ styles });
}
