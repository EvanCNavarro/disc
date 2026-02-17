"use client";

import type {
	DbPlaylist,
	GenerationVersion,
	PipelineProgress,
} from "@disc/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageReviewModal } from "./ImageReviewModal";
import { QueueCard } from "./QueueCard";
import { QueueColumn } from "./QueueColumn";
import { StylePicker } from "./StylePicker";

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
		if (raw.currentStep) {
			return raw as unknown as PipelineProgress;
		}
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

	// Polling logic
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

	// Fetch generation history when modal opens or processing completes
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

	const prevProcessingRef = useRef(modalPlaylistProcessing);
	useEffect(() => {
		const wasProcessing = prevProcessingRef.current;
		prevProcessingRef.current = modalPlaylistProcessing;
		if (wasProcessing && !modalPlaylistProcessing && modalPlaylist) {
			fetchGenerations(modalPlaylist.spotify_playlist_id);
		}
	}, [modalPlaylistProcessing, modalPlaylist, fetchGenerations]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on ID, not object ref
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

	// Selection handlers — works for todo AND done items
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

	const selectableItems = useMemo(() => [...todo, ...done], [todo, done]);

	const selectAll = useCallback(() => {
		setSelectedIds(new Set(selectableItems.map((p) => p.id)));
	}, [selectableItems]);

	const clearSelection = useCallback(() => {
		setSelectedIds(new Set());
	}, []);

	// Batch trigger — optimistic UI: move items to Scheduled immediately
	const handleBatchTrigger = useCallback(async () => {
		if (selectedIds.size === 0) return;

		const idsToTrigger = Array.from(selectedIds);

		// Optimistic: immediately move selected playlists to "queued" status
		setPlaylists((prev) =>
			prev.map((p) =>
				idsToTrigger.includes(p.id) ? { ...p, status: "queued" } : p,
			),
		);
		setSelectedIds(new Set());
		setTriggering(true);
		setError(null);

		// Scroll to top so user sees scheduled column
		window.scrollTo({ top: 0, behavior: "smooth" });

		try {
			const response = await fetch("/api/playlists/generate-batch", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					playlistIds: idsToTrigger,
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
				await fetchData();
			} else {
				const data = (await response.json()) as { error?: string };
				setError(data.error ?? "Batch trigger failed");
				// Revert optimistic update on failure
				await fetchData();
			}
		} catch {
			setError("Network error — could not reach server");
			// Revert optimistic update on failure
			await fetchData();
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

	// Modal handlers
	const handleRerun = useCallback(
		async (customObject?: string) => {
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
							customObject: customObject || undefined,
						}),
					},
				);
				await fetchData();
			} catch {
				// Error handling via polling
			}
		},
		[modalPlaylist, styleOverride, fetchData],
	);

	const handleRevise = useCallback(
		async (notes: string, customObject?: string) => {
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
							customObject: customObject || undefined,
						}),
					},
				);
				await fetchData();
			} catch {
				// Error handling via polling
			}
		},
		[modalPlaylist, styleOverride, fetchData],
	);

	if (loading) {
		return (
			<output
				aria-label="Loading queue"
				className="flex overflow-x-auto snap-x snap-mandatory gap-[var(--space-md)] md:grid md:grid-cols-4 md:overflow-visible md:snap-none"
			>
				<span className="sr-only">Loading queue data…</span>
				{[1, 2, 3, 4].map((i) => (
					<div
						key={i}
						className="min-w-[80vw] shrink-0 snap-center md:min-w-0 md:shrink"
					>
						<div className="flex flex-col gap-[var(--space-sm)]">
							<div className="h-6 w-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface)]" />
							<div className="h-48 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-surface)]" />
						</div>
					</div>
				))}
			</output>
		);
	}

	const hasSelection = selectedIds.size > 0;

	return (
		<section
			aria-label="Generation queue"
			className="flex flex-col gap-[var(--space-md)]"
		>
			{/* Sticky action header — sticks below navbar when scrolling */}
			<div className="sticky top-[calc(var(--nav-height)+var(--space-md)*2)] z-30 flex flex-wrap items-center gap-[var(--space-sm)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-[var(--space-md)] py-[var(--space-sm)]">
				{/* Selection count */}
				<span className="text-sm font-medium text-[var(--color-text-secondary)]">
					{hasSelection
						? `${selectedIds.size} selected`
						: `${playlists.length} playlists`}
				</span>

				{/* Spacer */}
				<div className="flex-1" />

				{/* Style picker */}
				<StylePicker
					styles={styles}
					value={styleOverride}
					onChange={setStyleOverride}
				/>

				{/* Select / Deselect */}
				{hasSelection ? (
					<button
						type="button"
						onClick={clearSelection}
						className="rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] transition-colors"
					>
						Deselect
					</button>
				) : (
					<button
						type="button"
						onClick={selectAll}
						className="rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] transition-colors"
					>
						Select All
					</button>
				)}

				{/* Generate button */}
				<button
					type="button"
					onClick={handleBatchTrigger}
					disabled={!hasSelection || triggering}
					className="rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
				>
					{triggering
						? "Triggering..."
						: `Generate${hasSelection ? ` (${selectedIds.size})` : ""}`}
				</button>
			</div>

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

			{/* Kanban grid */}
			<div className="flex overflow-x-auto snap-x snap-mandatory gap-[var(--space-md)] md:grid md:grid-cols-4 md:overflow-visible md:snap-none">
				<div className="min-w-[80vw] shrink-0 snap-center md:min-w-0 md:shrink">
					<QueueColumn title="To Do" count={todo.length} variant="todo">
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

				<div className="min-w-[80vw] shrink-0 snap-center md:min-w-0 md:shrink">
					<QueueColumn
						title="Scheduled"
						count={scheduled.length}
						variant="scheduled"
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

				<div className="min-w-[80vw] shrink-0 snap-center md:min-w-0 md:shrink">
					<QueueColumn
						title="In Progress"
						count={inProgress.length}
						variant="progress"
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

				<div className="min-w-[80vw] shrink-0 snap-center md:min-w-0 md:shrink">
					<QueueColumn title="Done" count={done.length} variant="done">
						{done.length === 0 ? (
							<p className="p-[var(--space-md)] text-center text-sm text-[var(--color-text-muted)]">
								No completed generations
							</p>
						) : (
							done.map((p) => (
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
							))
						)}
					</QueueColumn>
				</div>
			</div>

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
