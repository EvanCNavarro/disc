/**
 * DISC Style Definitions
 *
 * Each style defines a visual treatment for DALL-E cover generation.
 * The `promptBlock` is appended to the theme-selected object description.
 */

export interface StyleDefinition {
	id: string;
	name: string;
	description: string;
	promptBlock: string;
}

export const STYLES: Record<string, StyleDefinition> = {
	"bleached-crosshatch": {
		id: "bleached-crosshatch",
		name: "Bleached Cross-Hatch",
		description:
			"High-contrast black and white line art with intricate cross-hatching",
		promptBlock: `A monochromatic still-life or portrait rendered in Bleached Line, Cross-Hatch / Cross-Contour style — featuring subtle, desaturated black and white tones with faint beige-gray warmth. The artwork should look like it was drawn with graphite, charcoal, or fine ink on textured paper. Every surface is defined through deliberate cross-hatching and cross-contour strokes, with visible line direction following the shape and form of objects. Highlights appear softly "bleached out," as if worn or faded by time, while midtones are muted and low-contrast. Shadows are built through layered, directional strokes rather than fill shading. The overall tone is moody, tactile, and atmospheric — blending classical draftsmanship with a minimalist grayscale palette.

Visual Traits:
- Muted grayscale or sepia-gray palette (no pure black or white unless for emphasis)
- Dense cross-hatching for tonal build-up
- Cross-contour lines that follow form curvature
- Paper texture or parchment backdrop
- Bleached or faded highlights — not digitally crisp
- Soft ambient light or chiaroscuro mood
- Organic imperfections: smudges, uneven line pressure, human touch

Style Keywords: cross-hatching, cross-contour, bleached graphite, muted tones, grayscale sketch, fine ink drawing, pencil rendering, classical illustration, moody lighting, paper texture, subtle shading, hand-drawn aesthetic, charcoal realism, vintage study.

NO text, words, or letters in the image.`,
	},
} as const;

export const DEFAULT_STYLE_ID = "bleached-crosshatch";

export function getStyle(styleId: string): StyleDefinition {
	const style = STYLES[styleId];
	if (!style) {
		return STYLES[DEFAULT_STYLE_ID];
	}
	return style;
}
