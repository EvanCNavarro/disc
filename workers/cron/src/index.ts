/**
 * DISC Cron Worker
 *
 * Scheduled worker that generates AI cover art for playlists.
 * Runs every hour, filters users by their cron_time preference.
 *
 * Flow:
 * 1. Determine current hour (UTC)
 * 2. Query users where cron_enabled=1 and cron_time matches current hour
 * 3. For each user:
 *    a. Create job record
 *    b. Refresh Spotify access token
 *    c. Get active style
 *    d. For each cron-enabled playlist: generate cover art
 *    e. Update job record with totals
 */

import type { DbStyle } from "@disc/shared";
import { generateForPlaylist, type PipelineEnv } from "./pipeline";
import { refreshAccessToken } from "./spotify";

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
		const currentHour = new Date().getUTCHours().toString().padStart(2, "0");
		console.log(`[Cron] Running for hour ${currentHour}:00 UTC`);

		const usersResult = await env.DB.prepare(
			`SELECT id, encrypted_refresh_token, style_preference, cron_time
			 FROM users
			 WHERE cron_enabled = 1
			   AND substr(cron_time, 1, 2) = ?`,
		)
			.bind(currentHour)
			.all<UserRow>();

		const users = usersResult.results;

		if (users.length === 0) {
			console.log(`[Cron] No users scheduled for ${currentHour}:00 UTC`);
			return;
		}

		console.log(`[Cron] Processing ${users.length} user(s)`);

		for (const user of users) {
			ctx.waitUntil(processUser(user, env));
		}
	},

	async fetch(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
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
					trigger_type?: string;
				};

				const options: TriggerOptions = {
					limit: body.limit ?? 1,
					playlistFilter: body.playlist ?? null,
					playlistId: body.playlist_id ?? null,
					playlistIds: body.playlist_ids ?? null,
					styleId: body.style_id ?? null,
					revisionNotes: body.revision_notes ?? null,
					customObject: body.custom_object ?? null,
					triggerType: (body.trigger_type as "manual" | "cron") ?? "manual",
				};

				// Validate and set playlists to "processing" synchronously
				const setup = await setupTrigger(env, options);

				// Run pipeline synchronously — keeps the fetch handler alive
				// for the full duration. ctx.waitUntil() gets killed after
				// ~30s, but the fetch handler stays alive as long as the
				// HTTP connection is open.
				await executeTrigger(env, setup, options);

				return Response.json({
					completed: true,
					playlists: setup.playlists.map((p) => p.name),
				});
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
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

		return new Response("Not Found", { status: 404 });
	},
};

async function processUser(user: UserRow, env: Env): Promise<void> {
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

		const playlistsResult = await env.DB.prepare(
			`SELECT id, spotify_playlist_id, name, user_id
			 FROM playlists
			 WHERE user_id = ? AND cron_enabled = 1`,
		)
			.bind(user.id)
			.all<PlaylistRow>();

		const playlists = playlistsResult.results;
		console.log(
			`[Cron] Found ${playlists.length} playlist(s) for user ${user.id}`,
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
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		console.error(`[Cron] User ${user.id} failed:`, errorMessage);

		await env.DB.prepare(
			"UPDATE jobs SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
		)
			.bind(jobId)
			.run();
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
	triggerType: "manual" | "cron";
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
		`SELECT id, encrypted_refresh_token, style_preference, cron_time
		 FROM users
		 WHERE encrypted_refresh_token IS NOT NULL
		 LIMIT 1`,
	).first<UserRow>();

	if (!user) {
		throw new Error("No user with encrypted refresh token found");
	}

	console.log(`[Trigger] Refreshing token for user ${user.id}`);
	const accessToken = await refreshAccessToken(
		user.encrypted_refresh_token,
		env.ENCRYPTION_KEY,
		env.SPOTIFY_CLIENT_ID,
		env.SPOTIFY_CLIENT_SECRET,
		env.DB,
		user.id,
	);

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
			 FROM playlists WHERE id IN (${placeholders}) AND user_id = ?`,
		)
			.bind(...options.playlistIds, user.id)
			.all<PlaylistRow>();
	} else if (options.playlistId) {
		playlistsResult = await env.DB.prepare(
			`SELECT id, spotify_playlist_id, name, user_id
			 FROM playlists WHERE id = ? AND user_id = ?`,
		)
			.bind(options.playlistId, user.id)
			.all<PlaylistRow>();
	} else {
		let playlistQuery = `SELECT id, spotify_playlist_id, name, user_id
			FROM playlists WHERE user_id = ?`;
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
			},
		);
	}
}
