"use client";

import type {
	DbPlaylist,
	GenerationVersion,
	PipelineProgress,
} from "@disc/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageReviewModal } from "./ImageReviewModal";
import { QueueCard, type ScheduleConfig } from "./QueueCard";
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
	const [spotifyId, setSpotifyId] = useState<string | null>(null);
	const [scheduledItems, setScheduledItems] = useState<
		Map<string, ScheduleConfig>
	>(new Map());
	const [modalPlaylistId, setModalPlaylistId] = useState<string | null>(null);
	const [generations, setGenerations] = useState<GenerationVersion[]>([]);
	const [generationsLoading, setGenerationsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Fetch playlists, styles, and session
	const fetchData = useCallback(async () => {
		try {
			const [playlistsRes, stylesRes, sessionRes] = await Promise.all([
				fetch("/api/playlists"),
				fetch("/api/styles"),
				fetch("/api/auth/session"),
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

			if (sessionRes.ok) {
				const session = (await sessionRes.json()) as {
					user?: { spotifyId?: string };
				};
				if (session.user?.spotifyId) {
					setSpotifyId(session.user.spotifyId);
				}
			}
		} catch {
			// Silently fail — will retry on next poll
		} finally {
			setLoading(false);
		}
	}, []);

	// Eligibility check — locked if collaborative or not owned by user
	const isEligible = useCallback(
		(p: PlaylistWithImage) =>
			!p.is_collaborative &&
			(!p.owner_spotify_id || p.owner_spotify_id === spotifyId),
		[spotifyId],
	);

	// Categorize playlists into 4 columns
	const { todo, scheduled, inProgress, done } = useMemo(() => {
		const todoArr: PlaylistWithImage[] = [];
		const scheduledArr: PlaylistWithImage[] = [];
		const inProgressArr: PlaylistWithImage[] = [];
		const doneArr: PlaylistWithImage[] = [];

		for (const p of playlists) {
			if (scheduledItems.has(p.id)) {
				scheduledArr.push(p);
			} else if (p.status === "queued" || p.status === "processing") {
				inProgressArr.push(p);
			} else if (p.status === "generated" || p.status === "failed") {
				doneArr.push(p);
			} else {
				todoArr.push(p);
			}
		}

		return {
			todo: todoArr,
			scheduled: scheduledArr,
			inProgress: inProgressArr,
			done: doneArr,
		};
	}, [playlists, scheduledItems]);

	const hasProcessing = inProgress.length > 0;
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

	const selectableItems = useMemo(
		() => [...todo, ...done].filter((p) => isEligible(p)),
		[todo, done, isEligible],
	);

	const selectAll = useCallback(() => {
		setSelectedIds(new Set(selectableItems.map((p) => p.id)));
	}, [selectableItems]);

	const clearSelection = useCallback(() => {
		setSelectedIds(new Set());
	}, []);

	// Schedule: move selected items into the Scheduled column
	const handleSchedule = useCallback(() => {
		setScheduledItems((prev) => {
			const next = new Map(prev);
			for (const id of selectedIds) {
				if (!next.has(id)) {
					next.set(id, { analysisMode: "with", customText: "" });
				}
			}
			return next;
		});
		setSelectedIds(new Set());
	}, [selectedIds]);

	// Run: send all scheduled items to the backend
	const handleRun = useCallback(async () => {
		if (scheduledItems.size === 0) return;

		const configs = Array.from(scheduledItems.entries()).map(
			([id, config]) => ({
				playlistId: id,
				lightExtractionText:
					config.analysisMode === "without" ? config.customText : undefined,
			}),
		);

		const prevScheduled = new Map(scheduledItems);
		setScheduledItems(new Map());
		setPlaylists((prev) =>
			prev.map((p) =>
				prevScheduled.has(p.id) ? { ...p, status: "queued" as const } : p,
			),
		);
		setError(null);

		window.scrollTo({ top: 0, behavior: "smooth" });

		try {
			const res = await fetch("/api/playlists/generate-batch", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					playlistConfigs: configs,
					styleId: styleOverride || undefined,
				}),
			});
			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				throw new Error(data.error ?? "Batch trigger failed");
			}
			await fetchData();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Run failed");
			setScheduledItems(prevScheduled);
			setPlaylists((prev) =>
				prev.map((p) =>
					prevScheduled.has(p.id) ? { ...p, status: "idle" as const } : p,
				),
			);
		}
	}, [scheduledItems, styleOverride, fetchData]);

	// Unschedule a single item
	const handleUnschedule = useCallback((playlistId: string) => {
		setScheduledItems((prev) => {
			const next = new Map(prev);
			next.delete(playlistId);
			return next;
		});
	}, []);

	// Update config for a scheduled item
	const handleConfigChange = useCallback(
		(playlistId: string, config: Partial<ScheduleConfig>) => {
			setScheduledItems((prev) => {
				const next = new Map(prev);
				const existing = next.get(playlistId);
				if (existing) {
					next.set(playlistId, { ...existing, ...config });
				}
				return next;
			});
		},
		[],
	);

	// Can only run when all scheduled items have valid config
	const canRun =
		scheduledItems.size > 0 &&
		Array.from(scheduledItems.values()).every(
			(config) =>
				config.analysisMode === "with" || config.customText.trim().length > 0,
		);

	// Retry all failed items — moves them to Scheduled
	const handleRetryFailed = useCallback(() => {
		const failedItems = done.filter((p) => p.status === "failed");
		setScheduledItems((prev) => {
			const next = new Map(prev);
			for (const p of failedItems) {
				if (!next.has(p.id)) {
					next.set(p.id, { analysisMode: "with", customText: "" });
				}
			}
			return next;
		});
	}, [done]);

	// Retry handler (individual card in Done column)
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
				<span className="sr-only">Loading queue data...</span>
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
	const failedCount = done.filter((p) => p.status === "failed").length;

	return (
		<section
			aria-label="Generation queue"
			className="flex flex-col gap-[var(--space-md)]"
		>
			{/* Sticky action header — style picker + playlist count */}
			<div className="sticky top-[calc(var(--nav-height)+var(--space-md)*2)] z-30 flex flex-wrap items-center gap-[var(--space-sm)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-[var(--space-md)] py-[var(--space-sm)]">
				<span className="text-sm font-medium text-[var(--color-text-secondary)]">
					{playlists.length} playlists
				</span>
				<div className="flex-1" />
				<StylePicker
					styles={styles}
					value={styleOverride}
					onChange={setStyleOverride}
				/>
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
				{/* To Do column */}
				<div className="min-w-[80vw] shrink-0 snap-center md:min-w-0 md:shrink">
					<QueueColumn
						title="To Do"
						count={todo.length}
						variant="todo"
						actions={
							<>
								<button
									type="button"
									onClick={hasSelection ? clearSelection : selectAll}
									className="rounded-[var(--radius-pill)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] transition-colors"
								>
									{hasSelection ? "Deselect" : "Select All"}
								</button>
								<button
									type="button"
									onClick={handleSchedule}
									disabled={selectedIds.size === 0}
									className="rounded-[var(--radius-pill)] px-2 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] transition-colors disabled:opacity-40"
								>
									Schedule
								</button>
							</>
						}
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
									locked={!isEligible(p)}
									selected={selectedIds.has(p.id)}
									onSelect={isEligible(p) ? toggleSelect : undefined}
								/>
							))
						)}
					</QueueColumn>
				</div>

				{/* Scheduled column */}
				<div className="min-w-[80vw] shrink-0 snap-center md:min-w-0 md:shrink">
					<QueueColumn
						title="Scheduled"
						count={scheduled.length}
						variant="scheduled"
						actions={
							<button
								type="button"
								onClick={handleRun}
								disabled={!canRun}
								className="rounded-[var(--radius-pill)] px-2 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] transition-colors disabled:opacity-40"
							>
								Run
								{scheduledItems.size > 0 ? ` (${scheduledItems.size})` : ""}
							</button>
						}
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
									scheduleConfig={scheduledItems.get(p.id)}
									onConfigChange={(config) => handleConfigChange(p.id, config)}
									onUnschedule={() => handleUnschedule(p.id)}
								/>
							))
						)}
					</QueueColumn>
				</div>

				{/* In Progress column */}
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

				{/* Done column */}
				<div className="min-w-[80vw] shrink-0 snap-center md:min-w-0 md:shrink">
					<QueueColumn
						title="Done"
						count={done.length}
						variant="done"
						actions={
							<>
								<button
									type="button"
									onClick={() => {
										const doneSelectable = done.filter((p) => isEligible(p));
										setSelectedIds(new Set(doneSelectable.map((p) => p.id)));
									}}
									className="rounded-[var(--radius-pill)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] transition-colors"
								>
									Select All
								</button>
								<button
									type="button"
									onClick={handleRetryFailed}
									disabled={failedCount === 0}
									className="rounded-[var(--radius-pill)] px-2 py-1 text-xs font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive-muted)] transition-colors disabled:opacity-40"
								>
									Retry Failed
								</button>
							</>
						}
					>
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
									locked={!isEligible(p)}
									selected={selectedIds.has(p.id)}
									onSelect={isEligible(p) ? toggleSelect : undefined}
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
