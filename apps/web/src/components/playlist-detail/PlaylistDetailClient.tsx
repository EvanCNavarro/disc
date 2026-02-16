"use client";

import type {
	ConvergenceResult,
	DbPlaylist,
	TrackExtraction,
} from "@disc/shared";
import { HugeiconsIcon } from "@hugeicons/react";
import { RepeatIcon } from "@hugeicons-pro/core-stroke-rounded";
import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import {
	formatCost,
	formatDuration,
	formatTimestamp,
	formatTrackDuration,
} from "@/lib/format";

interface Analysis {
	id: string;
	chosen_object: string;
	aesthetic_context: string;
	style_name: string;
	track_snapshot: Array<{
		name: string;
		artist: string;
		album: string;
		albumImageUrl?: string | null;
		durationMs?: number;
	}>;
	track_extractions: TrackExtraction[];
	convergence_result: ConvergenceResult;
	tracks_added: string[] | null;
	tracks_removed: string[] | null;
	outlier_count: number;
	trigger_type: string;
	created_at: string;
}

interface Generation {
	id: string;
	r2_key: string | null;
	symbolic_object: string;
	style_name: string;
	prompt: string;
	trigger_type: string;
	status: string;
	duration_ms: number | null;
	cost_usd: number | null;
	cost_breakdown: string | null;
	analysis_id: string | null;
	created_at: string;
}

interface ClaimedObject {
	id: string;
	object_name: string;
	aesthetic_context: string | null;
	created_at: string;
	superseded_at: string | null;
}

interface PlaylistDetailClientProps {
	playlist: DbPlaylist;
	analysis: Analysis | null;
	generations: Generation[];
	claimedObjects: ClaimedObject[];
}

const TIER_SCORES: Record<string, number> = { high: 3, medium: 2, low: 1 };

function computeObjectScores(
	extractions: TrackExtraction[],
): Array<{ object: string; score: number; trackCount: number }> {
	const scores = new Map<string, { score: number; tracks: Set<string> }>();
	for (const track of extractions) {
		for (const obj of track.objects) {
			const key = obj.object.toLowerCase();
			const entry = scores.get(key) ?? { score: 0, tracks: new Set() };
			entry.score += TIER_SCORES[obj.tier] ?? 0;
			entry.tracks.add(`${track.trackName}|||${track.artist}`);
			scores.set(key, entry);
		}
	}
	return Array.from(scores.entries())
		.map(([object, { score, tracks }]) => ({
			object,
			score,
			trackCount: tracks.size,
		}))
		.sort((a, b) => b.score - a.score);
}

export function PlaylistDetailClient({
	playlist,
	analysis,
	generations,
	claimedObjects,
}: PlaylistDetailClientProps) {
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isProcessing =
		playlist.status === "processing" || playlist.status === "queued";

	async function handleGenerate() {
		setGenerating(true);
		setError(null);
		try {
			const res = await fetch(
				`/api/playlists/${playlist.spotify_playlist_id}/regenerate`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ mode: "rerun" }),
				},
			);
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || "Generation failed");
			}
			// Reload the page to reflect new state
			window.location.reload();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setGenerating(false);
		}
	}

	return (
		<>
			{/* Action Bar */}
			<div className="flex flex-wrap items-center gap-[var(--space-sm)]">
				<button
					type="button"
					onClick={handleGenerate}
					disabled={generating || isProcessing}
					className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<HugeiconsIcon icon={RepeatIcon} size={16} />
					{generating
						? "Generating..."
						: isProcessing
							? "Processing..."
							: "Generate Now"}
				</button>
				{error && (
					<span className="text-sm text-[var(--color-destructive)]">
						{error}
					</span>
				)}
			</div>

			{/* Analysis Summary */}
			{analysis ? (
				<section className="flex flex-col gap-[var(--space-md)]">
					<h2 className="text-lg font-semibold">Latest Analysis</h2>
					<div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-[var(--space-lg)]">
						<div className="flex flex-col gap-[var(--space-md)]">
							<div className="flex items-start justify-between gap-4">
								<div className="flex flex-col gap-1">
									<span className="text-2xl font-bold">
										{analysis.chosen_object}
									</span>
									<span className="text-sm text-[var(--color-text-secondary)]">
										{analysis.aesthetic_context}
									</span>
								</div>
								<span className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)]">
									{analysis.style_name}
								</span>
							</div>

							{/* Convergence candidates */}
							{analysis.convergence_result?.candidates?.length > 1 && (
								<div className="flex flex-col gap-[var(--space-sm)] border-t border-[var(--color-border-subtle)] pt-[var(--space-md)]">
									<h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
										Candidates
									</h3>
									<div className="flex flex-col gap-2">
										{analysis.convergence_result.candidates.map((c) => (
											<div
												key={`${c.rank}-${c.object}`}
												className={`flex items-start gap-3 rounded-[var(--radius-md)] p-2.5 text-sm ${
													c.rank ===
													analysis.convergence_result.selectedIndex + 1
														? "bg-[var(--color-accent-muted)] border border-[var(--color-accent)]"
														: "bg-[var(--color-surface)]"
												}`}
											>
												<span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-[var(--color-bg)] text-xs font-bold">
													{c.rank}
												</span>
												<div className="flex flex-col gap-0.5 min-w-0">
													<span className="font-medium">{c.object}</span>
													<span className="text-xs text-[var(--color-text-muted)]">
														{c.reasoning}
													</span>
												</div>
											</div>
										))}
									</div>
									{analysis.convergence_result.collisionNotes && (
										<p className="text-xs text-[var(--color-text-faint)] italic">
											{analysis.convergence_result.collisionNotes}
										</p>
									)}
								</div>
							)}

							{/* Change detection */}
							{(analysis.tracks_added || analysis.tracks_removed) && (
								<div className="flex flex-col gap-[var(--space-sm)] border-t border-[var(--color-border-subtle)] pt-[var(--space-md)]">
									<h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
										Changes Detected
									</h3>
									<div className="flex flex-wrap gap-2 text-xs">
										{analysis.tracks_added &&
											analysis.tracks_added.length > 0 && (
												<span className="rounded-[var(--radius-pill)] bg-green-100 px-2 py-0.5 text-green-800">
													+{analysis.tracks_added.length} added
												</span>
											)}
										{analysis.tracks_removed &&
											analysis.tracks_removed.length > 0 && (
												<span className="rounded-[var(--radius-pill)] bg-red-100 px-2 py-0.5 text-red-800">
													-{analysis.tracks_removed.length} removed
												</span>
											)}
										{analysis.outlier_count > 0 && (
											<span className="rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-2 py-0.5 text-[var(--color-text-muted)]">
												{analysis.outlier_count} outlier
												{analysis.outlier_count !== 1 && "s"}
											</span>
										)}
									</div>
								</div>
							)}

							<p className="text-xs text-[var(--color-text-faint)]">
								Analyzed {formatTimestamp(analysis.created_at)} via{" "}
								{analysis.trigger_type}
							</p>
						</div>
					</div>
				</section>
			) : (
				<section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-xl)] text-center">
					<p className="text-sm text-[var(--color-text-muted)]">
						No analysis yet — generate to see results.
					</p>
				</section>
			)}

			{/* Generation Timeline */}
			{generations.length > 0 && (
				<section className="flex flex-col gap-[var(--space-md)]">
					<h2 className="text-lg font-semibold">Generation History</h2>
					<div className="flex flex-col gap-[var(--space-sm)]">
						{generations.map((gen) => (
							<GenerationCard key={gen.id} generation={gen} />
						))}
					</div>
				</section>
			)}

			{/* Track Listing */}
			{analysis &&
				analysis.track_extractions.length > 0 &&
				(() => {
					// Build lookup from snapshot for enriched metadata
					const snapshotMap = new Map(
						analysis.track_snapshot.map((t) => [`${t.name}|||${t.artist}`, t]),
					);
					return (
						<section className="flex flex-col gap-[var(--space-md)]">
							<h2 className="text-lg font-semibold">
								Track Analysis ({analysis.track_snapshot.length} tracks)
							</h2>
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b border-[var(--color-border-subtle)] text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
											<th className="pb-2 pr-3">Track</th>
											<th className="pb-2 pr-3">Artist</th>
											<th className="pb-2 pr-3">Duration</th>
											<th className="pb-2">Objects</th>
										</tr>
									</thead>
									<tbody>
										{analysis.track_extractions.map((te) => {
											const snap = snapshotMap.get(
												`${te.trackName}|||${te.artist}`,
											);
											return (
												<tr
													key={`${te.trackName}-${te.artist}`}
													className="border-b border-[var(--color-border-subtle)] last:border-0"
												>
													<td className="py-2 pr-3 font-medium">
														<div className="flex items-center gap-2 max-w-[12rem]">
															{snap?.albumImageUrl && (
																// biome-ignore lint/performance/noImgElement: external Spotify CDN URL
																<img
																	src={snap.albumImageUrl}
																	alt=""
																	className="w-8 h-8 shrink-0 rounded-[var(--radius-sm)] object-cover"
																	loading="lazy"
																/>
															)}
															<span className="truncate">{te.trackName}</span>
														</div>
													</td>
													<td className="py-2 pr-3 max-w-[8rem] truncate text-[var(--color-text-secondary)]">
														{te.artist}
													</td>
													<td className="py-2 pr-3 text-[var(--color-text-muted)] tabular-nums">
														{formatTrackDuration(snap?.durationMs)}
													</td>
													<td className="py-2">
														<div className="flex flex-wrap gap-1">
															{te.objects.map((obj) => (
																<span
																	key={obj.object}
																	className={`rounded-[var(--radius-pill)] px-1.5 py-0.5 text-xs ${
																		obj.tier === "high"
																			? "bg-green-100 text-green-800"
																			: obj.tier === "medium"
																				? "bg-yellow-100 text-yellow-800"
																				: "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
																	}`}
																	title={obj.reasoning}
																>
																	{obj.object}
																</span>
															))}
														</div>
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						</section>
					);
				})()}

			{/* Object Scores */}
			{analysis &&
				analysis.track_extractions.length > 0 &&
				(() => {
					const scores = computeObjectScores(analysis.track_extractions);
					if (scores.length === 0) return null;
					return (
						<section className="flex flex-col gap-[var(--space-md)]">
							<h2 className="text-lg font-semibold">Object Scores</h2>
							<div className="flex flex-wrap gap-2">
								{scores.slice(0, 12).map((s) => (
									<div
										key={s.object}
										className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-sm"
									>
										<span className="font-medium">{s.object}</span>
										<span className="text-xs text-[var(--color-text-muted)]">
											{s.score}pts
										</span>
										<span className="text-xs text-[var(--color-text-faint)]">
											&times;{s.trackCount}
										</span>
									</div>
								))}
							</div>
						</section>
					);
				})()}

			{/* Object Inventory */}
			{claimedObjects.length > 0 && (
				<section className="flex flex-col gap-[var(--space-md)]">
					<h2 className="text-lg font-semibold">Claimed Objects</h2>
					<div className="flex flex-wrap gap-2">
						{claimedObjects.map((obj) => (
							<div
								key={obj.id}
								className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
									obj.superseded_at
										? "border-[var(--color-border-subtle)] bg-[var(--color-surface)] text-[var(--color-text-muted)] line-through"
										: "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
								}`}
							>
								<span className="font-medium">{obj.object_name}</span>
								{obj.aesthetic_context && (
									<span className="text-xs text-[var(--color-text-secondary)] ml-2">
										{obj.aesthetic_context}
									</span>
								)}
							</div>
						))}
					</div>
				</section>
			)}
		</>
	);
}

function GenerationCard({ generation }: { generation: Generation }) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				aria-expanded={expanded}
				className="flex w-full items-center gap-[var(--space-md)] p-[var(--space-md)] text-left transition-colors hover:bg-[var(--color-surface-hover)]"
			>
				{/* Thumbnail */}
				<div className="w-12 h-12 shrink-0 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--color-surface)]">
					{generation.r2_key ? (
						// biome-ignore lint/performance/noImgElement: auth proxy incompatible with next/image
						<img
							src={`/api/images?key=${encodeURIComponent(generation.r2_key)}`}
							alt=""
							className="w-full h-full object-cover"
							loading="lazy"
						/>
					) : (
						<div className="w-full h-full flex items-center justify-center text-[var(--color-text-faint)] text-xs">
							{generation.status === "failed" ? "!" : "..."}
						</div>
					)}
				</div>

				{/* Info */}
				<div className="flex flex-col gap-0.5 min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="font-medium text-sm truncate">
							{generation.symbolic_object}
						</span>
						<StatusBadge status={generation.status} />
					</div>
					<div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
						<span>{generation.style_name}</span>
						<span>{formatTimestamp(generation.created_at)}</span>
						{generation.cost_usd != null && (
							<span>{formatCost(generation.cost_usd)}</span>
						)}
					</div>
				</div>

				{/* Expand indicator */}
				<span
					className={`shrink-0 text-[var(--color-text-faint)] transition-transform ${expanded ? "rotate-180" : ""}`}
				>
					▾
				</span>
			</button>

			{expanded && (
				<div className="border-t border-[var(--color-border-subtle)] p-[var(--space-md)] flex flex-col gap-[var(--space-md)]">
					{/* Full image */}
					{generation.r2_key && (
						<div className="max-w-sm mx-auto">
							{/* biome-ignore lint/performance/noImgElement: auth proxy incompatible with next/image */}
							<img
								src={`/api/images?key=${encodeURIComponent(generation.r2_key)}`}
								alt={`Generated cover: ${generation.symbolic_object}`}
								className="w-full rounded-[var(--radius-md)]"
							/>
						</div>
					)}

					{/* Metadata grid */}
					<div className="grid grid-cols-2 gap-x-[var(--space-lg)] gap-y-[var(--space-sm)] text-sm">
						<div>
							<span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
								Object
							</span>
							<p className="font-medium">{generation.symbolic_object}</p>
						</div>
						<div>
							<span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
								Style
							</span>
							<p>{generation.style_name}</p>
						</div>
						<div>
							<span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
								Duration
							</span>
							<p>{formatDuration(generation.duration_ms)}</p>
						</div>
						<div>
							<span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
								Cost
							</span>
							<p>{formatCost(generation.cost_usd)}</p>
						</div>
						<div>
							<span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
								Trigger
							</span>
							<p>{generation.trigger_type}</p>
						</div>
						<div>
							<span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
								Created
							</span>
							<p>{formatTimestamp(generation.created_at)}</p>
						</div>
					</div>

					{/* Prompt */}
					<div>
						<span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
							Prompt
						</span>
						<p className="mt-1 text-sm text-[var(--color-text-secondary)] bg-[var(--color-surface)] rounded-[var(--radius-md)] p-[var(--space-sm)] font-mono text-xs leading-relaxed">
							{generation.prompt}
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
