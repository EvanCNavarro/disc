"use client";

import { useEffect, useRef, useState } from "react";

interface WatcherBannerProps {
	settings: { enabled: boolean; intervalMinutes: number };
	onToggle: (enabled: boolean) => void;
	onIntervalChange: (minutes: number) => void;
}

const INTERVAL_OPTIONS = [5, 10, 15] as const;

/** Returns seconds until next cron tick aligned to the given interval (UTC). */
function secondsUntilNextTick(intervalMinutes: number): number {
	const now = new Date();
	const min = now.getUTCMinutes();
	const sec = now.getUTCSeconds();
	const nextMin = Math.ceil((min + 1) / intervalMinutes) * intervalMinutes;
	const diffMin = nextMin - min;
	return diffMin * 60 - sec;
}

export function WatcherBanner({
	settings,
	onToggle,
	onIntervalChange,
}: WatcherBannerProps) {
	const interval = settings.intervalMinutes;
	const totalSeconds = interval * 60;

	const [remaining, setRemaining] = useState(() =>
		secondsUntilNextTick(interval),
	);
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Reset countdown when interval changes
	useEffect(() => {
		setRemaining(secondsUntilNextTick(interval));
	}, [interval]);

	useEffect(() => {
		if (!settings.enabled) return;

		const timer = setInterval(() => {
			const next = secondsUntilNextTick(interval);
			setRemaining(next <= 0 ? totalSeconds : next);
		}, 1000);
		return () => clearInterval(timer);
	}, [settings.enabled, interval, totalSeconds]);

	// Close dropdown on outside click
	useEffect(() => {
		if (!dropdownOpen) return;

		function handleClick(e: MouseEvent) {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setDropdownOpen(false);
			}
		}

		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [dropdownOpen]);

	const mins = Math.floor(remaining / 60);
	const secs = remaining % 60;
	const display = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

	// Progress: 0 at full interval, 1 at 0s
	const progress = settings.enabled ? 1 - remaining / totalSeconds : 0;

	return (
		<div
			className="flex items-center gap-[var(--space-sm)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-[var(--space-lg)] py-[var(--space-sm)]"
			title={
				settings.enabled
					? `Auto-detect checks every ${interval} minutes for new Spotify playlists`
					: "Auto-detect is paused"
			}
		>
			{/* Toggle button */}
			<button
				type="button"
				onClick={() => onToggle(!settings.enabled)}
				className="flex shrink-0 items-center justify-center rounded-[var(--radius-md)] p-0.5 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
				aria-label={
					settings.enabled ? "Pause auto-detect" : "Resume auto-detect"
				}
			>
				{settings.enabled ? (
					/* Pause icon */
					<svg
						width="14"
						height="14"
						viewBox="0 0 14 14"
						fill="currentColor"
						aria-hidden="true"
					>
						<rect x="3" y="2" width="3" height="10" rx="0.5" />
						<rect x="8" y="2" width="3" height="10" rx="0.5" />
					</svg>
				) : (
					/* Play icon */
					<svg
						width="14"
						height="14"
						viewBox="0 0 14 14"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M3 1.5v11l9-5.5z" />
					</svg>
				)}
			</button>

			{/* Circular progress indicator */}
			<svg
				width="16"
				height="16"
				viewBox="0 0 16 16"
				className="shrink-0"
				aria-hidden="true"
			>
				<circle
					cx="8"
					cy="8"
					r="6"
					fill="none"
					stroke="var(--color-border)"
					strokeWidth="1.5"
				/>
				<circle
					cx="8"
					cy="8"
					r="6"
					fill="none"
					stroke={
						settings.enabled ? "var(--color-accent)" : "var(--color-text-faint)"
					}
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeDasharray={`${progress * 37.7} 37.7`}
					transform="rotate(-90 8 8)"
				/>
			</svg>

			<span className="text-xs text-[var(--color-text-muted)]">
				{settings.enabled ? "Auto-detect" : "Auto-detect paused"}
			</span>

			{/* Interval dropdown */}
			{settings.enabled && (
				<div ref={dropdownRef} className="relative">
					<button
						type="button"
						onClick={() => setDropdownOpen((prev) => !prev)}
						className="rounded-[var(--radius-md)] px-1.5 py-0.5 text-xs text-[var(--color-text-faint)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text-muted)]"
					>
						{interval}m
						<svg
							width="8"
							height="8"
							viewBox="0 0 8 8"
							className="ml-0.5 inline-block"
							aria-hidden="true"
						>
							<path
								d="M1.5 3L4 5.5L6.5 3"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</button>

					{dropdownOpen && (
						<div className="absolute left-0 top-full z-50 mt-1 flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-0.5 shadow-lg">
							{INTERVAL_OPTIONS.map((opt) => (
								<button
									key={opt}
									type="button"
									onClick={() => {
										onIntervalChange(opt);
										setDropdownOpen(false);
									}}
									className={`whitespace-nowrap px-3 py-1 text-left text-xs transition-colors hover:bg-[var(--color-surface)] ${
										opt === interval
											? "text-[var(--color-accent)]"
											: "text-[var(--color-text-secondary)]"
									}`}
								>
									{opt} min
								</button>
							))}
						</div>
					)}
				</div>
			)}

			{/* Countdown or status */}
			<span className="ml-auto font-mono text-xs tabular-nums text-[var(--color-text-secondary)]">
				{settings.enabled ? display : "\u2014"}
			</span>
		</div>
	);
}
