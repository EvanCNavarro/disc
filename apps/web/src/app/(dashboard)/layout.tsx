import { redirect } from "next/navigation";
import { Footer } from "@/components/Footer";
import { NavDock } from "@/components/NavDock";
import { auth } from "@/lib/auth";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth();
	if (!session || session.error) redirect("/login");

	return (
		<>
			<a href="#main-content" className="skip-link">
				Skip to content
			</a>
			<NavDock />
			<div
				id="main-content"
				className="flex min-h-dvh flex-col pt-[calc(var(--nav-height)+var(--space-md)*2)]"
			>
				<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-[var(--space-lg)] py-[var(--space-xl)]">
					{children}
				</main>
				<Footer />
			</div>
		</>
	);
}
