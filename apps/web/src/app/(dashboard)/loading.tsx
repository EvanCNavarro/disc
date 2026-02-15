export default function DashboardLoading() {
	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			{/* Title placeholder */}
			<div className="h-8 w-40 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface)]" />

			{/* Two content section placeholders */}
			<div className="h-32 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-surface)]" />
			<div className="h-24 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-surface)]" />
		</div>
	);
}
