import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-route";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

const MAX_BATCH_SIZE = 50;

interface PlaylistConfig {
	playlistId: string;
	lightExtractionText?: string;
}

/** POST /api/playlists/generate-batch — trigger generation for multiple playlists */
export const POST = apiRoute(async function POST(request) {
	try {
		const session = await auth();
		if (!session?.spotifyId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = (await request.json()) as {
			playlistIds?: string[];
			playlistConfigs?: PlaylistConfig[];
			styleId?: string;
		};

		// Support both legacy (playlistIds) and new (playlistConfigs) format
		const configs: PlaylistConfig[] = body.playlistConfigs
			? body.playlistConfigs
			: (body.playlistIds ?? []).map((id) => ({ playlistId: id }));

		if (configs.length === 0) {
			return NextResponse.json(
				{ error: "playlistIds or playlistConfigs is required" },
				{ status: 400 },
			);
		}

		if (configs.length > MAX_BATCH_SIZE) {
			return NextResponse.json(
				{ error: `Max ${MAX_BATCH_SIZE} playlists per batch` },
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
		const userId = users[0].id;

		// Validate all playlists belong to this user
		const ids = configs.map((c) => c.playlistId);
		const placeholders = ids.map(() => "?").join(",");
		const playlists = await queryD1<{
			id: string;
			name: string;
			is_collaborative: number;
			contributor_count: number;
			owner_spotify_id: string | null;
		}>(
			`SELECT id, name, is_collaborative, contributor_count, owner_spotify_id FROM playlists WHERE id IN (${placeholders}) AND user_id = ? AND deleted_at IS NULL`,
			[...ids, userId],
		);

		if (playlists.length !== ids.length) {
			return NextResponse.json(
				{ error: "Some playlists not found or not owned by user" },
				{ status: 400 },
			);
		}

		// Filter out collaborative or non-owned playlists
		const eligibleSet = new Set<string>();
		for (const p of playlists) {
			if (p.is_collaborative || p.contributor_count > 1) {
				console.warn(
					`[generate-batch] Skipping collaborative playlist "${p.name}" (${p.id})`,
				);
				continue;
			}
			if (p.owner_spotify_id && p.owner_spotify_id !== session.spotifyId) {
				console.warn(
					`[generate-batch] Skipping non-owned playlist "${p.name}" (${p.id}), owner: ${p.owner_spotify_id}`,
				);
				continue;
			}
			eligibleSet.add(p.id);
		}

		const eligibleConfigs = configs.filter((c) =>
			eligibleSet.has(c.playlistId),
		);
		const skipped = configs.length - eligibleConfigs.length;

		if (eligibleConfigs.length === 0) {
			return NextResponse.json(
				{
					error:
						"No eligible playlists — collaborative and non-owned playlists cannot receive generated covers",
				},
				{ status: 400 },
			);
		}

		const workerUrl = process.env.DISC_WORKER_URL;
		const workerToken = process.env.WORKER_AUTH_TOKEN;

		if (!workerUrl || !workerToken) {
			return NextResponse.json(
				{ error: "Worker not configured" },
				{ status: 500 },
			);
		}

		// Create a job row so the queue status endpoint can track this batch
		const jobId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
		await queryD1(
			`INSERT INTO jobs (id, user_id, type, status, total_playlists, started_at, created_at)
		 VALUES (?, ?, 'manual', 'processing', ?, datetime('now'), datetime('now'))`,
			[jobId, userId, eligibleConfigs.length],
		);

		// Associate playlists with this job
		await queryD1(
			`UPDATE playlists SET job_id = ? WHERE id IN (${eligibleConfigs.map(() => "?").join(",")}) AND user_id = ?`,
			[jobId, ...eligibleConfigs.map((c) => c.playlistId), userId],
		);

		// Dispatch per-playlist to worker. Each playlist may have different
		// light_extraction_text, so we make individual calls. The worker marks
		// playlists as "queued" immediately in setupTrigger, so timeout is a
		// success case (pipeline keeps running).
		let succeeded = 0;
		let failed = 0;

		// Dispatch per-playlist to worker. The worker responds immediately
		// after queuing (pipeline runs in background via ctx.waitUntil).
		for (const config of eligibleConfigs) {
			try {
				const response = await fetch(`${workerUrl}/trigger`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${workerToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						playlist_id: config.playlistId,
						style_id: body.styleId,
						light_extraction_text: config.lightExtractionText,
						trigger_type: "manual",
						access_token: session.accessToken,
					}),
					signal: AbortSignal.timeout(30_000),
				});

				if (response.ok) {
					succeeded++;
				} else {
					const errorBody = await response.text().catch(() => "");
					console.error(
						`[generate-batch] Worker returned ${response.status} for ${config.playlistId}: ${errorBody}`,
					);
					failed++;
				}
			} catch (error) {
				console.error(
					`[generate-batch] Failed to trigger playlist ${config.playlistId}:`,
					error,
				);
				failed++;
			}
		}

		// Update job with actual dispatch counts (total_playlists reflects what actually dispatched)
		await queryD1(`UPDATE jobs SET total_playlists = ? WHERE id = ?`, [
			succeeded,
			jobId,
		]);

		// If all dispatches failed, mark job as failed immediately
		if (succeeded === 0) {
			await queryD1(
				`UPDATE jobs SET status = 'failed', failed_playlists = ?, completed_at = datetime('now') WHERE id = ?`,
				[failed, jobId],
			);
		}

		return NextResponse.json({
			total: configs.length,
			succeeded,
			skipped,
			failed,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown server error";
		console.error("[generate-batch] Unhandled error:", message);
		return NextResponse.json({ error: message }, { status: 500 });
	}
});
