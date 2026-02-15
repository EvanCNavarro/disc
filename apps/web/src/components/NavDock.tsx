import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { DiscLogo } from "./DiscLogo";
import { NavItems } from "./NavItems";
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

							{/* Nav items (client component for active state) */}
							<NavItems />

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
