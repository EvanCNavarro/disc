"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Image02Icon } from "@hugeicons-pro/core-stroke-rounded";
import Image from "next/image";

export interface PreviewImage {
	url: string | null;
	subject: string;
	loading: boolean;
}

interface PreviewGridProps {
	images: PreviewImage[];
	onRegenerate: () => void;
	onNewSubjects: () => void;
	regenerating: boolean;
}

export function PreviewGrid({
	images,
	onRegenerate,
	onNewSubjects,
	regenerating,
}: PreviewGridProps) {
	return (
		<div>
			{/* 2x2 image grid */}
			<div className="grid grid-cols-2 gap-[var(--space-sm)]">
				{images.map((img) => (
					<div
						key={img.subject}
						className="relative aspect-square overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface)]"
					>
						{img.loading ? (
							<div className="h-full w-full animate-pulse bg-[var(--color-surface-hover)]" />
						) : img.url ? (
							<Image
								src={img.url}
								alt={img.subject}
								fill
								sizes="(max-width: 768px) 45vw, 25vw"
								className="object-cover"
							/>
						) : (
							<div className="flex h-full w-full items-center justify-center text-[var(--color-text-faint)]">
								<HugeiconsIcon icon={Image02Icon} size={32} strokeWidth={1} />
							</div>
						)}

						{/* Subject label */}
						<div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
							<p className="truncate text-xs text-white">{img.subject}</p>
						</div>
					</div>
				))}
			</div>

			{/* Action buttons */}
			<div className="mt-[var(--space-md)] flex gap-[var(--space-sm)]">
				<button
					onClick={onRegenerate}
					disabled={regenerating}
					className="flex-1 rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
				>
					{regenerating ? "Generating..." : "Regenerate"}
				</button>
				<button
					onClick={onNewSubjects}
					disabled={regenerating}
					className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)] disabled:opacity-50"
				>
					New Subjects
				</button>
			</div>

			{/* Cost note */}
			<p className="mt-[var(--space-xs)] text-center text-xs text-[var(--color-text-faint)]">
				~$0.12 per generation (4 images {"\u00D7"} $0.03)
			</p>
		</div>
	);
}
