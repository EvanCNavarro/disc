/**
 * Prompt Reconstruction Engine
 *
 * Converts a flat StyleHeuristics object into a natural-language prompt
 * template. Used by the Style Editor UI: as the user adjusts sliders and
 * dropdowns, heuristics change and reconstructPrompt() deterministically
 * produces an updated prompt string in real-time.
 *
 * No AI call — pure string assembly from heuristic values.
 *
 * The output always contains exactly one {subject} placeholder and ends
 * with "Square 1:1."
 */

// ── Heuristic Schema ──

export interface StyleHeuristics {
	renderType: string;
	material: string;
	textures: string[];
	lightingDirection: string;
	/** 0-1: harsh (low) to soft (high) */
	lightingQuality: number;
	lightColor: string;
	background: string;
	/** 0-1: deep/sharp (low) to extreme shallow bokeh (high) */
	depthOfField: number;
	framing: string;
	/** 0-1: dark obsidian (low) to bright (high) */
	tonalRange: number;
	colorPalette: string;
	/** [primary%, secondary%, accent%] */
	colorRatio: [number, number, number];
	moods: string[];
	constraints: string[];
}

// ── Slider Thresholds ──

interface ThresholdEntry {
	at: number;
	text: string;
}

function resolveSlider(value: number, thresholds: ThresholdEntry[]): string {
	for (let i = thresholds.length - 1; i >= 0; i--) {
		if (value >= thresholds[i].at) {
			return thresholds[i].text;
		}
	}
	return thresholds[0].text;
}

const LIGHTING_QUALITY_THRESHOLDS: ThresholdEntry[] = [
	{ at: 0.0, text: "harsh and directional" },
	{ at: 0.3, text: "crisp with defined edges" },
	{ at: 0.5, text: "balanced and even" },
	{ at: 0.7, text: "soft and diffused" },
	{ at: 0.9, text: "extremely soft and wraparound" },
];

const DEPTH_OF_FIELD_THRESHOLDS: ThresholdEntry[] = [
	{ at: 0.0, text: "deep sharp focus throughout" },
	{ at: 0.3, text: "mostly sharp with gentle falloff" },
	{ at: 0.5, text: "moderate depth of field" },
	{ at: 0.7, text: "shallow depth of field with soft background" },
	{ at: 0.9, text: "extreme shallow depth of field with soft creamy bokeh" },
];

const TONAL_RANGE_THRESHOLDS: ThresholdEntry[] = [
	{
		at: 0.0,
		text: "uniformly dark obsidian tonal range across the entire image",
	},
	{ at: 0.3, text: "predominantly dark tones with subtle midtone presence" },
	{ at: 0.5, text: "balanced tonal range from shadows through midtones" },
	{ at: 0.7, text: "bright and open tonal range with lifted shadows" },
	{ at: 0.9, text: "high-key bright tonal range with luminous highlights" },
];

// ── Prompt Reconstruction ──

/**
 * Builds a natural-language prompt template from a StyleHeuristics object.
 *
 * Composition order (strongest attention weight first):
 * 1. Opening: render type + subject + material
 * 2. Texture details
 * 3. Lighting: direction + quality + color
 * 4. Scene: background + depth of field + framing
 * 5. Tonal range + color palette + color ratio
 * 6. Mood adjectives
 * 7. Constraints
 * 8. "Square 1:1." (always last)
 */
export function reconstructPrompt(heuristics: StyleHeuristics): string {
	const parts: string[] = [];

	// 1. Opening: render type + subject + material
	const textureList = heuristics.textures.join(", ");
	parts.push(
		`${capitalize(heuristics.renderType)} of {subject} crafted from ${heuristics.material} with ${textureList} surface detail.`,
	);

	// 2. Lighting: direction + quality + color
	const lightQualityText = resolveSlider(
		heuristics.lightingQuality,
		LIGHTING_QUALITY_THRESHOLDS,
	);
	parts.push(
		`${capitalize(heuristics.lightingDirection)}, ${lightQualityText}, casting ${heuristics.lightColor} light.`,
	);

	// 3. Scene: background + depth of field + framing
	const dofText = resolveSlider(
		heuristics.depthOfField,
		DEPTH_OF_FIELD_THRESHOLDS,
	);
	parts.push(
		`Set against ${heuristics.background}. ${capitalize(dofText)}. ${capitalize(heuristics.framing)} composition.`,
	);

	// 4. Tonal range + color palette + color ratio
	const tonalText = resolveSlider(
		heuristics.tonalRange,
		TONAL_RANGE_THRESHOLDS,
	);
	const [primary, secondary, accent] = heuristics.colorRatio;
	parts.push(
		`${capitalize(tonalText)}. ${capitalize(heuristics.colorPalette)} palette. Color ratio: ${primary}% primary, ${secondary}% secondary, ${accent}% accent.`,
	);

	// 5. Mood adjectives
	if (heuristics.moods.length > 0) {
		parts.push(`${capitalize(heuristics.moods.join(", "))}.`);
	}

	// 6. Constraints (capitalize first word of the sentence)
	if (heuristics.constraints.length > 0) {
		const constraintSentence = heuristics.constraints.join(", ");
		parts.push(`${capitalize(constraintSentence)}.`);
	}

	// 7. "Square 1:1." always last
	parts.push("Square 1:1.");

	return parts.join(" ");
}

// ── Default Heuristics ──

/**
 * Returns a sensible default StyleHeuristics object modeled after the
 * KGO style — dark cinematic 3D render with ember-orange rim light.
 */
export function getDefaultHeuristics(): StyleHeuristics {
	return {
		renderType: "3D render",
		material: "volcanic basalt",
		textures: ["granular", "ashy", "faceted"],
		lightingDirection: "rim light from behind",
		lightingQuality: 0.3,
		lightColor: "ember-orange",
		background: "deep void",
		depthOfField: 0.2,
		framing: "centered three-quarter",
		tonalRange: 0.1,
		colorPalette: "obsidian + ember-orange",
		colorRatio: [72, 20, 8],
		moods: ["cinematic", "contemplative", "moody"],
		constraints: ["no text", "no words", "no letters"],
	};
}

// ── Utilities ──

function capitalize(str: string): string {
	if (str.length === 0) return str;
	return str.charAt(0).toUpperCase() + str.slice(1);
}
