"use client";

import type { GenerationVersion, PipelineProgress } from "@disc/shared";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import { AnalysisView } from "./AnalysisView";
import { PipelineStepper } from "./PipelineStepper";

const MAX_NOTES_LENGTH = 500;

interface ImageReviewModalProps {
	open: boolean;
	onClose: () => void;
	playlistName: string;
	generations: GenerationVersion[];
	generationsLoading: boolean;
	processing: boolean;
	progress: PipelineProgress | null;
	onRerun: (customObject?: string) => void;
	onRevise: (notes: string, customObject?: string) => void;
}

export function ImageReviewModal({
	open,
	onClose,
	playlistName,
	generations,
	generationsLoading,
	processing,
	progress,
	onRerun,
	onRevise,
}: ImageReviewModalProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [notes, setNotes] = useState("");
	const [customObject, setCustomObject] = useState("");
	const [activeTab, setActiveTab] = useState<"gallery" | "analysis">("gallery");

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		if (open && !dialog.open) {
			dialog.showModal();
			setActiveTab("gallery");
		} else if (!open && dialog.open) {
			dialog.close();
		}
	}, [open]);

	// Auto-scroll to the rightmost (newest) generation on load
	useEffect(() => {
		if (!generationsLoading && generations.length > 0 && scrollRef.current) {
			scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
		}
	}, [generationsLoading, generations.length]);

	const handleClose = useCallback(() => {
		setNotes("");
		setCustomObject("");
		onClose();
	}, [onClose]);

	const handleRerunClick = useCallback(() => {
		onRerun(customObject.trim() || undefined);
		setCustomObject("");
		setNotes("");
	}, [customObject, onRerun]);

	const handleReviseClick = useCallback(() => {
		if (notes.trim()) {
			onRevise(notes.trim(), customObject.trim() || undefined);
			setNotes("");
			setCustomObject("");
		}
	}, [notes, customObject, onRevise]);

	const total = generations.length;

	return (
		<dialog
			ref={dialogRef}
			onClose={handleClose}
			className="m-auto w-full max-w-5xl rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0 shadow-lg backdrop:bg-black/50"
		>
			<div className="flex flex-col gap-[var(--space-lg)] p-[var(--space-lg)]">
				{/* Header */}
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold">{playlistName}</h2>
					<button
						type="button"
						onClick={handleClose}
						className="rounded-[var(--radius-pill)] p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] transition-colors"
						aria-label="Close"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="none"
							aria-hidden="true"
						>
							<path
								d="M4 4l8 8M12 4l-8 8"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
							/>
						</svg>
					</button>
				</div>

				{/* Tab bar */}
				<div className="flex gap-1 border-b border-[var(--color-border)]">
					{(["gallery", "analysis"] as const).map((tab) => (
						<button
							key={tab}
							type="button"
							onClick={() => setActiveTab(tab)}
							className={[
								"px-4 py-2 text-sm font-medium capitalize transition-colors -mb-px border-b-2",
								activeTab === tab
									? "border-[var(--color-accent)] text-[var(--color-accent)]"
									: "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
							].join(" ")}
						>
							{tab}
						</button>
					))}
				</div>

				{/* Tab content */}
				{activeTab === "gallery" ? (
					<>
						{/* Pipeline stepper (during processing) */}
						{processing && progress && (
							<div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-[var(--space-md)]">
								<PipelineStepper progress={progress} />
							</div>
						)}

						{/* Timeline */}
						{generationsLoading ? (
							<div className="flex items-end gap-[var(--space-md)] overflow-x-auto pb-2">
								{[1, 2, 3].map((i) => (
									<div
										key={i}
										className="shrink-0 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface)]"
										style={{ width: 120 + i * 25, height: 120 + i * 25 }}
									/>
								))}
							</div>
						) : generations.length === 0 ? (
							<div className="flex items-center justify-center py-8">
								<span className="text-sm text-[var(--color-text-muted)]">
									No generations yet
								</span>
							</div>
						) : (
							<div
								ref={scrollRef}
								className="flex items-end gap-[var(--space-md)] overflow-x-auto pb-2"
							>
								{generations.map((gen, i) => {
									const isNewest = i === total - 1;
									const size =
										total === 1
											? 200
											: Math.round(120 + (i / (total - 1)) * 80);
									const opacity =
										total === 1 ? 1.0 : 0.55 + (i / (total - 1)) * 0.45;

									return (
										<GenerationCard
											key={gen.id}
											generation={gen}
											size={size}
											opacity={opacity}
											isNewest={isNewest}
											playlistName={playlistName}
										/>
									);
								})}

								{/* Processing indicator at end of timeline */}
								{processing && (
									<div
										className="flex shrink-0 flex-col items-center justify-center gap-[var(--space-sm)] rounded-[var(--radius-md)] border-2 border-dashed border-[var(--color-info)]/40 bg-[var(--color-info)]/5"
										style={{ width: 200, height: 200 }}
									>
										<div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-info)] border-t-transparent" />
										<span className="text-xs text-[var(--color-info)]">
											Generating...
										</span>
									</div>
								)}
							</div>
						)}

						{/* Custom object override */}
						<div className="flex flex-col gap-[var(--space-xs)]">
							<label
								htmlFor="custom-object"
								className="text-sm font-medium text-[var(--color-text-secondary)]"
							>
								Custom object (optional)
							</label>
							<input
								id="custom-object"
								type="text"
								value={customObject}
								onChange={(e) => setCustomObject(e.target.value)}
								placeholder='e.g. "a vintage jukebox with neon tubes" — skips AI extraction'
								disabled={processing}
								className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] transition-colors focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50"
							/>
							<span className="text-xs text-[var(--color-text-faint)]">
								Provide your own subject — bypasses lyrics analysis and theme
								extraction
							</span>
						</div>

						{/* Revision notes */}
						<div className="flex flex-col gap-[var(--space-xs)]">
							<label
								htmlFor="revision-notes"
								className="text-sm font-medium text-[var(--color-text-secondary)]"
							>
								Revision notes (optional)
							</label>
							<textarea
								id="revision-notes"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								maxLength={MAX_NOTES_LENGTH}
								placeholder='e.g. "Make it darker" or "Focus more on the ocean theme"'
								rows={3}
								disabled={processing}
								className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] transition-colors focus:border-[var(--color-accent)] focus:outline-none resize-none disabled:opacity-50"
							/>
							<span className="text-xs text-[var(--color-text-faint)] text-right">
								{notes.length}/{MAX_NOTES_LENGTH}
							</span>
						</div>

						{/* Actions */}
						<div className="flex items-center justify-end gap-[var(--space-sm)]">
							<button
								type="button"
								onClick={handleRerunClick}
								disabled={processing}
								className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)] disabled:opacity-50"
							>
								{processing
									? "Processing..."
									: customObject.trim()
										? "Generate with Object"
										: "Full Re-run"}
							</button>
							<button
								type="button"
								onClick={handleReviseClick}
								disabled={processing || !notes.trim()}
								className="rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
							>
								{processing ? "Processing..." : "Revise with Notes"}
							</button>
						</div>
					</>
				) : (
					<AnalysisView generations={generations} />
				)}
			</div>
		</dialog>
	);
}

function GenerationCard({
	generation,
	size,
	opacity,
	isNewest,
	playlistName,
}: {
	generation: GenerationVersion;
	size: number;
	opacity: number;
	isNewest: boolean;
	playlistName: string;
}) {
	const [promptOpen, setPromptOpen] = useState(false);
	const imageUrl = `/api/images?key=${encodeURIComponent(generation.r2_key)}`;

	return (
		<div
			className="flex shrink-0 flex-col gap-[var(--space-xs)]"
			style={{ width: size, opacity }}
		>
			{/* Label */}
			<span className="text-xs font-medium text-[var(--color-text-muted)] truncate">
				{isNewest ? "Current" : generation.style_name}
			</span>

			{/* Image */}
			<div
				className={
					isNewest
						? "ring-2 ring-[var(--color-accent)] rounded-[var(--radius-md)]"
						: ""
				}
			>
				<Image
					src={imageUrl}
					alt={`Generated cover for ${playlistName} — ${generation.style_name}`}
					width={size}
					height={size}
					className="aspect-square w-full rounded-[var(--radius-md)] object-cover"
					loading={isNewest ? undefined : "lazy"}
					unoptimized
				/>
			</div>

			{/* Metadata */}
			<span className="text-xs text-[var(--color-text-muted)]">
				{generation.style_name} · {formatTimestamp(generation.created_at)}
			</span>
			<span className="inline-flex w-fit items-center rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)] truncate max-w-full">
				{generation.symbolic_object}
			</span>

			{/* Prompt toggle */}
			{isNewest && (
				<div>
					<button
						type="button"
						onClick={() => setPromptOpen(!promptOpen)}
						className="text-[10px] text-[var(--color-accent)] hover:underline"
					>
						{promptOpen ? "hide prompt" : "show prompt"}
					</button>
					{promptOpen && (
						<p className="mt-1 text-[10px] leading-snug text-[var(--color-text-muted)] break-words">
							{generation.prompt}
						</p>
					)}
				</div>
			)}
		</div>
	);
}
