"use client";

import type { DbStyle, StyleHeuristics } from "@disc/shared";
import { getDefaultHeuristics } from "@disc/shared";
import { useMemo, useState } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";

import { HeuristicControls } from "./HeuristicControls";

interface StyleEditorProps {
	style: DbStyle;
}

export function StyleEditor({ style }: StyleEditorProps) {
	const initialHeuristics = useMemo<StyleHeuristics>(() => {
		if (style.heuristics) {
			try {
				return JSON.parse(style.heuristics) as StyleHeuristics;
			} catch {
				// fall through to defaults
			}
		}
		return getDefaultHeuristics();
	}, [style.heuristics]);

	const [heuristics, setHeuristics] =
		useState<StyleHeuristics>(initialHeuristics);

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
						<HeuristicControls
							heuristics={heuristics}
							onChange={setHeuristics}
						/>
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
