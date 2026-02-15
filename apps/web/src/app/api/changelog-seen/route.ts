import { APP_VERSION } from "@disc/shared";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface UserRow {
	changelog_last_seen_version: string | null;
}

export async function GET() {
	const session = await auth();
	if (!session?.spotifyId) {
		return Response.json({ changelog_last_seen_version: null });
	}

	const rows = await queryD1<UserRow>(
		"SELECT changelog_last_seen_version FROM users WHERE spotify_user_id = ? LIMIT 1",
		[session.spotifyId],
	);

	return Response.json({
		changelog_last_seen_version: rows[0]?.changelog_last_seen_version ?? null,
	});
}

export async function PATCH(req: Request) {
	const session = await auth();
	if (!session?.spotifyId) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await req.json()) as { version?: string };
	const version = body.version ?? APP_VERSION;

	await queryD1(
		"UPDATE users SET changelog_last_seen_version = ?, updated_at = datetime('now') WHERE spotify_user_id = ?",
		[version, session.spotifyId],
	);

	return Response.json({ changelog_last_seen_version: version });
}
