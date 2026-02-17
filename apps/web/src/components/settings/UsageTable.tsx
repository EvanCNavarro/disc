"use client";

interface UsageEvent {
	id: string;
	actionType: string;
	model: string;
	tokensIn: number | null;
	tokensOut: number | null;
	durationMs: number | null;
	costUsd: number;
	triggerSource: string;
	status: string;
	errorMessage: string | null;
	playlistName: string | null;
	styleName: string | null;
	createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
	llm_extraction: "LLM Extract",
	llm_convergence: "LLM Converge",
	llm_light_extraction: "Light Extract",
	image_generation: "Image Gen",
	style_preview: "Style Preview",
	style_thumbnail: "Thumbnail",
};

const ACTION_COLORS: Record<string, string> = {
	llm_extraction: "var(--color-accent)",
	llm_convergence: "#0d9488",
	llm_light_extraction: "#3b82f6",
	image_generation: "var(--color-warning)",
	style_preview: "#8b5cf6",
	style_thumbnail: "#a78bfa",
};

function formatRelativeTime(dateStr: string): string {
	const now = Date.now();
	const then = new Date(dateStr).getTime();
	const diffMs = now - then;
	const diffMin = Math.floor(diffMs / 60000);
	const diffHr = Math.floor(diffMs / 3600000);
	const diffDay = Math.floor(diffMs / 86400000);

	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHr < 24) return `${diffHr}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

function formatDuration(ms: number | null): string {
	if (ms === null) return "\u2014";
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export function UsageTable({ events }: { events: UsageEvent[] }) {
	if (events.length === 0) {
		return (
			<div className="py-[var(--space-xl)] text-center text-[var(--color-text-muted)]">
				<p className="text-lg font-medium">No usage data yet</p>
				<p className="mt-1 text-sm">
					Cost tracking starts automatically when you generate cover art or
					create styles.
				</p>
			</div>
		);
	}

	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<caption className="sr-only">Usage event audit log</caption>
				<thead>
					<tr className="border-b border-[var(--color-border)] text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
						<th scope="col" className="pb-2 pr-4">
							Time
						</th>
						<th scope="col" className="pb-2 pr-4">
							Action
						</th>
						<th scope="col" className="pb-2 pr-4">
							Model
						</th>
						<th scope="col" className="pb-2 pr-4">
							Context
						</th>
						<th scope="col" className="pb-2 pr-4">
							Tokens
						</th>
						<th scope="col" className="pb-2 pr-4">
							Duration
						</th>
						<th scope="col" className="pb-2 pr-4 text-right">
							Cost
						</th>
						<th scope="col" className="pb-2 pr-4">
							Source
						</th>
						<th scope="col" className="pb-2">
							Status
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-[var(--color-border)]">
					{events.map((e) => (
						<tr key={e.id} className="hover:bg-[var(--color-surface)]">
							<td
								className="whitespace-nowrap py-2 pr-4"
								title={new Date(e.createdAt).toLocaleString()}
							>
								{formatRelativeTime(e.createdAt)}
							</td>
							<td className="py-2 pr-4">
								<span
									className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
									style={{
										backgroundColor:
											ACTION_COLORS[e.actionType] ?? "var(--color-text-muted)",
									}}
								>
									{ACTION_LABELS[e.actionType] ?? e.actionType}
								</span>
							</td>
							<td className="max-w-[140px] truncate py-2 pr-4" title={e.model}>
								{e.model}
							</td>
							<td className="max-w-[120px] truncate py-2 pr-4 text-[var(--color-text-muted)]">
								{e.playlistName ?? e.styleName ?? "\u2014"}
							</td>
							<td className="whitespace-nowrap py-2 pr-4 tabular-nums text-[var(--color-text-muted)]">
								{e.tokensIn !== null
									? `${e.tokensIn} / ${e.tokensOut}`
									: "\u2014"}
							</td>
							<td className="whitespace-nowrap py-2 pr-4 tabular-nums text-[var(--color-text-muted)]">
								{formatDuration(e.durationMs)}
							</td>
							<td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums font-medium">
								${e.costUsd.toFixed(4)}
							</td>
							<td className="py-2 pr-4 capitalize text-[var(--color-text-muted)]">
								{e.triggerSource.replace("_", " ")}
							</td>
							<td className="py-2">
								<span className="flex items-center gap-1">
									<span
										className={`h-2 w-2 rounded-full ${e.status === "success" ? "bg-[var(--color-accent)]" : "bg-red-500"}`}
									/>
									<span className="text-xs">
										{e.status === "success" ? "OK" : "Fail"}
									</span>
								</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
