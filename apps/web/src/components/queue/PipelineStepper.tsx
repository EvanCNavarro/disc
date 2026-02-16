"use client";

import type { PipelineProgress, PipelineStepName } from "@disc/shared";
import { useEffect, useRef, useState } from "react";

const STEPS: { name: PipelineStepName; label: string }[] = [
	{ name: "fetch_tracks", label: "Fetch tracks" },
	{ name: "fetch_lyrics", label: "Fetch lyrics" },
	{ name: "extract_themes", label: "Extract themes" },
	{ name: "select_theme", label: "Select theme" },
	{ name: "generate_image", label: "Generate image" },
	{ name: "upload", label: "Upload" },
];

const TIER_COLORS: Record<string, string> = {
	high: "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/30",
	medium:
		"bg-[var(--color-info)]/15 text-[var(--color-info)] border-[var(--color-info)]/30",
	low: "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]",
};

interface PipelineStepperProps {
	progress: PipelineProgress;
}

export function PipelineStepper({ progress }: PipelineStepperProps) {
	const [selectedStep, setSelectedStep] = useState<PipelineStepName | null>(
		null,
	);
	const prevStepRef = useRef(progress.currentStep);

	const currentIndex = STEPS.findIndex((s) => s.name === progress.currentStep);

	// Auto-select the most recently completed step when the pipeline advances
	useEffect(() => {
		if (prevStepRef.current !== progress.currentStep) {
			const prevStep = prevStepRef.current;
			prevStepRef.current = progress.currentStep;
			if (progress.steps[prevStep] !== undefined) {
				setSelectedStep(prevStep);
			}
		}
	}, [progress.currentStep, progress.steps]);

	// Auto-select first completed step with data if nothing is selected yet
	useEffect(() => {
		if (selectedStep !== null) return;
		const firstCompleted = STEPS.find(
			(s, i) => i < currentIndex && progress.steps[s.name] !== undefined,
		);
		if (firstCompleted) {
			setSelectedStep(firstCompleted.name);
		}
	}, [selectedStep, currentIndex, progress.steps]);

	// Also auto-select extract_themes while it's in progress (to show real-time per-track data)
	useEffect(() => {
		if (
			progress.currentStep === "extract_themes" &&
			progress.steps.extract_themes
		) {
			setSelectedStep("extract_themes");
		}
	}, [progress.currentStep, progress.steps.extract_themes]);

	return (
		<div
			className="flex rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden"
			style={{ minHeight: 200 }}
		>
			{/* Step list (left panel) */}
			<div className="flex flex-col w-[200px] shrink-0 bg-[var(--color-surface)] border-r border-[var(--color-border)]">
				{STEPS.map((step, i) => {
					const isCompleted = i < currentIndex;
					const isCurrent = i === currentIndex;
					const isFuture = i > currentIndex;
					const hasData = progress.steps[step.name] !== undefined;
					const isSelected = selectedStep === step.name;
					// Allow clicking current step if it has data (e.g. extract_themes with partial results)
					const isClickable =
						(isCompleted && hasData) || (isCurrent && hasData);

					return (
						<StepRow
							key={step.name}
							label={step.label}
							isCompleted={isCompleted}
							isCurrent={isCurrent}
							isFuture={isFuture}
							isSelected={isSelected}
							isClickable={isClickable}
							summary={
								hasData ? getStepSummary(step.name, progress) : undefined
							}
							onClick={
								isClickable ? () => setSelectedStep(step.name) : undefined
							}
						/>
					);
				})}
			</div>

			{/* Detail panel (right) */}
			<div className="flex-1 bg-[var(--color-bg-elevated)] p-[var(--space-md)] overflow-y-auto">
				{selectedStep && progress.steps[selectedStep] ? (
					<StepDetail stepName={selectedStep} progress={progress} />
				) : (
					<div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
						{currentIndex === 0
							? "Waiting for first step to complete..."
							: "Select a step to view details"}
					</div>
				)}
			</div>
		</div>
	);
}

function StepRow({
	label,
	isCompleted,
	isCurrent,
	isFuture,
	isSelected,
	isClickable,
	summary,
	onClick,
}: {
	label: string;
	isCompleted: boolean;
	isCurrent: boolean;
	isFuture: boolean;
	isSelected: boolean;
	isClickable: boolean;
	summary?: string;
	onClick?: () => void;
}) {
	const Tag = isClickable ? "button" : "div";

	return (
		<Tag
			type={isClickable ? "button" : undefined}
			onClick={onClick}
			className={[
				"flex items-center gap-[var(--space-sm)] px-[var(--space-sm)] py-[var(--space-xs)] text-left transition-colors",
				isSelected
					? "bg-[var(--color-bg-elevated)] mr-[-1px] relative z-10"
					: "",
				isClickable && !isSelected
					? "hover:bg-[var(--color-bg-elevated)]/50 cursor-pointer"
					: "",
				isFuture ? "opacity-40" : "",
				!isClickable ? "cursor-default" : "",
			]
				.filter(Boolean)
				.join(" ")}
			aria-current={isSelected ? "true" : undefined}
		>
			{/* Step indicator */}
			{isCompleted ? (
				<div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]">
					<svg
						width="8"
						height="8"
						viewBox="0 0 12 12"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M2 6l3 3 5-5"
							stroke="white"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
			) : isCurrent ? (
				<div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--color-info)]">
					<div className="h-2 w-2 animate-spin rounded-full border-[1px] border-[var(--color-info)] border-t-transparent" />
				</div>
			) : (
				<div className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)]" />
			)}

			{/* Label + summary */}
			<div className="flex flex-col min-w-0">
				<span
					className={[
						"text-xs font-medium truncate",
						isCurrent
							? "text-[var(--color-info)]"
							: isCompleted
								? "text-[var(--color-text)]"
								: "text-[var(--color-text-muted)]",
					].join(" ")}
				>
					{label}
				</span>
				{summary && !isSelected && (
					<span className="text-[10px] text-[var(--color-text-muted)] truncate">
						{summary}
					</span>
				)}
				{isCurrent && !summary && (
					<span className="text-[10px] text-[var(--color-text-muted)]">
						In progress...
					</span>
				)}
			</div>
		</Tag>
	);
}

function getStepSummary(
	stepName: PipelineStepName,
	progress: PipelineProgress,
): string {
	const data = progress.steps[stepName];
	if (!data) return "";

	switch (stepName) {
		case "fetch_tracks": {
			const d = data as NonNullable<typeof progress.steps.fetch_tracks>;
			return `${d.trackCount} tracks`;
		}
		case "fetch_lyrics": {
			const d = data as NonNullable<typeof progress.steps.fetch_lyrics>;
			return `${d.found}/${d.total} found`;
		}
		case "extract_themes": {
			const d = data as NonNullable<typeof progress.steps.extract_themes>;
			return d.completed < d.total
				? `${d.completed}/${d.total} tracks...`
				: `${d.objectCount} objects`;
		}
		case "select_theme": {
			const d = data as NonNullable<typeof progress.steps.select_theme>;
			return d.chosenObject;
		}
		case "generate_image": {
			const d = data as NonNullable<typeof progress.steps.generate_image>;
			return d.styleName;
		}
		case "upload":
			return "Complete";
		default:
			return "";
	}
}

function StepDetail({
	stepName,
	progress,
}: {
	stepName: PipelineStepName;
	progress: PipelineProgress;
}) {
	const data = progress.steps[stepName];
	if (!data) return null;

	const stepLabel = STEPS.find((s) => s.name === stepName)?.label ?? stepName;

	switch (stepName) {
		case "fetch_tracks": {
			const d = data as NonNullable<typeof progress.steps.fetch_tracks>;
			return (
				<div>
					<h3 className="text-sm font-semibold text-[var(--color-text)]">
						{stepLabel}
					</h3>
					<p className="mt-1 text-xs text-[var(--color-text-secondary)]">
						{d.trackCount} tracks fetched from Spotify
					</p>
					<div className="mt-2 max-h-48 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]">
						{d.trackNames.map((name, i) => (
							<div
								key={name}
								className={`px-2 py-1 text-xs text-[var(--color-text-muted)] truncate ${
									i < d.trackNames.length - 1
										? "border-b border-[var(--color-border)]"
										: ""
								}`}
							>
								{name}
							</div>
						))}
					</div>
				</div>
			);
		}
		case "fetch_lyrics": {
			const d = data as NonNullable<typeof progress.steps.fetch_lyrics>;
			const pct = d.total > 0 ? Math.round((d.found / d.total) * 100) : 0;
			return (
				<div>
					<h3 className="text-sm font-semibold text-[var(--color-text)]">
						{stepLabel}
					</h3>
					<p className="mt-1 text-xs text-[var(--color-text-secondary)]">
						Found lyrics for {d.found} of {d.total} tracks ({pct}%)
					</p>
					<div className="mt-2 h-1.5 w-full rounded-full bg-[var(--color-border)]">
						<div
							className="h-full rounded-full bg-[var(--color-accent)] transition-all"
							style={{ width: `${pct}%` }}
						/>
					</div>
					{/* Per-track lyrics breakdown */}
					{d.tracks && d.tracks.length > 0 && (
						<div className="mt-3 max-h-56 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]">
							{d.tracks.map((t, i) => (
								<div
									key={`${t.name}-${t.artist}`}
									className={`px-2 py-1.5 ${
										i < d.tracks.length - 1
											? "border-b border-[var(--color-border)]"
											: ""
									}`}
								>
									<div className="flex items-center gap-1.5">
										<span
											className={`text-[10px] ${t.found ? "text-[var(--color-accent)]" : "text-[var(--color-text-faint)]"}`}
										>
											{t.found ? "\u2713" : "\u2717"}
										</span>
										<span className="text-xs text-[var(--color-text-muted)] truncate">
											{t.name} — {t.artist}
										</span>
									</div>
									{t.snippet && (
										<p className="mt-0.5 pl-4 text-[10px] text-[var(--color-text-faint)] italic truncate">
											{t.snippet}
										</p>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			);
		}
		case "extract_themes": {
			const d = data as NonNullable<typeof progress.steps.extract_themes>;
			const isInProgress = d.completed < d.total;
			return (
				<div>
					<h3 className="text-sm font-semibold text-[var(--color-text)]">
						{stepLabel}
						{isInProgress && (
							<span className="ml-2 text-xs font-normal text-[var(--color-info)]">
								{d.completed}/{d.total} tracks analyzed...
							</span>
						)}
					</h3>
					<p className="mt-1 text-xs text-[var(--color-text-secondary)]">
						{d.objectCount} objects extracted
						{d.tokensUsed > 0 && ` (${d.tokensUsed.toLocaleString()} tokens)`}
					</p>
					{/* Progress bar during extraction */}
					{isInProgress && (
						<div className="mt-2 h-1.5 w-full rounded-full bg-[var(--color-border)]">
							<div
								className="h-full rounded-full bg-[var(--color-info)] transition-all"
								style={{
									width: `${Math.round((d.completed / d.total) * 100)}%`,
								}}
							/>
						</div>
					)}
					{/* Per-track extraction results */}
					{d.perTrack && d.perTrack.length > 0 && (
						<div className="mt-3 max-h-64 overflow-y-auto space-y-2">
							{d.perTrack.map((track) => (
								<div
									key={`${track.trackName}-${track.artist}`}
									className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2"
								>
									<p className="text-xs font-medium text-[var(--color-text)] truncate">
										{track.trackName}
										<span className="font-normal text-[var(--color-text-muted)]">
											{" "}
											— {track.artist}
										</span>
									</p>
									{track.objects.length > 0 ? (
										<div className="mt-1.5 flex flex-wrap gap-1">
											{track.objects.map((obj) => (
												<span
													key={obj.object}
													className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-1.5 py-0.5 text-[10px] ${TIER_COLORS[obj.tier] ?? TIER_COLORS.low}`}
													title={obj.reasoning}
												>
													{obj.object}
													<span className="opacity-60">{obj.tier[0]}</span>
												</span>
											))}
										</div>
									) : (
										<p className="mt-1 text-[10px] text-[var(--color-text-faint)] italic">
											No objects extracted
										</p>
									)}
								</div>
							))}
						</div>
					)}
					{/* Top objects summary (when per-track not available) */}
					{(!d.perTrack || d.perTrack.length === 0) &&
						d.topObjects.length > 0 && (
							<div className="mt-2 flex flex-wrap gap-1">
								{d.topObjects.map((obj) => (
									<span
										key={obj}
										className="inline-block rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)]"
									>
										{obj}
									</span>
								))}
							</div>
						)}
				</div>
			);
		}
		case "select_theme": {
			const d = data as NonNullable<typeof progress.steps.select_theme>;
			return (
				<div>
					<h3 className="text-sm font-semibold text-[var(--color-text)]">
						{stepLabel}
					</h3>
					{/* All candidates */}
					{d.candidates && d.candidates.length > 0 ? (
						<div className="mt-2 space-y-2">
							{d.candidates.map((c, i) => {
								const isChosen = c.object === d.chosenObject;
								return (
									<div
										key={c.object}
										className={`rounded-[var(--radius-sm)] border p-2 ${
											isChosen
												? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
												: "border-[var(--color-border)] bg-[var(--color-bg)]"
										}`}
									>
										<div className="flex items-center gap-1.5">
											<span
												className={`text-xs font-medium ${isChosen ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}
											>
												#{i + 1} {c.object}
											</span>
											{isChosen && (
												<span className="rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-1.5 py-0.5 text-[9px] font-medium text-white">
													SELECTED
												</span>
											)}
										</div>
										<p className="mt-1 text-[10px] text-[var(--color-text-muted)] leading-relaxed">
											{c.aestheticContext}
										</p>
										<p className="mt-0.5 text-[10px] text-[var(--color-text-faint)] italic">
											{c.reasoning}
										</p>
									</div>
								);
							})}
						</div>
					) : (
						<>
							<p className="mt-2 text-xs font-medium text-[var(--color-text)]">
								{d.chosenObject}
							</p>
							<p className="mt-1 text-xs text-[var(--color-text-muted)] leading-relaxed">
								{d.aestheticContext}
							</p>
						</>
					)}
					{d.collisionNotes && (
						<p className="mt-2 text-[10px] text-[var(--color-text-faint)] italic">
							{d.collisionNotes}
						</p>
					)}
				</div>
			);
		}
		case "generate_image": {
			const d = data as NonNullable<typeof progress.steps.generate_image>;
			return (
				<div>
					<h3 className="text-sm font-semibold text-[var(--color-text)]">
						{stepLabel}
					</h3>
					<p className="mt-1 text-xs text-[var(--color-text-secondary)]">
						Style: {d.styleName}
					</p>
					{/* Decomposed prompt */}
					{d.subject && (
						<div className="mt-2 space-y-1.5">
							<div>
								<span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
									Subject:
								</span>
								<p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
									{d.subject}
								</p>
							</div>
							{d.styleTemplate && (
								<div>
									<span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
										Style template:
									</span>
									<p className="text-[10px] text-[var(--color-text-faint)] leading-relaxed font-mono">
										{d.styleTemplate}
									</p>
								</div>
							)}
						</div>
					)}
					{/* Final composed prompt */}
					<div className="mt-2">
						<span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
							Final prompt:
						</span>
						<div className="mt-1 max-h-32 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
							<p className="text-[10px] text-[var(--color-text-muted)] break-words leading-relaxed font-mono">
								{d.prompt}
							</p>
						</div>
					</div>
				</div>
			);
		}
		case "upload":
			return (
				<div>
					<h3 className="text-sm font-semibold text-[var(--color-text)]">
						{stepLabel}
					</h3>
					<p className="mt-1 text-xs text-[var(--color-text-secondary)]">
						Uploaded to R2 + Spotify
					</p>
				</div>
			);
		default:
			return null;
	}
}
