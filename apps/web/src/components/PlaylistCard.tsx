import type { SpotifyPlaylist } from "@disc/shared";
import Image from "next/image";

interface PlaylistCardProps {
	playlist: SpotifyPlaylist;
}

export function PlaylistCard({ playlist }: PlaylistCardProps) {
	const coverUrl = playlist.images[0]?.url;
	const trackCount = playlist.items.total;

	return (
		<div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)] transition-shadow duration-[var(--duration-normal)] hover:shadow-[var(--shadow-md)]">
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
					<div className="flex h-full w-full items-center justify-center text-4xl text-[var(--color-text-muted)]">
						<svg
							width="48"
							height="48"
							viewBox="0 0 24 24"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
						</svg>
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
