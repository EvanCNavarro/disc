"use client";

import { useQueue } from "@/context/QueueContext";

interface DashboardLiveStatsProps {
	initialStats: {
		total: number;
		generated: number;
		needs_regen: number;
		failed: number;
		collaborative: number;
	};
	totalGenerations: number;
}

export function DashboardLiveStats({
	initialStats,
	totalGenerations,
}: DashboardLiveStatsProps) {
	const { status } = useQueue();

	let stats = initialStats;
	let liveTotal = totalGenerations;

	if (status?.activeJob) {
		const job = status.activeJob;
		stats = {
			...initialStats,
			generated: initialStats.generated + job.completedCount,
			failed: initialStats.failed + job.failedCount,
			needs_regen: Math.max(
				0,
				initialStats.needs_regen - job.completedCount - job.failedCount,
			),
		};
		liveTotal = totalGenerations + job.completedCount;
	}

	return (
		<section className="grid grid-cols-2 gap-[var(--space-md)] sm:grid-cols-3 lg:grid-cols-6">
			<StatCard label="Total" value={stats.total + stats.collaborative} />
			<StatCard label="Generated" value={stats.generated} accent />
			<StatCard
				label="Needs Regen"
				value={stats.needs_regen}
				warning={stats.needs_regen > 0}
			/>
			<StatCard label="Failed" value={stats.failed} error={stats.failed > 0} />
			<StatCard
				label="Collaborative"
				value={stats.collaborative}
				muted={stats.collaborative > 0}
			/>
			<StatCard
				label="Total Images"
				value={liveTotal}
				accent={liveTotal > 0}
				className="col-span-2 sm:col-span-1"
			/>
		</section>
	);
}

function StatCard({
	label,
	value,
	accent,
	warning,
	error,
	muted,
	className,
}: {
	label: string;
	value: number;
	accent?: boolean;
	warning?: boolean;
	error?: boolean;
	muted?: boolean;
	className?: string;
}) {
	let valueColor = "text-[var(--color-text)]";
	if (accent && value > 0) valueColor = "text-[var(--color-accent)]";
	if (warning) valueColor = "text-[var(--color-warning)]";
	if (error) valueColor = "text-[var(--color-destructive)]";
	if (muted) valueColor = "text-[var(--color-text-muted)]";

	return (
		<div
			className={`glass rounded-[var(--radius-md)] p-[var(--space-md)] ${className ?? ""}`}
		>
			<p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
				{label}
			</p>
			<p className={`mt-1 text-2xl font-bold ${valueColor}`}>{value}</p>
		</div>
	);
}
