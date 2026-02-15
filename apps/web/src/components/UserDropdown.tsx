"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
	const menuItemRef = useRef<HTMLButtonElement>(null);
	const initial = displayName.charAt(0).toUpperCase();

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
			// Defer to next frame so the DOM has rendered
			requestAnimationFrame(() => menuItemRef.current?.focus());
		}
	}, [open]);

	return (
		<div ref={containerRef} className="relative">
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-hover)]"
				aria-expanded={open}
				aria-haspopup="menu"
				aria-label={`User menu for ${displayName}`}
			>
				{initial}
			</button>

			{open && (
				<div
					role="menu"
					aria-label="User menu"
					className="glass absolute right-0 top-full mt-2 min-w-[180px] overflow-hidden rounded-[var(--radius-md)] p-1.5"
				>
					<div className="border-b border-[var(--color-border-subtle)] px-3 py-2.5">
						<p className="text-sm font-medium text-[var(--color-text)]">
							{displayName}
						</p>
					</div>
					<div className="pt-1">
						<form action={signOutAction}>
							<button
								ref={menuItemRef}
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
