"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavItems() {
	const pathname = usePathname();

	return (
		<div className="flex flex-1 items-center gap-1">
			<NavItem
				href="/playlists"
				label="Playlists"
				active={pathname.startsWith("/playlists")}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="currentColor"
					aria-hidden="true"
				>
					<rect x="1" y="1" width="6" height="6" rx="1.5" />
					<rect x="9" y="1" width="6" height="6" rx="1.5" />
					<rect x="1" y="9" width="6" height="6" rx="1.5" />
					<rect x="9" y="9" width="6" height="6" rx="1.5" />
				</svg>
			</NavItem>
			<NavItem
				href="/changelog"
				label="What's New"
				active={pathname.startsWith("/changelog")}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="currentColor"
					aria-hidden="true"
				>
					<path
						fillRule="evenodd"
						d="M8 1.5a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 1.5z"
						clipRule="evenodd"
					/>
				</svg>
			</NavItem>
			<NavItem
				href="/settings"
				label="Settings"
				active={pathname.startsWith("/settings")}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="currentColor"
					aria-hidden="true"
				>
					<path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
					<path
						fillRule="evenodd"
						d="M6.6 1.2a1 1 0 01.98-.8h.84a1 1 0 01.98.8l.18 1.07a5.5 5.5 0 011.15.67l1.01-.4a1 1 0 011.2.37l.42.72a1 1 0 01-.22 1.24l-.83.68a5.5 5.5 0 010 1.33l.83.68a1 1 0 01.22 1.24l-.42.72a1 1 0 01-1.2.37l-1.01-.4a5.5 5.5 0 01-1.15.67l-.18 1.07a1 1 0 01-.98.8h-.84a1 1 0 01-.98-.8l-.18-1.07a5.5 5.5 0 01-1.15-.67l-1.01.4a1 1 0 01-1.2-.37l-.42-.72a1 1 0 01.22-1.24l.83-.68a5.5 5.5 0 010-1.33l-.83-.68A1 1 0 012.64 4l.42-.72a1 1 0 011.2-.37l1.01.4a5.5 5.5 0 011.15-.67L6.6 1.2zM8 11a3 3 0 100-6 3 3 0 000 6z"
						clipRule="evenodd"
					/>
				</svg>
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
			className={`flex items-center gap-2 rounded-[var(--radius-pill)] px-3.5 py-2 text-sm transition-colors duration-[var(--duration-fast)] ${
				active
					? "bg-[var(--color-surface)] text-[var(--color-text)]"
					: "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
			}`}
		>
			{children}
			<span className="hidden sm:inline">{label}</span>
		</Link>
	);
}
