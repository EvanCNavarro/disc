"use client";

import type {
	DbPlaylist,
	GenerationVersion,
	PipelineProgress,
} from "@disc/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageReviewModal } from "./ImageReviewModal";
import { QueueCard } from "./QueueCard";
import { QueueColumn } from "./QueueColumn";
import { QueueFooter } from "./QueueFooter";

interface PlaylistWithImage extends DbPlaylist {
	latest_r2_key: string | null;
}

interface Style {
	id: string;
	name: string;
	description: string | null;
}

const POLL_FAST_MS = 4000;
const POLL_SLOW_MS = 15000;

function parseProgress(data: string | null): PipelineProgress | null {
	if (!data) return null;
	try {
		const raw = JSON.parse(data) as Record<string, unknown>;
		// New format
		if (raw.currentStep) {
			return raw as unknown as PipelineProgress;
		}
		// Old format ({ step, started_at, generation_id })
		if (raw.step) {
			return {
				currentStep: raw.step as PipelineProgress["currentStep"],
				startedAt: (raw.started_at as string) ?? "",
				generationId: (raw.generation_id as string) ?? "",
				steps: {},
			};
		}
		return null;
	} catch {
		return null;
	}
}

export function QueueBoard() {
	const [playlists, setPlaylists] = useState<PlaylistWithImage[]>([]);
	const [styles, setStyles] = useState<Style[]>([]);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [styleOverride, setStyleOverride] = useState("");
	const [loading, setLoading] = useState(true);
	const [triggering, setTriggering] = useState(false);
	const [modalPlaylistId, setModalPlaylistId] = useState<string | null>(null);
	const [generations, setGenerations] = useState<GenerationVersion[]>([]);
	const [generationsLoading, setGenerationsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Footer height measurement for dynamic column clearance
	const footerRef = useRef<HTMLElement>(null);
	const [footerHeight, setFooterHeight] = useState(128);

	useEffect(() => {
		const el = footerRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const height =
					entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
				setFooterHeight(height);
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// Fetch playlists and styles
	const fetchData = useCallback(async () => {
		try {
			const [playlistsRes, stylesRes] = await Promise.all([
				fetch("/api/playlists"),
				fetch("/api/styles"),
			]);

			if (playlistsRes.ok) {
				const data = (await playlistsRes.json()) as {
					playlists: PlaylistWithImage[];
				};
				setPlaylists(data.playlists);
			}

			if (stylesRes.ok) {
				const data = (await stylesRes.json()) as { styles: Style[] };
				setStyles(data.styles);
			}
		} catch {
			// Silently fail — will retry on next poll
		} finally {
			setLoading(false);
		}
	}, []);

	// Categorize playlists into 4 columns
	const todo = playlists.filter((p) => p.status === "idle");
	const scheduled = playlists.filter((p) => p.status === "queued");
	const inProgress = playlists.filter((p) => p.status === "processing");
	const done = playlists.filter(
		(p) => p.status === "generated" || p.status === "failed",
	);

	const hasProcessing = inProgress.length > 0 || scheduled.length > 0;
	const isModalOpen = modalPlaylistId !== null;
	const modalPlaylist = playlists.find((p) => p.id === modalPlaylistId);
	const modalPlaylistProcessing = modalPlaylist?.status === "processing";
	const modalProgress = modalPlaylist
		? parseProgress(modalPlaylist.progress_data)
		: null;

	// Polling logic — always poll; fast when processing, slow otherwise
	useEffect(() => {
		fetchData();
	}, [fetchData]);

	useEffect(() => {
		const interval = hasProcessing ? POLL_FAST_MS : POLL_SLOW_MS;
		pollRef.current = setInterval(fetchData, interval);

		return () => {
			if (pollRef.current) {
				clearInterval(pollRef.current);
				pollRef.current = null;
			}
		};
	}, [hasProcessing, fetchData]);

	// Fetch generation history when modal opens or when processing completes
	const fetchGenerations = useCallback(async (spotifyPlaylistId: string) => {
		try {
			const res = await fetch(
				`/api/playlists/${spotifyPlaylistId}/generations`,
			);
			if (res.ok) {
				const data = (await res.json()) as {
					generations: GenerationVersion[];
				};
				setGenerations(data.generations);
			}
		} catch {
			// Will retry on next poll cycle
		}
	}, []);

	// Track previous processing state to detect completion
	const prevProcessingRef = useRef(modalPlaylistProcessing);
	useEffect(() => {
		const wasProcessing = prevProcessingRef.current;
		prevProcessingRef.current = modalPlaylistProcessing;

		// If modal playlist just finished processing, refresh generations
		if (wasProcessing && !modalPlaylistProcessing && modalPlaylist) {
			fetchGenerations(modalPlaylist.spotify_playlist_id);
		}
	}, [modalPlaylistProcessing, modalPlaylist, fetchGenerations]);

	// Initial generations fetch when modal opens
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on ID, not object ref — adding modalPlaylist would cause infinite re-renders
	useEffect(() => {
		if (!modalPlaylist) {
			setGenerations([]);
			return;
		}
		setGenerationsLoading(true);
		fetchGenerations(modalPlaylist.spotify_playlist_id).finally(() => {
			setGenerationsLoading(false);
		});
	}, [modalPlaylistId]);

	// Selection handlers
	const toggleSelect = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	const selectAll = useCallback(() => {
		setSelectedIds(new Set(todo.map((p) => p.id)));
	}, [todo]);

	const clearSelection = useCallback(() => {
		setSelectedIds(new Set());
	}, []);

	// Batch trigger
	const handleBatchTrigger = useCallback(async () => {
		if (selectedIds.size === 0) return;

		setTriggering(true);
		setError(null);
		try {
			const response = await fetch("/api/playlists/generate-batch", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					playlistIds: Array.from(selectedIds),
					styleId: styleOverride || undefined,
				}),
			});

			if (response.ok) {
				const data = (await response.json()) as {
					failed: number;
					succeeded: number;
				};
				if (data.failed > 0) {
					setError(`${data.succeeded} triggered, ${data.failed} failed`);
				}
				setSelectedIds(new Set());
				await fetchData();
			} else {
				const data = (await response.json()) as { error?: string };
				setError(data.error ?? "Batch trigger failed");
			}
		} catch {
			setError("Network error — could not reach server");
		} finally {
			setTriggering(false);
		}
	}, [selectedIds, styleOverride, fetchData]);

	// Retry handler (from card)
	const handleRetry = useCallback(
		async (playlistId: string) => {
			const playlist = playlists.find((p) => p.id === playlistId);
			if (!playlist) return;

			try {
				await fetch(
					`/api/playlists/${playlist.spotify_playlist_id}/regenerate`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ mode: "rerun" }),
					},
				);
				await fetchData();
			} catch {
				// Handled by polling
			}
		},
		[playlists, fetchData],
	);

	// Requeue: move done/failed items back to todo
	const handleRequeue = useCallback(async () => {
		const doneIds = done.map((p) => p.id);
		setSelectedIds(new Set(doneIds));
	}, [done]);

	// Modal handlers — keep modal open, don't close on rerun/revise
	const handleRerun = useCallback(async () => {
		if (!modalPlaylist) return;
		try {
			await fetch(
				`/api/playlists/${modalPlaylist.spotify_playlist_id}/regenerate`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						mode: "rerun",
						styleId: styleOverride || undefined,
					}),
				},
			);
			// Refresh playlist data to pick up "processing" status
			await fetchData();
		} catch {
			// Error handling via polling
		}
	}, [modalPlaylist, styleOverride, fetchData]);

	const handleRevise = useCallback(
		async (notes: string) => {
			if (!modalPlaylist) return;
			try {
				await fetch(
					`/api/playlists/${modalPlaylist.spotify_playlist_id}/regenerate`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							mode: "revision",
							notes,
							styleId: styleOverride || undefined,
						}),
					},
				);
				// Refresh playlist data to pick up "processing" status
				await fetchData();
			} catch {
				// Error handling via polling
			}
		},
		[modalPlaylist, styleOverride, fetchData],
	);

	// Derive bucket data for footer
	const toSummary = (p: PlaylistWithImage) => ({
		id: p.id,
		name: p.name,
		spotify_cover_url: p.latest_r2_key
			? `/api/images?key=${encodeURIComponent(p.latest_r2_key)}`
			: p.spotify_cover_url,
	});

	const selectedPlaylists = todo
		.filter((p) => selectedIds.has(p.id))
		.map(toSummary);
	const runningPlaylists = [...scheduled, ...inProgress].map(toSummary);
	const donePlaylists = done.slice(0, 8).map(toSummary);

	if (loading) {
		return (
			<output
				aria-label="Loading queue"
				className="flex overflow-x-auto snap-x snap-mandatory gap-[var(--space-md)] md:grid md:grid-cols-4 md:overflow-visible md:snap-none flex-1 min-h-0"
			>
				<span className="sr-only">Loading queue data…</span>
				{[1, 2, 3, 4].map((i) => (
					<div
						key={i}
						className="min-w-[80vw] shrink-0 snap-center h-full md:min-w-0 md:shrink"
					>
						<div className="flex flex-col gap-[var(--space-sm)] h-full">
							<div className="h-6 w-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface)]" />
							<div className="flex-1 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-surface)]" />
						</div>
					</div>
				))}
			</output>
		);
	}

	return (
		<section
			aria-label="Generation queue"
			className="flex flex-col flex-1 min-h-0 gap-[var(--space-md)]"
		>
			{/* Error banner */}
			{error && (
				<div
					role="alert"
					className="shrink-0 flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-[var(--space-md)] py-[var(--space-sm)] text-sm text-[var(--color-destructive)]"
				>
					<span>{error}</span>
					<button
						type="button"
						onClick={() => setError(null)}
						className="ml-[var(--space-sm)] text-xs opacity-70 hover:opacity-100"
					>
						Dismiss
					</button>
				</div>
			)}

			{/* Progress summary — hidden when no playlists loaded */}
			{playlists.length > 0 && (
				<output
					aria-live="polite"
					className="block shrink-0 text-sm text-[var(--color-text-muted)]"
				>
					{done.filter((p) => p.status === "generated").length} of{" "}
					{playlists.length} generated
				</output>
			)}

			{/* Kanban grid — horizontal scroll on mobile, 4-col grid on desktop */}
			<div className="flex overflow-x-auto snap-x snap-mandatory gap-[var(--space-md)] md:grid md:grid-cols-4 md:overflow-visible md:snap-none flex-1 min-h-0">
				<div className="min-w-[80vw] shrink-0 snap-center h-full md:min-w-0 md:shrink">
					<QueueColumn
						title="To Do"
						count={todo.length}
						variant="todo"
						footerPadding={footerHeight}
					>
						{todo.length === 0 ? (
							<p className="p-[var(--space-md)] text-center text-sm text-[var(--color-text-muted)]">
								No playlists pending
							</p>
						) : (
							todo.map((p) => (
								<QueueCard
									key={p.id}
									id={p.id}
									name={p.name}
									status={p.status}
									coverUrl={p.spotify_cover_url}
									progressData={p.progress_data}
									lastGeneratedAt={p.last_generated_at}
									selected={selectedIds.has(p.id)}
									onSelect={toggleSelect}
								/>
							))
						)}
					</QueueColumn>
				</div>

				<div className="min-w-[80vw] shrink-0 snap-center h-full md:min-w-0 md:shrink">
					<QueueColumn
						title="Scheduled"
						count={scheduled.length}
						variant="scheduled"
						footerPadding={footerHeight}
					>
						{scheduled.length === 0 ? (
							<p className="p-[var(--space-md)] text-center text-sm text-[var(--color-text-muted)]">
								Nothing scheduled
							</p>
						) : (
							scheduled.map((p) => (
								<QueueCard
									key={p.id}
									id={p.id}
									name={p.name}
									status={p.status}
									coverUrl={p.spotify_cover_url}
									progressData={p.progress_data}
									lastGeneratedAt={p.last_generated_at}
								/>
							))
						)}
					</QueueColumn>
				</div>

				<div className="min-w-[80vw] shrink-0 snap-center h-full md:min-w-0 md:shrink">
					<QueueColumn
						title="In Progress"
						count={inProgress.length}
						variant="progress"
						footerPadding={footerHeight}
					>
						{inProgress.length === 0 ? (
							<p className="p-[var(--space-md)] text-center text-sm text-[var(--color-text-muted)]">
								Nothing processing
							</p>
						) : (
							inProgress.map((p) => (
								<QueueCard
									key={p.id}
									id={p.id}
									name={p.name}
									status={p.status}
									coverUrl={
										p.latest_r2_key
											? `/api/images?key=${encodeURIComponent(p.latest_r2_key)}`
											: p.spotify_cover_url
									}
									progressData={p.progress_data}
									lastGeneratedAt={p.last_generated_at}
									onViewDetails={setModalPlaylistId}
								/>
							))
						)}
					</QueueColumn>
				</div>

				<div className="min-w-[80vw] shrink-0 snap-center h-full md:min-w-0 md:shrink">
					<QueueColumn
						title="Done"
						count={done.length}
						variant="done"
						footerPadding={footerHeight}
					>
						{done.length === 0 ? (
							<p className="p-[var(--space-md)] text-center text-sm text-[var(--color-text-muted)]">
								No completed generations
							</p>
						) : (
							<>
								{done.length > 0 && (
									<div className="flex justify-end px-1">
										<button
											type="button"
											onClick={handleRequeue}
											className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
										>
											Requeue all
										</button>
									</div>
								)}
								{done.map((p) => (
									<QueueCard
										key={p.id}
										id={p.id}
										name={p.name}
										status={p.status}
										coverUrl={
											p.latest_r2_key
												? `/api/images?key=${encodeURIComponent(p.latest_r2_key)}`
												: p.spotify_cover_url
										}
										progressData={p.progress_data}
										lastGeneratedAt={p.last_generated_at}
										selected={selectedIds.has(p.id)}
										onSelect={toggleSelect}
										onViewImage={
											p.status === "generated" ? setModalPlaylistId : undefined
										}
										onRetry={p.status === "failed" ? handleRetry : undefined}
									/>
								))}
							</>
						)}
					</QueueColumn>
				</div>
			</div>

			{/* Sticky footer */}
			<QueueFooter
				ref={footerRef}
				selectedPlaylists={selectedPlaylists}
				runningPlaylists={runningPlaylists}
				donePlaylists={donePlaylists}
				onDeselect={toggleSelect}
				onSelectAll={selectAll}
				onClearSelection={clearSelection}
				todoCount={todo.length}
				styles={styles}
				styleOverride={styleOverride}
				onStyleChange={setStyleOverride}
				onGenerate={handleBatchTrigger}
				triggering={triggering}
				onViewPlaylist={setModalPlaylistId}
			/>

			{/* Image review modal */}
			{modalPlaylist && (
				<ImageReviewModal
					open={isModalOpen}
					onClose={() => setModalPlaylistId(null)}
					playlistName={modalPlaylist.name}
					generations={generations}
					generationsLoading={generationsLoading}
					processing={modalPlaylistProcessing ?? false}
					progress={modalProgress}
					onRerun={handleRerun}
					onRevise={handleRevise}
				/>
			)}
		</section>
	);
}
