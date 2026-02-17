"use client";

import type { AnalysisDetail, GenerationVersion } from "@disc/shared";
import { useCallback, useEffect, useRef, useState } from "react";

const TIER_COLORS: Record<string, string> = {
	high: "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/30",
	medium:
		"bg-[var(--color-info)]/15 text-[var(--color-info)] border-[var(--color-info)]/30",
	low: "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]",
};

interface AnalysisViewProps {
	generations: GenerationVersion[];
}

export function AnalysisView({ generations }: AnalysisViewProps) {
	const versionsWithAnalysis = generations.filter((g) => g.analysis_id);
	const [selectedIdx, setSelectedIdx] = useState(
		Math.max(0, versionsWithAnalysis.length - 1),
	);
	const [analysis, setAnalysis] = useState<AnalysisDetail | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const cacheRef = useRef<Map<string, AnalysisDetail>>(new Map());
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

	// Reset to latest when generations list changes
	useEffect(() => {
		setSelectedIdx(Math.max(0, versionsWithAnalysis.length - 1));
	}, [versionsWithAnalysis.length]);

	const selectedGen = versionsWithAnalysis[selectedIdx] ?? null;

	const fetchAnalysis = useCallback(async (analysisId: string) => {
		const cached = cacheRef.current.get(analysisId);
		if (cached) {
			setAnalysis(cached);
			return;
		}

		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/analyses/${analysisId}`);
			if (!res.ok) throw new Error(`Failed to load analysis (${res.status})`);
			const data = (await res.json()) as { analysis: AnalysisDetail };
			cacheRef.current.set(analysisId, data.analysis);
			setAnalysis(data.analysis);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load analysis");
			setAnalysis(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (selectedGen?.analysis_id) {
			fetchAnalysis(selectedGen.analysis_id);
		}
	}, [selectedGen?.analysis_id, fetchAnalysis]);

	const toggleSection = (key: string) => {
		setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
	};

	if (versionsWithAnalysis.length === 0) {
		return (
			<div className="flex items-center justify-center py-12">
				<span className="text-sm text-[var(--color-text-muted)]">
					No analysis data available for these generations
				</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-[var(--space-md)]">
			{/* Version picker */}
			<div className="flex items-center gap-[var(--space-xs)] flex-wrap">
				<span className="text-xs font-medium text-[var(--color-text-secondary)]">
					Version:
				</span>
				{versionsWithAnalysis.map((gen, i) => {
					const isSelected = i === selectedIdx;
					const label =
						i === versionsWithAnalysis.length - 1
							? `v${i + 1} (latest)`
							: `v${i + 1}`;
					return (
						<button
							key={gen.id}
							type="button"
							onClick={() => setSelectedIdx(i)}
							className={[
								"rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium transition-colors",
								isSelected
									? "bg-[var(--color-accent)] text-white"
									: "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]",
							].join(" ")}
						>
							{label}
						</button>
					);
				})}
			</div>

			{/* Loading state */}
			{loading && (
				<div className="space-y-3">
					{[1, 2, 3, 4].map((i) => (
						<div
							key={i}
							className="animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface)] h-20"
						/>
					))}
				</div>
			)}

			{/* Error state */}
			{error && (
				<div className="rounded-[var(--radius-md)] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 p-[var(--space-md)]">
					<p className="text-sm text-[var(--color-error)]">{error}</p>
				</div>
			)}

			{/* Analysis sections */}
			{analysis && !loading && (
				<div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
					{/* Track List */}
					<CollapsibleSection
						title="Track List"
						subtitle={`${analysis.trackSnapshot.length} tracks fetched`}
						collapsed={collapsed.tracks}
						onToggle={() => toggleSection("tracks")}
					>
						<div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] max-h-48 overflow-y-auto">
							{analysis.trackSnapshot.map((track, i) => (
								<div
									key={`${i}-${track.name}-${track.artist}`}
									className={`px-2 py-1.5 text-xs text-[var(--color-text-muted)] ${
										i < analysis.trackSnapshot.length - 1
											? "border-b border-[var(--color-border)]"
											: ""
									}`}
								>
									<span className="text-[var(--color-text)]">{track.name}</span>
									<span> — {track.artist}</span>
								</div>
							))}
						</div>
					</CollapsibleSection>

					{/* Extracted Themes */}
					<CollapsibleSection
						title="Extracted Themes"
						subtitle={`${analysis.trackExtractions.length} tracks analyzed`}
						collapsed={collapsed.themes}
						onToggle={() => toggleSection("themes")}
					>
						<div className="space-y-2">
							{analysis.trackExtractions.map((extraction, ei) => (
								<TrackExtractionCard
									key={`${ei}-${extraction.trackName}-${extraction.artist}`}
									extraction={extraction}
								/>
							))}
						</div>
					</CollapsibleSection>

					{/* Theme Selection (Convergence) — only rendered for full APLOTOCA runs */}
					{analysis.convergenceResult && (
						<CollapsibleSection
							title="Theme Selection"
							subtitle={`Selected: ${analysis.chosenObject}`}
							collapsed={collapsed.convergence}
							onToggle={() => toggleSection("convergence")}
						>
							<div className="space-y-2">
								{analysis.convergenceResult.candidates.map((candidate, i) => {
									const isSelected =
										i === analysis.convergenceResult?.selectedIndex;
									return (
										<div
											key={candidate.object}
											className={[
												"rounded-[var(--radius-sm)] border p-2",
												isSelected
													? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
													: "border-[var(--color-border)] bg-[var(--color-bg)]",
											].join(" ")}
										>
											<div className="flex items-center gap-1.5">
												<span
													className={`text-xs font-medium ${isSelected ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}
												>
													#{candidate.rank} {candidate.object}
												</span>
												{isSelected && (
													<span className="rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-1.5 py-0.5 text-[9px] font-medium text-white">
														SELECTED
													</span>
												)}
											</div>
											<p className="mt-1 text-[10px] text-[var(--color-text-muted)] leading-relaxed">
												{candidate.aestheticContext}
											</p>
											<p className="mt-0.5 text-[10px] text-[var(--color-text-faint)] italic">
												{candidate.reasoning}
											</p>
										</div>
									);
								})}
								{analysis.convergenceResult.collisionNotes && (
									<div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
										<span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
											Collision notes:
										</span>
										<p className="mt-0.5 text-[10px] text-[var(--color-text-muted)] italic">
											{analysis.convergenceResult.collisionNotes}
										</p>
									</div>
								)}
							</div>
						</CollapsibleSection>
					)}

					{/* Image Prompt */}
					<CollapsibleSection
						title="Image Prompt"
						subtitle={analysis.styleName}
						collapsed={collapsed.prompt}
						onToggle={() => toggleSection("prompt")}
					>
						<div className="space-y-2">
							<div>
								<span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
									Style:
								</span>
								<span className="ml-1 text-[10px] text-[var(--color-text)]">
									{analysis.styleName}
								</span>
							</div>
							<div>
								<span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
									Subject:
								</span>
								<p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
									{analysis.chosenObject}, {analysis.aestheticContext}
								</p>
							</div>
							{/* Show the full prompt from the generation if available */}
							{selectedGen && (
								<div>
									<span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
										Final prompt:
									</span>
									<div className="mt-1 max-h-32 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
										<p className="text-[10px] text-[var(--color-text-muted)] break-words leading-relaxed font-mono">
											{selectedGen.prompt}
										</p>
									</div>
								</div>
							)}
						</div>
					</CollapsibleSection>

					{/* Change Detection (if available) */}
					{(analysis.tracksAdded || analysis.tracksRemoved) && (
						<CollapsibleSection
							title="Change Detection"
							subtitle={`${analysis.outlierCount} new track${analysis.outlierCount !== 1 ? "s" : ""}`}
							collapsed={collapsed.changes}
							onToggle={() => toggleSection("changes")}
						>
							<div className="space-y-1.5">
								{analysis.tracksAdded && analysis.tracksAdded.length > 0 && (
									<div>
										<span className="text-[10px] font-medium text-[var(--color-accent)]">
											Added:
										</span>
										<div className="mt-0.5 flex flex-wrap gap-1">
											{analysis.tracksAdded.map((name) => (
												<span
													key={name}
													className="rounded-[var(--radius-pill)] bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]"
												>
													{name}
												</span>
											))}
										</div>
									</div>
								)}
								{analysis.tracksRemoved &&
									analysis.tracksRemoved.length > 0 && (
										<div>
											<span className="text-[10px] font-medium text-[var(--color-text-muted)]">
												Removed:
											</span>
											<div className="mt-0.5 flex flex-wrap gap-1">
												{analysis.tracksRemoved.map((name) => (
													<span
														key={name}
														className="rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]"
													>
														{name}
													</span>
												))}
											</div>
										</div>
									)}
							</div>
						</CollapsibleSection>
					)}
				</div>
			)}
		</div>
	);
}

function CollapsibleSection({
	title,
	subtitle,
	collapsed,
	onToggle,
	children,
}: {
	title: string;
	subtitle: string;
	collapsed: boolean | undefined;
	onToggle: () => void;
	children: React.ReactNode;
}) {
	const isCollapsed = collapsed ?? false;

	return (
		<div className="rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden">
			<button
				type="button"
				onClick={onToggle}
				className="flex w-full items-center justify-between bg-[var(--color-surface)] px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface)]/80"
			>
				<div className="flex items-center gap-2">
					<span className="text-xs font-semibold text-[var(--color-text)]">
						{title}
					</span>
					<span className="text-[10px] text-[var(--color-text-muted)]">
						{subtitle}
					</span>
				</div>
				<svg
					width="12"
					height="12"
					viewBox="0 0 12 12"
					fill="none"
					className={`text-[var(--color-text-muted)] transition-transform ${isCollapsed ? "" : "rotate-180"}`}
					aria-hidden="true"
				>
					<path
						d="M3 4.5l3 3 3-3"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
			{!isCollapsed && (
				<div className="p-3 bg-[var(--color-bg-elevated)]">{children}</div>
			)}
		</div>
	);
}

function TrackExtractionCard({
	extraction,
}: {
	extraction: AnalysisDetail["trackExtractions"][number];
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center justify-between text-left"
			>
				<p className="text-xs font-medium text-[var(--color-text)] truncate">
					{extraction.trackName}
					<span className="font-normal text-[var(--color-text-muted)]">
						{" "}
						— {extraction.artist}
					</span>
					{!extraction.lyricsFound && (
						<span className="ml-1 text-[10px] text-[var(--color-text-faint)]">
							(no lyrics)
						</span>
					)}
				</p>
				<svg
					width="10"
					height="10"
					viewBox="0 0 12 12"
					fill="none"
					className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${expanded ? "rotate-180" : ""}`}
					aria-hidden="true"
				>
					<path
						d="M3 4.5l3 3 3-3"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>

			{/* Object badges — always visible */}
			{extraction.objects.length > 0 && (
				<div className="mt-1.5 flex flex-wrap gap-1">
					{extraction.objects.map((obj) => (
						<span
							key={obj.object}
							className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-1.5 py-0.5 text-[10px] ${TIER_COLORS[obj.tier] ?? TIER_COLORS.low}`}
							title={expanded ? undefined : obj.reasoning}
						>
							{obj.object}
							<span className="opacity-60">{obj.tier[0]}</span>
						</span>
					))}
				</div>
			)}

			{/* Expanded reasoning */}
			{expanded && extraction.objects.length > 0 && (
				<div className="mt-2 space-y-1 border-t border-[var(--color-border)] pt-2">
					{extraction.objects.map((obj) => (
						<div key={obj.object} className="flex gap-1.5">
							<span className="shrink-0 text-[10px] font-medium text-[var(--color-text-secondary)]">
								{obj.object}:
							</span>
							<span className="text-[10px] text-[var(--color-text-faint)] italic leading-relaxed">
								{obj.reasoning}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
