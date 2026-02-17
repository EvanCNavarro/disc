"use client";

import type { QueueActiveJob, QueuePlaylistStatus } from "@disc/shared";
import Image from "next/image";
import { useEffect, useState } from "react";
import { formatCost } from "@/lib/format";
import { QueueColumn } from "./QueueColumn";

interface CronProgressPanelProps {
	job: QueueActiveJob;
	onViewPlaylist?: (playlistId: string) => void;
}

function elapsed(startedAt: string): string {
	const ms = Date.now() - new Date(startedAt).getTime();
	const mins = Math.floor(ms / 60_000);
	const secs = Math.floor((ms % 60_000) / 1_000);
	if (mins > 0) return `${mins}m ${secs}s`;
	return `${secs}s`;
}

function MetadataPill({
	label,
	value,
	mono,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium">
			<span className="text-[var(--color-text-muted)]">{label} </span>
			<span className={`text-[var(--color-text)] ${mono ? "font-mono" : ""}`}>
				{value}
			</span>
		</div>
	);
}

function MiniCard({
	playlist,
	onClick,
}: {
	playlist: QueuePlaylistStatus;
	onClick?: () => void;
}) {
	const thumbnailUrl = playlist.thumbnailR2Key
		? `/api/images?key=${encodeURIComponent(playlist.thumbnailR2Key)}`
		: null;

	return (
		<button
			type="button"
			onClick={onClick}
			className="glass flex w-full items-center gap-[var(--space-sm)] rounded-[var(--radius-md)] p-[var(--space-sm)] text-left transition-all duration-[var(--duration-fast)] cursor-pointer hover:ring-1 hover:ring-[var(--color-border)]"
		>
			{thumbnailUrl ? (
				<Image
					src={thumbnailUrl}
					alt=""
					width={48}
					height={48}
					className="h-12 w-12 shrink-0 rounded-[var(--radius-sm)] object-cover"
					unoptimized
				/>
			) : (
				<div className="h-12 w-12 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-surface)]" />
			)}

			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{playlist.name}</p>
				{playlist.status === "processing" && (
					<p className="text-xs text-[var(--color-info)]">
						{playlist.stepSummary ?? "Processing..."}
					</p>
				)}
				{playlist.status === "completed" && (
					<div className="flex items-center gap-[var(--space-xs)]">
						{playlist.durationMs != null && (
							<span className="text-xs text-[var(--color-text-muted)]">
								{Math.round(playlist.durationMs / 1000)}s
							</span>
						)}
						{playlist.costUsd != null && (
							<span className="font-mono text-xs text-[var(--color-text-muted)]">
								{formatCost(playlist.costUsd)}
							</span>
						)}
					</div>
				)}
				{playlist.status === "failed" && (
					<p className="text-xs text-[var(--color-destructive)]">Failed</p>
				)}
				{playlist.status === "pending" && (
					<p className="text-xs text-[var(--color-text-muted)]">Waiting...</p>
				)}
			</div>

			{playlist.status === "processing" && (
				<div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--color-info)] border-t-transparent" />
			)}
		</button>
	);
}

export function CronProgressPanel({
	job,
	onViewPlaylist,
}: CronProgressPanelProps) {
	const [elapsedStr, setElapsedStr] = useState(elapsed(job.startedAt));

	useEffect(() => {
		const interval = setInterval(() => {
			setElapsedStr(elapsed(job.startedAt));
		}, 1_000);
		return () => clearInterval(interval);
	}, [job.startedAt]);

	const total = job.playlists.length;
	const pending = job.playlists.filter((p) => p.status === "pending");
	const processing = job.playlists.filter((p) => p.status === "processing");
	const done = job.playlists.filter(
		(p) => p.status === "completed" || p.status === "failed",
	);

	return (
		<section
			aria-label="Cron run progress"
			className="flex flex-col gap-[var(--space-lg)]"
		>
			{/* Header banner */}
			<div className="glass flex flex-wrap items-center justify-between gap-[var(--space-sm)] rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				<div className="flex items-center gap-[var(--space-sm)]">
					<span className="relative flex h-2.5 w-2.5">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-info)] opacity-75" />
						<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-info)]" />
					</span>
					<h2 className="text-lg font-semibold">
						{job.type === "cron" ? "Cron Run" : "Batch Run"} in Progress
					</h2>
				</div>

				<div className="flex flex-wrap items-center gap-[var(--space-sm)]">
					<MetadataPill label="Style:" value={job.style.name} />
					<MetadataPill label="Elapsed:" value={elapsedStr} />
					<MetadataPill label="Cost:" value={formatCost(job.totalCost)} mono />
				</div>
			</div>

			{/* Three-column progress grid */}
			<div className="grid grid-cols-1 gap-[var(--space-md)] md:grid-cols-3">
				<QueueColumn title="Pending" count={pending.length} variant="todo">
					{pending.length === 0 ? (
						<p className="p-[var(--space-md)] text-center text-sm text-[var(--color-text-muted)]">
							All playlists dispatched
						</p>
					) : (
						pending.map((p) => (
							<MiniCard
								key={p.id}
								playlist={p}
								onClick={() => onViewPlaylist?.(p.id)}
							/>
						))
					)}
				</QueueColumn>

				<QueueColumn
					title="In Progress"
					count={processing.length}
					variant="progress"
				>
					{processing.length === 0 ? (
						<p className="p-[var(--space-md)] text-center text-sm text-[var(--color-text-muted)]">
							Waiting...
						</p>
					) : (
						processing.map((p) => (
							<MiniCard
								key={p.id}
								playlist={p}
								onClick={() => onViewPlaylist?.(p.id)}
							/>
						))
					)}
				</QueueColumn>

				<QueueColumn title="Done" count={done.length} variant="done">
					{done.length === 0 ? (
						<p className="p-[var(--space-md)] text-center text-sm text-[var(--color-text-muted)]">
							No completions yet
						</p>
					) : (
						done.map((p) => (
							<MiniCard
								key={p.id}
								playlist={p}
								onClick={() => onViewPlaylist?.(p.id)}
							/>
						))
					)}
				</QueueColumn>
			</div>

			{/* Cost summary footer */}
			<div className="flex items-center justify-between border-t border-[var(--color-border)] pt-[var(--space-md)]">
				<span className="text-sm text-[var(--color-text-secondary)]">
					{job.completedCount + job.failedCount} of {total} playlists complete
				</span>
				<span className="font-mono text-sm text-[var(--color-text)]">
					{formatCost(job.totalCost)} total cost
				</span>
			</div>
		</section>
	);
}
