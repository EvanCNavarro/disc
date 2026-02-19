// DISC Cron Worker
//
// Single scheduled trigger (every 5 min) runs two parallel flows:
// - Watcher: detects new Spotify playlists, auto-triggers APLOTOCA
// - Scheduled cron: regenerates playlists at user's configured cron_time
//
// Also exposes HTTP endpoints: /trigger, /health, /upload, /image
//
// -- Token Lifecycle (IMPORTANT) --
//
// Spotify access tokens expire after 1 hour, but the worker never
// persists or reuses them. Every execution calls refreshAccessToken(),
// which exchanges the long-lived refresh token (stored encrypted in D1)
// for a brand-new access token. The access token is used once and
// discarded when the execution ends.
//
// This means the 1-hour expiry is irrelevant -- the refresh token is
// what keeps the system alive. Spotify may revoke a refresh token that
// hasn't been used for an extended period (~6+ months of zero usage).
// Each call to refreshAccessToken() resets that clock.
//
// CRITICAL: At least one of watcher or scheduled cron must remain
// active (cron_enabled = 1 on the user) to keep the refresh token
// alive. If both are disabled and the user doesn't log into the web
// app, the token will eventually go stale and require manual
// re-authentication via the web UI.
//
// Recovery from a revoked token: user logs in at the web app ->
// Spotify issues a new refresh token -> signIn() callback encrypts
// and stores it in D1 -> next worker tick picks it up automatically.

import type { DbStyle } from "@disc/shared";
import {
	compressForSpotify,
	computePerceptualHash,
	hammingDistance,
	PHASH_MATCH_THRESHOLD,
} from "./image";
import { generateForPlaylist, type PipelineEnv } from "./pipeline";
import { fetchUserPlaylists, refreshAccessToken } from "./spotify";
import { insertWorkerTick, pruneOldTicks } from "./ticks";

export interface Env {
	DB: D1Database;
	IMAGES: R2Bucket;
	REPLICATE_API_TOKEN: string;
	OPENAI_API_KEY: string;
	ENCRYPTION_KEY: string;
	SPOTIFY_CLIENT_ID: string;
	SPOTIFY_CLIENT_SECRET: string;
	WORKER_AUTH_TOKEN: string;
	ENVIRONMENT: string;
}

interface UserRow {
	id: string;
	encrypted_refresh_token: string;
	style_preference: string | null;
	cron_time: string;
	spotify_user_id: string;
	watcher_enabled: number;
	watcher_interval_minutes: number;
}

interface WatchedPlaylistRow {
	id: string;
	spotify_playlist_id: string;
	auto_detect_status: string | null;
	auto_detect_snapshot: string | null;
	auto_detected_at: string | null;
	contributor_count: number;
	last_seen_cover_url: string | null;
	cover_verified_at: string | null;
}

/** Spotify's auto-generated 2x2 mosaic covers come from mosaic.scdn.co */
function isMosaicUrl(url: string | null): boolean {
	return url?.includes("mosaic.scdn.co") ?? false;
}

/**
 * Fetches a Spotify cover image and computes its perceptual hash.
 * Normalizes via compressForSpotify() first so the hash is computed
 * on the same format as our stored hash (640x640 JPEG), eliminating
 * format/resolution differences from Spotify's CDN re-encoding.
 * Returns null if the fetch or hash computation fails.
 */
async function fetchSpotifyCoverPhash(
	imageUrl: string,
): Promise<string | null> {
	try {
		const resp = await fetch(imageUrl);
		if (!resp.ok) return null;
		const bytes = new Uint8Array(await resp.arrayBuffer());
		// Normalize: compress to our standard format before hashing,
		// matching the pipeline's hash computation path exactly
		const base64Jpeg = await compressForSpotify(bytes);
		const jpegBytes = Uint8Array.from(atob(base64Jpeg), (c) => c.charCodeAt(0));
		return computePerceptualHash(jpegBytes);
	} catch {
		return null;
	}
}

/**
 * Resets a playlist for regeneration after cover integrity failure.
 * Soft-deletes the generation and resets playlist to idle/watching state.
 */
async function resetCoverForPlaylist(
	db: D1Database,
	playlistId: string,
	generationId: string,
): Promise<void> {
	await db
		.prepare(
			`UPDATE generations SET deleted_at = datetime('now', 'utc') WHERE id = ?`,
		)
		.bind(generationId)
		.run();

	await db
		.prepare(
			`UPDATE playlists
			 SET status = 'idle',
				 auto_detect_status = 'watching',
				 last_seen_cover_url = NULL,
				 cover_verified_at = NULL
			 WHERE id = ?`,
		)
		.bind(playlistId)
		.run();
}

/** Returns true if the user's cron_time (HH:MM UTC) is within N minutes from now. */
function isCronWithinMinutes(cronTime: string, minutes: number): boolean {
	const [hh, mm] = cronTime.split(":").map(Number);
	if (Number.isNaN(hh) || Number.isNaN(mm)) return false;
	const now = new Date();
	const cronTotalMin = hh * 60 + mm;
	const nowTotalMin = now.getUTCHours() * 60 + now.getUTCMinutes();
	// Handle midnight wrap (e.g., now=23:55, cron=00:03)
	let diff = cronTotalMin - nowTotalMin;
	if (diff < 0) diff += 1440;
	return diff > 0 && diff <= minutes;
}

interface PlaylistRow {
	id: string;
	spotify_playlist_id: string;
	name: string;
	user_id: string;
}

export default {
	async scheduled(
		_controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		// Single every-5-min trigger handles watcher, cron, and daily heartbeat.
		ctx.waitUntil(watchForNewPlaylists(env));
		ctx.waitUntil(runScheduledCron(env));

		// Daily heartbeat at midnight UTC: refresh tokens for ALL users
		// (regardless of cron_enabled/watcher_enabled) to prevent token
		// revocation from extended inactivity. Also prunes old ticks.
		const now = new Date();
		if (now.getUTCHours() === 0 && now.getUTCMinutes() < 5) {
			ctx.waitUntil(runHeartbeat(env));
		}
	},

	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return Response.json({ status: "ok", worker: "disc-cron" });
		}

		if (url.pathname === "/trigger") {
			if (request.method !== "POST") {
				return Response.json({ error: "Method not allowed" }, { status: 405 });
			}

			const authHeader = request.headers.get("Authorization");
			const expectedToken = env.WORKER_AUTH_TOKEN;
			if (
				!expectedToken ||
				!authHeader ||
				authHeader !== `Bearer ${expectedToken}`
			) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}

			try {
				const body = (await request.json()) as {
					playlist_id?: string;
					playlist_ids?: string[];
					playlist?: string;
					limit?: number;
					style_id?: string;
					revision_notes?: string;
					custom_object?: string;
					light_extraction_text?: string;
					trigger_type?: string;
					access_token?: string;
				};

				const options: TriggerOptions = {
					limit: body.limit ?? 1,
					playlistFilter: body.playlist ?? null,
					playlistId: body.playlist_id ?? null,
					playlistIds: body.playlist_ids ?? null,
					styleId: body.style_id ?? null,
					revisionNotes: body.revision_notes ?? null,
					customObject: body.custom_object ?? null,
					lightExtractionText: body.light_extraction_text ?? null,
					triggerType:
						(body.trigger_type as "manual" | "cron" | "auto") ?? "manual",
					accessToken: body.access_token ?? null,
				};

				// Validate and set playlists to "queued" synchronously
				const setup = await setupTrigger(env, options);

				await insertWorkerTick(env.DB, {
					userId: setup.user.id,
					tickType: options.triggerType === "auto" ? "auto" : "manual",
					status: "success",
					playlistsProcessed: setup.playlists.length,
					tokenRefreshed: !options.accessToken,
					startedAt: new Date().toISOString(),
				});

				// Run pipeline in background — ctx.waitUntil() keeps the
				// worker alive for I/O-bound operations (same pattern as
				// the scheduled/cron handler). Respond immediately so the
				// caller doesn't need to hold the connection open.
				ctx.waitUntil(executeTrigger(env, setup, options));

				return Response.json({
					queued: true,
					playlists: setup.playlists.map((p) => p.name),
				});
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				await insertWorkerTick(env.DB, {
					tickType: "manual",
					status: "failure",
					errorMessage: msg,
					startedAt: new Date().toISOString(),
				});
				return Response.json({ error: msg }, { status: 500 });
			}
		}

		if (url.pathname === "/upload" && request.method === "POST") {
			const authHeader = request.headers.get("Authorization");
			if (
				!env.WORKER_AUTH_TOKEN ||
				!authHeader ||
				authHeader !== `Bearer ${env.WORKER_AUTH_TOKEN}`
			) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}

			const key = url.searchParams.get("key");
			if (!key) {
				return Response.json(
					{ error: "Missing key parameter" },
					{ status: 400 },
				);
			}

			// Only allow styles/ prefix for thumbnail uploads
			if (!key.startsWith("styles/") || key.includes("..")) {
				return Response.json({ error: "Invalid key" }, { status: 400 });
			}

			const imageBytes = await request.arrayBuffer();
			await env.IMAGES.put(key, imageBytes, {
				httpMetadata: {
					contentType: request.headers.get("Content-Type") ?? "image/png",
				},
			});

			return Response.json({ key });
		}

		if (url.pathname === "/image") {
			const authHeader = request.headers.get("Authorization");
			if (
				!env.WORKER_AUTH_TOKEN ||
				!authHeader ||
				authHeader !== `Bearer ${env.WORKER_AUTH_TOKEN}`
			) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}

			const key = url.searchParams.get("key");
			if (!key) {
				return Response.json(
					{ error: "Missing key parameter" },
					{ status: 400 },
				);
			}

			const object = await env.IMAGES.get(key);
			if (!object) {
				return Response.json({ error: "Image not found" }, { status: 404 });
			}

			const headers = new Headers();
			headers.set(
				"Content-Type",
				object.httpMetadata?.contentType ?? "image/png",
			);
			headers.set("Cache-Control", "public, max-age=31536000, immutable");
			return new Response(object.body, { headers });
		}

		if (url.pathname === "/hash" && request.method === "POST") {
			const authHeader = request.headers.get("Authorization");
			if (authHeader !== `Bearer ${env.WORKER_AUTH_TOKEN}`) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}

			try {
				const imageBytes = new Uint8Array(await request.arrayBuffer());
				// Compress to JPEG first (same as pipeline) so phash matches what Spotify receives
				const base64Jpeg = await compressForSpotify(imageBytes);
				const jpegBytes = Uint8Array.from(atob(base64Jpeg), (c) =>
					c.charCodeAt(0),
				);
				const phash = computePerceptualHash(jpegBytes);
				return Response.json({ phash });
			} catch (err) {
				return Response.json(
					{
						error: err instanceof Error ? err.message : "Hash failed",
					},
					{ status: 500 },
				);
			}
		}

		return new Response("Not Found", { status: 404 });
	},
};

// Daily heartbeat -- refreshes tokens for ALL users regardless of settings.
// This prevents Spotify from revoking tokens due to extended inactivity.
// Also prunes worker_ticks older than 30 days.
async function runHeartbeat(env: Env): Promise<void> {
	console.log("[Heartbeat] Running daily token refresh and tick pruning");

	await pruneOldTicks(env.DB);

	const usersResult = await env.DB.prepare(
		"SELECT id, encrypted_refresh_token FROM users WHERE encrypted_refresh_token IS NOT NULL",
	).all<{ id: string; encrypted_refresh_token: string }>();

	for (const user of usersResult.results) {
		const tickStart = new Date().toISOString();
		const startMs = Date.now();
		try {
			await refreshAccessToken(
				user.encrypted_refresh_token,
				env.ENCRYPTION_KEY,
				env.SPOTIFY_CLIENT_ID,
				env.SPOTIFY_CLIENT_SECRET,
				env.DB,
				user.id,
			);
			await insertWorkerTick(env.DB, {
				userId: user.id,
				tickType: "heartbeat",
				status: "success",
				durationMs: Date.now() - startMs,
				tokenRefreshed: true,
				startedAt: tickStart,
			});
			console.log(`[Heartbeat] Token refreshed for user ${user.id}`);
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			console.error(`[Heartbeat] Failed for user ${user.id}: ${msg}`);
			await insertWorkerTick(env.DB, {
				userId: user.id,
				tickType: "heartbeat",
				status: "failure",
				durationMs: Date.now() - startMs,
				tokenRefreshed: false,
				errorMessage: msg,
				startedAt: tickStart,
			});
		}
	}
}

/**
 * Checks if any user's cron_time falls in the current 5-minute window.
 * E.g., at 09:25 UTC, matches cron_time values "09:25" through "09:29".
 */
async function runScheduledCron(env: Env): Promise<void> {
	const now = new Date();
	const hh = now.getUTCHours().toString().padStart(2, "0");
	const mm = now.getUTCMinutes();
	const windowStart = `${hh}:${mm.toString().padStart(2, "0")}`;
	const windowEndMm = mm + 4;
	const windowEnd =
		windowEndMm >= 60
			? `${((now.getUTCHours() + 1) % 24).toString().padStart(2, "0")}:${(windowEndMm - 60).toString().padStart(2, "0")}`
			: `${hh}:${windowEndMm.toString().padStart(2, "0")}`;

	console.log(
		`[Cron] Checking for users in window ${windowStart}–${windowEnd}`,
	);

	const usersResult = await env.DB.prepare(
		`SELECT id, encrypted_refresh_token, style_preference, cron_time, spotify_user_id,
		        watcher_enabled, watcher_interval_minutes
		 FROM users
		 WHERE cron_enabled = 1
		   AND cron_time >= ? AND cron_time <= ?`,
	)
		.bind(windowStart, windowEnd)
		.all<UserRow>();

	const users = usersResult.results;

	if (users.length === 0) {
		return;
	}

	console.log(`[Cron] ${users.length} user(s) scheduled in this window`);

	for (const user of users) {
		const tickStart = new Date().toISOString();
		const startMs = Date.now();
		try {
			const result = await processUser(user, env);
			await insertWorkerTick(env.DB, {
				userId: user.id,
				tickType: "cron",
				status: result.playlistCount > 0 ? "success" : "no_work",
				durationMs: Date.now() - startMs,
				playlistsProcessed: result.playlistCount,
				tokenRefreshed: true,
				startedAt: tickStart,
			});
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			await insertWorkerTick(env.DB, {
				userId: user.id,
				tickType: "cron",
				status: "failure",
				durationMs: Date.now() - startMs,
				errorMessage: msg,
				startedAt: tickStart,
			});
		}
	}
}

async function processUser(
	user: UserRow,
	env: Env,
): Promise<{ playlistCount: number }> {
	const jobId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);

	try {
		await env.DB.prepare(
			`INSERT INTO jobs (id, user_id, type, status, started_at, created_at)
			 VALUES (?, ?, 'cron', 'processing', datetime('now'), datetime('now'))`,
		)
			.bind(jobId, user.id)
			.run();

		console.log(`[Cron] Refreshing token for user ${user.id}`);
		const accessToken = await refreshAccessToken(
			user.encrypted_refresh_token,
			env.ENCRYPTION_KEY,
			env.SPOTIFY_CLIENT_ID,
			env.SPOTIFY_CLIENT_SECRET,
			env.DB,
			user.id,
		);

		const styleId = user.style_preference || "bleached-crosshatch";
		const style = await env.DB.prepare("SELECT * FROM styles WHERE id = ?")
			.bind(styleId)
			.first<DbStyle>();

		if (!style) {
			throw new Error(`Style not found: ${styleId}`);
		}

		// Smart cron: only regenerate playlists that DON'T have a completed
		// generation with the current style since its last update.
		const playlistsResult = await env.DB.prepare(
			`SELECT p.id, p.spotify_playlist_id, p.name, p.user_id
			 FROM playlists p
			 WHERE p.user_id = ?
			   AND p.deleted_at IS NULL
			   AND p.cron_enabled = 1
			   AND p.is_collaborative = 0
			   AND p.contributor_count <= 1
			   AND p.track_count > 0
			   AND NOT EXISTS (
			     SELECT 1 FROM generations g
			     WHERE g.playlist_id = p.id
			       AND g.style_id = ?
			       AND g.status = 'completed'
			       AND g.deleted_at IS NULL
			       AND g.created_at > ?
			   )`,
		)
			.bind(user.id, style.id, style.updated_at)
			.all<PlaylistRow>();

		const playlists = playlistsResult.results;

		if (playlists.length === 0) {
			console.log(
				`[Cron] User ${user.id}: all playlists up-to-date with style "${style.id}" — nothing to do`,
			);
			await env.DB.prepare(
				`UPDATE jobs
				 SET status = 'completed',
					 total_playlists = 0,
					 completed_playlists = 0,
					 failed_playlists = 0,
					 completed_at = datetime('now')
				 WHERE id = ?`,
			)
				.bind(jobId)
				.run();
			return { playlistCount: 0 };
		}

		console.log(
			`[Cron] Found ${playlists.length} playlist(s) needing regeneration for user ${user.id} (style: ${style.id})`,
		);

		let completed = 0;
		let failed = 0;

		const pipelineEnv: PipelineEnv = {
			DB: env.DB,
			IMAGES: env.IMAGES,
			REPLICATE_API_TOKEN: env.REPLICATE_API_TOKEN,
			OPENAI_API_KEY: env.OPENAI_API_KEY,
		};

		for (const playlist of playlists) {
			const result = await generateForPlaylist(
				playlist,
				style,
				accessToken,
				pipelineEnv,
			);

			if (result.success) {
				completed++;
			} else {
				failed++;
			}
		}

		await env.DB.prepare(
			`UPDATE jobs
			 SET status = 'completed',
				 total_playlists = ?,
				 completed_playlists = ?,
				 failed_playlists = ?,
				 completed_at = datetime('now')
			 WHERE id = ?`,
		)
			.bind(playlists.length, completed, failed, jobId)
			.run();

		console.log(
			`[Cron] User ${user.id} done: ${completed} completed, ${failed} failed out of ${playlists.length}`,
		);

		return { playlistCount: playlists.length };
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		console.error(`[Cron] User ${user.id} failed:`, errorMessage);

		await env.DB.prepare(
			"UPDATE jobs SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
		)
			.bind(jobId)
			.run();

		throw error;
	}
}

interface TriggerOptions {
	limit: number;
	playlistFilter: string | null;
	playlistId: string | null;
	playlistIds: string[] | null;
	styleId: string | null;
	revisionNotes: string | null;
	customObject: string | null;
	lightExtractionText: string | null;
	triggerType: "manual" | "cron" | "auto";
	accessToken: string | null;
}

interface TriggerSetup {
	user: UserRow;
	accessToken: string;
	style: DbStyle;
	playlists: PlaylistRow[];
}

/**
 * Validates inputs, refreshes token, resolves playlists, and marks them as "queued".
 * Runs synchronously before returning the HTTP response.
 */
async function setupTrigger(
	env: Env,
	options: TriggerOptions,
): Promise<TriggerSetup> {
	const user = await env.DB.prepare(
		`SELECT id, encrypted_refresh_token, style_preference, cron_time, spotify_user_id,
		        watcher_enabled, watcher_interval_minutes
		 FROM users
		 WHERE encrypted_refresh_token IS NOT NULL
		 LIMIT 1`,
	).first<UserRow>();

	if (!user) {
		throw new Error("No user with encrypted refresh token found");
	}

	let accessToken: string;
	if (options.accessToken) {
		console.log(
			`[Trigger] Using caller-provided access token for user ${user.id}`,
		);
		accessToken = options.accessToken;
	} else {
		console.log(`[Trigger] Refreshing token for user ${user.id}`);
		accessToken = await refreshAccessToken(
			user.encrypted_refresh_token,
			env.ENCRYPTION_KEY,
			env.SPOTIFY_CLIENT_ID,
			env.SPOTIFY_CLIENT_SECRET,
			env.DB,
			user.id,
		);
	}

	const styleId =
		options.styleId || user.style_preference || "bleached-crosshatch";
	const style = await env.DB.prepare("SELECT * FROM styles WHERE id = ?")
		.bind(styleId)
		.first<DbStyle>();

	if (!style) {
		throw new Error(`Style not found: ${styleId}`);
	}

	let playlistsResult: D1Result<PlaylistRow>;

	if (options.playlistIds && options.playlistIds.length > 0) {
		// Batch mode: multiple playlist IDs
		const placeholders = options.playlistIds.map(() => "?").join(",");
		playlistsResult = await env.DB.prepare(
			`SELECT id, spotify_playlist_id, name, user_id
			 FROM playlists WHERE id IN (${placeholders}) AND user_id = ? AND is_collaborative = 0 AND deleted_at IS NULL`,
		)
			.bind(...options.playlistIds, user.id)
			.all<PlaylistRow>();
	} else if (options.playlistId) {
		playlistsResult = await env.DB.prepare(
			`SELECT id, spotify_playlist_id, name, user_id
			 FROM playlists WHERE id = ? AND user_id = ? AND is_collaborative = 0 AND deleted_at IS NULL`,
		)
			.bind(options.playlistId, user.id)
			.all<PlaylistRow>();
	} else {
		let playlistQuery = `SELECT id, spotify_playlist_id, name, user_id
			FROM playlists WHERE user_id = ? AND is_collaborative = 0 AND deleted_at IS NULL`;
		const bindParams: unknown[] = [user.id];

		if (options.playlistFilter) {
			playlistQuery += " AND name LIKE ?";
			bindParams.push(`%${options.playlistFilter}%`);
		}

		playlistQuery += " LIMIT ?";
		bindParams.push(options.limit);

		playlistsResult = await env.DB.prepare(playlistQuery)
			.bind(...bindParams)
			.all<PlaylistRow>();
	}

	// Mark playlists as "queued" — each transitions to "processing" when
	// its pipeline starts (ProgressTracker.advance sets status = 'processing')
	const queuedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
	for (const playlist of playlistsResult.results) {
		await env.DB.prepare(
			`UPDATE playlists SET status = 'queued', progress_data = ? WHERE id = ?`,
		)
			.bind(JSON.stringify({ queuedAt }), playlist.id)
			.run();
	}

	return {
		user,
		accessToken,
		style,
		playlists: playlistsResult.results,
	};
}

/**
 * Runs the pipeline for each playlist sequentially.
 * Each playlist transitions from "queued" → "processing" → "generated"/"failed".
 */
async function executeTrigger(
	env: Env,
	setup: TriggerSetup,
	options: TriggerOptions,
): Promise<void> {
	const pipelineEnv: PipelineEnv = {
		DB: env.DB,
		IMAGES: env.IMAGES,
		REPLICATE_API_TOKEN: env.REPLICATE_API_TOKEN,
		OPENAI_API_KEY: env.OPENAI_API_KEY,
	};

	for (const playlist of setup.playlists) {
		console.log(`[Trigger] Processing "${playlist.name}"...`);
		await generateForPlaylist(
			playlist,
			setup.style,
			setup.accessToken,
			pipelineEnv,
			{
				triggerType: options.triggerType,
				revisionNotes: options.revisionNotes ?? undefined,
				customObject: options.customObject ?? undefined,
				lightExtractionText: options.lightExtractionText ?? undefined,
			},
		);
	}
}

// ──────────────────────────────────────────────
// Playlist Watcher — detects new playlists from Spotify
// ──────────────────────────────────────────────

/**
 * Runs every 5 minutes. For each cron-enabled user:
 * 1. Fetch playlists from Spotify
 * 2. Upsert new playlists into D1
 * 3. Track stabilization via snapshot_id
 * 4. When stable (2 ticks, ~10 min) + has tracks → trigger APLOTOCA
 */
async function watchForNewPlaylists(env: Env): Promise<void> {
	const utcMinute = new Date().getUTCMinutes();
	console.log(`[Watcher] Tick (UTC minute ${utcMinute})`);

	const usersResult = await env.DB.prepare(
		`SELECT id, encrypted_refresh_token, style_preference, cron_time, spotify_user_id,
		        watcher_enabled, watcher_interval_minutes
		 FROM users
		 WHERE cron_enabled = 1
		   AND encrypted_refresh_token IS NOT NULL`,
	).all<UserRow>();

	const users = usersResult.results;
	if (users.length === 0) {
		console.log("[Watcher] No cron-enabled users");
		return;
	}

	for (const user of users) {
		// Skip users with watcher disabled -- log as skipped
		if (!user.watcher_enabled) {
			await insertWorkerTick(env.DB, {
				userId: user.id,
				tickType: "watcher",
				status: "skipped",
				startedAt: new Date().toISOString(),
			});
			continue;
		}

		// Respect per-user interval: only run on minutes aligned to their interval
		const interval = [5, 10, 15].includes(user.watcher_interval_minutes)
			? user.watcher_interval_minutes
			: 5;
		if (utcMinute % interval !== 0) {
			continue; // Interval skip -- don't log (too noisy, happens most ticks)
		}

		const tickStart = new Date().toISOString();
		const startMs = Date.now();
		try {
			const { integrityChecked, integrityFlagged } = await watchUser(user, env);
			await insertWorkerTick(env.DB, {
				userId: user.id,
				tickType: "watcher",
				status: "success",
				durationMs: Date.now() - startMs,
				tokenRefreshed: true,
				integrityChecked,
				integrityFlagged,
				startedAt: tickStart,
			});
		} catch (error) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			console.error(`[Watcher] Error for user ${user.id}: ${msg}`);
			await insertWorkerTick(env.DB, {
				userId: user.id,
				tickType: "watcher",
				status: "failure",
				durationMs: Date.now() - startMs,
				errorMessage: msg,
				startedAt: tickStart,
			});
		}
	}
}

async function watchUser(
	user: UserRow,
	env: Env,
): Promise<{ integrityChecked: number; integrityFlagged: number }> {
	const accessToken = await refreshAccessToken(
		user.encrypted_refresh_token,
		env.ENCRYPTION_KEY,
		env.SPOTIFY_CLIENT_ID,
		env.SPOTIFY_CLIENT_SECRET,
		env.DB,
		user.id,
	);

	const spotifyPlaylists = await fetchUserPlaylists(accessToken);

	// Get known playlists from D1
	const knownResult = await env.DB.prepare(
		`SELECT id, spotify_playlist_id, auto_detect_status, auto_detect_snapshot, auto_detected_at, contributor_count, last_seen_cover_url, cover_verified_at
		 FROM playlists WHERE user_id = ? AND deleted_at IS NULL`,
	)
		.bind(user.id)
		.all<WatchedPlaylistRow>();

	const knownMap = new Map(
		knownResult.results.map((p) => [p.spotify_playlist_id, p]),
	);

	const spotifyIds = new Set(spotifyPlaylists.map((p) => p.id));

	// Soft-delete playlists no longer on Spotify
	for (const known of knownResult.results) {
		if (!spotifyIds.has(known.spotify_playlist_id)) {
			await env.DB.prepare(
				"UPDATE playlists SET deleted_at = datetime('now') WHERE id = ?",
			)
				.bind(known.id)
				.run();
			console.log(
				`[Watcher] Soft-deleted playlist ${known.spotify_playlist_id}`,
			);
		}
	}

	// Process each Spotify playlist
	for (const sp of spotifyPlaylists) {
		// Skip collaborative or non-owned
		if (sp.collaborative || sp.ownerId !== user.spotify_user_id) continue;

		const existing = knownMap.get(sp.id);

		if (!existing) {
			// New playlist — insert into D1 and start watching
			const playlistId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
			await env.DB.prepare(
				`INSERT INTO playlists (id, user_id, spotify_playlist_id, name, track_count,
				  is_collaborative, owner_spotify_id, auto_detected_at, auto_detect_snapshot,
				  auto_detect_status, cron_enabled, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, 0, ?, datetime('now'), ?, 'watching', 1,
				  datetime('now'), datetime('now'))`,
			)
				.bind(
					playlistId,
					user.id,
					sp.id,
					sp.name,
					sp.trackCount,
					sp.ownerId,
					sp.snapshotId,
				)
				.run();

			console.log(
				`[Watcher] New playlist detected: "${sp.name}" (${sp.id}) — watching`,
			);
			continue;
		}

		// Existing playlist — update metadata
		await env.DB.prepare(
			`UPDATE playlists SET name = ?, track_count = ?, updated_at = datetime('now')
			 WHERE id = ?`,
		)
			.bind(sp.name, sp.trackCount, existing.id)
			.run();

		// Playlist synced by web app before watcher ran — start watching it
		if (!existing.auto_detected_at) {
			await env.DB.prepare(
				`UPDATE playlists SET auto_detected_at = datetime('now'),
				  auto_detect_status = 'watching', auto_detect_snapshot = ? WHERE id = ?`,
			)
				.bind(sp.snapshotId, existing.id)
				.run();
			console.log(
				`[Watcher] Picked up synced playlist "${sp.name}" — now watching`,
			);
			continue;
		}

		// Skip existing playlists with multiple contributors
		if (existing.contributor_count > 1) continue;

		// Only process playlists in watcher state machine
		if (
			!existing.auto_detect_status ||
			existing.auto_detect_status === "triggered"
		) {
			continue;
		}

		if (existing.auto_detect_status === "watching") {
			// Check if snapshot changed
			if (sp.snapshotId !== existing.auto_detect_snapshot) {
				// Still changing — reset snapshot
				await env.DB.prepare(
					`UPDATE playlists SET auto_detect_snapshot = ? WHERE id = ?`,
				)
					.bind(sp.snapshotId, existing.id)
					.run();
				console.log(`[Watcher] "${sp.name}" still changing — reset snapshot`);
			} else if (sp.trackCount > 0) {
				// Snapshot stable for one tick — mark as stable
				await env.DB.prepare(
					`UPDATE playlists SET auto_detect_status = 'stable' WHERE id = ?`,
				)
					.bind(existing.id)
					.run();
				console.log(`[Watcher] "${sp.name}" stable — will trigger next tick`);
			}
		} else if (existing.auto_detect_status === "stable") {
			// Check snapshot is still the same (second consecutive stable tick)
			if (sp.snapshotId !== existing.auto_detect_snapshot) {
				// Changed again — go back to watching
				await env.DB.prepare(
					`UPDATE playlists SET auto_detect_status = 'watching', auto_detect_snapshot = ? WHERE id = ?`,
				)
					.bind(sp.snapshotId, existing.id)
					.run();
				console.log(
					`[Watcher] "${sp.name}" changed during stabilization — back to watching`,
				);
			} else if (sp.trackCount > 0) {
				// Defer if user's scheduled cron is within 10 minutes
				if (user.cron_time && isCronWithinMinutes(user.cron_time, 10)) {
					console.log(
						`[Watcher] "${sp.name}" ready but cron at ${user.cron_time} UTC is within 10 min — deferring`,
					);
					continue;
				}

				// Skip if playlist already generated today (prevents cron/auto double-trigger)
				const todayGen = await env.DB.prepare(
					`SELECT 1 FROM generations
					 WHERE playlist_id = ? AND DATE(created_at) = DATE('now', 'utc')
					 AND status IN ('pending', 'completed', 'processing') AND deleted_at IS NULL`,
				)
					.bind(existing.id)
					.first();

				if (todayGen) {
					console.log(
						`[Watcher] "${sp.name}" already generated today — skipping`,
					);
					continue;
				}

				// Stable for 2 ticks — trigger generation
				console.log(`[Watcher] "${sp.name}" ready — triggering APLOTOCA`);
				await triggerAutoGeneration(user, existing, env, accessToken);
			}
		}
	}

	// ── Cover Integrity Check ──
	// For playlists with completed generations, verify Spotify still has our cover
	let integrityChecked = 0;
	let integrityFlagged = 0;

	for (const sp of spotifyPlaylists) {
		const existing = knownMap.get(sp.id);
		if (!existing) continue;

		// Only check playlists that have a completed, non-deleted generation
		const gen = await env.DB.prepare(
			`SELECT g.id, g.cover_phash FROM generations g
			 WHERE g.playlist_id = ? AND g.status = 'completed' AND g.deleted_at IS NULL
			 ORDER BY g.created_at DESC LIMIT 1`,
		)
			.bind(existing.id)
			.first<{ id: string; cover_phash: string | null }>();

		if (!gen) continue;

		integrityChecked++;

		// Layer 1: Mosaic detection (cover was removed from Spotify)
		if (isMosaicUrl(sp.imageUrl)) {
			console.log(
				`[Integrity] "${sp.name}" — cover reverted to mosaic, resetting`,
			);
			await resetCoverForPlaylist(env.DB, existing.id, gen.id);
			integrityFlagged++;
			continue;
		}

		// Layer 2: URL change detection + phash verification
		if (sp.imageUrl && sp.imageUrl !== existing.last_seen_cover_url) {
			if (gen.cover_phash && sp.imageUrl) {
				const livePhash = await fetchSpotifyCoverPhash(sp.imageUrl);
				if (livePhash) {
					const distance = hammingDistance(livePhash, gen.cover_phash);
					console.log(
						`[Integrity] "${sp.name}" — URL changed, hamming distance: ${distance}/${PHASH_MATCH_THRESHOLD} (stored: ${gen.cover_phash}, live: ${livePhash})`,
					);
					if (distance > PHASH_MATCH_THRESHOLD) {
						console.log(`[Integrity] "${sp.name}" — cover replaced, resetting`);
						await resetCoverForPlaylist(env.DB, existing.id, gen.id);
						integrityFlagged++;
						continue;
					}
				}
			}

			// Phash matches or within threshold — update stored URL
			await env.DB.prepare(
				`UPDATE playlists SET last_seen_cover_url = ?, cover_verified_at = datetime('now') WHERE id = ?`,
			)
				.bind(sp.imageUrl, existing.id)
				.run();
		} else if (sp.imageUrl) {
			// URL unchanged — update verification timestamp
			await env.DB.prepare(
				`UPDATE playlists SET cover_verified_at = datetime('now') WHERE id = ?`,
			)
				.bind(existing.id)
				.run();
		}
	}

	return { integrityChecked, integrityFlagged };
}

async function triggerAutoGeneration(
	user: UserRow,
	playlist: WatchedPlaylistRow,
	env: Env,
	accessToken: string,
): Promise<void> {
	const jobId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);

	// Create job record so it appears in queue UI
	await env.DB.prepare(
		`INSERT INTO jobs (id, user_id, type, status, total_playlists, started_at, created_at)
		 VALUES (?, ?, 'auto', 'processing', 1, datetime('now'), datetime('now'))`,
	)
		.bind(jobId, user.id)
		.run();

	// Mark playlist as triggered
	await env.DB.prepare(
		`UPDATE playlists SET auto_detect_status = 'triggered', status = 'queued' WHERE id = ?`,
	)
		.bind(playlist.id)
		.run();

	const styleId = user.style_preference || "bleached-crosshatch";
	const style = await env.DB.prepare("SELECT * FROM styles WHERE id = ?")
		.bind(styleId)
		.first<DbStyle>();

	if (!style) {
		console.error(`[Watcher] Style not found: ${styleId}`);
		await env.DB.prepare(
			"UPDATE jobs SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
		)
			.bind(jobId)
			.run();
		return;
	}

	const pipelineEnv: PipelineEnv = {
		DB: env.DB,
		IMAGES: env.IMAGES,
		REPLICATE_API_TOKEN: env.REPLICATE_API_TOKEN,
		OPENAI_API_KEY: env.OPENAI_API_KEY,
	};

	const playlistRow: PlaylistRow = {
		id: playlist.id,
		spotify_playlist_id: playlist.spotify_playlist_id,
		name: "", // Will be overwritten by pipeline
		user_id: user.id,
	};

	// Fetch the name
	const nameResult = await env.DB.prepare(
		"SELECT name FROM playlists WHERE id = ?",
	)
		.bind(playlist.id)
		.first<{ name: string }>();
	playlistRow.name = nameResult?.name ?? "Unknown";

	const result = await generateForPlaylist(
		playlistRow,
		style,
		accessToken,
		pipelineEnv,
		{ triggerType: "auto" },
	);

	const status = result.success ? "completed" : "failed";
	await env.DB.prepare(
		`UPDATE jobs
		 SET status = ?,
			 completed_playlists = ?,
			 failed_playlists = ?,
			 completed_at = datetime('now')
		 WHERE id = ?`,
	)
		.bind(status, result.success ? 1 : 0, result.success ? 0 : 1, jobId)
		.run();

	console.log(`[Watcher] Auto-generation for "${playlistRow.name}": ${status}`);
}
