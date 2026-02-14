export interface Env {
	DB: D1Database;
	OPENAI_API_KEY: string;
	ENCRYPTION_KEY: string;
	SPOTIFY_CLIENT_ID: string;
	SPOTIFY_CLIENT_SECRET: string;
	ENVIRONMENT: string;
}

export default {
	async scheduled(
		_controller: ScheduledController,
		_env: Env,
		_ctx: ExecutionContext,
	): Promise<void> {
		console.log("DISC cron triggered");
		// Phase 4: Query users with cron_enabled, refresh tokens, enqueue playlists
	},

	async fetch(
		_request: Request,
		_env: Env,
		_ctx: ExecutionContext,
	): Promise<Response> {
		return new Response("DISC Cron Worker", { status: 200 });
	},
};
