"use client";

import type {
	DbPlaylist,
	GenerationVersion,
	PipelineProgress,
	QueueCompletedJob,
	WatcherSettings,
} from "@disc/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { useQueue } from "@/context/QueueContext";
import { formatCost, formatDuration } from "@/lib/format";
import { CronIdleBanner } from "./CronIdleBanner";
import { CronProgressPanel } from "./CronProgressPanel";
import { ImageReviewModal } from "./ImageReviewModal";
import { QueueCard, type ScheduleConfig } from "./QueueCard";
import { QueueColumn } from "./QueueColumn";
import { StylePicker } from "./StylePicker";
import { WatcherBanner } from "./WatcherBanner";

interface PlaylistWithImage extends DbPlaylist {
	latest_r2_key: string | null;
	latest_error_message: string | null;
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

function CompletionBanner({
	job,
	onDismiss,
}: {
	job: QueueCompletedJob;
	onDismiss: () => void;
}) {
	const allSucceeded = job.failedPlaylists === 0;
	const allFailed = job.completedPlaylists === 0 && job.failedPlaylists > 0;

	return (
		<div
			role="status"
			className={`glass flex flex-col gap-[var(--space-md)] rounded-[var(--radius-lg)] border p-[var(--space-lg)] ${
				allFailed
					? "border-[var(--color-destructive)]/30"
					: allSucceeded
						? "border-[var(--color-success)]/30"
						: "border-[var(--color-warning)]/30"
			}`}
		>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-[var(--space-sm)]">
					<span
						className={`inline-flex h-2.5 w-2.5 rounded-full ${
							allFailed
								? "bg-[var(--color-destructive)]"
								: allSucceeded
									? "bg-[var(--color-success)]"
									: "bg-[var(--color-warning)]"
						}`}
					/>
					<h2 className="text-lg font-semibold">
						{job.type === "cron"
							? "Cron Run"
							: job.type === "auto"
								? "Auto-Detect Run"
								: "Batch Run"}{" "}
						{allFailed ? "Failed" : "Complete"}
					</h2>
				</div>
				<button
					type="button"
					onClick={onDismiss}
					className="rounded-[var(--radius-pill)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] transition-colors"
				>
					Dismiss
				</button>
			</div>

			<div className="flex flex-wrap gap-[var(--space-sm)]">
				<span className="rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium">
					<span className="text-[var(--color-text-muted)]">Style: </span>
					<span className="text-[var(--color-text)]">{job.style.name}</span>
				</span>
				<span className="rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium">
					<span className="text-[var(--color-text-muted)]">Duration: </span>
					<span className="text-[var(--color-text)]">
						{formatDuration(job.durationMs)}
					</span>
				</span>
				{job.totalCostUsd != null && (
					<span className="rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium">
						<span className="text-[var(--color-text-muted)]">Cost: </span>
						<span className="font-mono text-[var(--color-text)]">
							{formatCost(job.totalCostUsd)}
						</span>
					</span>
				)}
			</div>

			<div className="flex items-center gap-[var(--space-md)] border-t border-[var(--color-border)] pt-[var(--space-md)]">
				{job.totalPlaylists === 0 ? (
					<span className="text-sm text-[var(--color-text-muted)]">
						No playlists were scheduled for generation
					</span>
				) : (
					<>
						{job.completedPlaylists > 0 && (
							<span className="text-sm text-[var(--color-success)]">
								{job.completedPlaylists} succeeded
							</span>
						)}
						{job.failedPlaylists > 0 && (
							<span className="text-sm text-[var(--color-destructive)]">
								{job.failedPlaylists} failed
							</span>
						)}
						<span className="text-sm text-[var(--color-text-muted)]">
							{job.totalPlaylists} total
						</span>
						{job.failedPlaylists > 0 && (
							<span className="ml-auto text-xs text-[var(--color-text-faint)]">
								See generation history for details
							</span>
						)}
					</>
				)}
			</div>
		</div>
	);
}

export function QueueBoard() {
	const { addToast } = useToast();
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
	const [fetchError, setFetchError] = useState<string | null>(null);
	const [dismissedJobId, setDismissedJobId] = useState<string | null>(null);
	const [showCollaborative, setShowCollaborative] = useState(() => {
		if (typeof window === "undefined") return false;
		return localStorage.getItem("queue:showCollaborative") === "true";
	});
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const { status: queueStatus, refresh: refreshQueue } = useQueue();
	const hasCronActive = Boolean(queueStatus?.activeJob);
	const lastCompleted = queueStatus?.lastCompletedJob ?? null;
	const showCompletionBanner =
		lastCompleted && lastCompleted.id !== dismissedJobId;
	const watcherSettings: WatcherSettings = queueStatus?.watcherSettings ?? {
		enabled: true,
		intervalMinutes: 5,
	};

	// Fetch playlists, styles, and session
	const fetchData = useCallback(async () => {
		try {
			const [playlistsRes, stylesRes, sessionRes] = await Promise.all([
				fetch("/api/playlists"),
				fetch("/api/styles"),
				fetch("/api/auth/session"),
			]);

			if (!playlistsRes.ok && !stylesRes.ok) {
				setFetchError("Failed to load queue data");
				return;
			}

			setFetchError(null);

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
					spotifyId?: string;
					user?: { spotifyId?: string };
				};
				const sid = session.spotifyId ?? session.user?.spotifyId;
				if (sid) {
					setSpotifyId(sid);
				}
			}
		} catch {
			setFetchError("Failed to load queue data");
		} finally {
			setLoading(false);
		}
	}, []);

	// Eligibility check — locked if collaborative or not owned by user
	const isEligible = useCallback(
		(p: PlaylistWithImage) =>
			!p.is_collaborative &&
			p.contributor_count <= 1 &&
			(!p.owner_spotify_id || p.owner_spotify_id === spotifyId),
		[spotifyId],
	);

	const toggleShowCollaborative = useCallback(() => {
		setShowCollaborative((prev) => {
			const next = !prev;
			localStorage.setItem("queue:showCollaborative", String(next));
			return next;
		});
	}, []);

	const isCollaborative = useCallback(
		(p: PlaylistWithImage): boolean =>
			Boolean(p.is_collaborative || p.contributor_count > 1),
		[],
	);

	// Categorize playlists into 4 columns
	const { todo, scheduled, inProgress, done } = useMemo(() => {
		const todoArr: PlaylistWithImage[] = [];
		const scheduledArr: PlaylistWithImage[] = [];
		const inProgressArr: PlaylistWithImage[] = [];
		const doneArr: PlaylistWithImage[] = [];

		for (const p of playlists) {
			if (!showCollaborative && isCollaborative(p)) continue;

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
	}, [playlists, scheduledItems, showCollaborative, isCollaborative]);

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
			// Intentionally silent — retries on next poll cycle or modal reopen
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
				let message = `Batch trigger failed (${res.status})`;
				try {
					const data = (await res.json()) as { error?: string };
					if (data.error) message = data.error;
				} catch {
					// Server returned non-JSON error body — use status-based message
				}
				throw new Error(message);
			}
			await fetchData();
			addToast(
				`Generation started for ${configs.length} playlist${configs.length === 1 ? "" : "s"}`,
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Run failed";
			setError(msg);
			addToast("Failed to start generation", "error");
			setScheduledItems(prevScheduled);
			setPlaylists((prev) =>
				prev.map((p) =>
					prevScheduled.has(p.id) ? { ...p, status: "idle" as const } : p,
				),
			);
		}
	}, [scheduledItems, styleOverride, fetchData, addToast]);

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

	// Watcher settings handlers
	const [savingWatcher, setSavingWatcher] = useState(false);

	const handleWatcherToggle = useCallback(
		async (enabled: boolean) => {
			setSavingWatcher(true);
			try {
				await fetch("/api/settings/watcher", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ enabled }),
				});
				await refreshQueue();
				addToast(enabled ? "Auto-detect enabled" : "Auto-detect paused");
			} catch {
				addToast("Failed to update auto-detect", "error");
			} finally {
				setSavingWatcher(false);
			}
		},
		[refreshQueue, addToast],
	);

	const handleWatcherIntervalChange = useCallback(
		async (minutes: number) => {
			setSavingWatcher(true);
			try {
				await fetch("/api/settings/watcher", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ intervalMinutes: minutes }),
				});
				await refreshQueue();
				addToast("Watcher settings saved");
			} catch {
				addToast("Failed to save settings", "error");
			} finally {
				setSavingWatcher(false);
			}
		},
		[refreshQueue, addToast],
	);

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
				addToast("Failed to retry", "error");
			}
		},
		[playlists, fetchData, addToast],
	);

	// Cancel all in-progress/queued items
	const handleCancelAll = useCallback(async () => {
		try {
			const res = await fetch("/api/queue/cancel", { method: "POST" });
			if (!res.ok) throw new Error("Cancel failed");
			await fetchData();
			addToast("Batch cancelled");
		} catch {
			addToast("Failed to cancel", "error");
		}
	}, [fetchData, addToast]);

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
				addToast("Failed to rerun", "error");
			}
		},
		[modalPlaylist, styleOverride, fetchData, addToast],
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
				addToast("Failed to revise", "error");
			}
		},
		[modalPlaylist, styleOverride, fetchData, addToast],
	);

	if (loading) {
		return (
			<div
				role="status"
				aria-label="Loading queue"
				className="flex overflow-x-auto snap-x snap-mandatory gap-[var(--space-md)] md:grid md:grid-cols-4 md:overflow-visible md:snap-none"
			>
				<span className="sr-only">Loading queue data...</span>
				{[1, 2, 3, 4].map((i) => (
					<div
						key={i}
						className="min-w-[calc(100vw-4rem)] shrink-0 snap-center md:min-w-0 md:shrink"
					>
						<div className="flex flex-col gap-[var(--space-sm)]">
							<div className="h-6 w-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface)]" />
							<div className="h-48 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-surface)]" />
						</div>
					</div>
				))}
			</div>
		);
	}

	if (fetchError) {
		return (
			<div className="flex flex-col items-center gap-[var(--space-md)] py-12 text-center">
				<p className="text-sm text-[var(--color-destructive)]">{fetchError}</p>
				<button
					type="button"
					onClick={() => {
						setLoading(true);
						setFetchError(null);
						fetchData();
					}}
					className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm transition-colors hover:bg-[var(--color-surface)]"
				>
					Retry
				</button>
			</div>
		);
	}

	const hasSelection = selectedIds.size > 0;
	const failedCount = done.filter((p) => p.status === "failed").length;

	return (
		<section
			aria-label="Generation queue"
			className="flex flex-col gap-[var(--space-md)]"
		>
			{/* Cron active: full replacement */}
			{hasCronActive && queueStatus?.activeJob ? (
				<CronProgressPanel
					job={queueStatus.activeJob}
					onViewPlaylist={setModalPlaylistId}
				/>
			) : (
				<>
					{/* Completion summary banner */}
					{showCompletionBanner && (
						<CompletionBanner
							job={lastCompleted}
							onDismiss={() => setDismissedJobId(lastCompleted.id)}
						/>
					)}

					{/* Cron idle banner */}
					{queueStatus?.nextCron && (
						<CronIdleBanner nextCron={queueStatus.nextCron} />
					)}

					{/* Watcher countdown */}
					<WatcherBanner
						settings={watcherSettings}
						onToggle={handleWatcherToggle}
						onIntervalChange={handleWatcherIntervalChange}
						saving={savingWatcher}
					/>

					{/* Sticky action header — style picker + playlist count + collaborative filter */}
					<div className="sticky top-[calc(var(--nav-height)+var(--space-md)*2)] z-30 flex flex-wrap items-center gap-[var(--space-sm)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-[var(--space-md)] py-[var(--space-sm)]">
						<span className="text-sm font-medium text-[var(--color-text-secondary)]">
							{playlists.length} playlists
						</span>
						<button
							type="button"
							onClick={toggleShowCollaborative}
							className={`flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium transition-colors ${
								showCollaborative
									? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
									: "text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
							}`}
							title={
								showCollaborative
									? "Showing collaborative playlists"
									: "Collaborative playlists hidden"
							}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
								<circle cx="9" cy="7" r="4" />
								<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
								<path d="M16 3.13a4 4 0 0 1 0 7.75" />
							</svg>
							{showCollaborative ? "Collaborative" : "Solo"}
						</button>
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
						<div className="min-w-[calc(100vw-4rem)] shrink-0 snap-center md:min-w-0 md:shrink">
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
									<div
										className="flex items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-[var(--space-md)]"
										style={{ minHeight: "5rem" }}
									>
										<p className="text-sm text-[var(--color-text-muted)]">
											No playlists pending
										</p>
									</div>
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
											isCollaborative={isCollaborative(p)}
											locked={!isEligible(p)}
											selected={selectedIds.has(p.id)}
											onSelect={isEligible(p) ? toggleSelect : undefined}
										/>
									))
								)}
							</QueueColumn>
						</div>

						{/* Scheduled column */}
						<div className="min-w-[calc(100vw-4rem)] shrink-0 snap-center md:min-w-0 md:shrink">
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
									<div
										className="flex items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-[var(--space-md)]"
										style={{ minHeight: "5rem" }}
									>
										<p className="text-sm text-[var(--color-text-muted)]">
											Nothing scheduled
										</p>
									</div>
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
											onConfigChange={(config) =>
												handleConfigChange(p.id, config)
											}
											onUnschedule={() => handleUnschedule(p.id)}
										/>
									))
								)}
							</QueueColumn>
						</div>

						{/* In Progress column */}
						<div className="min-w-[calc(100vw-4rem)] shrink-0 snap-center md:min-w-0 md:shrink">
							<QueueColumn
								title="In Progress"
								count={inProgress.length}
								variant="progress"
								actions={
									inProgress.length > 0 ? (
										<button
											type="button"
											onClick={handleCancelAll}
											className="rounded-[var(--radius-pill)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-destructive-muted)] hover:text-[var(--color-destructive)] transition-colors"
										>
											Cancel All
										</button>
									) : undefined
								}
							>
								{inProgress.length === 0 ? (
									<div
										className="flex items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-[var(--space-md)]"
										style={{ minHeight: "5rem" }}
									>
										<p className="text-sm text-[var(--color-text-muted)]">
											Nothing processing
										</p>
									</div>
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
											errorMessage={p.latest_error_message}
											onViewDetails={setModalPlaylistId}
											onCancel={handleCancelAll}
										/>
									))
								)}
							</QueueColumn>
						</div>

						{/* Done column */}
						<div className="min-w-[calc(100vw-4rem)] shrink-0 snap-center md:min-w-0 md:shrink">
							<QueueColumn
								title="Done"
								count={done.length}
								variant="done"
								actions={
									<>
										<button
											type="button"
											onClick={() => {
												const doneSelectable = done.filter((p) =>
													isEligible(p),
												);
												setSelectedIds(
													new Set(doneSelectable.map((p) => p.id)),
												);
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
									<div
										className="flex items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-[var(--space-md)]"
										style={{ minHeight: "5rem" }}
									>
										<p className="text-sm text-[var(--color-text-muted)]">
											No completed generations
										</p>
									</div>
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
											errorMessage={p.latest_error_message}
											isCollaborative={isCollaborative(p)}
											locked={!isEligible(p)}
											selected={selectedIds.has(p.id)}
											onSelect={isEligible(p) ? toggleSelect : undefined}
											onViewImage={
												p.status === "generated"
													? setModalPlaylistId
													: undefined
											}
											onRetry={p.status === "failed" ? handleRetry : undefined}
										/>
									))
								)}
							</QueueColumn>
						</div>
					</div>
				</>
			)}

			{/* Image review modal — always available */}
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
