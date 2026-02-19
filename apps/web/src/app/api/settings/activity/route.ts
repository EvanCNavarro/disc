import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface TickRow {
	id: string;
	user_id: string | null;
	tick_type: string;
	status: string;
	duration_ms: number | null;
	playlists_checked: number | null;
	playlists_processed: number | null;
	token_refreshed: number;
	integrity_checked: number | null;
	integrity_flagged: number | null;
	error_message: string | null;
	started_at: string;
	completed_at: string | null;
	created_at: string;
}

export async function GET(request: Request) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const dateParam = url.searchParams.get("date");

	// Default to today UTC
	const date = dateParam || new Date().toISOString().slice(0, 10);
	const dayStart = `${date} 00:00:00`;
	const dayEnd = `${date} 23:59:59`;

	// Fetch ticks for the requested day
	const ticks = await queryD1<TickRow>(
		`SELECT * FROM worker_ticks
		 WHERE created_at >= ? AND created_at <= ?
		 ORDER BY created_at ASC`,
		[dayStart, dayEnd],
	);

	// Build timeline data
	const timeline = ticks.map((t) => {
		const d = new Date(
			t.started_at.endsWith("Z") ? t.started_at : `${t.started_at}Z`,
		);
		return {
			minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
			tickType: t.tick_type,
			status: t.status,
			durationMs: t.duration_ms,
			playlistsChecked: t.playlists_checked,
			playlistsProcessed: t.playlists_processed,
			tokenRefreshed: t.token_refreshed === 1,
			integrityChecked: t.integrity_checked,
			integrityFlagged: t.integrity_flagged,
			errorMessage: t.error_message,
			startedAt: t.started_at,
			completedAt: t.completed_at,
		};
	});

	// Summary stats — "skipped" ticks are excluded from success rate
	// since they represent disabled watchers, not failed operations
	const totalTicks = ticks.length;
	const skippedCount = ticks.filter((t) => t.status === "skipped").length;
	const attemptedCount = totalTicks - skippedCount;
	const successCount = ticks.filter(
		(t) => t.status === "success" || t.status === "no_work",
	).length;
	const failureCount = ticks.filter((t) => t.status === "failure").length;
	const durations = ticks
		.map((t) => t.duration_ms)
		.filter((d): d is number => d !== null);
	const avgDurationMs =
		durations.length > 0
			? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
			: 0;
	const minDurationMs = durations.length > 0 ? Math.min(...durations) : null;
	const maxDurationMs = durations.length > 0 ? Math.max(...durations) : null;

	// Last failure across all time
	const lastFailureRows = await queryD1<{ created_at: string }>(
		"SELECT created_at FROM worker_ticks WHERE status = 'failure' ORDER BY created_at DESC LIMIT 1",
		[],
	);
	const lastFailure = lastFailureRows[0]?.created_at ?? null;

	// Last heartbeat
	const lastHeartbeatRows = await queryD1<{ created_at: string }>(
		"SELECT created_at FROM worker_ticks WHERE tick_type = 'heartbeat' AND status = 'success' ORDER BY created_at DESC LIMIT 1",
		[],
	);
	const lastHeartbeat = lastHeartbeatRows[0]?.created_at ?? null;

	// Health checks
	const recentSuccess = await queryD1<{ cnt: number }>(
		"SELECT COUNT(*) as cnt FROM worker_ticks WHERE token_refreshed = 1 AND status != 'failure' AND created_at > datetime('now', '-24 hours')",
		[],
	);
	const recentWatcher = await queryD1<{ cnt: number }>(
		"SELECT COUNT(*) as cnt FROM worker_ticks WHERE tick_type = 'watcher' AND status != 'skipped' AND created_at > datetime('now', '-15 minutes')",
		[],
	);
	const recentCron = await queryD1<{ cnt: number }>(
		"SELECT COUNT(*) as cnt FROM worker_ticks WHERE tick_type = 'cron' AND created_at > datetime('now', '-25 hours')",
		[],
	);
	const recentHeartbeat = await queryD1<{ cnt: number }>(
		"SELECT COUNT(*) as cnt FROM worker_ticks WHERE tick_type = 'heartbeat' AND status = 'success' AND created_at > datetime('now', '-25 hours')",
		[],
	);

	return NextResponse.json({
		timeline,
		summary: {
			totalTicks,
			attemptedCount,
			skippedCount,
			successCount,
			failureCount,
			successRate:
				attemptedCount > 0
					? Math.round((successCount / attemptedCount) * 100)
					: 100,
			lastFailure,
			lastHeartbeat,
			avgDurationMs,
			minDurationMs,
			maxDurationMs,
		},
		health: {
			tokenAlive: (recentSuccess[0]?.cnt ?? 0) > 0,
			watcherActive: (recentWatcher[0]?.cnt ?? 0) > 0,
			cronActive: (recentCron[0]?.cnt ?? 0) > 0,
			heartbeatCurrent: (recentHeartbeat[0]?.cnt ?? 0) > 0,
		},
	});
}
