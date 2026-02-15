import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

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

interface RecentGeneration {
	id: string;
	playlist_name: string;
	symbolic_object: string;
	status: string;
	created_at: string;
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
		const [styleRows, statRows, recentRows, lastJobRows] = await Promise.all([
			queryD1<StyleRow>(
				"SELECT id, name, description FROM styles WHERE id = ? LIMIT 1",
				[user.style_preference],
			),
			queryD1<{ status: string; cnt: number }>(
				`SELECT status, COUNT(*) as cnt FROM playlists WHERE user_id = ? GROUP BY status`,
				[user.id],
			),
			queryD1<RecentGeneration>(
				`SELECT g.id, p.name as playlist_name, g.symbolic_object, g.status, g.created_at
				 FROM generations g
				 JOIN playlists p ON g.playlist_id = p.id
				 WHERE g.user_id = ?
				 ORDER BY g.created_at DESC
				 LIMIT 5`,
				[user.id],
			),
			queryD1<JobRow>(
				`SELECT status, completed_at, created_at FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 2`,
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

		return {
			user,
			style,
			stats,
			recentGenerations: recentRows,
			lastJob: lastJobRows[0] ?? null,
			previousJob: lastJobRows[1] ?? null,
		};
	} catch (error) {
		console.error("Failed to fetch dashboard data:", error);
		return {
			user,
			style: null,
			stats: { total: 0, generated: 0, needs_regen: 0, failed: 0 },
			recentGenerations: [] as RecentGeneration[],
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

	const { user, style, stats, recentGenerations, lastJob } = data;

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
			<h1 className="text-2xl font-bold">Overview</h1>

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
								? formatRelativeTime(lastJob.completed_at)
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
			<section className="grid grid-cols-2 gap-[var(--space-md)] sm:grid-cols-4">
				<StatCard label="Total" value={stats.total} />
				<StatCard label="Generated" value={stats.generated} accent />
				<StatCard
					label="Needs Regen"
					value={stats.needs_regen}
					warning={stats.needs_regen > 0}
				/>
				<StatCard
					label="Failed"
					value={stats.failed}
					error={stats.failed > 0}
				/>
			</section>

			{/* ── Recent Generations ── */}
			<section className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				<div className="mb-[var(--space-md)] flex items-center justify-between">
					<h2 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
						Recent Generations
					</h2>
					<Link
						href="/playlists"
						className="text-sm text-[var(--color-accent)] hover:underline"
					>
						View all playlists
					</Link>
				</div>

				{recentGenerations.length === 0 ? (
					<p className="text-sm text-[var(--color-text-muted)]">
						No generations yet. The pipeline will run at {user.cron_time} UTC
						daily.
					</p>
				) : (
					<div className="flex flex-col divide-y divide-[var(--color-border-subtle)]">
						{recentGenerations.map((gen) => (
							<div
								key={gen.id}
								className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
							>
								<div className="flex flex-col gap-0.5">
									<span className="text-sm font-medium">
										{gen.playlist_name}
									</span>
									<span className="text-xs text-[var(--color-text-muted)]">
										{gen.symbolic_object || "—"}
									</span>
								</div>
								<div className="flex items-center gap-3">
									<StatusBadge status={gen.status} />
									<span className="text-xs text-[var(--color-text-faint)]">
										{formatRelativeTime(gen.created_at)}
									</span>
								</div>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	);
}

function StatCard({
	label,
	value,
	accent,
	warning,
	error,
}: {
	label: string;
	value: number;
	accent?: boolean;
	warning?: boolean;
	error?: boolean;
}) {
	let valueColor = "text-[var(--color-text)]";
	if (accent && value > 0) valueColor = "text-[var(--color-accent)]";
	if (warning) valueColor = "text-[var(--color-warning)]";
	if (error) valueColor = "text-[var(--color-destructive)]";

	return (
		<div className="glass rounded-[var(--radius-md)] p-[var(--space-md)]">
			<p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
				{label}
			</p>
			<p className={`mt-1 text-2xl font-bold ${valueColor}`}>{value}</p>
		</div>
	);
}

function StatusBadge({ status }: { status: string }) {
	const styles: Record<string, string> = {
		completed: "bg-[var(--color-accent-muted)] text-[var(--color-accent)]",
		failed:
			"bg-[var(--color-destructive-muted)] text-[var(--color-destructive)]",
		processing: "bg-[var(--color-info-muted)] text-[var(--color-info)]",
		pending: "bg-[var(--color-surface)] text-[var(--color-text-muted)]",
	};

	return (
		<span
			className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}
		>
			{status}
		</span>
	);
}

function formatRelativeTime(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60_000);
	const diffHours = Math.floor(diffMs / 3_600_000);
	const diffDays = Math.floor(diffMs / 86_400_000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString();
}

function formatNextRun(date: Date): string {
	const now = new Date();
	const diffMs = date.getTime() - now.getTime();
	const diffHours = Math.floor(diffMs / 3_600_000);
	const diffMins = Math.floor((diffMs % 3_600_000) / 60_000);

	if (diffHours > 0) return `in ${diffHours}h ${diffMins}m`;
	return `in ${diffMins}m`;
}
