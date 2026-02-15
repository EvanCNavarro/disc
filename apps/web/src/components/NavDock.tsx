import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { DiscLogo } from "./DiscLogo";
import { UserDropdown } from "./UserDropdown";

export async function NavDock() {
	const session = await auth();

	const signOutAction = async () => {
		"use server";
		await signOut({ redirectTo: "/login" });
	};

	return (
		<>
			{/* Aura glow behind nav */}
			<div className="aura pointer-events-none fixed inset-x-0 top-0 z-40 h-32" />

			<nav
				className="fixed inset-x-0 top-0 z-50 flex justify-center px-[var(--space-md)] pt-[var(--space-sm)]"
				aria-label="Main navigation"
			>
				<div className="glass flex h-[var(--nav-height)] w-full max-w-3xl items-center gap-2 rounded-[var(--radius-pill)] px-2.5">
					{/* Logo pill */}
					<Link
						href={session ? "/" : "/login"}
						className="flex items-center gap-2.5 rounded-[var(--radius-pill)] px-3 py-2 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-accent-glow)]"
						aria-label="DISC home"
					>
						<DiscLogo size={22} />
						<span className="text-sm font-bold tracking-tight">DISC</span>
					</Link>

					{/* Authenticated nav */}
					{session && (
						<>
							{/* Separator */}
							<hr className="mx-0 h-6 w-px border-0 bg-[var(--color-separator)] opacity-40" />

							{/* Nav items */}
							<div className="flex flex-1 items-center gap-1">
								<NavItem href="/" label="Playlists">
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
								<NavItem href="/settings" label="Settings">
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

							{/* User dropdown */}
							<UserDropdown
								displayName={session.displayName ?? "User"}
								signOutAction={signOutAction}
							/>
						</>
					)}
				</div>
			</nav>
		</>
	);
}

function NavItem({
	href,
	label,
	children,
}: {
	href: string;
	label: string;
	children: React.ReactNode;
}) {
	return (
		<Link
			href={href}
			className="flex items-center gap-2 rounded-[var(--radius-pill)] px-3.5 py-2 text-sm text-[var(--color-text-secondary)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
		>
			{children}
			<span className="hidden sm:inline">{label}</span>
		</Link>
	);
}
