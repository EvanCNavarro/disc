import type { WatcherSettings } from "@disc/shared";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface UserRow {
	id: string;
	watcher_enabled: number;
	watcher_interval_minutes: number;
}

const VALID_INTERVALS = [5, 10, 15] as const;

/** GET /api/settings/watcher — returns current watcher settings */
export async function GET() {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const users = await queryD1<UserRow>(
		"SELECT id, watcher_enabled, watcher_interval_minutes FROM users WHERE spotify_user_id = ? LIMIT 1",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}

	const user = users[0];
	const settings: WatcherSettings = {
		enabled: user.watcher_enabled === 1,
		intervalMinutes: (VALID_INTERVALS.includes(
			user.watcher_interval_minutes as (typeof VALID_INTERVALS)[number],
		)
			? user.watcher_interval_minutes
			: 5) as 5 | 10 | 15,
	};

	return NextResponse.json(settings);
}

/** PATCH /api/settings/watcher — update watcher enabled/interval */
export async function PATCH(request: Request) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as {
		enabled?: boolean;
		intervalMinutes?: number;
	};

	// Validate intervalMinutes if provided
	if (
		body.intervalMinutes !== undefined &&
		!VALID_INTERVALS.includes(
			body.intervalMinutes as (typeof VALID_INTERVALS)[number],
		)
	) {
		return NextResponse.json(
			{ error: "intervalMinutes must be 5, 10, or 15" },
			{ status: 400 },
		);
	}

	if (body.enabled === undefined && body.intervalMinutes === undefined) {
		return NextResponse.json(
			{ error: "At least one of enabled or intervalMinutes is required" },
			{ status: 400 },
		);
	}

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}

	const setClauses: string[] = [];
	const params: unknown[] = [];

	if (body.enabled !== undefined) {
		setClauses.push("watcher_enabled = ?");
		params.push(body.enabled ? 1 : 0);
	}

	if (body.intervalMinutes !== undefined) {
		setClauses.push("watcher_interval_minutes = ?");
		params.push(body.intervalMinutes);
	}

	setClauses.push("updated_at = datetime('now')");
	params.push(users[0].id);

	await queryD1(
		`UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`,
		params,
	);

	return NextResponse.json({ success: true });
}
