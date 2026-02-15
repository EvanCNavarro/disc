import type { SpotifyPlaylist } from "@disc/shared";
import { HugeiconsIcon } from "@hugeicons/react";
import { MusicNote01Icon } from "@hugeicons-pro/core-stroke-rounded";
import Image from "next/image";

interface PlaylistCardProps {
	playlist: SpotifyPlaylist;
}

export function PlaylistCard({ playlist }: PlaylistCardProps) {
	const coverUrl = playlist.images[0]?.url;
	const trackCount = playlist.items.total;

	return (
		<div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)] transition-all duration-[var(--duration-normal)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5">
			<div className="relative aspect-square w-full overflow-hidden bg-[var(--color-surface)]">
				{coverUrl ? (
					<Image
						src={coverUrl}
						alt={`Cover art for ${playlist.name}`}
						fill
						sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
						className="object-cover"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-[var(--color-text-muted)]">
						<HugeiconsIcon icon={MusicNote01Icon} size={48} strokeWidth={1} />
					</div>
				)}
			</div>

			<div className="flex flex-col gap-1 p-[var(--space-md)]">
				<h3 className="truncate text-sm font-semibold">{playlist.name}</h3>
				<p className="text-xs text-[var(--color-text-muted)]">
					{trackCount} {trackCount === 1 ? "track" : "tracks"}
				</p>
			</div>
		</div>
	);
}
