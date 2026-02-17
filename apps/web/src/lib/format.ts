/** Parse a D1 datetime string as UTC (SQLite omits the Z suffix) */
function parseUTC(dateStr: string): Date {
	const s = dateStr.endsWith("Z") ? dateStr : `${dateStr.replace(" ", "T")}Z`;
	return new Date(s);
}

export function formatDuration(ms: number | null): string {
	if (ms == null) return "\u2014";
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const mins = Math.floor(ms / 60_000);
	const secs = Math.round((ms % 60_000) / 1000);
	return `${mins}m ${secs}s`;
}

export function formatTrackDuration(ms: number | undefined): string {
	if (ms == null) return "";
	const totalSeconds = Math.floor(ms / 1000);
	const mins = Math.floor(totalSeconds / 60);
	const secs = totalSeconds % 60;
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatCost(usd: number | null): string {
	if (usd == null) return "\u2014";
	return `$${usd.toFixed(4)}`;
}

const timestampFormatter = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

export function formatTimestamp(dateStr: string): string {
	return timestampFormatter.format(parseUTC(dateStr));
}

export function formatElapsed(startedAt: string): string {
	const ms = Math.max(0, Date.now() - parseUTC(startedAt).getTime());
	const mins = Math.floor(ms / 60_000);
	const secs = Math.floor((ms % 60_000) / 1_000);
	if (mins > 0) return `${mins}m ${secs}s`;
	return `${secs}s`;
}

export function formatRelative(dateStr: string): string {
	const date = parseUTC(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60_000);
	const diffHours = Math.floor(diffMs / 3_600_000);
	const diffDays = Math.floor(diffMs / 86_400_000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString();
}
