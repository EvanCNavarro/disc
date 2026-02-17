/**
 * DISC Style Definitions
 *
 * Each style maps to a row in the D1 `styles` table.
 * The `promptTemplate` uses `{subject}` as a placeholder — the pipeline
 * replaces it with the convergence-selected object + aesthetic context.
 *
 * Source of truth for seed data is the D1 table itself; this file provides
 * TypeScript-side metadata for the web app (settings UI, style picker).
 */

export interface StyleDefinition {
	id: string;
	name: string;
	description: string;
	promptTemplate: string;
}

export const STYLES: Record<string, StyleDefinition> = {
	"bleached-crosshatch": {
		id: "bleached-crosshatch",
		name: "Bleached Crosshatch",
		description:
			"Desaturated cross-hatch illustration — graphite and fine ink on textured paper, with bleached highlights and layered directional strokes",
		promptTemplate:
			"A monochromatic still-life of {subject}, rendered in bleached cross-hatch style — desaturated black and white tones with faint beige-gray warmth. Drawn with graphite and fine ink on textured paper. Every surface defined through deliberate cross-hatching and cross-contour strokes, with visible line direction following shape and form. Highlights softly bleached out as if worn by time, midtones muted and low-contrast. Shadows built through layered directional strokes. Moody, tactile, atmospheric. Classical draftsmanship with minimalist grayscale palette. No text, no words, no letters. Square composition.",
	},
	"neon-noir": {
		id: "neon-noir",
		name: "Neon Noir",
		description:
			"Cinematic noir scene bathed in neon glow — deep shadows, saturated color accents, rain-slicked surfaces",
		promptTemplate:
			"A cinematic noir still-life of {subject}, bathed in neon light. Deep shadows with saturated cyan and magenta accents. Rain-slicked reflective surfaces catching colored light. Volumetric fog and atmospheric haze. Film grain texture, anamorphic lens flare. Dramatic chiaroscuro lighting, high contrast. Moody, brooding, cyberpunk-adjacent. No text, no words, no letters. Square composition.",
	},
	"soft-watercolor": {
		id: "soft-watercolor",
		name: "Soft Watercolor",
		description:
			"Gentle watercolor painting with soft washes, visible paper grain, and delicate color bleeding at edges",
		promptTemplate:
			"A delicate watercolor painting of {subject}. Soft translucent washes of color bleeding gently into each other. Visible cold-pressed paper texture and grain showing through. Subtle granulation in pigment settling. Wet-on-wet technique with soft undefined edges. Muted, pastel-adjacent palette with occasional rich pigment concentration. Loose brushwork suggesting form rather than defining it. Gentle ambient light. Ethereal, calming, contemplative. No text, no words, no letters. Square composition.",
	},
	"brutalist-collage": {
		id: "brutalist-collage",
		name: "Brutalist Collage",
		description:
			"Raw mixed-media collage with torn paper, bold typography fragments, and concrete textures",
		promptTemplate:
			"A brutalist mixed-media collage of {subject}. Torn paper edges, overlapping layers, raw concrete and newsprint textures. Bold geometric shapes in muted earth tones with occasional red or yellow accent. Visible glue marks and tape strips. Distressed photographic fragments layered with hand-drawn marks. Gritty, industrial, punk-influenced aesthetic. Zine-like rawness with intentional imperfection. High contrast, flat composition with depth from layering. No readable text, no legible words, no letters. Square composition.",
	},
	"chromatic-glass": {
		id: "chromatic-glass",
		name: "Chromatic Glass",
		description:
			"Luminous stained-glass aesthetic with jewel tones, bold black leading lines, and backlit radiance",
		promptTemplate:
			"A luminous stained-glass artwork of {subject}. Rich jewel tones — deep sapphire, emerald, ruby, amber — separated by bold black leading lines. Light streaming through from behind, creating a warm backlit radiance. Geometric facets with organic flowing forms. Cathedral-inspired composition with Art Nouveau curves. Translucent color overlaps creating new hues at intersections. Dramatic, reverent, ornate. No text, no words, no letters. Square composition.",
	},
	"ukiyo-e-wave": {
		id: "ukiyo-e-wave",
		name: "Ukiyo-e Wave",
		description:
			"Japanese woodblock print style with flat color planes, bold outlines, and traditional Edo-period composition",
		promptTemplate:
			"A Japanese ukiyo-e woodblock print of {subject}. Flat planes of rich color with bold black outlines. Traditional Edo-period aesthetic with flowing organic lines. Visible wood grain texture from the printing process. Limited but vibrant palette — indigo, vermillion, ochre, sage green. Decorative clouds or wave patterns as atmospheric elements. Elegant compositional balance with asymmetric harmony. Stylized natural forms, seasonal sensitivity. No text, no words, no letters, no kanji. Square composition.",
	},
	kuroginorenjiiro: {
		id: "kuroginorenjiiro",
		name: "Kuro Gin Orenjiiro",
		description:
			"Dark cinematic low-poly faceted stone objects with vivid ember-orange rim light floating in obsidian void",
		promptTemplate:
			"Dark cinematic 3D render of a single low-poly faceted {subject} carved from rough volcanic basalt with ashy granular texture. Every part of the object — all details, accessories, and appendages — is carved from the same dark stone. The surface is solid and unbroken, no cracks, no glowing seams. The object is very dark with faceted planes subtly visible through surface noise and faint stone highlights. Uniformly dark obsidian tonal range across the entire image. An intense vivid ember-orange rim light from directly behind the object, centered, creating edge lighting on the full silhouette and facet seams. The glow is warm and organic like smoldering embers. The object floats weightlessly in a deep dark void, hovering with nothing beneath it. The bottom of the object softly fades and dissolves into the darkness below. An extremely faint, barely perceptible shadow diffuses far beneath — so soft it almost blends into the background. No floor, no ground surface, no reflections, no contact with any surface. The object dominates the frame, centered, filling the majority of the composition. Slight three-quarter angle. Color ratio: 72% obsidian black, 20% dark charcoal stone with visible faceted detail, 8% vivid ember-orange accent. Visible photographic film grain everywhere. Cinematic, contemplative, moody. No text, no words, no letters. Square 1:1.",
	},
} as const;

export const DEFAULT_STYLE_ID = "bleached-crosshatch";

export const STYLE_IDS = Object.keys(STYLES) as ReadonlyArray<string>;

export function getStyle(styleId: string): StyleDefinition {
	const style = STYLES[styleId];
	if (!style) {
		return STYLES[DEFAULT_STYLE_ID];
	}
	return style;
}
