"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { DiscLogo } from "./DiscLogo";

export function LogoLink({ href }: { href: string }) {
	const pathname = usePathname();
	const [animKey, setAnimKey] = useState(0);
	// Active on home and any sub-page not owned by another nav item
	const isActive =
		!pathname.startsWith("/playlists") &&
		!pathname.startsWith("/settings") &&
		!pathname.startsWith("/login");

	const handleClick = useCallback(() => {
		setAnimKey((k) => k + 1);
	}, []);

	return (
		<Link
			href={href}
			onClick={handleClick}
			className={`flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-2 transition-all duration-[var(--duration-fast)] ${
				isActive
					? "nav-active text-[var(--color-text)]"
					: "text-[var(--color-text)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
			}`}
			aria-label="DISC home"
			aria-current={isActive ? "page" : undefined}
		>
			<DiscLogo key={animKey} size={16} />
			<span className="text-xs font-semibold tracking-tight">DISC</span>
		</Link>
	);
}
