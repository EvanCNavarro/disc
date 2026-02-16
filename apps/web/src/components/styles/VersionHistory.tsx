"use client";

export interface VersionEntry {
	id: string;
	version: string;
	notes: string | null;
	createdAt: string;
	isCurrent: boolean;
}

interface VersionHistoryProps {
	versions: VersionEntry[];
	onLoadVersion: (versionId: string) => void;
}

function formatRelativeTime(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function VersionHistory({
	versions,
	onLoadVersion,
}: VersionHistoryProps) {
	return (
		<div className="flex flex-col">
			<h3 className="mb-[var(--space-sm)] text-sm font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
				Version History
			</h3>

			{versions.length === 0 ? (
				<p className="text-xs text-[var(--color-text-faint)]">
					No versions saved yet
				</p>
			) : (
				<div className="relative pl-4">
					{/* Vertical line */}
					<div className="absolute bottom-2 left-[5px] top-2 w-px bg-[var(--color-border)]" />

					{versions.map((v) => (
						<button
							key={v.id}
							onClick={() => onLoadVersion(v.id)}
							disabled={v.isCurrent}
							className="-ml-1 relative flex w-full items-start gap-3 rounded-[var(--radius-sm)] px-1 py-2 text-left transition-colors hover:bg-[var(--color-surface)] disabled:cursor-default disabled:hover:bg-transparent"
						>
							{/* Dot */}
							<div
								className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
									v.isCurrent
										? "border-[var(--color-accent)] bg-[var(--color-accent)]"
										: "border-[var(--color-border)] bg-[var(--color-bg)]"
								}`}
							/>

							{/* Content */}
							<div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
								<div className="min-w-0">
									<span
										className={`text-sm font-medium ${
											v.isCurrent
												? "text-[var(--color-text)]"
												: "text-[var(--color-text-secondary)]"
										}`}
									>
										{v.version}
									</span>
									{v.notes && (
										<span className="ml-2 text-xs text-[var(--color-text-muted)]">
											&mdash; {v.notes}
										</span>
									)}
								</div>
								<span className="shrink-0 text-xs text-[var(--color-text-faint)]">
									{formatRelativeTime(v.createdAt)}
								</span>
							</div>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
