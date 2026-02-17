import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardLiveStats } from "@/components/dashboard/DashboardLiveStats";
import { GenerationHistoryTable } from "@/components/dashboard/GenerationHistoryTable";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";
import { formatTimestamp } from "@/lib/format";

interface StyleRow {
	id: string;
	name: string;
	description: string | null;
}

interface PlaylistStats {
	total: number;
	generated: number;
	needs_regen: number;
	failed: number;
}

interface UserRow {
	id: string;
	style_preference: string;
	cron_enabled: number;
	cron_time: string;
}

interface JobRow {
	status: string;
	completed_at: string | null;
	created_at: string;
}

async function getDashboardData(spotifyId: string) {
	// Get user from D1
	const users = await queryD1<UserRow>(
		"SELECT id, style_preference, cron_enabled, cron_time FROM users WHERE spotify_user_id = ? LIMIT 1",
		[spotifyId],
	);
	const user = users[0];
	if (!user) return null;

	try {
		const [styleRows, statRows, lastJobRows, totalGenRows] = await Promise.all([
			queryD1<StyleRow>(
				"SELECT id, name, description FROM styles WHERE id = ? LIMIT 1",
				[user.style_preference],
			),
			queryD1<{ status: string; cnt: number }>(
				`SELECT status, COUNT(*) as cnt FROM playlists WHERE user_id = ? GROUP BY status`,
				[user.id],
			),
			queryD1<JobRow>(
				`SELECT status, completed_at, created_at FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 2`,
				[user.id],
			),
			queryD1<{ cnt: number }>(
				`SELECT COUNT(*) as cnt FROM generations WHERE user_id = ? AND status = 'completed'`,
				[user.id],
			),
		]);

		const style = styleRows[0] ?? null;

		const stats: PlaylistStats = {
			total: 0,
			generated: 0,
			needs_regen: 0,
			failed: 0,
		};
		for (const row of statRows) {
			const count = Number(row.cnt);
			stats.total += count;
			if (row.status === "generated") stats.generated += count;
			else if (row.status === "failed") stats.failed += count;
			else if (row.status === "idle" || row.status === "queued")
				stats.needs_regen += count;
		}

		const totalGenerations = Number(totalGenRows[0]?.cnt ?? 0);

		return {
			user,
			style,
			stats,
			totalGenerations,
			lastJob: lastJobRows[0] ?? null,
			previousJob: lastJobRows[1] ?? null,
		};
	} catch (error) {
		console.error("Failed to fetch dashboard data:", error);
		return {
			user,
			style: null,
			stats: { total: 0, generated: 0, needs_regen: 0, failed: 0 },
			totalGenerations: 0,
			lastJob: null,
			previousJob: null,
			fetchError: true,
		};
	}
}

export default async function DashboardPage() {
	const session = await auth();
	if (!session?.accessToken || !session.spotifyId) redirect("/login");
	if (session.error === "RefreshTokenError") redirect("/login");

	const data = await getDashboardData(session.spotifyId);

	if (!data) {
		return (
			<div className="flex flex-col items-center justify-center gap-[var(--space-md)] py-[var(--space-3xl)]">
				<p className="text-[var(--color-text-muted)]">
					No account data found. Visit{" "}
					<Link
						href="/playlists"
						className="text-[var(--color-accent)] underline"
					>
						Playlists
					</Link>{" "}
					to sync your Spotify data.
				</p>
			</div>
		);
	}

	const { user, style, stats, totalGenerations, lastJob } = data;

	// Calculate next run time
	const now = new Date();
	const [cronHour, cronMinute] = (user.cron_time || "04:20")
		.split(":")
		.map(Number);
	const nextRun = new Date(now);
	nextRun.setUTCHours(cronHour, cronMinute, 0, 0);
	if (nextRun <= now) {
		nextRun.setUTCDate(nextRun.getUTCDate() + 1);
	}

	return (
		<div className="flex flex-col gap-[var(--space-xl)]">
			<div className="sticky top-[calc(var(--nav-height)+var(--space-md)*2)] z-30 bg-[var(--color-bg)] pb-[var(--space-md)] -mb-[var(--space-md)]">
				<h1 className="text-2xl font-bold">Overview</h1>
			</div>

			{/* ── Active Style Card ── */}
			<section className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				<div className="flex items-start justify-between">
					<div>
						<h2 className="text-lg font-semibold">
							{style?.name ?? "No Style Set"}
						</h2>
						<p className="mt-1 text-sm text-[var(--color-text-muted)]">
							{style?.description ??
								"Configure a style in Settings to start generating cover art."}
						</p>
					</div>
					<Link
						href="/settings"
						className="rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]"
					>
						Change Style
					</Link>
				</div>
			</section>

			{/* ── Run Timeline ── */}
			<section className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				<h2 className="mb-[var(--space-md)] text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
					Pipeline Status
				</h2>
				<div className="flex items-center justify-between">
					{/* Previous run */}
					<div className="flex flex-col items-center gap-1">
						<div
							role="img"
							aria-label={`Previous run: ${lastJob?.status ?? "none"}`}
							className={`h-3 w-3 rounded-full ${
								lastJob?.status === "completed"
									? "bg-[var(--color-accent)]"
									: lastJob?.status === "failed"
										? "bg-[var(--color-destructive)]"
										: "bg-[var(--color-surface)]"
							}`}
						/>
						<span className="text-xs text-[var(--color-text-muted)]">
							{lastJob?.completed_at
								? formatTimestamp(lastJob.completed_at)
								: "No runs yet"}
						</span>
						<span className="text-xs font-medium">
							{lastJob?.status === "completed"
								? "Success"
								: lastJob?.status === "failed"
									? "Failed"
									: "—"}
						</span>
					</div>

					{/* Connecting line */}
					<div className="flex-1 mx-4 h-px bg-[var(--color-border)]" />

					{/* Current state */}
					<div className="flex flex-col items-center gap-1">
						<div className="h-3 w-3 rounded-full bg-[var(--color-surface)] ring-2 ring-[var(--color-border)]" />
						<span className="text-xs font-medium">
							{user.cron_enabled ? "Idle" : "Paused"}
						</span>
					</div>

					{/* Connecting line */}
					<div className="flex-1 mx-4 h-px bg-[var(--color-border)]" />

					{/* Next run */}
					<div className="flex flex-col items-center gap-1">
						<div className="h-3 w-3 rounded-full bg-[var(--color-surface)]" />
						<span className="text-xs text-[var(--color-text-muted)]">
							{user.cron_enabled ? formatNextRun(nextRun) : "Disabled"}
						</span>
						<span className="text-xs font-medium">Next Run</span>
					</div>
				</div>
			</section>

			{/* ── Playlist Summary Stats ── */}
			<DashboardLiveStats
				initialStats={stats}
				totalGenerations={totalGenerations}
			/>

			{/* ── Quick Actions ── */}
			<section className="grid grid-cols-2 gap-[var(--space-md)]">
				<Link
					href="/queue"
					className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)] transition-all hover:shadow-[var(--shadow-md)]"
				>
					<h2 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
						Queue
					</h2>
					<p className="mt-1 text-sm text-[var(--color-text-secondary)]">
						Batch generate covers for your playlists
					</p>
				</Link>
				<Link
					href="/playlists"
					className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)] transition-all hover:shadow-[var(--shadow-md)]"
				>
					<h2 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
						Playlists
					</h2>
					<p className="mt-1 text-sm text-[var(--color-text-secondary)]">
						View and manage your Spotify playlists
					</p>
				</Link>
			</section>

			{/* ── Generation History ── */}
			<section className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				<h2 className="mb-[var(--space-md)] text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
					Generation History
				</h2>
				<GenerationHistoryTable />
			</section>
		</div>
	);
}

function formatNextRun(date: Date): string {
	const now = new Date();
	const diffMs = date.getTime() - now.getTime();
	const diffHours = Math.floor(diffMs / 3_600_000);
	const diffMins = Math.floor((diffMs % 3_600_000) / 60_000);

	if (diffHours > 0) return `in ${diffHours}h ${diffMins}m`;
	return `in ${diffMins}m`;
}
