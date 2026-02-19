export const TICK_TYPE_LABELS: Record<string, string> = {
	watcher: "Watcher",
	cron: "Scheduled",
	heartbeat: "Heartbeat",
	manual: "Manual",
	auto: "Auto-detect",
};

export const TICK_TYPE_COLORS: Record<string, string> = {
	watcher: "var(--color-accent)",
	cron: "var(--color-info)",
	heartbeat: "var(--color-warning)",
	manual: "var(--color-text-secondary)",
	auto: "var(--color-text-muted)",
};
