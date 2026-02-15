"use client";

import { Fireworks } from "fireworks-js";
import { useCallback, useRef } from "react";
import { DiscLogo } from "./DiscLogo";

/**
 * DISC logo + wordmark as a ghost button.
 * Each click launches exactly one green firework from the badge itself,
 * shooting upward. Canvas bottom edge = button position so rockets
 * appear to originate from the badge.
 */
export function FooterLogo() {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const fwRef = useRef<Fireworks | null>(null);
	const cleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);

	const handleClick = useCallback(() => {
		if (!buttonRef.current) return;

		const rect = buttonRef.current.getBoundingClientRect();
		const btnCenterX = rect.left + rect.width / 2;
		const btnCenterY = rect.top + rect.height / 2;

		// Canvas stretches from top of viewport to the button's center Y.
		// fireworks-js launches from the bottom of its canvas = button position.
		const canvasH = Math.max(btnCenterY, 100);
		const canvasW = window.innerWidth;
		const launchPct = (btnCenterX / canvasW) * 100;

		// Reset cleanup timer if clicking rapidly
		if (cleanupRef.current) {
			clearTimeout(cleanupRef.current);
		}

		if (!canvasRef.current) {
			const canvas = document.createElement("canvas");
			canvas.style.cssText = `
				position:fixed;top:0;left:0;
				width:${canvasW}px;height:${canvasH}px;
				pointer-events:none;z-index:100;
			`;
			canvas.width = canvasW;
			canvas.height = canvasH;
			document.body.appendChild(canvas);
			canvasRef.current = canvas;

			const fw = new Fireworks(canvas, {
				autoresize: false,
				opacity: 0.5,
				acceleration: 1.04,
				friction: 0.96,
				gravity: 1.5,
				particles: 50,
				traceLength: 3,
				traceSpeed: 10,
				explosion: 5,
				intensity: 0,
				flickering: 40,
				lineStyle: "round",
				hue: { min: 135, max: 155 },
				delay: { min: 100, max: 100 },
				rocketsPoint: {
					min: Math.max(5, launchPct - 3),
					max: Math.min(95, launchPct + 3),
				},
				lineWidth: {
					explosion: { min: 1, max: 3 },
					trace: { min: 1, max: 2 },
				},
				brightness: { min: 50, max: 80 },
				decay: { min: 0.015, max: 0.03 },
				mouse: { click: false, move: false, max: 1 },
			});

			fwRef.current = fw;
			fw.start();
		} else {
			// Update canvas size + launch point
			canvasRef.current.style.width = `${canvasW}px`;
			canvasRef.current.style.height = `${canvasH}px`;
			canvasRef.current.width = canvasW;
			canvasRef.current.height = canvasH;
			fwRef.current?.updateSize({ width: canvasW, height: canvasH });
			fwRef.current?.updateOptions({
				rocketsPoint: {
					min: Math.max(5, launchPct - 3),
					max: Math.min(95, launchPct + 3),
				},
			});
			if (!fwRef.current?.isRunning) {
				fwRef.current?.start();
			}
		}

		fwRef.current?.launch(1);

		// Auto-cleanup after particles settle
		cleanupRef.current = setTimeout(() => {
			fwRef.current?.stop(true);
			canvasRef.current?.remove();
			canvasRef.current = null;
			fwRef.current = null;
			cleanupRef.current = null;
		}, 2500);
	}, []);

	return (
		<button
			ref={buttonRef}
			type="button"
			onClick={handleClick}
			className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-2 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface)]"
			aria-label="DISC"
		>
			<DiscLogo size={16} />
			<span className="text-xs font-semibold text-[var(--color-text)]">
				DISC
			</span>
		</button>
	);
}
