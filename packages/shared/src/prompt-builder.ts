/**
 * Parameterized Prompt Builder for DISC Style System
 *
 * Converts numeric/categorical GUI parameters into natural-language prompt
 * segments. Each style defines an identity block (fixed), parameterized
 * segments (user-adjustable), and a constraint block (fixed).
 *
 * Composition order matters: earlier tokens receive stronger attention
 * weight in diffusion/generation models.
 *
 * Order: identity → subject+material → environment → lighting → surface →
 *        color ratio → mood → constraints
 */

// ── Parameter Definition Types ──

export interface SliderParam {
	type: "slider";
	min: number;
	max: number;
	step: number;
	default: number;
	label: string;
	description: string;
	/** Ordered thresholds: numeric value → descriptive text */
	thresholds: Array<{ at: number; text: string }>;
}

export interface DropdownParam {
	type: "dropdown";
	default: string;
	label: string;
	description: string;
	options: Array<{ value: string; label: string; promptText: string }>;
}

export type ParameterDef = SliderParam | DropdownParam;

// ── Template Definition ──

export interface PromptSegment {
	key: string;
	parameterKeys: string[];
	/** Template string with {paramKey} placeholders */
	template: string;
}

export interface ParameterizedStyleTemplate {
	version: string;
	styleId: string;
	styleName: string;
	/** Fixed opening. Strongest attention weight. No parameters. */
	identityBlock: string;
	/** Contains {subject} placeholder + optional parameter placeholders */
	subjectBlock: string;
	/** Ordered segments composed after identity + subject */
	segments: PromptSegment[];
	/** GUI-exposed parameters */
	parameters: Record<string, ParameterDef>;
	/** Always appended last */
	constraintBlock: string;
}

// ── Parameter Resolution ──

function resolveParam(value: number | string, def: ParameterDef): string {
	if (def.type === "slider") {
		const numVal = value as number;
		for (let i = def.thresholds.length - 1; i >= 0; i--) {
			if (numVal >= def.thresholds[i].at) {
				return def.thresholds[i].text;
			}
		}
		return def.thresholds[0].text;
	}
	// dropdown
	const strVal = value as string;
	const option = def.options.find((o) => o.value === strVal);
	return option?.promptText ?? def.options[0].promptText;
}

// ── Prompt Builder ──

/**
 * Extracts a short noun from a subject phrase for use as a pronoun.
 * "human skull" → "skull"
 * "acoustic guitar with glow from sound hole" → "guitar"
 * "horse with glow from behind" → "horse"
 */
function extractNoun(subject: string): string {
	// Split on prepositions that start descriptive clauses
	const corePart = subject
		.split(/\s+(?:with|from|through|along|and)\s+/)[0]
		.trim();
	const words = corePart.split(/\s+/);
	return words[words.length - 1];
}

/**
 * Builds a complete prompt from a parameterized template.
 *
 * @param template - The style template definition
 * @param subject - Subject text from convergence (e.g. "human skull with glowing eye sockets")
 * @param userParams - Parameter overrides (missing keys use defaults)
 */
export function buildPrompt(
	template: ParameterizedStyleTemplate,
	subject: string,
	userParams: Record<string, number | string> = {},
): string {
	const parts: string[] = [];
	const noun = extractNoun(subject);

	// 1. Identity block (fixed anchor)
	parts.push(template.identityBlock);

	// 2. Subject block — replace {subject} and any parameter placeholders
	let subjectText = template.subjectBlock.replace("{subject}", subject);
	for (const [key, def] of Object.entries(template.parameters)) {
		const value = userParams[key] ?? def.default;
		subjectText = subjectText.replaceAll(`{${key}}`, resolveParam(value, def));
	}
	parts.push(subjectText);

	// 3. Segments in order — replace {noun} with extracted subject noun
	for (const segment of template.segments) {
		let text = segment.template;
		for (const paramKey of segment.parameterKeys) {
			const def = template.parameters[paramKey];
			if (!def) continue;
			const value = userParams[paramKey] ?? def.default;
			text = text.replaceAll(`{${paramKey}}`, resolveParam(value, def));
		}
		text = text.replaceAll("{noun}", noun);
		const trimmed = text.replace(/[.,\s]/g, "");
		if (trimmed.length > 0) {
			parts.push(text);
		}
	}

	// 4. Constraint block
	parts.push(template.constraintBlock);

	return parts.join(" ");
}

// ── KGO Style Template (Nano Banana / Gemini) ──

export const KGO_TEMPLATE: ParameterizedStyleTemplate = {
	version: "1.0.0",
	styleId: "kuroginorenjiiro",
	styleName: "Kuro Gin Orenjiiro",

	identityBlock: "Dark cinematic 3D render of a single low-poly faceted",

	subjectBlock:
		"{subject} carved from {material} with {texture}. Every part of the {noun} — all details, accessories, and appendages — is carved from the same dark stone. The surface is solid and unbroken, no cracks, no glowing seams.",

	segments: [
		{
			key: "objectVisibility",
			parameterKeys: ["objectDarkness"],
			template: "{objectDarkness}",
		},
		{
			key: "lighting",
			parameterKeys: ["glowIntensity", "glowColor"],
			template:
				"{glowIntensity} {glowColor} rim light from directly behind the {noun}, centered, creating edge lighting on the full silhouette and facet seams. The glow is concentrated and intentional, not diffused.",
		},
		{
			key: "environment",
			parameterKeys: ["voidDepth"],
			template: "{voidDepth}",
		},
		{
			key: "composition",
			parameterKeys: [],
			template:
				"The {noun} dominates the frame, centered, filling the majority of the composition. Slight three-quarter angle.",
		},
		{
			key: "colorRatio",
			parameterKeys: ["colorBalance"],
			template: "{colorBalance}",
		},
		{
			key: "surface",
			parameterKeys: ["grainIntensity"],
			template: "{grainIntensity}",
		},
		{
			key: "mood",
			parameterKeys: ["atmosphere"],
			template: "{atmosphere}",
		},
	],

	parameters: {
		material: {
			type: "dropdown",
			default: "volcanic-basalt",
			label: "Material",
			description: "The substance the object appears carved from",
			options: [
				{
					value: "volcanic-basalt",
					label: "Volcanic Basalt",
					promptText: "rough volcanic basalt",
				},
				{
					value: "charcoal-stone",
					label: "Dark Charcoal Stone",
					promptText: "dark charcoal-black faceted stone",
				},
				{
					value: "obsidian",
					label: "Obsidian",
					promptText: "polished black obsidian with sharp faceted planes",
				},
				{
					value: "dark-iron",
					label: "Dark Iron",
					promptText: "dark forged iron with hammered faceted surfaces",
				},
			],
		},

		texture: {
			type: "dropdown",
			default: "ashy-granular",
			label: "Surface Texture",
			description: "The tactile quality overlaid on the material",
			options: [
				{
					value: "ashy-granular",
					label: "Ashy Granular",
					promptText: "ashy granular texture",
				},
				{
					value: "crystalline",
					label: "Crystalline",
					promptText: "crystalline mineral texture",
				},
				{
					value: "smooth-matte",
					label: "Smooth Matte",
					promptText: "smooth matte texture",
				},
				{
					value: "rough-hewn",
					label: "Rough Hewn",
					promptText: "rough hewn chiseled texture",
				},
			],
		},

		objectDarkness: {
			type: "slider",
			min: 0,
			max: 1,
			step: 0.1,
			default: 0.7,
			label: "Object Darkness",
			description: "How dark the object is relative to the void",
			thresholds: [
				{
					at: 0.0,
					text: "The {noun} is distinctly lighter than the background, clearly visible.",
				},
				{
					at: 0.3,
					text: "The {noun} is moderately dark with clearly visible faceted planes.",
				},
				{
					at: 0.5,
					text: "The {noun} is dark but its faceted planes are visible through surface highlights.",
				},
				{
					at: 0.7,
					text: "The {noun} is very dark but its faceted planes are subtly visible through surface noise and faint highlights on the stone.",
				},
				{
					at: 0.9,
					text: "The {noun} is nearly invisible, barely distinguishable from the void except where light catches edges.",
				},
			],
		},

		glowColor: {
			type: "dropdown",
			default: "orange-amber",
			label: "Glow Color",
			description: "Color temperature of the accent lighting",
			options: [
				{
					value: "orange-amber",
					label: "Orange Amber",
					promptText: "warm orange-amber",
				},
				{
					value: "warm-gold",
					label: "Warm Gold",
					promptText: "golden",
				},
				{
					value: "deep-red",
					label: "Deep Red",
					promptText: "crimson-red",
				},
				{
					value: "cool-cyan",
					label: "Cool Cyan",
					promptText: "cyan-blue",
				},
			],
		},

		glowIntensity: {
			type: "slider",
			min: 0,
			max: 1,
			step: 0.1,
			default: 0.7,
			label: "Glow Intensity",
			description: "Brightness of the accent glow",
			thresholds: [
				{ at: 0.0, text: "A barely visible hint of" },
				{ at: 0.2, text: "A subtle" },
				{ at: 0.4, text: "A moderate" },
				{ at: 0.6, text: "A vibrant" },
				{ at: 0.8, text: "An intense blazing" },
				{ at: 1.0, text: "An overwhelming searing" },
			],
		},

		voidDepth: {
			type: "slider",
			min: 0,
			max: 1,
			step: 0.1,
			default: 0.6,
			label: "Void Depth",
			description: "How deep and empty the background feels",
			thresholds: [
				{
					at: 0.0,
					text: "The {noun} sits against a dark background.",
				},
				{
					at: 0.3,
					text: "The {noun} floats in a dark void.",
				},
				{
					at: 0.5,
					text: "The {noun} is suspended in a deep dark void with warm ambient depth.",
				},
				{
					at: 0.7,
					text: "The {noun} is suspended in an endless dark void with warm ambient depth, no ground, no floor.",
				},
				{
					at: 1.0,
					text: "The {noun} is suspended in an infinite abyss of darkness, no ground, no floor, no surface of any kind.",
				},
			],
		},

		colorBalance: {
			type: "dropdown",
			default: "classic-kgo",
			label: "Color Balance",
			description: "The ratio of black, charcoal, and accent color",
			options: [
				{
					value: "classic-kgo",
					label: "Classic KGO (70/22/8)",
					promptText:
						"Color ratio: 70% near-black, 22% dark charcoal stone with visible faceted detail, 8% vibrant warm accent.",
				},
				{
					value: "darker",
					label: "Darker (80/15/5)",
					promptText:
						"Color ratio: 80% near-black, 15% dark charcoal stone, 5% accent glow.",
				},
				{
					value: "brighter-accent",
					label: "Brighter Accent (65/20/15)",
					promptText:
						"Color ratio: 65% near-black, 20% dark charcoal stone, 15% vibrant accent glow.",
				},
			],
		},

		grainIntensity: {
			type: "slider",
			min: 0,
			max: 1,
			step: 0.1,
			default: 0.6,
			label: "Film Grain",
			description: "Amount of photographic noise across surfaces",
			thresholds: [
				{ at: 0.0, text: "Clean smooth surfaces." },
				{ at: 0.3, text: "Subtle film grain across surfaces." },
				{ at: 0.5, text: "Fine granular noise everywhere." },
				{
					at: 0.7,
					text: "Visible photographic film grain and granular noise everywhere.",
				},
				{
					at: 1.0,
					text: "Heavy photographic grain and noise covering every surface, like high-ISO film.",
				},
			],
		},

		atmosphere: {
			type: "dropdown",
			default: "contemplative",
			label: "Atmosphere",
			description: "The emotional tone of the image",
			options: [
				{
					value: "contemplative",
					label: "Contemplative",
					promptText: "Cinematic, contemplative, moody.",
				},
				{
					value: "menacing",
					label: "Menacing",
					promptText: "Ominous, brooding, menacing.",
				},
				{
					value: "serene",
					label: "Serene",
					promptText: "Still, peaceful, meditative.",
				},
				{
					value: "electric",
					label: "Electric",
					promptText: "Charged, kinetic, electric.",
				},
			],
		},
	},

	constraintBlock:
		"No text, no words, no letters. No particles, no embers, no sparks. Square 1:1.",
};

/**
 * Convenience: build a KGO prompt with default parameters.
 * Used for quick testing without a full parameter map.
 */
export function buildKgoPrompt(
	subject: string,
	overrides: Record<string, number | string> = {},
): string {
	return buildPrompt(KGO_TEMPLATE, subject, overrides);
}
