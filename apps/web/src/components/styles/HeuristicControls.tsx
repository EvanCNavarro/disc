"use client";

import type { StyleHeuristics } from "@disc/shared";
import { reconstructPrompt } from "@disc/shared";
import { useId, useMemo } from "react";

import { ChipSelect } from "./ChipSelect";
import { HeuristicSection } from "./HeuristicSection";
import { SliderInput } from "./SliderInput";

interface HeuristicControlsProps {
	heuristics: StyleHeuristics;
	onChange: (heuristics: StyleHeuristics) => void;
}

// ── Dropdown option sets ──

const RENDER_TYPE_OPTIONS = [
	"3D render",
	"photograph",
	"illustration",
	"macro photograph",
];

const MATERIAL_OPTIONS = [
	"volcanic basalt",
	"handmade clay",
	"glass",
	"paper",
	"metal",
	"wood",
];

const TEXTURE_OPTIONS = [
	"granular",
	"fingerprints",
	"faceted",
	"smooth",
	"rough",
	"ashy",
	"tool marks",
	"crystalline",
];

const LIGHTING_DIRECTION_OPTIONS = [
	"rim light from behind",
	"golden hour backlight",
	"overhead spotlight",
	"side light",
	"ambient diffused",
];

const LIGHT_COLOR_OPTIONS = [
	"ember-orange",
	"warm amber",
	"cool blue",
	"neutral white",
	"golden",
];

const BACKGROUND_OPTIONS = [
	"deep void",
	"autumn diorama",
	"urban scene",
	"abstract gradient",
	"natural landscape",
];

const FRAMING_OPTIONS = [
	"centered three-quarter",
	"centered straight-on",
	"environmental wide",
	"extreme close-up",
];

const COLOR_PALETTE_OPTIONS = [
	"obsidian + ember-orange",
	"autumn warm",
	"monochrome",
	"pastel muted",
	"deep jewel tones",
];

const MOOD_OPTIONS = [
	"cinematic",
	"whimsical",
	"contemplative",
	"moody",
	"cozy",
	"nostalgic",
	"dramatic",
];

const CONSTRAINT_OPTIONS = [
	"no text",
	"no words",
	"no letters",
	"no particles",
	"no floor",
];

// ── Shared dropdown styles ──

const selectClassName =
	"w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none";

// ── Component ──

export function HeuristicControls({
	heuristics,
	onChange,
}: HeuristicControlsProps) {
	const id = useId();

	const handleChange = <K extends keyof StyleHeuristics>(
		field: K,
		value: StyleHeuristics[K],
	) => {
		onChange({ ...heuristics, [field]: value });
	};

	const handleColorRatioChange = (index: 0 | 1 | 2, value: number) => {
		const newRatio = [...heuristics.colorRatio] as [number, number, number];
		newRatio[index] = value;
		onChange({ ...heuristics, colorRatio: newRatio });
	};

	const promptPreview = useMemo(
		() => reconstructPrompt(heuristics),
		[heuristics],
	);

	return (
		<div className="flex flex-col">
			{/* 1. Material & Surface */}
			<HeuristicSection title="Material & Surface" defaultOpen>
				{/* Render type */}
				<label className="flex flex-col gap-1">
					<span className="text-sm font-medium">Render Type</span>
					<select
						value={heuristics.renderType}
						onChange={(e) => handleChange("renderType", e.target.value)}
						className={selectClassName}
					>
						{RENDER_TYPE_OPTIONS.map((opt) => (
							<option key={opt} value={opt}>
								{opt}
							</option>
						))}
					</select>
				</label>

				{/* Material */}
				<div className="flex flex-col gap-1">
					<label className="flex flex-col gap-1">
						<span className="text-sm font-medium">Material</span>
						<select
							value={
								MATERIAL_OPTIONS.includes(heuristics.material)
									? heuristics.material
									: "__custom__"
							}
							onChange={(e) => {
								if (e.target.value !== "__custom__") {
									handleChange("material", e.target.value);
								}
							}}
							className={selectClassName}
						>
							{MATERIAL_OPTIONS.map((opt) => (
								<option key={opt} value={opt}>
									{opt}
								</option>
							))}
							{!MATERIAL_OPTIONS.includes(heuristics.material) && (
								<option value="__custom__">
									{heuristics.material} (custom)
								</option>
							)}
						</select>
					</label>
					<input
						type="text"
						value={heuristics.material}
						onChange={(e) => handleChange("material", e.target.value)}
						placeholder="Custom material..."
						aria-label="Custom material"
						className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent)] focus:outline-none"
					/>
				</div>

				{/* Textures */}
				<ChipSelect
					label="Textures"
					selected={heuristics.textures}
					options={TEXTURE_OPTIONS}
					onChange={(textures) => handleChange("textures", textures)}
					allowCustom
				/>
			</HeuristicSection>

			{/* 2. Lighting & Color */}
			<HeuristicSection title="Lighting & Color" defaultOpen>
				{/* Direction */}
				<label className="flex flex-col gap-1">
					<span className="text-sm font-medium">Direction</span>
					<select
						value={heuristics.lightingDirection}
						onChange={(e) => handleChange("lightingDirection", e.target.value)}
						className={selectClassName}
					>
						{LIGHTING_DIRECTION_OPTIONS.map((opt) => (
							<option key={opt} value={opt}>
								{opt}
							</option>
						))}
					</select>
				</label>

				{/* Quality */}
				<SliderInput
					label="Quality"
					value={heuristics.lightingQuality}
					onChange={(v) => handleChange("lightingQuality", v)}
					minLabel="Harsh"
					maxLabel="Soft"
				/>

				{/* Light color */}
				<label className="flex flex-col gap-1">
					<span className="text-sm font-medium">Light Color</span>
					<select
						value={heuristics.lightColor}
						onChange={(e) => handleChange("lightColor", e.target.value)}
						className={selectClassName}
					>
						{LIGHT_COLOR_OPTIONS.map((opt) => (
							<option key={opt} value={opt}>
								{opt}
							</option>
						))}
					</select>
				</label>
			</HeuristicSection>

			{/* 3. Scene & Composition */}
			<HeuristicSection title="Scene & Composition">
				{/* Background */}
				<label className="flex flex-col gap-1">
					<span className="text-sm font-medium">Background</span>
					<select
						value={heuristics.background}
						onChange={(e) => handleChange("background", e.target.value)}
						className={selectClassName}
					>
						{BACKGROUND_OPTIONS.map((opt) => (
							<option key={opt} value={opt}>
								{opt}
							</option>
						))}
					</select>
				</label>

				{/* Depth of field */}
				<SliderInput
					label="Depth of Field"
					value={heuristics.depthOfField}
					onChange={(v) => handleChange("depthOfField", v)}
					minLabel="Deep/Sharp"
					maxLabel="Extreme Shallow"
				/>

				{/* Framing */}
				<label className="flex flex-col gap-1">
					<span className="text-sm font-medium">Framing</span>
					<select
						value={heuristics.framing}
						onChange={(e) => handleChange("framing", e.target.value)}
						className={selectClassName}
					>
						{FRAMING_OPTIONS.map((opt) => (
							<option key={opt} value={opt}>
								{opt}
							</option>
						))}
					</select>
				</label>
			</HeuristicSection>

			{/* 4. Palette & Tone */}
			<HeuristicSection title="Palette & Tone">
				{/* Tonal range */}
				<SliderInput
					label="Tonal Range"
					value={heuristics.tonalRange}
					onChange={(v) => handleChange("tonalRange", v)}
					minLabel="Dark Obsidian"
					maxLabel="Bright"
				/>

				{/* Color palette */}
				<label className="flex flex-col gap-1">
					<span className="text-sm font-medium">Color Palette</span>
					<select
						value={heuristics.colorPalette}
						onChange={(e) => handleChange("colorPalette", e.target.value)}
						className={selectClassName}
					>
						{COLOR_PALETTE_OPTIONS.map((opt) => (
							<option key={opt} value={opt}>
								{opt}
							</option>
						))}
					</select>
				</label>

				{/* Color ratio */}
				<fieldset className="flex flex-col gap-1">
					<legend className="text-sm font-medium">Color Ratio</legend>
					<div className="flex items-center gap-2">
						<label className="flex flex-1 flex-col gap-0.5">
							<span className="text-xs text-[var(--color-text-faint)]">
								Primary %
							</span>
							<input
								type="number"
								min={0}
								max={100}
								value={heuristics.colorRatio[0]}
								onChange={(e) =>
									handleColorRatioChange(0, Number(e.target.value))
								}
								className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-center text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
							/>
						</label>
						<label className="flex flex-1 flex-col gap-0.5">
							<span className="text-xs text-[var(--color-text-faint)]">
								Secondary %
							</span>
							<input
								type="number"
								min={0}
								max={100}
								value={heuristics.colorRatio[1]}
								onChange={(e) =>
									handleColorRatioChange(1, Number(e.target.value))
								}
								className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-center text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
							/>
						</label>
						<label className="flex flex-1 flex-col gap-0.5">
							<span className="text-xs text-[var(--color-text-faint)]">
								Accent %
							</span>
							<input
								type="number"
								min={0}
								max={100}
								value={heuristics.colorRatio[2]}
								onChange={(e) =>
									handleColorRatioChange(2, Number(e.target.value))
								}
								className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-center text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
							/>
						</label>
					</div>
				</fieldset>
			</HeuristicSection>

			{/* 5. Mood & Constraints */}
			<HeuristicSection title="Mood & Constraints">
				<ChipSelect
					label="Mood"
					selected={heuristics.moods}
					options={MOOD_OPTIONS}
					onChange={(moods) => handleChange("moods", moods)}
					allowCustom
				/>

				<ChipSelect
					label="Constraints"
					selected={heuristics.constraints}
					options={CONSTRAINT_OPTIONS}
					onChange={(constraints) => handleChange("constraints", constraints)}
					allowCustom
				/>
			</HeuristicSection>

			{/* 6. Advanced */}
			<HeuristicSection title="Advanced">
				<label className="flex flex-col gap-1" htmlFor={`${id}-prompt`}>
					<span className="text-sm font-medium">
						Reconstructed Prompt Template
					</span>
					<textarea
						id={`${id}-prompt`}
						readOnly
						value={promptPreview}
						rows={8}
						className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs leading-relaxed text-[var(--color-text-muted)] focus:outline-none"
					/>
				</label>
			</HeuristicSection>
		</div>
	);
}
