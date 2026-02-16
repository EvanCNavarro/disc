"use client";

import { useId } from "react";

interface QueueColumnProps {
	title: string;
	count: number;
	variant: "todo" | "scheduled" | "progress" | "done";
	footerPadding?: number;
	children: React.ReactNode;
}

const variantColors: Record<string, string> = {
	todo: "bg-[var(--color-surface)]",
	scheduled: "bg-[var(--color-warning-muted)]",
	progress: "bg-[var(--color-info-muted)]",
	done: "bg-[var(--color-accent-muted)]",
};

const badgeColors: Record<string, string> = {
	todo: "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]",
	scheduled: "bg-[var(--color-warning-muted)] text-[var(--color-warning)]",
	progress: "bg-[var(--color-info-muted)] text-[var(--color-info)]",
	done: "bg-[var(--color-accent-muted)] text-[var(--color-accent)]",
};

export function QueueColumn({
	title,
	count,
	variant,
	footerPadding = 128,
	children,
}: QueueColumnProps) {
	const headingId = useId();

	return (
		<section
			aria-labelledby={headingId}
			className="flex flex-col gap-[var(--space-sm)] min-w-0 min-h-0 h-full"
		>
			<div className="flex items-center gap-[var(--space-sm)] px-1 shrink-0">
				<h3
					id={headingId}
					className="text-base font-semibold text-[var(--color-text-secondary)]"
				>
					{title}
				</h3>
				<span
					className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-sm font-medium ${badgeColors[variant]}`}
				>
					{count}
				</span>
			</div>
			<div
				className={`flex flex-col gap-[var(--space-sm)] rounded-[var(--radius-lg)] p-[var(--space-sm)] flex-1 overflow-y-auto min-h-0 ${variantColors[variant]}`}
				style={{ paddingBottom: footerPadding + 16 }}
			>
				{children}
			</div>
		</section>
	);
}
