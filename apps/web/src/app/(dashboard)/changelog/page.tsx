import { APP_VERSION } from "@disc/shared";
import Link from "next/link";
import { ChangelogList } from "@/components/changelog/ChangelogList";
import { ChangelogMarkSeen } from "@/components/changelog/ChangelogMarkSeen";

export const metadata = {
	title: "Changelog - DISC",
};

export default function ChangelogPage() {
	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			{/* Breadcrumbs */}
			<nav
				aria-label="Breadcrumb"
				className="text-sm text-[var(--color-text-muted)]"
			>
				<ol className="flex items-center gap-1.5">
					<li>
						<Link
							href="/"
							className="transition-colors hover:text-[var(--color-text-secondary)]"
						>
							Home
						</Link>
					</li>
					<li aria-hidden="true">›</li>
					<li aria-current="page" className="text-[var(--color-text)]">
						Changelog
					</li>
				</ol>
			</nav>

			<div className="flex items-baseline justify-between">
				<h1 className="text-2xl font-bold">Changelog</h1>
				<span className="text-sm text-[var(--color-text-muted)]">
					v{APP_VERSION}
				</span>
			</div>
			<ChangelogList />
			<ChangelogMarkSeen />
		</div>
	);
}
