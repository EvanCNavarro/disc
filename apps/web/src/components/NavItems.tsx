"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
	Playlist01Icon,
	Settings02Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
