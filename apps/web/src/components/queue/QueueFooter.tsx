"use client";

import Image from "next/image";
import { forwardRef } from "react";
import { StylePicker } from "./StylePicker";

interface PlaylistSummary {
	id: string;
	name: string;
	spotify_cover_url: string | null;
}

interface Style {
	id: string;
	name: string;
	description: string | null;
}

interface QueueFooterProps {
	selectedPlaylists: PlaylistSummary[];
	runningPlaylists: PlaylistSummary[];
	donePlaylists: PlaylistSummary[];

	onDeselect: (id: string) => void;
	onSelectAll: () => void;
	onClearSelection: () => void;
	todoCount: number;

	styles: Style[];
	styleOverride: string;
	onStyleChange: (value: string) => void;
	onGenerate: () => void;
	triggering: boolean;

	onViewPlaylist: (id: string) => void;
}

type BucketVariant = "selected" | "running" | "done";

const bucketConfig: Record<
	BucketVariant,
	{
		label: string;
		badgeClass: string;
		overlayIcon: "remove" | "spinner" | "check";
	}
> = {
	selected: {
		label: "Selected",
		badgeClass: "bg-[var(--color-accent-muted)] text-[var(--color-accent)]",
		overlayIcon: "remove",
	},
	running: {
		label: "Running",
		badgeClass: "bg-[var(--color-info-muted)] text-[var(--color-info)]",
		overlayIcon: "spinner",
	},
	done: {
		label: "Done",
		badgeClass:
			"bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]",
		overlayIcon: "check",
	},
};

const MAX_VISIBLE_THUMBNAILS = 10;

function Bucket({
	variant,
	playlists,
	onClickThumbnail,
}: {
	variant: BucketVariant;
	playlists: PlaylistSummary[];
	onClickThumbnail: (id: string) => void;
}) {
	if (playlists.length === 0) return null;

	const config = bucketConfig[variant];
	const visible = playlists.slice(0, MAX_VISIBLE_THUMBNAILS);
	const overflow = playlists.length - MAX_VISIBLE_THUMBNAILS;

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-1.5">
				<span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
					{config.label}
				</span>
				<span
					className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-semibold tabular-nums ${config.badgeClass}`}
				>
					{playlists.length}
				</span>
			</div>
			<div className="flex items-center gap-1 overflow-x-auto">
				{visible.map((p) => (
					<button
						key={p.id}
						type="button"
						onClick={() => onClickThumbnail(p.id)}
						className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
						title={p.name}
					>
						{p.spotify_cover_url ? (
							<Image
								src={p.spotify_cover_url}
								alt={p.name}
								width={40}
								height={40}
								className="h-10 w-10 object-cover"
								unoptimized
							/>
						) : (
							<div className="h-10 w-10 bg-[var(--color-surface)]" />
						)}
						{/* Overlay icon */}
						{config.overlayIcon === "remove" && (
							<span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
								<svg
									width="14"
									height="14"
									viewBox="0 0 14 14"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M3.5 3.5l7 7M10.5 3.5l-7 7"
										stroke="white"
										strokeWidth="1.5"
										strokeLinecap="round"
									/>
								</svg>
							</span>
						)}
						{config.overlayIcon === "spinner" && (
							<span className="absolute inset-0 flex items-center justify-center bg-black/30">
								<output
									className="h-3.5 w-3.5 animate-spin rounded-full border border-white border-t-transparent"
									aria-label="Processing"
								/>
							</span>
						)}
						{config.overlayIcon === "check" && (
							<span className="absolute bottom-0 right-0 flex h-3.5 w-3.5 items-center justify-center rounded-tl-[var(--radius-sm)] bg-[var(--color-accent)]">
								<svg
									width="8"
									height="8"
									viewBox="0 0 8 8"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M1.5 4l2 2 3-3"
										stroke="white"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							</span>
						)}
					</button>
				))}
				{overflow > 0 && (
					<span className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">
						+{overflow}
					</span>
				)}
			</div>
		</div>
	);
}

export const QueueFooter = forwardRef<HTMLElement, QueueFooterProps>(
	function QueueFooter(
		{
			selectedPlaylists,
			runningPlaylists,
			donePlaylists,
			onDeselect,
			onSelectAll,
			onClearSelection,
			todoCount,
			styles,
			styleOverride,
			onStyleChange,
			onGenerate,
			triggering,
			onViewPlaylist,
		},
		ref,
	) {
		const hasBuckets =
			selectedPlaylists.length > 0 ||
			runningPlaylists.length > 0 ||
			donePlaylists.length > 0;

		return (
			<footer
				ref={ref}
				className="glass fixed inset-x-0 bottom-0 z-40 !rounded-none !border-x-0 !border-b-0"
			>
				<div
					className="mx-auto max-w-7xl px-[var(--space-lg)]"
					style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}
				>
					{/* Bucket thumbnails row */}
					{hasBuckets && (
						<div className="flex flex-wrap items-end gap-[var(--space-lg)] border-b border-[var(--color-border)]/30 py-[var(--space-md)] transition-all duration-[var(--duration-normal)]">
							<Bucket
								variant="selected"
								playlists={selectedPlaylists}
								onClickThumbnail={onDeselect}
							/>
							<Bucket
								variant="running"
								playlists={runningPlaylists}
								onClickThumbnail={onViewPlaylist}
							/>
							<Bucket
								variant="done"
								playlists={donePlaylists}
								onClickThumbnail={onViewPlaylist}
							/>
						</div>
					)}

					{/* Action bar */}
					<div className="flex min-h-[48px] items-center gap-[var(--space-sm)] py-[var(--space-md)]">
						<StylePicker
							styles={styles}
							value={styleOverride}
							onChange={onStyleChange}
						/>

						<div className="ml-auto flex items-center gap-[var(--space-xs)]">
							{selectedPlaylists.length > 0 && (
								<button
									type="button"
									onClick={onClearSelection}
									className="rounded-[var(--radius-pill)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] transition-colors"
								>
									Deselect All
								</button>
							)}
							{todoCount > 0 && selectedPlaylists.length < todoCount && (
								<button
									type="button"
									onClick={onSelectAll}
									className="rounded-[var(--radius-pill)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] transition-colors"
								>
									Select All
								</button>
							)}
							<button
								type="button"
								onClick={onGenerate}
								disabled={selectedPlaylists.length === 0 || triggering}
								className="rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
							>
								{triggering
									? "Triggering..."
									: `Generate${selectedPlaylists.length > 0 ? ` (${selectedPlaylists.length})` : ""}`}
							</button>
						</div>
					</div>
				</div>
			</footer>
		);
	},
);
