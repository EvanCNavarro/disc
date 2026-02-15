import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth();
	if (!session) redirect("/login");

	return (
		<div className="min-h-screen bg-[var(--color-bg)]">
			<header className="flex items-center justify-between border-b border-[var(--color-border)] px-[var(--space-lg)] py-[var(--space-md)]">
				<span className="text-lg font-bold tracking-tight">DISC</span>

				<div className="flex items-center gap-[var(--space-md)]">
					<span className="text-sm text-[var(--color-text-muted)]">
						{session.displayName}
					</span>
					<form
						action={async () => {
							"use server";
							await signOut({ redirectTo: "/login" });
						}}
					>
						<button
							type="submit"
							className="cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-sm text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-text-muted)] hover:text-[var(--color-text)]"
						>
							Sign out
						</button>
					</form>
				</div>
			</header>

			<main className="mx-auto max-w-6xl px-[var(--space-lg)] py-[var(--space-xl)]">
				{children}
			</main>
		</div>
	);
}
