interface DiscLogoProps {
	size?: number;
}

/**
 * 4 concentric rings representing D-I-S-C.
 *
 * Correct ring math (cross-section from center to edge):
 *   center_hole(0.5u) + ring(1u) + gap(1u) + ring(1u) + gap(1u) + ring(1u) + gap(1u) + ring(1u) = 7.5u radius
 *   Total diameter = 15u → unit = size / 15
 *
 * Ring outer diameters: 15u, 11u, 7u, 3u (decreasing by 4u: 2u ring + 2u gap per step)
 * Each ring border = 1u, box-sizing: border-box
 * Gaps are truly transparent (works over any background).
 */
export function DiscLogo({ size = 32 }: DiscLogoProps) {
	const unit = size / 15;

	const rings = [15, 11, 7, 3].map((multiplier, i) => {
		const diameter = unit * multiplier;
		return (
			<div
				key={multiplier}
				className="disc-ring absolute rounded-full"
				style={{
					boxSizing: "border-box",
					width: diameter,
					height: diameter,
					borderWidth: unit,
					borderStyle: "solid",
					borderColor: "currentColor",
					top: (size - diameter) / 2,
					left: (size - diameter) / 2,
					animationDelay: `${i * 100}ms`,
				}}
			/>
		);
	});

	return (
		<div
			className="disc-logo-wrapper relative shrink-0"
			style={{ width: size, height: size }}
			aria-hidden="true"
		>
			{rings}
		</div>
	);
}
