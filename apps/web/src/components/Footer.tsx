import { APP_VERSION } from "@disc/shared";
import Link from "next/link";
import { BackToTop } from "./BackToTop";
import { FooterLogo } from "./FooterLogo";

export function Footer({ className }: { className?: string }) {
	return (
		<footer
			className={`mx-auto max-w-7xl px-[var(--space-lg)] py-[var(--space-xl)] ${className ?? ""}`}
			style={{
				backgroundImage:
					"repeating-linear-gradient(to right, var(--color-border) 0, var(--color-border) 6px, transparent 6px, transparent 14px)",
				backgroundSize: "100% 1px",
				backgroundRepeat: "no-repeat",
				backgroundPosition: "top",
				paddingTop: "var(--space-xl)",
			}}
		>
			<div className="flex items-start justify-between gap-[var(--space-lg)]">
				<div className="flex flex-col gap-4 text-xs text-[var(--color-text-muted)]">
					{/* Top row: Logo + wordmark + changelog */}
					<div className="flex items-center gap-4">
						<FooterLogo />
						<Link
							href="/changelog"
							className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium transition-colors hover:border-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
						>
							Changelog
							<span className="rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-secondary)]">
								v{APP_VERSION}
							</span>
							<span aria-hidden="true">&rarr;</span>
						</Link>
					</div>

					{/* Description */}
					<p className="max-w-[60ch] leading-relaxed">
						&ldquo;Daily Image Spotify Covers&rdquo; &mdash; a web application
						that generates AI cover art for your Spotify playlists on a user-set
						recurring schedule. Pick a style, set a time, and rest assured every
						playlist looks aesthetically congruent the next time you open
						Spotify.
					</p>

					{/* Copyright */}
					<p>
						&copy; {new Date().getFullYear()}{" "}
						<span className="text-[var(--color-text-secondary)]">400Faces</span>
						. All rights reserved.
					</p>
				</div>

				{/* Back to top */}
				<BackToTop />
			</div>
		</footer>
	);
}
