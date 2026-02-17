import { Footer } from "@/components/Footer";
import { NavDock } from "@/components/NavDock";

export default function ChangelogLayout({
	children,
}: {
	children: React.ReactNode;
}) {
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
