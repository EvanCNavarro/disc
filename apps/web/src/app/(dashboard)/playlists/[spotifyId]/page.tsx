import type {
	ConvergenceResult,
	DbPlaylist,
	DbPlaylistAnalysis,
	TrackExtraction,
} from "@disc/shared";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowLeft02Icon,
	SpotifyIcon,
} from "@hugeicons-pro/core-stroke-rounded";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlaylistDetailClient } from "@/components/playlist-detail/PlaylistDetailClient";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";
import { formatTimestamp } from "@/lib/format";

interface PlaylistDetailData {
	playlist: DbPlaylist & { latest_r2_key: string | null };
	analysis: {
		id: string;
		chosen_object: string;
		aesthetic_context: string;
		style_name: string;
		track_snapshot: Array<{
			name: string;
			artist: string;
			album: string;
			albumImageUrl?: string | null;
			durationMs?: number;
		}>;
		track_extractions: TrackExtraction[];
		convergence_result: ConvergenceResult | null;
		tracks_added: string[] | null;
		tracks_removed: string[] | null;
		outlier_count: number;
		trigger_type: string;
		created_at: string;
	} | null;
	generations: Array<{
		id: string;
		r2_key: string | null;
		symbolic_object: string;
		style_name: string;
		prompt: string;
		trigger_type: string;
		status: string;
		duration_ms: number | null;
		cost_usd: number | null;
		cost_breakdown: string | null;
		analysis_id: string | null;
		created_at: string;
	}>;
	claimedObjects: Array<{
		id: string;
		object_name: string;
		aesthetic_context: string | null;
		created_at: string;
		superseded_at: string | null;
	}>;
}

async function fetchPlaylistDetail(
	spotifyPlaylistId: string,
	userId: string,
): Promise<PlaylistDetailData | null> {
	const playlists = await queryD1<
		DbPlaylist & { latest_r2_key: string | null }
	>(
		`SELECT p.*,
			(SELECT g.r2_key FROM generations g
			 WHERE g.playlist_id = p.id AND g.status = 'completed' AND g.deleted_at IS NULL
			 ORDER BY g.created_at DESC LIMIT 1) AS latest_r2_key
		 FROM playlists p
		 WHERE p.spotify_playlist_id = ? AND p.user_id = ? AND p.deleted_at IS NULL`,
		[spotifyPlaylistId, userId],
	);

	if (playlists.length === 0) return null;

	const playlist = playlists[0];
	const playlistId = playlist.id;

	// Parallel fetch: analysis, generations, and claimed objects are independent
	const [analysisRows, generations, claimedObjects] = await Promise.all([
		queryD1<DbPlaylistAnalysis & { style_name: string }>(
			`SELECT pa.*,
				COALESCE(s.name, pa.style_id) AS style_name
			 FROM playlist_analyses pa
			 LEFT JOIN styles s ON pa.style_id = s.id
			 WHERE pa.playlist_id = ? AND pa.user_id = ?
			 ORDER BY pa.created_at DESC
			 LIMIT 1`,
			[playlistId, userId],
		),
		queryD1<PlaylistDetailData["generations"][number]>(
			`SELECT
				g.id,
				g.r2_key,
				g.symbolic_object,
				COALESCE(s.name, g.style_id) AS style_name,
				g.prompt,
				g.trigger_type,
				g.status,
				g.duration_ms,
				g.cost_usd,
				g.cost_breakdown,
				g.analysis_id,
				g.created_at
			 FROM generations g
			 LEFT JOIN styles s ON g.style_id = s.id
			 WHERE g.playlist_id = ? AND g.user_id = ?
			 ORDER BY g.created_at DESC`,
			[playlistId, userId],
		),
		queryD1<PlaylistDetailData["claimedObjects"][number]>(
			`SELECT id, object_name, aesthetic_context, created_at, superseded_at
			 FROM claimed_objects
			 WHERE playlist_id = ? AND user_id = ?
			 ORDER BY created_at DESC`,
			[playlistId, userId],
		),
	]);

	let analysis: PlaylistDetailData["analysis"] = null;
	if (analysisRows.length > 0) {
		const row = analysisRows[0];
		try {
			analysis = {
				id: row.id,
				chosen_object: row.chosen_object,
				aesthetic_context: row.aesthetic_context,
				style_name: row.style_name,
				track_snapshot: JSON.parse(row.track_snapshot),
				track_extractions: JSON.parse(row.track_extractions),
				convergence_result: row.convergence_result
					? JSON.parse(row.convergence_result)
					: null,
				tracks_added: row.tracks_added ? JSON.parse(row.tracks_added) : null,
				tracks_removed: row.tracks_removed
					? JSON.parse(row.tracks_removed)
					: null,
				outlier_count: row.outlier_count,
				trigger_type: row.trigger_type,
				created_at: row.created_at,
			};
		} catch {
			// Corrupted analysis — treat as null
		}
	}

	return { playlist, analysis, generations, claimedObjects };
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ spotifyId: string }>;
}): Promise<Metadata> {
	const session = await auth();
	if (!session?.spotifyId) return { title: "Playlist" };

	const { spotifyId } = await params;
	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) return { title: "Playlist" };

	const rows = await queryD1<{ name: string }>(
		"SELECT name FROM playlists WHERE spotify_playlist_id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
		[spotifyId, users[0].id],
	);

	return { title: rows[0]?.name ?? "Playlist" };
}

export default async function PlaylistDetailPage({
	params,
}: {
	params: Promise<{ spotifyId: string }>;
}) {
	const session = await auth();
	if (!session?.spotifyId) redirect("/login");

	const { spotifyId } = await params;

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) redirect("/login");

	const data = await fetchPlaylistDetail(spotifyId, users[0].id);
	if (!data) notFound();

	const { playlist, analysis, generations, claimedObjects } = data;
	const completedGenerations = generations.filter(
		(g) => g.status === "completed" && g.r2_key,
	);
	const isCollaborative = playlist.contributor_count > 1;

	return (
		<div className="flex flex-col gap-[var(--space-xl)]">
			{/* Back nav */}
			<Link
				href="/playlists"
				className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors w-fit"
			>
				<HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
				Back to playlists
			</Link>

			{/* Collaborative banner */}
			{isCollaborative && (
				<output className="flex items-center gap-[var(--space-sm)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-lg)] py-[var(--space-md)]">
					<span className="text-sm font-medium text-[var(--color-text-secondary)]">
						Collaborative Playlist
					</span>
					<span className="text-sm text-[var(--color-text-muted)]">
						&mdash; Generation is disabled for playlists with multiple
						contributors ({playlist.contributor_count} contributors detected).
					</span>
				</output>
			)}

			{/* Header */}
			<div className="flex flex-col gap-[var(--space-lg)] sm:flex-row sm:items-start sm:gap-[var(--space-xl)]">
				{/* Cover image */}
				<div className="flex flex-col gap-[var(--space-xs)]">
					<div className="w-32 h-32 sm:w-40 sm:h-40 shrink-0 rounded-[var(--radius-lg)] overflow-hidden bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
						{playlist.latest_r2_key ? (
							// biome-ignore lint/performance/noImgElement: auth proxy incompatible with next/image
							<img
								src={`/api/images?key=${encodeURIComponent(playlist.latest_r2_key)}`}
								alt={`Generated cover for ${playlist.name}`}
								className="w-full h-full object-cover"
							/>
						) : playlist.spotify_cover_url ? (
							// biome-ignore lint/performance/noImgElement: external Spotify CDN URL
							<img
								src={playlist.spotify_cover_url}
								alt={`Spotify cover for ${playlist.name}`}
								className="w-full h-full object-cover"
							/>
						) : (
							<div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)]">
								<span className="text-3xl">♪</span>
							</div>
						)}
					</div>
					{playlist.latest_r2_key ? (
						<span className="text-xs text-[var(--color-accent)]">
							Generated by DISC
						</span>
					) : playlist.spotify_cover_url ? (
						<span className="text-xs text-[var(--color-text-muted)]">
							Spotify cover
						</span>
					) : null}
				</div>

				{/* Info */}
				<div className="flex flex-col gap-[var(--space-sm)] min-w-0">
					<div className="flex items-center gap-[var(--space-sm)]">
						<h1 className="text-2xl font-bold truncate">{playlist.name}</h1>
						{isCollaborative && (
							<span className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">
								Collaborative
							</span>
						)}
					</div>
					{playlist.description && (
						<p className="text-sm text-[var(--color-text-secondary)] line-clamp-2">
							{playlist.description}
						</p>
					)}
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-text-muted)]">
						<span>
							{playlist.track_count}{" "}
							{playlist.track_count === 1 ? "track" : "tracks"}
						</span>
						<span>
							{completedGenerations.length}{" "}
							{completedGenerations.length === 1 ? "generation" : "generations"}
						</span>
						{playlist.last_generated_at && (
							<span>
								Last generated {formatTimestamp(playlist.last_generated_at)}
							</span>
						)}
					</div>
					<a
						href={`https://open.spotify.com/playlist/${playlist.spotify_playlist_id}`}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline w-fit mt-1"
					>
						<HugeiconsIcon icon={SpotifyIcon} size={16} />
						Open in Spotify
					</a>
				</div>
			</div>

			{/* Client-side interactive sections */}
			<PlaylistDetailClient
				playlist={playlist}
				analysis={analysis}
				generations={generations}
				claimedObjects={claimedObjects}
				isCollaborative={isCollaborative}
			/>
		</div>
	);
}
