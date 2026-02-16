"use client";

import { useId } from "react";

interface SliderInputProps {
	label: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	minLabel?: string;
	maxLabel?: string;
}

export function SliderInput({
	label,
	value,
	onChange,
	min = 0,
	max = 1,
	step = 0.05,
	minLabel,
	maxLabel,
}: SliderInputProps) {
	const id = useId();

	return (
		<div className="flex flex-col gap-1">
			{/* Label + value */}
			<div className="flex items-center justify-between">
				<label htmlFor={id} className="text-sm font-medium">
					{label}
				</label>
				<span className="text-xs text-[var(--color-text-muted)]">
					{value.toFixed(2)}
				</span>
			</div>

			{/* Slider */}
			<input
				id={id}
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-border)] accent-[var(--color-accent)] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-accent)]"
			/>

			{/* Endpoint labels */}
			{(minLabel || maxLabel) && (
				<div className="flex items-center justify-between">
					<span className="text-xs text-[var(--color-text-faint)]">
						{minLabel}
					</span>
					<span className="text-xs text-[var(--color-text-faint)]">
						{maxLabel}
					</span>
				</div>
			)}
		</div>
	);
}
