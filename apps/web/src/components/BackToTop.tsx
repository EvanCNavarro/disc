"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp02Icon } from "@hugeicons-pro/core-stroke-rounded";
import { useCallback, useEffect, useState } from "react";

/** Snappy scroll to top — 300ms ease-out (browser smooth is ~800ms+) */
function scrollToTop() {
	const start = window.scrollY;
	if (start === 0) return;

	const duration = 300;
	const startTime = performance.now();

	function step(now: number) {
		const elapsed = now - startTime;
		const progress = Math.min(elapsed / duration, 1);
		// ease-out cubic
		const eased = 1 - (1 - progress) ** 3;
		window.scrollTo(0, start * (1 - eased));
		if (progress < 1) requestAnimationFrame(step);
	}

	requestAnimationFrame(step);
}

export function BackToTop() {
	const [isScrollable, setIsScrollable] = useState(false);
	const handleClick = useCallback(() => scrollToTop(), []);

	useEffect(() => {
		function check() {
			setIsScrollable(
				document.documentElement.scrollHeight > window.innerHeight + 50,
			);
		}
		check();
		const observer = new ResizeObserver(check);
		observer.observe(document.documentElement);
		return () => observer.disconnect();
	}, []);

	if (!isScrollable) return null;

	return (
		<button
			type="button"
			onClick={handleClick}
			className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
			aria-label="Back to top"
		>
			<HugeiconsIcon icon={ArrowUp02Icon} size={14} strokeWidth={2} />
			Top
		</button>
	);
}
