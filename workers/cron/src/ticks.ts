// Fire-and-forget worker tick logging.
// Records each worker execution to D1 for the Activity UI.
// Errors are logged but never thrown -- tick instrumentation
// must not break the pipeline.

import type { TickStatus, TickType } from "@disc/shared";

interface TickParams {
	userId?: string;
	tickType: TickType;
	status: TickStatus;
	durationMs?: number;
	playlistsChecked?: number;
	playlistsProcessed?: number;
	tokenRefreshed?: boolean;
	errorMessage?: string;
	startedAt: string;
}

export async function insertWorkerTick(
	db: D1Database,
	params: TickParams,
): Promise<void> {
	try {
		await db
			.prepare(
				`INSERT INTO worker_ticks
				 (user_id, tick_type, status, duration_ms, playlists_checked,
				  playlists_processed, token_refreshed, error_message,
				  started_at, completed_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
			)
			.bind(
				params.userId ?? null,
				params.tickType,
				params.status,
				params.durationMs ?? null,
				params.playlistsChecked ?? null,
				params.playlistsProcessed ?? null,
				params.tokenRefreshed ? 1 : 0,
				params.errorMessage ?? null,
				params.startedAt,
			)
			.run();
	} catch (error) {
		console.error(
			"[Tick] Failed to insert:",
			error instanceof Error ? error.message : error,
		);
	}
}

// Prune ticks older than 30 days. Called once per day (midnight heartbeat).
export async function pruneOldTicks(db: D1Database): Promise<void> {
	try {
		const result = await db
			.prepare(
				"DELETE FROM worker_ticks WHERE created_at < datetime('now', '-30 days')",
			)
			.run();
		if (result.meta.changes > 0) {
			console.log(`[Tick] Pruned ${result.meta.changes} old ticks`);
		}
	} catch (error) {
		console.error(
			"[Tick] Failed to prune:",
			error instanceof Error ? error.message : error,
		);
	}
}
