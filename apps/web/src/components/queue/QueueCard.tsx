"use client";

import type { PipelineProgress, PipelineStepName } from "@disc/shared";
import Image from "next/image";
import { formatRelative } from "@/lib/format";

export interface ScheduleConfig {
	analysisMode: "with" | "without";
	customText: string;
}

const STEP_LABELS: Record<PipelineStepName, string> = {
	fetch_tracks: "Fetching tracks",
	fetch_lyrics: "Fetching lyrics",
	extract_themes: "Extracting themes",
	select_theme: "Selecting theme",
	generate_image: "Generating image",
	upload: "Uploading to Spotify",
};

const STEP_ORDER: PipelineStepName[] = [
	"fetch_tracks",
	"fetch_lyrics",
	"extract_themes",
	"select_theme",
	"generate_image",
	"upload",
];

interface QueueCardProps {
	id: string;
	name: string;
	status: string;
	coverUrl: string | null;
	progressData: string | null;
	lastGeneratedAt: string | null;
	selected?: boolean;
	locked?: boolean;
	scheduleConfig?: ScheduleConfig;
	onSelect?: (id: string) => void;
	onConfigChange?: (config: Partial<ScheduleConfig>) => void;
	onUnschedule?: () => void;
	onViewImage?: (id: string) => void;
	onViewDetails?: (id: string) => void;
	onRetry?: (id: string) => void;
}

export function QueueCard({
	id,
	name,
	status,
	coverUrl,
	progressData,
	lastGeneratedAt,
	selected,
	locked,
	scheduleConfig,
	onSelect,
	onConfigChange,
	onUnschedule,
	onViewImage,
	onViewDetails,
	onRetry,
}: QueueCardProps) {
	let progress: PipelineProgress | null = null;
	if (progressData) {
		try {
			const raw = JSON.parse(progressData) as Record<string, unknown>;
			// Handle old format ({ step, started_at, generation_id }) and new format ({ currentStep, startedAt, generationId })
			if (raw.currentStep) {
				progress = raw as unknown as PipelineProgress;
			} else if (raw.step) {
				progress = {
					currentStep: raw.step as PipelineStepName,
					startedAt: (raw.started_at as string) ?? "",
					generationId: (raw.generation_id as string) ?? "",
					steps: {},
				};
			}
		} catch {
			// Malformed progress data — treat as no progress
		}
	}

	const stepIndex = progress ? STEP_ORDER.indexOf(progress.currentStep) : -1;
	const stepPercent =
		stepIndex >= 0 ? ((stepIndex + 1) / STEP_ORDER.length) * 100 : 0;

	const isSelectable =
		!locked &&
		(status === "idle" ||
			status === "queued" ||
			status === "generated" ||
			status === "failed");

	return (
		<div
			className={[
				"glass rounded-[var(--radius-md)] p-[var(--space-md)] transition-all duration-[var(--duration-fast)]",
				selected ? "ring-2 ring-[var(--color-accent)]" : "",
				locked ? "opacity-50" : "",
			].join(" ")}
		>
			<div className="flex items-center gap-[var(--space-md)]">
				{/* Selection / status indicator */}
				{locked ? (
					<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)]">
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							aria-hidden="true"
						>
							<path
								d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6M3.5 6h7a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"
								stroke="var(--color-text-faint)"
								strokeWidth="1.2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</span>
				) : isSelectable && onSelect ? (
					<button
						type="button"
						onClick={() => onSelect(id)}
						className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border border-[var(--color-border)] transition-colors hover:border-[var(--color-accent)]"
						aria-label={`Select ${name}`}
					>
						{selected && (
							<svg
								width="14"
								height="14"
								viewBox="0 0 14 14"
								fill="none"
								aria-hidden="true"
							>
								<path
									d="M2.5 7l3 3 5.5-5.5"
									stroke="var(--color-accent)"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						)}
					</button>
				) : status === "queued" && !scheduleConfig ? (
					<span
						role="img"
						className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--color-warning)]"
						aria-label="Scheduled"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							aria-hidden="true"
						>
							<circle
								cx="7"
								cy="7"
								r="6"
								stroke="currentColor"
								strokeWidth="1.5"
							/>
							<path
								d="M7 4v3.5l2.5 1.5"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
							/>
						</svg>
					</span>
				) : status === "processing" ? (
					<output
						className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-[var(--color-info)] border-t-transparent"
						aria-label="Processing"
					/>
				) : null}

				{/* Cover thumbnail */}
				{coverUrl ? (
					<Image
						src={coverUrl}
						alt=""
						width={48}
						height={48}
						className="h-12 w-12 shrink-0 rounded-[var(--radius-sm)] object-cover"
						unoptimized
					/>
				) : (
					<div className="h-12 w-12 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-surface)]" />
				)}

				{/* Name + status */}
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-semibold">{name}</p>
					{locked ? (
						<span className="inline-block rounded-[var(--radius-pill)] bg-[var(--color-surface-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-faint)]">
							Not included
						</span>
					) : scheduleConfig ? (
						<p className="text-sm text-[var(--color-warning)]">Scheduled</p>
					) : status === "queued" ? (
						<p className="text-sm text-[var(--color-warning)]">Scheduled</p>
					) : status === "processing" && progress ? (
						<p className="text-sm text-[var(--color-info)]">
							Step {stepIndex + 1}/6:{" "}
							{STEP_LABELS[progress.currentStep] ?? progress.currentStep}
						</p>
					) : status === "failed" ? (
						<p className="text-sm text-[var(--color-destructive)]">Failed</p>
					) : status === "generated" ? (
						<p className="text-sm text-[var(--color-accent)]">
							Generated {lastGeneratedAt ? formatRelative(lastGeneratedAt) : ""}
						</p>
					) : lastGeneratedAt ? (
						<p className="text-sm text-[var(--color-text-muted)]">
							{formatRelative(lastGeneratedAt)}
						</p>
					) : (
						<p className="text-sm text-[var(--color-text-muted)]">
							Not generated
						</p>
					)}
				</div>

				{/* Actions */}
				{!locked && (
					<div className="flex shrink-0 gap-[var(--space-xs)]">
						{status === "processing" && onViewDetails && (
							<button
								type="button"
								onClick={() => onViewDetails(id)}
								className="rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-medium text-[var(--color-info)] hover:bg-[var(--color-info)]/10 transition-colors"
							>
								Details
							</button>
						)}
						{status === "generated" && onViewImage && (
							<button
								type="button"
								onClick={() => onViewImage(id)}
								className="rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] transition-colors"
							>
								View
							</button>
						)}
						{status === "failed" && onRetry && (
							<button
								type="button"
								onClick={() => onRetry(id)}
								className="rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive-muted)] transition-colors"
							>
								Retry
							</button>
						)}
					</div>
				)}
			</div>

			{/* Schedule config (for Scheduled column items) */}
			{scheduleConfig && (
				<div className="flex flex-col gap-[var(--space-xs)] mt-[var(--space-xs)] border-t border-[var(--color-border)] pt-[var(--space-xs)]">
					<select
						value={scheduleConfig.analysisMode}
						onChange={(e) =>
							onConfigChange?.({
								analysisMode: e.target.value as "with" | "without",
							})
						}
						className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
					>
						<option value="with">With lyrics analysis</option>
						<option value="without">Without lyrics analysis</option>
					</select>

					{scheduleConfig.analysisMode === "without" && (
						<input
							type="text"
							value={scheduleConfig.customText}
							onChange={(e) => onConfigChange?.({ customText: e.target.value })}
							placeholder="Describe the subject and mood..."
							className={[
								"rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)]",
								!scheduleConfig.customText.trim()
									? "border-[var(--color-destructive)]"
									: "border-[var(--color-border)]",
							].join(" ")}
						/>
					)}

					<button
						type="button"
						onClick={onUnschedule}
						className="text-[10px] text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] self-start"
					>
						Remove
					</button>
				</div>
			)}

			{/* Progress bar */}
			{status === "processing" && (
				<div className="mt-[var(--space-sm)] h-1.5 overflow-hidden rounded-full bg-[var(--color-surface)]">
					<div
						className="h-full rounded-full bg-[var(--color-info)] transition-all duration-500"
						style={{ width: `${stepPercent}%` }}
					/>
				</div>
			)}
		</div>
	);
}
