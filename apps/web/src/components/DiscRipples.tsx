"use client";

import { DiscLogo } from "./DiscLogo";

/**
 * Zen breathing background — DISC logos of varying sizes scattered across the
 * screen, gently expanding and contracting with overlapping transparency.
 * Fixed positions to avoid hydration mismatch.
 */

const LOGOS: {
	x: number;
	y: number;
	size: number;
	delay: number;
	duration: number;
	direction: "in" | "out";
}[] = [
	// ── Massive (bigger than hero 80px) — the majority ──
	{ x: 5, y: 8, size: 200, delay: -4, duration: 10, direction: "out" },
	{ x: 80, y: 55, size: 180, delay: -7, duration: 11, direction: "in" },
	{ x: 85, y: 2, size: 160, delay: -2, duration: 9, direction: "out" },
	{ x: 8, y: 50, size: 150, delay: -5, duration: 10, direction: "in" },
	{ x: 78, y: 25, size: 140, delay: 0, duration: 9, direction: "out" },
	{ x: 12, y: 65, size: 130, delay: -3, duration: 8, direction: "in" },
	{ x: 88, y: 40, size: 120, delay: -6, duration: 10, direction: "out" },
	{ x: 18, y: 18, size: 110, delay: -1, duration: 9, direction: "in" },
	{ x: 82, y: 68, size: 100, delay: -8, duration: 8, direction: "out" },
	{ x: 6, y: 35, size: 96, delay: -4.5, duration: 9, direction: "in" },
	{ x: 75, y: 10, size: 170, delay: -2.5, duration: 10, direction: "out" },
	{ x: 15, y: 42, size: 190, delay: -6.5, duration: 11, direction: "in" },
	{ x: 90, y: 30, size: 145, delay: -1.5, duration: 9, direction: "out" },
	// ── Between footer (16px) and hero (80px) — a few ──
	{ x: 90, y: 12, size: 60, delay: -2.5, duration: 7, direction: "out" },
	{ x: 14, y: 72, size: 48, delay: -6, duration: 7, direction: "in" },
	{ x: 92, y: 48, size: 36, delay: -1, duration: 6, direction: "out" },
	{ x: 22, y: 6, size: 28, delay: -3.5, duration: 6, direction: "in" },
	{ x: 86, y: 62, size: 22, delay: -5, duration: 5, direction: "out" },
];

export function DiscRipples() {
	return (
		<div
			className="pointer-events-none fixed inset-0 overflow-hidden"
			aria-hidden="true"
		>
			{LOGOS.map((l) => (
				<div
					key={`${l.x}-${l.y}`}
					className={`absolute text-[var(--color-border)] ${
						l.direction === "out" ? "disc-breathe-out" : "disc-breathe-in"
					}`}
					style={{
						left: `${l.x}%`,
						top: `${l.y}%`,
						animationDelay: `${l.delay}s`,
						animationDuration: `${l.duration}s`,
					}}
				>
					<DiscLogo size={l.size} />
				</div>
			))}
		</div>
	);
}
