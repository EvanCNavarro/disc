"use client";

import { useCallback, useEffect, useState } from "react";
import { WorkerTimeline } from "@/components/settings/WorkerTimeline";

interface TimelinePoint {
	minuteOfDay: number;
	tickType: string;
	status: string;
	durationMs: number | null;
	playlistsChecked: number | null;
	playlistsProcessed: number | null;
	tokenRefreshed: boolean;
	errorMessage: string | null;
	startedAt: string;
	completedAt: string | null;
}

interface ActivityData {
	timeline: TimelinePoint[];
	summary: {
		totalTicks: number;
		successCount: number;
		failureCount: number;
		successRate: number;
		lastFailure: string | null;
		lastHeartbeat: string | null;
		avgDurationMs: number;
	};
	health: {
		tokenAlive: boolean;
		watcherActive: boolean;
		cronActive: boolean;
		heartbeatCurrent: boolean;
	};
}

function todayUTC(): string {
	return new Date().toISOString().slice(0, 10);
}

// -- Health status pills --

const HEALTH_ITEMS = [
	{ key: "tokenAlive", label: "Token" },
	{ key: "watcherActive", label: "Watcher" },
	{ key: "cronActive", label: "Cron" },
	{ key: "heartbeatCurrent", label: "Heartbeat" },
] as const;

function HealthBar({ health }: { health: ActivityData["health"] }) {
	return (
		<div className="flex flex-wrap gap-[var(--space-sm)]">
			{HEALTH_ITEMS.map(({ key, label }) => {
				const ok = health[key];
				return (
					<span
						key={key}
						className="glass flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-medium"
					>
						<span
							className={`h-2 w-2 rounded-full ${
								ok
									? "bg-[var(--color-accent)]"
									: "bg-[var(--color-destructive)]"
							}`}
						/>
						{label}
					</span>
				);
			})}
		</div>
	);
}

// -- Summary cards --

function SummaryCards({ summary }: { summary: ActivityData["summary"] }) {
	return (
		<div className="grid grid-cols-1 gap-[var(--space-md)] sm:grid-cols-3">
			<div className="glass rounded-[var(--radius-lg)] p-[var(--space-md)]">
				<div className="text-2xl font-bold tabular-nums">
					{summary.totalTicks}
				</div>
				<div className="text-sm text-[var(--color-text-muted)]">
					Total Ticks
				</div>
			</div>
			<div className="glass rounded-[var(--radius-lg)] p-[var(--space-md)]">
				<div className="text-2xl font-bold tabular-nums">
					{summary.successRate}%
				</div>
				<div className="text-sm text-[var(--color-text-muted)]">
					Success Rate
				</div>
			</div>
			<div className="glass rounded-[var(--radius-lg)] p-[var(--space-md)]">
				<div className="text-2xl font-bold tabular-nums">
					{summary.avgDurationMs}ms
				</div>
				<div className="text-sm text-[var(--color-text-muted)]">
					Avg Duration
				</div>
			</div>
		</div>
	);
}

// -- Ticks table --

const TICK_TYPE_COLORS: Record<string, string> = {
	watcher: "var(--color-accent)",
	cron: "var(--color-info)",
	heartbeat: "#8b5cf6",
	manual: "var(--color-warning)",
	auto: "#0d9488",
};

const TICK_TYPE_LABELS: Record<string, string> = {
	watcher: "Watcher",
	cron: "Cron",
	heartbeat: "Heartbeat",
	manual: "Manual",
	auto: "Auto",
};

function TicksTable({ ticks }: { ticks: TimelinePoint[] }) {
	const sorted = [...ticks].reverse();

	return (
		<section className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
			<h2 className="mb-[var(--space-md)] text-sm font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
				Tick Log
			</h2>
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<caption className="sr-only">Worker tick execution log</caption>
					<thead>
						<tr className="border-b border-[var(--color-border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
							<th scope="col" className="pb-2 pr-4">
								Time
							</th>
							<th scope="col" className="pb-2 pr-4">
								Type
							</th>
							<th scope="col" className="pb-2 pr-4">
								Status
							</th>
							<th scope="col" className="pb-2 pr-4">
								Duration
							</th>
							<th scope="col" className="pb-2 pr-4">
								Playlists
							</th>
							<th scope="col" className="pb-2">
								Error
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-[var(--color-border)]">
						{sorted.map((t) => (
							<tr key={t.startedAt} className="hover:bg-[var(--color-surface)]">
								<td
									className="whitespace-nowrap py-2 pr-4 tabular-nums"
									title={t.startedAt}
								>
									{new Date(t.startedAt).toLocaleTimeString("en-US", {
										hour: "2-digit",
										minute: "2-digit",
										timeZone: "UTC",
									})}
								</td>
								<td className="py-2 pr-4">
									<span
										className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
										style={{
											backgroundColor:
												TICK_TYPE_COLORS[t.tickType] ??
												"var(--color-text-muted)",
										}}
									>
										{TICK_TYPE_LABELS[t.tickType] ?? t.tickType}
									</span>
								</td>
								<td className="py-2 pr-4">
									<span className="flex items-center gap-1">
										<span
											className={`h-2 w-2 rounded-full ${
												t.status === "success"
													? "bg-[var(--color-accent)]"
													: t.status === "failure"
														? "bg-[var(--color-destructive)]"
														: "bg-[var(--color-text-muted)]"
											}`}
										/>
										<span className="text-xs">{t.status}</span>
									</span>
								</td>
								<td className="whitespace-nowrap py-2 pr-4 tabular-nums text-[var(--color-text-muted)]">
									{t.durationMs != null ? `${t.durationMs}ms` : "\u2014"}
								</td>
								<td className="py-2 pr-4 tabular-nums text-[var(--color-text-muted)]">
									{t.playlistsProcessed ?? "\u2014"}
								</td>
								<td className="max-w-[200px] truncate py-2 text-xs text-[var(--color-destructive)]">
									{t.errorMessage ?? ""}
								</td>
							</tr>
						))}
						{sorted.length === 0 && (
							<tr>
								<td
									colSpan={6}
									className="py-8 text-center text-[var(--color-text-muted)]"
								>
									No ticks recorded for this day
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}

// -- Main component --

export function ActivityClient() {
	const [date, setDate] = useState(todayUTC);
	const [data, setData] = useState<ActivityData | null>(null);
	const [loading, setLoading] = useState(true);

	const fetchData = useCallback(async (d: string) => {
		setLoading(true);
		try {
			const res = await fetch(`/api/settings/activity?date=${d}`);
			if (res.ok) {
				setData(await res.json());
			}
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchData(date);
	}, [date, fetchData]);

	const shiftDate = (days: number) => {
		const d = new Date(`${date}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() + days);
		const next = d.toISOString().slice(0, 10);
		if (next <= todayUTC()) {
			setDate(next);
		}
	};

	const dateLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});

	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			{/* Health status bar */}
			{data && <HealthBar health={data.health} />}

			{/* Day selector */}
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
					Worker Timeline
				</h2>
				<div className="flex items-center gap-[var(--space-sm)]">
					<button
						type="button"
						onClick={() => shiftDate(-1)}
						aria-label="Previous day"
						className="rounded-[var(--radius-md)] p-[var(--space-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
					>
						&larr;
					</button>
					<span className="min-w-[120px] text-center text-sm font-medium">
						{dateLabel}
					</span>
					<button
						type="button"
						onClick={() => shiftDate(1)}
						disabled={date >= todayUTC()}
						aria-label="Next day"
						className="rounded-[var(--radius-md)] p-[var(--space-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] disabled:opacity-30"
					>
						&rarr;
					</button>
				</div>
			</div>

			{/* Timeline chart */}
			<section className="glass rounded-[var(--radius-lg)] p-[var(--space-md)]">
				{loading ? (
					<div className="flex h-[80px] items-center justify-center text-sm text-[var(--color-text-muted)]">
						Loading...
					</div>
				) : data ? (
					<WorkerTimeline data={data.timeline} />
				) : (
					<div className="flex h-[80px] items-center justify-center text-sm text-[var(--color-text-muted)]">
						No data
					</div>
				)}
			</section>

			{/* Summary cards */}
			{data && <SummaryCards summary={data.summary} />}

			{/* Recent ticks table */}
			{data && <TicksTable ticks={data.timeline} />}
		</div>
	);
}
