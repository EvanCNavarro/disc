export default function PlaylistDetailLoading() {
	return (
		<div className="flex flex-col gap-[var(--space-xl)] animate-pulse">
			{/* Back link */}
			<div className="h-4 w-32 rounded bg-[var(--color-surface)]" />

			{/* Header */}
			<div className="flex flex-col gap-[var(--space-lg)] sm:flex-row sm:items-start sm:gap-[var(--space-xl)]">
				<div className="w-32 h-32 sm:w-40 sm:h-40 shrink-0 rounded-[var(--radius-lg)] bg-[var(--color-surface)]" />
				<div className="flex flex-col gap-[var(--space-sm)] flex-1">
					<div className="h-8 w-64 rounded bg-[var(--color-surface)]" />
					<div className="h-4 w-48 rounded bg-[var(--color-surface)]" />
					<div className="h-4 w-32 rounded bg-[var(--color-surface)]" />
				</div>
			</div>

			{/* Action bar */}
			<div className="h-10 w-40 rounded-[var(--radius-md)] bg-[var(--color-surface)]" />

			{/* Analysis section */}
			<div className="flex flex-col gap-[var(--space-md)]">
				<div className="h-6 w-36 rounded bg-[var(--color-surface)]" />
				<div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-[var(--space-lg)]">
					<div className="flex flex-col gap-[var(--space-md)]">
						<div className="h-8 w-40 rounded bg-[var(--color-surface)]" />
						<div className="h-4 w-64 rounded bg-[var(--color-surface)]" />
					</div>
				</div>
			</div>

			{/* Generation timeline */}
			<div className="flex flex-col gap-[var(--space-md)]">
				<div className="h-6 w-44 rounded bg-[var(--color-surface)]" />
				{[1, 2, 3].map((i) => (
					<div
						key={i}
						className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-[var(--space-md)]"
					>
						<div className="flex items-center gap-[var(--space-md)]">
							<div className="w-12 h-12 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-surface)]" />
							<div className="flex flex-col gap-1 flex-1">
								<div className="h-4 w-32 rounded bg-[var(--color-surface)]" />
								<div className="h-3 w-48 rounded bg-[var(--color-surface)]" />
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
