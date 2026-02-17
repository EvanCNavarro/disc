"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { UsageTable } from "@/components/settings/UsageTable";

const UsageChart = dynamic(
	() => import("@/components/settings/UsageChart").then((m) => m.UsageChart),
	{ ssr: false, loading: () => <div className="h-[280px]" /> },
);

type TimeRange = "day" | "week" | "month" | "quarter" | "year" | "lifetime";

interface ChartDataPoint {
	date: string;
	openai_usd: number;
	replicate_usd: number;
	total_usd: number;
}

interface Summary {
	totalCost: number;
	eventCount: number;
	avgCostPerEvent: number;
	topModel: string;
	topAction: string;
}

interface UsageEvent {
	id: string;
	actionType: string;
	model: string;
	tokensIn: number | null;
	tokensOut: number | null;
	durationMs: number | null;
	costUsd: number;
	triggerSource: string;
	status: string;
	errorMessage: string | null;
	playlistName: string | null;
	styleName: string | null;
	createdAt: string;
}

interface BillingData {
	chartData: ChartDataPoint[];
	summary: Summary;
	events: UsageEvent[];
	pagination: { page: number; limit: number; total: number };
}

const TIME_RANGES: { value: TimeRange; label: string }[] = [
	{ value: "day", label: "Daily" },
	{ value: "week", label: "Weekly" },
	{ value: "month", label: "Monthly" },
	{ value: "quarter", label: "Quarterly" },
	{ value: "year", label: "Annually" },
	{ value: "lifetime", label: "Lifetime" },
];

export function BillingClient() {
	const [range, setRange] = useState<TimeRange>("month");
	const [page, setPage] = useState(1);
	const [data, setData] = useState<BillingData | null>(null);
	const [loading, setLoading] = useState(true);

	const fetchData = useCallback(async (r: TimeRange, p: number) => {
		setLoading(true);
		try {
			const res = await fetch(
				`/api/settings/billing/usage?range=${r}&page=${p}&limit=50`,
				{ cache: "no-store" },
			);
			if (res.ok) {
				setData(await res.json());
			}
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchData(range, page);
	}, [range, page, fetchData]);

	const handleRangeChange = (newRange: TimeRange) => {
		setRange(newRange);
		setPage(1);
	};

	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			<div>
				<h2 className="text-lg font-semibold">Usage & Costs</h2>
				<p className="text-sm text-[var(--color-text-muted)]">
					Track spending across all AI operations
				</p>
			</div>

			{/* Time Range Selector */}
			<div
				role="tablist"
				aria-label="Time range"
				className="flex gap-1 rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-1"
			>
				{TIME_RANGES.map((tr) => (
					<button
						key={tr.value}
						type="button"
						role="tab"
						aria-selected={range === tr.value}
						onClick={() => handleRangeChange(tr.value)}
						className={`min-h-[44px] rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium transition-colors ${
							range === tr.value
								? "bg-[var(--color-bg-elevated)] text-[var(--color-text)] shadow-sm"
								: "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
						}`}
					>
						{tr.label}
					</button>
				))}
			</div>

			{/* Chart */}
			<div className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				{loading ? (
					<div className="flex h-[280px] items-center justify-center text-[var(--color-text-muted)]">
						Loading chart...
					</div>
				) : (
					<UsageChart data={data?.chartData ?? []} />
				)}
			</div>

			{/* Summary Cards */}
			{data && (
				<div className="grid grid-cols-1 gap-[var(--space-md)] sm:grid-cols-3">
					<div className="glass rounded-[var(--radius-lg)] p-[var(--space-md)]">
						<div className="text-2xl font-bold tabular-nums">
							${data.summary.totalCost.toFixed(2)}
						</div>
						<div className="text-sm text-[var(--color-text-muted)]">
							Total Cost
						</div>
					</div>
					<div className="glass rounded-[var(--radius-lg)] p-[var(--space-md)]">
						<div className="text-2xl font-bold tabular-nums">
							{data.summary.eventCount}
						</div>
						<div className="text-sm text-[var(--color-text-muted)]">
							Actions
						</div>
					</div>
					<div className="glass rounded-[var(--radius-lg)] p-[var(--space-md)]">
						<div className="text-2xl font-bold tabular-nums">
							${data.summary.avgCostPerEvent.toFixed(4)}
						</div>
						<div className="text-sm text-[var(--color-text-muted)]">
							Avg Cost
						</div>
					</div>
				</div>
			)}

			{/* Audit Table */}
			<div className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				{loading ? (
					<div className="text-center text-[var(--color-text-muted)]">
						Loading events...
					</div>
				) : (
					<UsageTable events={data?.events ?? []} />
				)}
			</div>

			{/* Pagination */}
			{data && data.pagination.total > data.pagination.limit && (
				<nav
					aria-label="Pagination"
					className="flex items-center justify-center gap-[var(--space-md)]"
				>
					<button
						type="button"
						disabled={page <= 1}
						onClick={() => setPage((p) => p - 1)}
						className="min-h-[44px] min-w-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-40"
					>
						Previous
					</button>
					<span className="text-sm text-[var(--color-text-muted)]">
						Page {page} of{" "}
						{Math.ceil(data.pagination.total / data.pagination.limit)}
					</span>
					<button
						type="button"
						disabled={
							page >= Math.ceil(data.pagination.total / data.pagination.limit)
						}
						onClick={() => setPage((p) => p + 1)}
						className="min-h-[44px] min-w-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-40"
					>
						Next
					</button>
				</nav>
			)}
		</div>
	);
}
