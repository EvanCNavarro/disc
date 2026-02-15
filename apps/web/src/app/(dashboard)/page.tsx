import type { SpotifyPlaylist } from "@disc/shared";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { PlaylistGrid } from "@/components/PlaylistGrid";
import { auth } from "@/lib/auth";
import { fetchUserPlaylists } from "@/lib/spotify";
import { syncPlaylistsToD1 } from "@/lib/sync";

export default async function DashboardPage() {
	const session = await auth();
	if (!session?.accessToken || !session.spotifyId) redirect("/login");
	if (session.error === "RefreshTokenError") redirect("/login");

	let playlists: SpotifyPlaylist[] = [];
	let fetchError = false;

	try {
		playlists = await fetchUserPlaylists(session.accessToken);
	} catch (error) {
		console.error("Failed to fetch playlists:", error);
		fetchError = true;
	}

	// Sync to D1 after response is sent — does not block rendering
	const spotifyId = session.spotifyId;
	if (playlists.length > 0 && spotifyId) {
		after(() => syncPlaylistsToD1(spotifyId, playlists));
	}

	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Your Playlists</h1>
				<p className="text-sm text-[var(--color-text-muted)]">
					{playlists.length} playlist{playlists.length !== 1 && "s"}
				</p>
			</div>

			{fetchError && (
				<div
					role="alert"
					className="rounded-[var(--radius-md)] border border-[var(--color-destructive)] bg-red-50 px-[var(--space-md)] py-[var(--space-sm)] text-sm text-[var(--color-destructive)]"
				>
					Failed to load playlists. Try refreshing the page.
				</div>
			)}

			<PlaylistGrid playlists={playlists} />
		</div>
	);
}
