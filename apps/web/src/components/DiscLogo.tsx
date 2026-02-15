interface DiscLogoProps {
	size?: number;
}

/**
 * 4 concentric rings representing D-I-S-C.
 *
 * Uses SVG for pixel-perfect centering (no sub-pixel rounding from CSS borders).
 *
 * ViewBox = 15×15, stroke-width = 1.2u (slightly thicker for tighter gaps).
 * Stroke-center radii: 6.9, 5.0, 3.1, 1.2
 * Adjusted so outer ring stays within viewBox and gaps are ~0.7u visible.
 */
const RINGS = [6.9, 5.0, 3.1, 1.2] as const;

export function DiscLogo({ size = 32 }: DiscLogoProps) {
	return (
		<svg
			className="disc-logo-wrapper shrink-0"
			width={size}
			height={size}
			viewBox="0 0 15 15"
			fill="none"
			aria-hidden="true"
		>
			{RINGS.map((r, i) => (
				<circle
					key={r}
					className="disc-ring"
					cx="7.5"
					cy="7.5"
					r={r}
					stroke="currentColor"
					strokeWidth="1.2"
					style={{ animationDelay: `${i * 100}ms`, transformOrigin: "center" }}
				/>
			))}
		</svg>
	);
}
