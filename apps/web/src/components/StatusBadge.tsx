const styles: Record<string, string> = {
	completed: "bg-[var(--color-accent-muted)] text-[var(--color-accent)]",
	failed: "bg-[var(--color-destructive-muted)] text-[var(--color-destructive)]",
	processing: "bg-[var(--color-info-muted)] text-[var(--color-info)]",
	pending: "bg-[var(--color-surface)] text-[var(--color-text-muted)]",
};

export function StatusBadge({ status }: { status: string }) {
	return (
		<span
			className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}
		>
			{status}
		</span>
	);
}
