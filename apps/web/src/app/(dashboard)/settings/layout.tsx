"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
	{ href: "/settings/general", label: "General" },
	{ href: "/settings/billing", label: "Billing" },
] as const;

export default function SettingsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();

	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			<h1 className="text-2xl font-bold">Settings</h1>

			<div className="flex flex-col gap-[var(--space-lg)] md:flex-row">
				{/* Sidebar — vertical on md+, horizontal pills on mobile */}
				<nav
					aria-label="Settings navigation"
					className="flex gap-[var(--space-xs)] overflow-x-auto md:w-[180px] md:shrink-0 md:flex-col md:overflow-x-visible"
				>
					{TABS.map((tab) => {
						const isActive = pathname.startsWith(tab.href);
						return (
							<Link
								key={tab.href}
								href={tab.href}
								aria-current={isActive ? "page" : undefined}
								className={`whitespace-nowrap rounded-[var(--radius-md)] px-[var(--space-md)] py-[var(--space-sm)] text-sm font-medium transition-colors ${
									isActive
										? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
										: "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
								}`}
							>
								{tab.label}
							</Link>
						);
					})}
				</nav>

				{/* Content area */}
				<div className="min-w-0 flex-1">{children}</div>
			</div>
		</div>
	);
}
