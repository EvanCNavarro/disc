"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { formatCost, formatDuration, formatTimestamp } from "@/lib/format";

interface CostStep {
	step: string;
	model: string;
	input_tokens?: number;
	output_tokens?: number;
	cost_usd: number;
}

interface CostBreakdown {
	steps: CostStep[];
	total_usd: number;
}

interface GenerationRow {
	id: string;
	playlist_name: string;
	r2_key: string | null;
	symbolic_object: string;
	style_name: string;
	trigger_type: string;
	status: string;
	duration_ms: number | null;
	cost_usd: number | null;
	prompt: string;
	error_message: string | null;
	created_at: string;
	model_name: string | null;
	llm_input_tokens: number | null;
	llm_output_tokens: number | null;
	image_model: string | null;
	cost_breakdown: string | null;
}

type StatusFilter = "all" | "completed" | "failed" | "pending" | "processing";
type TriggerFilter = "all" | "manual" | "cron";

const STATUS_OPTIONS: StatusFilter[] = [
	"all",
	"completed",
	"failed",
	"processing",
	"pending",
];
const TRIGGER_OPTIONS: TriggerFilter[] = ["all", "manual", "cron"];
const PAGE_SIZE = 20;

const STEP_LABELS: Record<string, string> = {
	extract_themes: "Extract Themes",
	convergence: "Convergence",
	image_generation: "Image Gen",
};

function formatTokens(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function shortenModel(model: string): string {
	const parts = model.split("/");
	return parts[parts.length - 1];
}

export function GenerationHistoryTable() {
	const { data, loading } = useCachedFetch<{ generations: GenerationRow[] }>(
		"/api/generations",
	);
	const generations = data?.generations ?? [];
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>("all");
	const [page, setPage] = useState(0);

	function handleStatusFilter(v: StatusFilter) {
		setStatusFilter(v);
		setPage(0);
	}

	function handleTriggerFilter(v: TriggerFilter) {
		setTriggerFilter(v);
		setPage(0);
	}

	const filtered = generations.filter((g) => {
		if (statusFilter !== "all" && g.status !== statusFilter) return false;
		if (triggerFilter !== "all" && g.trigger_type !== triggerFilter)
			return false;
		return true;
	});

	const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
	const rangeStart = filtered.length === 0 ? 0 : page * PAGE_SIZE + 1;
	const rangeEnd = Math.min((page + 1) * PAGE_SIZE, filtered.length);

	function toggleRow(id: string) {
		setExpandedId((prev) => (prev === id ? null : id));
	}

	if (loading) return <SkeletonRows />;

	if (generations.length === 0) {
		return (
			<div className="flex flex-col items-center gap-[var(--space-sm)] py-[var(--space-xl)] text-center">
				<p className="text-sm text-[var(--color-text-muted)]">
					No generations yet.
				</p>
				<Link
					href="/queue"
					className="text-sm text-[var(--color-accent)] hover:underline"
				>
					Go to Queue to generate covers
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-[var(--space-md)]">
			{/* Filter pills */}
			<div className="flex flex-wrap gap-[var(--space-sm)]">
				<FilterGroup
					label="Status"
					options={STATUS_OPTIONS}
					value={statusFilter}
					onChange={handleStatusFilter}
				/>
				<div className="mx-1 w-px bg-[var(--color-border-subtle)]" />
				<FilterGroup
					label="Trigger"
					options={TRIGGER_OPTIONS}
					value={triggerFilter}
					onChange={handleTriggerFilter}
				/>
			</div>

			{filtered.length === 0 ? (
				<div className="flex flex-col items-center gap-[var(--space-sm)] py-[var(--space-lg)] text-center">
					<p className="text-sm text-[var(--color-text-muted)]">No matches.</p>
					<button
						type="button"
						onClick={() => {
							setStatusFilter("all");
							setTriggerFilter("all");
						}}
						className="text-sm text-[var(--color-accent)] hover:underline"
					>
						Clear filters
					</button>
				</div>
			) : (
				<>
					{/* Desktop table */}
					<div className="hidden md:block overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-[var(--color-border-subtle)] text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
									<th className="pb-2 pr-2 w-10">
										<span className="sr-only">Cover</span>
									</th>
									<th className="pb-2 pr-3">Playlist</th>
									<th className="pb-2 pr-3">Object</th>
									<th className="pb-2 pr-3">Style</th>
									<th className="pb-2 pr-3">Trigger</th>
									<th className="pb-2 pr-3">Status</th>
									<th className="pb-2 pr-3">Cost</th>
									<th className="pb-2">When</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-[var(--color-border-subtle)]">
								{paginated.map((g) => (
									<DesktopRow
										key={g.id}
										row={g}
										expanded={expandedId === g.id}
										onToggle={() => toggleRow(g.id)}
									/>
								))}
							</tbody>
						</table>
					</div>

					{/* Mobile list */}
					<div className="flex flex-col divide-y divide-[var(--color-border-subtle)] md:hidden">
						{paginated.map((g) => (
							<MobileRow
								key={g.id}
								row={g}
								expanded={expandedId === g.id}
								onToggle={() => toggleRow(g.id)}
							/>
						))}
					</div>

					{/* Pagination */}
					<div className="flex items-center justify-between pt-[var(--space-sm)]">
						<span className="hidden sm:inline text-xs text-[var(--color-text-muted)]">
							Showing {rangeStart}&ndash;{rangeEnd} of {filtered.length}
						</span>
						<div className="flex gap-[var(--space-xs)] ml-auto">
							<button
								type="button"
								disabled={page === 0}
								onClick={() => setPage((p) => p - 1)}
								className="rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:pointer-events-none"
							>
								Previous
							</button>
							<button
								type="button"
								disabled={page >= totalPages - 1}
								onClick={() => setPage((p) => p + 1)}
								className="rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:pointer-events-none"
							>
								Next
							</button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}

function FilterGroup<T extends string>({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: T[];
	value: T;
	onChange: (v: T) => void;
}) {
	return (
		<div className="flex items-center gap-[var(--space-xs)]">
			<span className="text-xs text-[var(--color-text-faint)] uppercase tracking-wide">
				{label}:
			</span>
			{options.map((opt) => (
				<button
					key={opt}
					type="button"
					onClick={() => onChange(opt)}
					className={`rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium transition-colors ${
						value === opt
							? "bg-[var(--color-accent)] text-white"
							: "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
					}`}
				>
					{opt === "all" ? "All" : opt.charAt(0).toUpperCase() + opt.slice(1)}
				</button>
			))}
		</div>
	);
}

function TriggerIcon({ type }: { type: string }) {
	if (type === "cron") {
		return (
			<svg
				className="inline-block h-3.5 w-3.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={2}
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="10" />
				<polyline points="12 6 12 12 16 14" />
			</svg>
		);
	}
	return (
		<svg
			className="inline-block h-3.5 w-3.5"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2}
			aria-hidden="true"
		>
			<path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
		</svg>
	);
}

function CostTooltip({
	breakdown,
	flipUp,
}: {
	breakdown: CostBreakdown;
	flipUp?: boolean;
}) {
	return (
		<div
			role="tooltip"
			className={`glass absolute ${flipUp ? "bottom-full mb-1" : "top-full mt-1"} right-0 z-50 min-w-[20rem] rounded-[var(--radius-md)] p-[var(--space-md)] text-xs shadow-[var(--shadow-lg)]`}
		>
			<table className="w-full">
				<thead>
					<tr className="text-left text-[var(--color-text-faint)] uppercase tracking-wide">
						<th className="pb-1.5 pr-3 font-medium">Step</th>
						<th className="pb-1.5 pr-3 font-medium">Model</th>
						<th className="pb-1.5 text-right font-medium">Cost</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-[var(--color-border-subtle)]">
					{breakdown.steps.map((s) => (
						<tr key={s.step}>
							<td className="py-1.5 pr-3">
								<span className="font-medium">
									{STEP_LABELS[s.step] ?? s.step}
								</span>
								{s.input_tokens != null && s.output_tokens != null && (
									<div className="text-[var(--color-text-faint)] mt-0.5">
										{formatTokens(s.input_tokens)} in &middot;{" "}
										{formatTokens(s.output_tokens)} out
									</div>
								)}
							</td>
							<td className="py-1.5 pr-3 text-[var(--color-text-muted)] max-w-[8rem] truncate">
								{shortenModel(s.model)}
							</td>
							<td className="py-1.5 text-right font-mono">
								{formatCost(s.cost_usd)}
							</td>
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr className="border-t border-[var(--color-border)]">
						<td colSpan={2} className="pt-1.5 pr-3 font-semibold">
							Total
						</td>
						<td className="pt-1.5 text-right font-mono font-semibold">
							{formatCost(breakdown.total_usd)}
						</td>
					</tr>
				</tfoot>
			</table>
		</div>
	);
}

function CostCell({ row }: { row: GenerationRow }) {
	const [show, setShow] = useState(false);
	const [flipUp, setFlipUp] = useState(false);
	const btnRef = useRef<HTMLButtonElement>(null);
	const breakdown = parseCostBreakdown(row.cost_breakdown);

	if (!breakdown) {
		return (
			<td className="py-2.5 pr-3 text-[var(--color-text-muted)]">
				{formatCost(row.cost_usd)}
			</td>
		);
	}

	function handleShow() {
		if (btnRef.current) {
			const rect = btnRef.current.getBoundingClientRect();
			// Flip tooltip above if less than 200px to viewport bottom
			setFlipUp(window.innerHeight - rect.bottom < 200);
		}
		setShow(true);
	}

	return (
		<td className="py-2.5 pr-3 text-[var(--color-text-muted)] relative">
			<button
				ref={btnRef}
				type="button"
				className="underline decoration-dotted underline-offset-2 cursor-help bg-transparent border-none p-0 text-inherit text-left font-inherit"
				aria-describedby={show ? `cost-tip-${row.id}` : undefined}
				onMouseEnter={handleShow}
				onMouseLeave={() => setShow(false)}
				onFocus={handleShow}
				onBlur={() => setShow(false)}
				onClick={(e) => e.stopPropagation()}
			>
				{formatCost(row.cost_usd)}
			</button>
			{show && (
				<div id={`cost-tip-${row.id}`}>
					<CostTooltip breakdown={breakdown} flipUp={flipUp} />
				</div>
			)}
		</td>
	);
}

function parseCostBreakdown(raw: string | null): CostBreakdown | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as CostBreakdown;
	} catch {
		return null;
	}
}

function ExpandedDetails({ row }: { row: GenerationRow }) {
	const breakdown = parseCostBreakdown(row.cost_breakdown);

	return (
		<div
			id={`detail-${row.id}`}
			className="flex flex-col gap-[var(--space-sm)] bg-[var(--color-surface)] rounded-[var(--radius-md)] p-[var(--space-md)] text-xs"
		>
			{row.prompt && (
				<div>
					<span className="font-medium text-[var(--color-text-muted)]">
						Prompt
					</span>
					<pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[var(--color-text-secondary)]">
						{row.prompt}
					</pre>
				</div>
			)}
			{row.status === "failed" && row.error_message && (
				<div>
					<span className="font-medium text-[var(--color-destructive)]">
						Error
					</span>
					<p className="mt-1 text-[var(--color-destructive)]">
						{row.error_message}
					</p>
				</div>
			)}
			<div className="flex flex-wrap gap-[var(--space-md)]">
				{row.duration_ms != null && (
					<div>
						<span className="font-medium text-[var(--color-text-muted)]">
							Duration
						</span>
						<span className="ml-2 text-[var(--color-text-secondary)]">
							{formatDuration(row.duration_ms)}
						</span>
					</div>
				)}
				{row.cost_usd != null && (
					<div>
						<span className="font-medium text-[var(--color-text-muted)]">
							Cost
						</span>
						<span className="ml-2 text-[var(--color-text-secondary)]">
							{formatCost(row.cost_usd)}
						</span>
					</div>
				)}
			</div>
			{breakdown && (
				<div>
					<span className="font-medium text-[var(--color-text-muted)]">
						Cost Breakdown
					</span>
					<div className="mt-1 grid grid-cols-[auto_auto_auto] gap-x-[var(--space-md)] gap-y-1">
						{breakdown.steps.map((s) => (
							<div key={s.step} className="contents">
								<span className="font-medium">
									{STEP_LABELS[s.step] ?? s.step}
								</span>
								<span className="text-[var(--color-text-muted)]">
									{shortenModel(s.model)}
									{s.input_tokens != null &&
										` (${formatTokens(s.input_tokens)} in / ${formatTokens(s.output_tokens ?? 0)} out)`}
								</span>
								<span className="font-mono text-right">
									{formatCost(s.cost_usd)}
								</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function DesktopRow({
	row,
	expanded,
	onToggle,
}: {
	row: GenerationRow;
	expanded: boolean;
	onToggle: () => void;
}) {
	return (
		<>
			{/* biome-ignore lint/a11y/useSemanticElements: <tr> cannot be replaced with <button> inside <tbody> — interactive row is a standard table pattern */}
			<tr
				role="button"
				tabIndex={0}
				aria-expanded={expanded}
				aria-controls={`detail-${row.id}`}
				onClick={onToggle}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onToggle();
					}
				}}
				className="cursor-pointer transition-colors hover:bg-[var(--color-surface-hover)]"
			>
				<td className="py-2.5 pr-2 w-10">
					{row.r2_key ? (
						// biome-ignore lint/performance/noImgElement: auth proxy incompatible with next/image
						<img
							src={`/api/images?key=${encodeURIComponent(row.r2_key)}`}
							alt=""
							className="h-8 w-8 rounded-[var(--radius-sm)] object-cover"
							loading="lazy"
						/>
					) : (
						<div className="h-8 w-8 rounded-[var(--radius-sm)] bg-[var(--color-surface)]" />
					)}
				</td>
				<td className="py-2.5 pr-3 max-w-[12rem] truncate">
					{row.playlist_name}
				</td>
				<td className="py-2.5 pr-3 max-w-[14rem] truncate text-[var(--color-text-secondary)]">
					{row.symbolic_object || "\u2014"}
				</td>
				<td className="py-2.5 pr-3">
					<span className="rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-2 py-0.5 text-xs">
						{row.style_name}
					</span>
				</td>
				<td className="py-2.5 pr-3">
					<span className="inline-flex items-center gap-1 text-[var(--color-text-muted)]">
						<TriggerIcon type={row.trigger_type} />
						{row.trigger_type}
					</span>
				</td>
				<td className="py-2.5 pr-3">
					<StatusBadge status={row.status} />
				</td>
				<CostCell row={row} />
				<td className="py-2.5 text-[var(--color-text-muted)]">
					{formatTimestamp(row.created_at)}
				</td>
			</tr>
			{expanded && (
				<tr>
					<td colSpan={8} className="pb-2">
						<ExpandedDetails row={row} />
					</td>
				</tr>
			)}
		</>
	);
}

function MobileRow({
	row,
	expanded,
	onToggle,
}: {
	row: GenerationRow;
	expanded: boolean;
	onToggle: () => void;
}) {
	return (
		<div>
			<button
				type="button"
				aria-expanded={expanded}
				aria-controls={`detail-${row.id}`}
				onClick={onToggle}
				className="flex w-full items-center justify-between py-3 text-left"
			>
				<div className="flex items-center gap-2.5 min-w-0">
					{row.r2_key ? (
						// biome-ignore lint/performance/noImgElement: auth proxy incompatible with next/image
						<img
							src={`/api/images?key=${encodeURIComponent(row.r2_key)}`}
							alt=""
							className="h-8 w-8 shrink-0 rounded-[var(--radius-sm)] object-cover"
							loading="lazy"
						/>
					) : (
						<div className="h-8 w-8 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-surface)]" />
					)}
					<div className="flex flex-col gap-0.5 min-w-0">
						<span className="text-sm font-medium truncate">
							{row.playlist_name}
						</span>
						<span className="text-xs text-[var(--color-text-muted)] truncate">
							{row.symbolic_object || "\u2014"}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-3 shrink-0 ml-3">
					<StatusBadge status={row.status} />
					<span className="text-xs text-[var(--color-text-faint)]">
						{formatTimestamp(row.created_at)}
					</span>
				</div>
			</button>
			{expanded && <ExpandedDetails row={row} />}
		</div>
	);
}

const SKELETON_KEYS = ["sk-1", "sk-2", "sk-3", "sk-4", "sk-5"];

function SkeletonRows() {
	return (
		<div className="flex flex-col gap-[var(--space-sm)]">
			{SKELETON_KEYS.map((key) => (
				<div
					key={key}
					className="h-10 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface)]"
				/>
			))}
		</div>
	);
}
