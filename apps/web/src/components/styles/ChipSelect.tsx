"use client";

import { useCallback, useRef, useState } from "react";

interface ChipSelectProps {
	label: string;
	selected: string[];
	options: string[];
	onChange: (selected: string[]) => void;
	allowCustom?: boolean;
}

export function ChipSelect({
	label,
	selected,
	options,
	onChange,
	allowCustom = false,
}: ChipSelectProps) {
	const [adding, setAdding] = useState(false);
	const [customValue, setCustomValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const toggle = useCallback(
		(option: string) => {
			if (selected.includes(option)) {
				onChange(selected.filter((s) => s !== option));
			} else {
				onChange([...selected, option]);
			}
		},
		[selected, onChange],
	);

	const handleAddCustom = useCallback(() => {
		const trimmed = customValue.trim().toLowerCase();
		if (trimmed && !selected.includes(trimmed)) {
			onChange([...selected, trimmed]);
		}
		setCustomValue("");
		setAdding(false);
	}, [customValue, selected, onChange]);

	const handleAddKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				handleAddCustom();
			} else if (e.key === "Escape") {
				setCustomValue("");
				setAdding(false);
			}
		},
		[handleAddCustom],
	);

	// Merge options with any custom selections not in the original list
	const allOptions = [
		...options,
		...selected.filter((s) => !options.includes(s)),
	];

	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-sm font-medium">{label}</span>

			<div className="flex flex-wrap gap-1.5">
				{allOptions.map((option) => {
					const isActive = selected.includes(option);
					return (
						<button
							key={option}
							type="button"
							onClick={() => toggle(option)}
							className={`rounded-[var(--radius-pill)] px-3 py-1 text-xs transition-colors duration-[var(--duration-fast)] ${
								isActive
									? "bg-[var(--color-accent)] text-white"
									: "border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
							}`}
						>
							{option}
						</button>
					);
				})}

				{/* "+ Add" chip */}
				{allowCustom && !adding && (
					<button
						type="button"
						onClick={() => {
							setAdding(true);
							requestAnimationFrame(() => inputRef.current?.focus());
						}}
						className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface)]"
					>
						+ Add
					</button>
				)}

				{/* Inline text input for custom value */}
				{allowCustom && adding && (
					<input
						ref={inputRef}
						type="text"
						value={customValue}
						onChange={(e) => setCustomValue(e.target.value)}
						onBlur={handleAddCustom}
						onKeyDown={handleAddKeyDown}
						placeholder="Type..."
						className="rounded-[var(--radius-pill)] border border-[var(--color-accent)] bg-transparent px-3 py-1 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
						style={{ width: "80px" }}
					/>
				)}
			</div>
		</div>
	);
}
