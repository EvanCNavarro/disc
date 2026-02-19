"use client";

import type { PipelineProgress, PipelineStepName } from "@disc/shared";
import { APLOTOCA } from "@disc/shared";
import { useState } from "react";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { formatRelative } from "@/lib/format";
import {
	PIPELINE_STEP_LABELS,
	PIPELINE_STEP_ORDER,
} from "@/lib/pipeline-constants";

const ANALYSIS_MODE_OPTIONS: DropdownOption[] = [
	{
		value: APLOTOCA.modes.full.value,
		label: APLOTOCA.modes.full.label,
		description: APLOTOCA.modes.full.description,
	},
	{
		value: APLOTOCA.modes.custom.value,
		label: APLOTOCA.modes.custom.label,
		description: APLOTOCA.modes.custom.description,
	},
];

export interface ScheduleConfig {
	analysisMode: "with" | "without";
	customText: string;
}

interface QueueCardProps {
	id: string;
	name: string;
	status: string;
	coverUrl: string | null;
	progressData: string | null;
	lastGeneratedAt: string | null;
	errorMessage?: string | null;
	isCollaborative?: boolean;
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
	errorMessage,
	isCollaborative,
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
	const [coverLoaded, setCoverLoaded] = useState(false);
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

	const stepIndex = progress
		? PIPELINE_STEP_ORDER.indexOf(progress.currentStep)
		: -1;
	const stepPercent =
		stepIndex >= 0 ? ((stepIndex + 1) / PIPELINE_STEP_ORDER.length) * 100 : 0;

	const isSelectable =
		!locked &&
		(status === "idle" ||
			status === "queued" ||
			status === "generated" ||
			status === "failed");

	return (
		<div
			className={[
				"relative rounded-[var(--radius-md)] p-[var(--space-md)] transition-all duration-[var(--duration-fast)]",
				locked
					? "border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/50"
					: "glass",
				selected ? "ring-2 ring-[var(--color-accent)]" : "",
			].join(" ")}
		>
			<div className="flex items-center gap-[var(--space-md)]">
				{/* Badges for locked / collaborative cards */}
				{locked && (
					<span className="absolute right-2 top-2 flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-surface-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-faint)]">
						{isCollaborative ? (
							<>
								<svg
									width="10"
									height="10"
									viewBox="0 0 16 16"
									fill="none"
									aria-hidden="true"
								>
									<circle
										cx="5"
										cy="6"
										r="2.5"
										stroke="currentColor"
										strokeWidth="1.3"
									/>
									<circle
										cx="11"
										cy="6"
										r="2.5"
										stroke="currentColor"
										strokeWidth="1.3"
									/>
									<path
										d="M1 14c0-2.2 1.8-4 4-4M7 14c0-2.2 1.8-4 4-4"
										stroke="currentColor"
										strokeWidth="1.3"
										strokeLinecap="round"
									/>
								</svg>
								Collaborative
							</>
						) : (
							<>
								<svg
									width="10"
									height="10"
									viewBox="0 0 16 16"
									fill="none"
									aria-hidden="true"
								>
									<circle
										cx="8"
										cy="8"
										r="7"
										stroke="currentColor"
										strokeWidth="1.5"
									/>
									<path
										d="M5 11L11 5"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
									/>
								</svg>
								Not eligible
							</>
						)}
					</span>
				)}

				{/* Selection / status indicator */}
				{isSelectable && onSelect ? (
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
					<span
						role="status"
						className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-[var(--color-info)] border-t-transparent"
						aria-label="Processing"
					/>
				) : null}

				{/* Cover thumbnail */}
				<div className="relative h-12 w-12 shrink-0 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--color-surface)]">
					{coverUrl ? (
						<>
							{!coverLoaded && (
								<div className="absolute inset-0 animate-pulse bg-[var(--color-border)]" />
							)}
							{/* biome-ignore lint/performance/noImgElement: auth proxy incompatible with next/image */}
							<img
								src={coverUrl}
								alt={`Cover for ${name}`}
								className={`h-full w-full object-cover transition-opacity duration-300 ${coverLoaded ? "opacity-100" : "opacity-0"}`}
								onLoad={() => setCoverLoaded(true)}
								loading="lazy"
							/>
						</>
					) : null}
				</div>

				{/* Name + status */}
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-semibold">{name}</p>
					{locked ? (
						<p className="text-sm text-[var(--color-text-faint)]">
							Collaborative or non-owned
						</p>
					) : scheduleConfig ? (
						<p className="text-sm text-[var(--color-warning)]">Scheduled</p>
					) : status === "queued" ? (
						<p className="text-sm text-[var(--color-warning)]">Scheduled</p>
					) : status === "processing" && progress ? (
						<p className="text-sm text-[var(--color-info)]">
							Step {stepIndex + 1}/6:{" "}
							{PIPELINE_STEP_LABELS[progress.currentStep] ??
								progress.currentStep}
						</p>
					) : status === "failed" ? (
						<p
							className="text-sm text-[var(--color-destructive)] truncate"
							title={errorMessage ?? undefined}
						>
							{errorMessage || "Failed"}
						</p>
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
					<div className="flex items-center gap-[var(--space-xs)] min-w-0">
						<div className="min-w-0 flex-1">
							<Dropdown
								options={ANALYSIS_MODE_OPTIONS}
								value={scheduleConfig.analysisMode}
								onChange={(val) =>
									onConfigChange?.({
										analysisMode: val as "with" | "without",
									})
								}
								label="Pipeline mode"
							/>
						</div>
						<AplotocaInfoButton />
					</div>

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

function AplotocaInfoButton() {
	const [open, setOpen] = useState(false);

	return (
		<div className="relative shrink-0">
			<button
				type="button"
				onMouseEnter={() => setOpen(true)}
				onMouseLeave={() => setOpen(false)}
				onFocus={() => setOpen(true)}
				onBlur={() => setOpen(false)}
				className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)] text-[10px] font-bold text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
				aria-label="What is APLOTOCA?"
			>
				?
			</button>
			{open && (
				<div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 shadow-[var(--shadow-md)]">
					<p className="text-xs font-semibold text-[var(--color-text)]">
						{APLOTOCA.acronym}
					</p>
					<p className="mt-0.5 text-[10px] text-[var(--color-text-secondary)]">
						{APLOTOCA.fullForm}
					</p>
					<p className="mt-1.5 text-[10px] leading-relaxed text-[var(--color-text-muted)]">
						{APLOTOCA.description}
					</p>
				</div>
			)}
		</div>
	);
}
