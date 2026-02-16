"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons-pro/core-stroke-rounded";
import { useState } from "react";

interface HeuristicSectionProps {
	title: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
}

export function HeuristicSection({
	title,
	defaultOpen = false,
	children,
}: HeuristicSectionProps) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<div className="border-b border-[var(--color-border)] last:border-b-0">
			{/* Header */}
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className="flex w-full items-center justify-between py-3 text-left"
			>
				<span className="text-sm font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
					{title}
				</span>
				<HugeiconsIcon
					icon={ArrowDown01Icon}
					size={14}
					strokeWidth={1.5}
					className={`shrink-0 text-[var(--color-text-muted)] transition-transform duration-150 ${
						open ? "rotate-180" : ""
					}`}
				/>
			</button>

			{/* Content */}
			{open && (
				<div className="flex flex-col gap-[var(--space-md)] pb-4">
					{children}
				</div>
			)}
		</div>
	);
}
