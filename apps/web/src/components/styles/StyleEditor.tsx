"use client";

import type { DbStyle } from "@disc/shared";
import { Breadcrumb } from "@/components/Breadcrumb";

interface StyleEditorProps {
	style: DbStyle;
}

export function StyleEditor({ style }: StyleEditorProps) {
	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			{/* Breadcrumb */}
			<Breadcrumb
				segments={[{ label: "Styles", href: "/styles" }, { label: style.name }]}
			/>

			{/* Split panels */}
			<div className="flex flex-col gap-[var(--space-lg)] lg:flex-row">
				{/* Left panel — Controls (40%) */}
				<div className="w-full lg:w-[40%]">
					<div className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
						<h2 className="mb-[var(--space-md)] text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
							Style Controls
						</h2>
						<p className="text-sm text-[var(--color-text-muted)]">
							Heuristic controls will go here (Task 9)
						</p>
					</div>
				</div>

				{/* Right panel — Preview (60%) */}
				<div className="w-full lg:w-[60%] lg:sticky lg:top-[calc(var(--nav-height)+var(--space-md)*2)] lg:self-start">
					<div className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
						<h2 className="mb-[var(--space-md)] text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
							Preview
						</h2>
						<p className="text-sm text-[var(--color-text-muted)]">
							Preview grid will go here (Task 10)
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
