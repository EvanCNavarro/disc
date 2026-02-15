import { auth, signOut } from "@/lib/auth";
import { LogoLink } from "./LogoLink";
import { NavItems } from "./NavItems";
import { UserDropdown } from "./UserDropdown";

export async function NavDock() {
	const rawSession = await auth();
	// Treat sessions with token refresh errors as unauthenticated
	const session = rawSession?.error ? null : rawSession;

	const signOutAction = async () => {
		"use server";
		await signOut({ redirectTo: "/login" });
	};

	return (
		<>
			{/* Fade mask: content fades out smoothly behind nav area */}
			<div
				className="pointer-events-none fixed inset-x-0 top-0 z-40 h-28"
				style={{
					background:
						"linear-gradient(to bottom, var(--color-bg) 40%, color-mix(in srgb, var(--color-bg) 60%, transparent) 70%, transparent 100%)",
				}}
			/>

			{/* Aura glow behind nav */}
			<div className="aura pointer-events-none fixed inset-x-0 top-0 z-40 h-32" />

			<nav
				className="fixed inset-x-0 top-0 z-50 flex justify-center px-[var(--space-md)] pt-[var(--space-sm)]"
				aria-label="Main navigation"
			>
				<div className="glass flex items-center gap-1.5 rounded-[var(--radius-pill)] p-1.5">
					{/* Logo pill */}
					<LogoLink href={session ? "/" : "/login"} />

					{/* Authenticated nav */}
					{session && (
						<>
							{/* Separator */}
							<hr className="h-4 w-px border-0 bg-[var(--color-separator)] opacity-50" />

							{/* Nav items */}
							<NavItems />

							{/* Separator */}
							<hr className="h-4 w-px border-0 bg-[var(--color-separator)] opacity-50" />

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
