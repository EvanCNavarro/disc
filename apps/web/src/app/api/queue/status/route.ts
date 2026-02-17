import type { QueueStatus } from "@disc/shared";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface JobRow {
	id: string;
	type: string;
	status: string;
	started_at: string;
}

interface PlaylistRow {
	id: string;
	name: string;
	spotify_playlist_id: string;
	status: string;
	progress_data: string | null;
	r2_key: string | null;
	duration_ms: number | null;
	cost_usd: number | null;
}

interface UserRow {
	id: string;
	cron_time: string;
	cron_enabled: number;
	style_preference: string;
}

interface StyleRow {
	id: string;
	name: string;
}

const STEP_LABELS: Record<string, string> = {
	fetch_tracks: "Fetching tracks",
	fetch_lyrics: "Fetching lyrics",
	extract_themes: "Extracting themes",
	select_theme: "Selecting theme",
	generate_image: "Generating image",
	upload: "Uploading to Spotify",
};

function parseStepFromProgress(progressData: string | null): {
	currentStep: string | null;
	stepSummary: string | null;
} {
	if (!progressData) return { currentStep: null, stepSummary: null };
	try {
		const raw = JSON.parse(progressData) as Record<string, unknown>;
		const step = (raw.currentStep as string) ?? (raw.step as string) ?? null;
		return {
			currentStep: step,
			stepSummary: step ? (STEP_LABELS[step] ?? step) : null,
		};
	} catch {
		return { currentStep: null, stepSummary: null };
	}
}

/** GET /api/queue/status — polling endpoint for global queue awareness */
export async function GET() {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const users = await queryD1<UserRow>(
		"SELECT id, cron_time, cron_enabled, style_preference FROM users WHERE spotify_user_id = ? LIMIT 1",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}
	const user = users[0];

	// 1. Check for active job
	const activeJobs = await queryD1<JobRow>(
		"SELECT id, type, status, started_at FROM jobs WHERE user_id = ? AND status = 'processing' ORDER BY started_at DESC LIMIT 1",
		[user.id],
	);

	let activeJob: QueueStatus["activeJob"] = null;

	if (activeJobs.length > 0) {
		const job = activeJobs[0];

		// Get playlists involved in this job (recently updated)
		const playlists = await queryD1<PlaylistRow>(
			`SELECT p.id, p.name, p.spotify_playlist_id, p.status, p.progress_data,
				(SELECT g.r2_key FROM generations g WHERE g.playlist_id = p.id ORDER BY g.created_at DESC LIMIT 1) as r2_key,
				(SELECT g.duration_ms FROM generations g WHERE g.playlist_id = p.id ORDER BY g.created_at DESC LIMIT 1) as duration_ms,
				(SELECT g.cost_usd FROM generations g WHERE g.playlist_id = p.id ORDER BY g.created_at DESC LIMIT 1) as cost_usd
			FROM playlists p
			WHERE p.user_id = ? AND p.status IN ('queued', 'processing', 'generated', 'failed')
				AND p.updated_at > datetime('now', '-2 hours')
			ORDER BY
				CASE p.status
					WHEN 'processing' THEN 0
					WHEN 'queued' THEN 1
					WHEN 'generated' THEN 2
					WHEN 'failed' THEN 3
				END`,
			[user.id],
		);

		// Get active style
		const styleRows = await queryD1<StyleRow>(
			"SELECT id, name FROM styles WHERE id = ? LIMIT 1",
			[user.style_preference],
		);
		const style = styleRows[0] ?? {
			id: user.style_preference,
			name: "Unknown",
		};

		let totalCost = 0;
		let completedCount = 0;
		let failedCount = 0;
		let pendingCount = 0;

		const playlistStatuses = playlists.map((p) => {
			const { currentStep, stepSummary } = parseStepFromProgress(
				p.progress_data,
			);
			const mappedStatus =
				p.status === "queued"
					? ("pending" as const)
					: p.status === "generated"
						? ("completed" as const)
						: (p.status as "processing" | "failed");

			if (mappedStatus === "completed") completedCount++;
			else if (mappedStatus === "failed") failedCount++;
			else if (mappedStatus === "pending") pendingCount++;

			if (p.cost_usd) totalCost += p.cost_usd;

			return {
				id: p.id,
				name: p.name,
				spotifyPlaylistId: p.spotify_playlist_id,
				status: mappedStatus,
				thumbnailR2Key: p.r2_key,
				currentStep,
				stepSummary,
				durationMs: p.duration_ms,
				costUsd: p.cost_usd,
			};
		});

		activeJob = {
			id: job.id,
			type: job.type as "cron" | "manual",
			startedAt: job.started_at,
			style,
			playlists: playlistStatuses,
			totalCost,
			completedCount,
			failedCount,
			pendingCount,
		};
	}

	// 2. Next cron info
	let nextCron: QueueStatus["nextCron"] = null;

	if (user.cron_enabled) {
		const styleRows = await queryD1<StyleRow>(
			"SELECT id, name FROM styles WHERE id = ? LIMIT 1",
			[user.style_preference],
		);
		const style = styleRows[0] ?? {
			id: user.style_preference,
			name: "Unknown",
		};

		nextCron = {
			utcTime: user.cron_time,
			style,
		};
	}

	const status: QueueStatus = { activeJob, nextCron };
	return NextResponse.json(status);
}
