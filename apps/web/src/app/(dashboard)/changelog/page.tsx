import { APP_VERSION } from "@disc/shared";
import { ChangelogList } from "@/components/changelog/ChangelogList";

export const metadata = {
	title: "Changelog - DISC",
};

export default function ChangelogPage() {
	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			<div className="flex items-baseline justify-between">
				<h1 className="text-2xl font-bold">Changelog</h1>
				<span className="text-sm text-[var(--color-text-muted)]">
					v{APP_VERSION}
				</span>
			</div>
			<ChangelogList />
		</div>
	);
}
