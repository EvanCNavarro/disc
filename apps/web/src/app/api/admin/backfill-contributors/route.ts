import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-route";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface SpotifyTrackItem {
	added_at: string | null;
	added_by: { id: string } | null;
	is_local: boolean;
}

interface SpotifyTracksPage {
	items?: SpotifyTrackItem[];
	next: string | null;
}

/** POST /api/admin/backfill-contributors — backfill contributor data for all playlists */
export const POST = apiRoute(async function POST() {
	const session = await auth();
	if (!session?.spotifyId || session.spotifyId !== "evancnavarro") {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const accessToken = session.accessToken;
	if (!accessToken) {
		return NextResponse.json({ error: "No access token" }, { status: 401 });
	}

	const playlists = await queryD1<{
		id: string;
		spotify_playlist_id: string;
		name: string;
	}>(
		"SELECT id, spotify_playlist_id, name FROM playlists WHERE deleted_at IS NULL",
		[],
	);

	const results: Array<{
		name: string;
		contributorCount: number;
		hasLocal: boolean;
	}> = [];

	for (const playlist of playlists) {
		const fields = "items(added_at,added_by(id),is_local)";
		let allItems: SpotifyTrackItem[] = [];
		let url: string | null =
			`https://api.spotify.com/v1/playlists/${playlist.spotify_playlist_id}/tracks?fields=next,${encodeURIComponent(fields)}&limit=50`;

		while (url) {
			const resp = await fetch(url, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			if (!resp.ok) {
				console.error(
					`[backfill] Failed for "${playlist.name}": ${resp.status}`,
				);
				break;
			}
			const page = (await resp.json()) as SpotifyTracksPage;
			allItems = allItems.concat(page.items ?? []);
			url = page.next;
			// Rate limit: 100ms between pages
			await new Promise((r) => setTimeout(r, 100));
		}

		// Compute contributors
		const contribMap = new Map<
			string,
			{
				id: string;
				trackCount: number;
				firstAddedAt: string | null;
				lastAddedAt: string | null;
			}
		>();
		let hasLocal = false;

		for (const item of allItems) {
			if (item.is_local) hasLocal = true;
			const userId = item.added_by?.id;
			if (!userId) continue;
			const existing = contribMap.get(userId);
			if (existing) {
				existing.trackCount++;
				if (item.added_at) {
					if (!existing.firstAddedAt || item.added_at < existing.firstAddedAt) {
						existing.firstAddedAt = item.added_at;
					}
					if (!existing.lastAddedAt || item.added_at > existing.lastAddedAt) {
						existing.lastAddedAt = item.added_at;
					}
				}
			} else {
				contribMap.set(userId, {
					id: userId,
					trackCount: 1,
					firstAddedAt: item.added_at,
					lastAddedAt: item.added_at,
				});
			}
		}

		const contributors = Array.from(contribMap.values()).sort(
			(a, b) => b.trackCount - a.trackCount,
		);

		await queryD1(
			"UPDATE playlists SET contributor_count = ?, contributors_json = ?, has_local_tracks = ? WHERE id = ?",
			[
				contributors.length,
				JSON.stringify(contributors),
				hasLocal ? 1 : 0,
				playlist.id,
			],
		);

		results.push({
			name: playlist.name,
			contributorCount: contributors.length,
			hasLocal,
		});

		// Rate limit: 200ms between playlists
		await new Promise((r) => setTimeout(r, 200));
	}

	return NextResponse.json({ backfilled: results.length, results });
});
