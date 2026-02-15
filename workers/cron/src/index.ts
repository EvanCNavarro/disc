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

import type { DbStyle, GenerationResult } from "@disc/shared";
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

	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return Response.json({ status: "ok", worker: "disc-cron" });
		}

		// Manual trigger: /trigger?limit=1&playlist=GROWL
		if (url.pathname === "/trigger") {
			const limit = Number.parseInt(url.searchParams.get("limit") || "1", 10);
			const playlistFilter = url.searchParams.get("playlist") || null;
			try {
				const result = await triggerManual(env, limit, playlistFilter);
				return Response.json(result, {
					headers: { "Content-Type": "application/json" },
				});
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Unknown error";
				return Response.json({ error: msg }, { status: 500 });
			}
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

async function triggerManual(
	env: Env,
	limit: number,
	playlistFilter: string | null,
): Promise<{
	user: string;
	playlists: string[];
	results: GenerationResult[];
}> {
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

	const styleId = user.style_preference || "bleached-crosshatch";
	const style = await env.DB.prepare("SELECT * FROM styles WHERE id = ?")
		.bind(styleId)
		.first<DbStyle>();

	if (!style) {
		throw new Error(`Style not found: ${styleId}`);
	}

	// Build playlist query with optional name filter
	let playlistQuery = `SELECT id, spotify_playlist_id, name, user_id
		FROM playlists WHERE user_id = ?`;
	const bindParams: unknown[] = [user.id];

	if (playlistFilter) {
		playlistQuery += " AND name LIKE ?";
		bindParams.push(`%${playlistFilter}%`);
	}

	playlistQuery += " LIMIT ?";
	bindParams.push(limit);

	const playlistsResult = await env.DB.prepare(playlistQuery)
		.bind(...bindParams)
		.all<PlaylistRow>();

	const results: GenerationResult[] = [];
	const playlistNames: string[] = [];

	const pipelineEnv: PipelineEnv = {
		DB: env.DB,
		IMAGES: env.IMAGES,
		REPLICATE_API_TOKEN: env.REPLICATE_API_TOKEN,
		OPENAI_API_KEY: env.OPENAI_API_KEY,
	};

	for (const playlist of playlistsResult.results) {
		playlistNames.push(playlist.name);
		console.log(`[Trigger] Processing "${playlist.name}"...`);

		const result = await generateForPlaylist(
			playlist,
			style,
			accessToken,
			pipelineEnv,
		);
		results.push(result);
	}

	return { user: user.id, playlists: playlistNames, results };
}
