"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
	DashboardSquare02Icon,
	PaintBrush01Icon,
	Playlist01Icon,
	Settings02Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { QueueNavTooltip } from "@/components/nav/QueueNavTooltip";
import { useQueue } from "@/context/QueueContext";

export function NavItems() {
	const pathname = usePathname();

	return (
		<div className="flex items-center gap-0.5">
			<NavItem
				href="/playlists"
				label="Playlists"
				active={pathname.startsWith("/playlists")}
			>
				<HugeiconsIcon icon={Playlist01Icon} size={14} strokeWidth={1.5} />
			</NavItem>
			<QueueNavItemWithTooltip active={pathname.startsWith("/queue")} />
			<NavItem
				href="/styles"
				label="Styles"
				active={pathname.startsWith("/styles")}
			>
				<HugeiconsIcon icon={PaintBrush01Icon} size={14} strokeWidth={1.5} />
			</NavItem>
			<NavItem
				href="/settings"
				label="Settings"
				active={pathname.startsWith("/settings")}
			>
				<HugeiconsIcon icon={Settings02Icon} size={14} strokeWidth={1.5} />
			</NavItem>
		</div>
	);
}

function QueueNavItemWithTooltip({ active }: { active: boolean }) {
	const { status } = useQueue();
	const [showTooltip, setShowTooltip] = useState(false);
	const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isActive = Boolean(status?.activeJob);

	const handleMouseEnter = useCallback(() => {
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current);
			hideTimeoutRef.current = null;
		}
		setShowTooltip(true);
	}, []);

	const handleMouseLeave = useCallback(() => {
		hideTimeoutRef.current = setTimeout(() => {
			setShowTooltip(false);
		}, 150);
	}, []);

	return (
		<div
			role="group"
			className="relative"
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			<Link
				href="/queue"
				aria-current={active ? "page" : undefined}
				className={`relative flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-2 text-xs font-medium transition-all duration-[var(--duration-fast)] ${
					active
						? "nav-active text-[var(--color-text)]"
						: "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
				}`}
			>
				<span className="relative">
					<HugeiconsIcon
						icon={DashboardSquare02Icon}
						size={14}
						strokeWidth={1.5}
					/>
					{isActive && (
						<span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-75" />
							<span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
						</span>
					)}
				</span>
				<span className="hidden sm:inline">Queue</span>
			</Link>

			{showTooltip && status && (
				<div className="glass absolute top-full left-1/2 z-50 mt-[var(--space-sm)] w-72 -translate-x-1/2 rounded-[var(--radius-md)] p-[var(--space-md)] shadow-[var(--shadow-lg)]">
					<QueueNavTooltip status={status} />
				</div>
			)}
		</div>
	);
}

function NavItem({
	href,
	label,
	active,
	children,
}: {
	href: string;
	label: string;
	active: boolean;
	children: React.ReactNode;
}) {
	return (
		<Link
			href={href}
			aria-current={active ? "page" : undefined}
			className={`flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-2 text-xs font-medium transition-all duration-[var(--duration-fast)] ${
				active
					? "nav-active text-[var(--color-text)]"
					: "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
			}`}
		>
			{children}
			<span className="hidden sm:inline">{label}</span>
		</Link>
	);
}
