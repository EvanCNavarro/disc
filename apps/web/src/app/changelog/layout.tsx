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
				className="pt-[calc(var(--nav-height)+var(--space-md)*2)]"
			>
				<main className="mx-auto max-w-7xl px-[var(--space-lg)] py-[var(--space-xl)]">
					{children}
				</main>
				<Footer className="mt-[var(--space-3xl)]" />
			</div>
		</>
	);
}
