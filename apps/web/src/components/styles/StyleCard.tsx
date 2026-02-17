import { HugeiconsIcon } from "@hugeicons/react";
import { PaintBrush01Icon } from "@hugeicons-pro/core-stroke-rounded";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";

interface StyleCardProps {
	style: {
		id: string;
		name: string;
		description: string | null;
		status: string;
		is_default: number;
		thumbnail_url: string | null;
	};
}

export function StyleCard({ style }: StyleCardProps) {
	return (
		<Link
			href={`/styles/${style.id}`}
			className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)] transition-all duration-[var(--duration-normal)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
		>
			<div className="relative aspect-square w-full overflow-hidden bg-[var(--color-surface)]">
				{style.thumbnail_url ? (
					// biome-ignore lint/performance/noImgElement: R2-proxied via /api/images with query string — next/image can't handle localPatterns with query strings
					<img
						src={
							style.thumbnail_url.startsWith("styles/")
								? `/api/images?key=${encodeURIComponent(style.thumbnail_url)}`
								: style.thumbnail_url
						}
						alt={`${style.name} thumbnail`}
						className="absolute inset-0 h-full w-full object-cover"
						loading="lazy"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-[var(--color-text-muted)]">
						<HugeiconsIcon icon={PaintBrush01Icon} size={48} strokeWidth={1} />
					</div>
				)}
			</div>

			<div className="flex flex-col gap-1 p-[var(--space-md)]">
				<div className="flex items-center gap-2">
					<h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
						{style.name}
					</h3>
					<StatusBadge status={style.status ?? "active"} />
				</div>
				{style.description && (
					<p className="truncate text-xs text-[var(--color-text-muted)]">
						{style.description}
					</p>
				)}
				{style.is_default === 1 && (
					<p className="text-xs text-[var(--color-text-muted)]">Built-in</p>
				)}
			</div>
		</Link>
	);
}
