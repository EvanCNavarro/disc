import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons-pro/core-stroke-rounded";
import Link from "next/link";
import { StyleCard } from "./StyleCard";

interface StyleGridProps {
	styles: Array<{
		id: string;
		name: string;
		description: string | null;
		status: string;
		is_default: number;
		thumbnail_url: string | null;
	}>;
}

function CreateStyleCard() {
	return (
		<Link
			href="/styles/new"
			className="flex aspect-auto flex-col items-center justify-center gap-[var(--space-sm)] overflow-hidden rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-[var(--space-lg)] text-[var(--color-text-muted)] shadow-[var(--shadow-sm)] transition-all duration-[var(--duration-normal)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
		>
			<HugeiconsIcon icon={Add01Icon} size={32} strokeWidth={1.5} />
			<span className="text-sm font-medium">Create New Style</span>
		</Link>
	);
}

export function StyleGrid({ styles }: StyleGridProps) {
	return (
		<div className="grid grid-cols-1 gap-[var(--space-lg)] sm:grid-cols-2 lg:grid-cols-3">
			<CreateStyleCard />
			{styles.map((style) => (
				<StyleCard key={style.id} style={style} />
			))}
		</div>
	);
}
