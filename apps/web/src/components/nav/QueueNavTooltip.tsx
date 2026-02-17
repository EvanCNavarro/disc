"use client";

import type { QueueStatus } from "@disc/shared";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/format";
import { formatLocalTime } from "@/lib/timezone";

interface QueueNavTooltipProps {
	status: QueueStatus;
}

export function QueueNavTooltip({ status }: QueueNavTooltipProps) {
	const { activeJob, nextCron } = status;
	const startedAt = activeJob?.startedAt ?? null;
	const [elapsedStr, setElapsedStr] = useState(
		startedAt ? formatElapsed(startedAt) : "",
	);

	useEffect(() => {
		if (!startedAt) return;
		const interval = setInterval(() => {
			setElapsedStr(formatElapsed(startedAt));
		}, 1_000);
		return () => clearInterval(interval);
	}, [startedAt]);

	if (activeJob) {
		const current = activeJob.playlists.find((p) => p.status === "processing");
		const total = activeJob.playlists.length;
		const done = activeJob.completedCount + activeJob.failedCount;
		const pct = total > 0 ? (done / total) * 100 : 0;
		const thumbnailUrl = current?.thumbnailR2Key
			? `/api/images?key=${encodeURIComponent(current.thumbnailR2Key)}`
			: null;

		return (
			<div className="flex flex-col gap-[var(--space-sm)]">
				<div className="flex items-center gap-[var(--space-xs)]">
					<span className="relative flex h-2 w-2">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-info)] opacity-75" />
						<span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-info)]" />
					</span>
					<span className="text-xs font-medium text-[var(--color-info)]">
						Processing
					</span>
				</div>

				{current && (
					<div className="flex items-center gap-[var(--space-sm)]">
						{thumbnailUrl ? (
							<Image
								src={thumbnailUrl}
								alt=""
								width={40}
								height={40}
								className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
								unoptimized
							/>
						) : (
							<div className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-surface)]" />
						)}
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium">{current.name}</p>
							{current.stepSummary && (
								<span className="inline-block rounded-[var(--radius-pill)] bg-[var(--color-info-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-info)]">
									{current.stepSummary}
								</span>
							)}
						</div>
					</div>
				)}

				<div className="flex flex-col gap-1">
					<div className="flex items-center justify-between">
						<span className="text-xs text-[var(--color-text-muted)]">
							{done}/{total} playlists
						</span>
						<span className="text-xs text-[var(--color-text-muted)]">
							{elapsedStr}
						</span>
					</div>
					<div className="h-1 overflow-hidden rounded-full bg-[var(--color-surface)]">
						<div
							className="h-full rounded-full bg-[var(--color-info)] transition-all duration-500"
							style={{ width: `${pct}%` }}
						/>
					</div>
				</div>

				<Link
					href="/queue"
					className="text-xs text-[var(--color-accent)] hover:underline"
				>
					View queue &rarr;
				</Link>
			</div>
		);
	}

	if (nextCron) {
		return (
			<div className="flex flex-col gap-[var(--space-xs)]">
				<p className="text-sm font-medium">Next run</p>
				<p className="text-sm text-[var(--color-text)]">
					{formatLocalTime(nextCron.utcTime)}
				</p>
				<p className="text-xs text-[var(--color-text-muted)]">
					{nextCron.style.name}
				</p>
				<Link
					href="/queue"
					className="mt-[var(--space-xs)] text-xs text-[var(--color-accent)] hover:underline"
				>
					View queue &rarr;
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-[var(--space-xs)]">
			<p className="text-sm text-[var(--color-text-muted)]">
				No runs scheduled
			</p>
			<Link
				href="/queue"
				className="text-xs text-[var(--color-accent)] hover:underline"
			>
				View queue &rarr;
			</Link>
		</div>
	);
}
