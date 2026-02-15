function SkeletonCard() {
	return (
		<div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
			<div className="aspect-square w-full animate-pulse bg-[var(--color-surface)]" />
			<div className="flex flex-col gap-2 p-[var(--space-md)]">
				<div className="h-4 w-3/4 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface)]" />
				<div className="h-3 w-1/3 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface)]" />
			</div>
		</div>
	);
}

export default function DashboardLoading() {
	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			<div className="flex items-center justify-between">
				<div className="h-8 w-48 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface)]" />
				<div className="h-5 w-24 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface)]" />
			</div>

			<div className="grid grid-cols-2 gap-[var(--space-md)] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{Array.from({ length: 15 }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
					<SkeletonCard key={i} />
				))}
			</div>
		</div>
	);
}
