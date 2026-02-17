"use client";

import type { QueueNextCron } from "@disc/shared";
import { formatLocalTime } from "@/lib/timezone";

interface CronIdleBannerProps {
	nextCron: QueueNextCron;
}

export function CronIdleBanner({ nextCron }: CronIdleBannerProps) {
	const localTimeStr = formatLocalTime(nextCron.utcTime);

	return (
		<div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-[var(--space-lg)] py-[var(--space-md)]">
			<div className="flex items-center gap-[var(--space-sm)]">
				<svg
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="none"
					className="shrink-0 text-[var(--color-text-muted)]"
					aria-hidden="true"
				>
					<circle
						cx="8"
						cy="8"
						r="6.5"
						stroke="currentColor"
						strokeWidth="1.2"
					/>
					<path
						d="M8 4.5V8.5L10.5 10"
						stroke="currentColor"
						strokeWidth="1.2"
						strokeLinecap="round"
					/>
				</svg>
				<span className="text-sm text-[var(--color-text-secondary)]">
					Next scheduled run
				</span>
			</div>

			<span className="text-sm font-semibold text-[var(--color-text)]">
				{localTimeStr}
			</span>

			<span className="rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
				{nextCron.style.name}
			</span>
		</div>
	);
}
