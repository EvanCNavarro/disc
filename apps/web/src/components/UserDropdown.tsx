"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
	Logout03Icon,
	SparklesIcon,
	UserCircleIcon,
} from "@hugeicons-pro/core-stroke-rounded";
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
	const { hasUnread, markAsSeen } = useChangelogSeen();

	const close = useCallback(() => {
		setOpen(false);
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

	const truncatedName =
		displayName.length > 15 ? `${displayName.slice(0, 15)}…` : displayName;

	return (
		<div ref={containerRef} className="relative">
			{/* Trigger — user icon + truncated name */}
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className={`relative flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-2 text-xs font-medium transition-all duration-[var(--duration-fast)] ${
					open
						? "nav-active text-[var(--color-text)]"
						: "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
				}`}
				aria-expanded={open}
				aria-haspopup="menu"
				aria-label={`User menu for ${displayName}${hasUnread ? " — new updates available" : ""}`}
			>
				<HugeiconsIcon icon={UserCircleIcon} size={14} strokeWidth={1.5} />
				<span className="hidden sm:inline">{truncatedName}</span>
				{hasUnread && (
					<span className="flex h-2 w-2 shrink-0">
						<span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-blue-500 opacity-75" />
						<span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
					</span>
				)}
			</button>

			{open && (
				<div
					role="menu"
					aria-label="User menu"
					className="glass absolute right-0 top-full mt-2 min-w-[180px] overflow-hidden rounded-[var(--radius-md)] p-1"
				>
					{/* User info */}
					<div className="flex items-center gap-2 px-2.5 py-2">
						<HugeiconsIcon
							icon={UserCircleIcon}
							size={14}
							strokeWidth={1.5}
							className="shrink-0 text-[var(--color-text-muted)]"
						/>
						<p className="truncate text-xs font-medium text-[var(--color-text)]">
							{displayName.length > 30
								? `${displayName.slice(0, 30)}…`
								: displayName}
						</p>
					</div>

					<hr className="mx-1 border-[var(--color-border-subtle)]" />

					{/* Menu items */}
					<div className="py-0.5">
						<Link
							ref={firstItemRef}
							href="/changelog"
							role="menuitem"
							tabIndex={0}
							onClick={() => {
								close();
								if (hasUnread) markAsSeen();
							}}
							className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-xs text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
						>
							<HugeiconsIcon icon={SparklesIcon} size={14} strokeWidth={1.5} />
							What&apos;s New
							{hasUnread && (
								<span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-blue-500" />
							)}
						</Link>

						<form action={signOutAction}>
							<button
								type="submit"
								role="menuitem"
								tabIndex={0}
								className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-xs text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
							>
								<HugeiconsIcon
									icon={Logout03Icon}
									size={14}
									strokeWidth={1.5}
								/>
								Sign out
							</button>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
