"use client";

import type { SpotifyPlaylist } from "@disc/shared";
import { HugeiconsIcon } from "@hugeicons/react";
import { MusicNote01Icon } from "@hugeicons-pro/core-stroke-rounded";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

interface PlaylistCardProps {
	playlist: SpotifyPlaylist;
}

export function PlaylistCard({ playlist }: PlaylistCardProps) {
	const coverUrl = playlist.images[0]?.url;
	const trackCount = playlist.items.total;
	const [coverLoaded, setCoverLoaded] = useState(false);

	return (
		<Link
			href={`/playlists/${playlist.id}`}
			className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)] transition-all duration-[var(--duration-normal)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
		>
			<div className="relative aspect-square w-full overflow-hidden bg-[var(--color-surface)]">
				{coverUrl ? (
					<>
						{!coverLoaded && (
							<div className="absolute inset-0 animate-pulse bg-[var(--color-border)]" />
						)}
						<Image
							src={coverUrl}
							alt={`Cover art for ${playlist.name}`}
							fill
							sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
							className={`object-cover transition-opacity duration-300 ${coverLoaded ? "opacity-100" : "opacity-0"}`}
							onLoad={() => setCoverLoaded(true)}
						/>
					</>
				) : (
					<div className="flex h-full w-full items-center justify-center text-[var(--color-text-muted)]">
						<HugeiconsIcon icon={MusicNote01Icon} size={48} strokeWidth={1} />
					</div>
				)}
				{playlist.collaborative && (
					<span className="absolute top-2 right-2 rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)] shadow-[var(--shadow-sm)]">
						Collaborative
					</span>
				)}
			</div>

			<div className="flex flex-col gap-1 p-[var(--space-md)]">
				<h3 className="truncate text-sm font-semibold">{playlist.name}</h3>
				<p className="text-xs text-[var(--color-text-muted)]">
					{trackCount} {trackCount === 1 ? "track" : "tracks"}
				</p>
			</div>
		</Link>
	);
}
