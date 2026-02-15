import { APP_VERSION } from "@disc/shared";
import Link from "next/link";

export function Footer() {
	return (
		<footer className="mx-auto mt-[var(--space-3xl)] max-w-6xl border-t border-[var(--color-border)] px-[var(--space-lg)] py-[var(--space-xl)]">
			<div className="flex flex-col gap-[var(--space-md)] text-xs text-[var(--color-text-muted)]">
				<p className="max-w-prose leading-relaxed">
					<strong className="text-[var(--color-text-secondary)]">DISC</strong>{" "}
					generates AI cover art for your Spotify playlists on a recurring
					schedule. Pick a style, set a time, and forget about it — every
					playlist gets a consistent look, and new playlists are picked up
					automatically.
				</p>
				<div className="flex flex-wrap items-center gap-[var(--space-md)]">
					<span>
						A{" "}
						<span className="text-[var(--color-text-secondary)]">
							400 Faces
						</span>{" "}
						project
					</span>
					<span className="text-[var(--color-border)]">·</span>
					<Link
						href="/changelog"
						className="transition-colors hover:text-[var(--color-text-secondary)]"
					>
						Changelog
					</Link>
					<span className="text-[var(--color-border)]">·</span>
					<span>v{APP_VERSION}</span>
				</div>
			</div>
		</footer>
	);
}
