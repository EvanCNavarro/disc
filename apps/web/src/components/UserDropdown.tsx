"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChangelogSeen } from "@/hooks/useChangelogSeen";

interface UserDropdownProps {
	displayName: string;
	signOutAction: () => Promise<void>;
}

export function UserDropdown({
	displayName,
	signOutAction,
}: UserDropdownProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const firstItemRef = useRef<HTMLAnchorElement>(null);
	const initial = displayName.charAt(0).toUpperCase();
	const { hasUnread, markAsSeen } = useChangelogSeen();

	const close = useCallback(() => {
		setOpen(false);
		// Return focus to trigger when closing
		triggerRef.current?.focus();
	}, []);

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				close();
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open, close]);

	// Close on Escape
	useEffect(() => {
		if (!open) return;
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") close();
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [open, close]);

	// Focus first menu item when opening
	useEffect(() => {
		if (open) {
			requestAnimationFrame(() => firstItemRef.current?.focus());
		}
	}, [open]);

	return (
		<div ref={containerRef} className="relative">
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-hover)]"
				aria-expanded={open}
				aria-haspopup="menu"
				aria-label={`User menu for ${displayName}${hasUnread ? " — new updates available" : ""}`}
			>
				{initial}
				{hasUnread && (
					<span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
						<span className="absolute inset-0 animate-ping rounded-full bg-blue-500 opacity-75" />
						<span className="relative block h-3 w-3 rounded-full bg-blue-500 ring-2 ring-white" />
					</span>
				)}
			</button>

			{open && (
				<div
					role="menu"
					aria-label="User menu"
					className="glass absolute right-0 top-full mt-2 min-w-[200px] overflow-hidden rounded-[var(--radius-md)] p-1.5"
				>
					<div className="border-b border-[var(--color-border-subtle)] px-3 py-2.5">
						<p className="text-sm font-medium text-[var(--color-text)]">
							{displayName}
						</p>
					</div>

					<div className="border-b border-[var(--color-border-subtle)] py-1">
						<Link
							ref={firstItemRef}
							href="/changelog"
							role="menuitem"
							tabIndex={0}
							onClick={() => {
								close();
								if (hasUnread) markAsSeen();
							}}
							className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2.5 text-left text-sm text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 16 16"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M8 1.5a.75.75 0 01.67.41l1.3 2.63 2.9.42a.75.75 0 01.42 1.28l-2.1 2.05.5 2.88a.75.75 0 01-1.09.79L8 10.35l-2.6 1.37a.75.75 0 01-1.09-.79l.5-2.88-2.1-2.05a.75.75 0 01.42-1.28l2.9-.42 1.3-2.63A.75.75 0 018 1.5z" />
							</svg>
							What&apos;s New
							{hasUnread && (
								<span className="ml-auto flex h-2 w-2 rounded-full bg-blue-500" />
							)}
						</Link>
					</div>

					<div className="pt-1">
						<form action={signOutAction}>
							<button
								type="submit"
								role="menuitem"
								tabIndex={0}
								className="flex w-full cursor-pointer items-center rounded-[var(--radius-sm)] px-3 py-2.5 text-left text-sm text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
							>
								Sign out
							</button>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
