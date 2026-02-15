import type { ChangelogEntryType } from "@disc/shared";
import { ENTRY_TYPE_META } from "@disc/shared";

const colorMap: Record<string, string> = {
	accent:
		"bg-[var(--color-accent-glow)] text-[var(--color-accent)] border-[var(--color-accent)]",
	destructive:
		"bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] text-[var(--color-destructive)] border-[var(--color-destructive)]",
	warning:
		"bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)] border-[var(--color-warning)]",
	info: "bg-[color-mix(in_srgb,var(--color-info)_12%,transparent)] text-[var(--color-info)] border-[var(--color-info)]",
	muted:
		"bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]",
};

export function ChangelogEntryBadge({ type }: { type: ChangelogEntryType }) {
	const meta = ENTRY_TYPE_META[type];
	const classes = colorMap[meta.color] ?? colorMap.muted;

	return (
		<span
			className={`inline-flex shrink-0 items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium ${classes}`}
		>
			{meta.label}
		</span>
	);
}
