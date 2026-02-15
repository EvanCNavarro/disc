import type { SpotifyPlaylist } from "@disc/shared";
import { PlaylistCard } from "./PlaylistCard";

interface PlaylistGridProps {
	playlists: SpotifyPlaylist[];
}

export function PlaylistGrid({ playlists }: PlaylistGridProps) {
	if (playlists.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 py-[var(--space-3xl)] text-[var(--color-text-muted)]">
				<p className="text-lg font-medium">No playlists found</p>
				<p className="text-sm">
					Create a playlist on Spotify and it will appear here.
				</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-[var(--space-md)] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{playlists.map((playlist) => (
				<PlaylistCard key={playlist.id} playlist={playlist} />
			))}
		</div>
	);
}
