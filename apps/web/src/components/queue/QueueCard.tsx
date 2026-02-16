"use client";

import type { PipelineProgress, PipelineStepName } from "@disc/shared";
import Image from "next/image";
import { formatRelative } from "@/lib/format";

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
	onSelect?: (id: string) => void;
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
	onSelect,
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
		status === "idle" ||
		status === "queued" ||
		status === "generated" ||
		status === "failed";

	return (
		<div
			className={`glass rounded-[var(--radius-md)] p-[var(--space-md)] transition-all duration-[var(--duration-fast)] ${
				selected ? "ring-2 ring-[var(--color-accent)]" : ""
			}`}
		>
			<div className="flex items-center gap-[var(--space-md)]">
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
				) : status === "queued" ? (
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
					{status === "queued" ? (
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
			</div>

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
