import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-route";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

const WORKER_URL = process.env.DISC_WORKER_URL;
const WORKER_TOKEN = process.env.WORKER_AUTH_TOKEN;

interface GenerationRow {
	id: string;
	r2_key: string;
}

/** POST /api/admin/backfill-phash — compute phash for all existing generations */
export const POST = apiRoute(async function POST() {
	const session = await auth();
	if (!session?.spotifyId || session.spotifyId !== "evancnavarro") {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	if (!WORKER_URL || !WORKER_TOKEN) {
		return NextResponse.json(
			{ error: "Missing DISC_WORKER_URL or WORKER_AUTH_TOKEN" },
			{ status: 500 },
		);
	}

	const generations = await queryD1<GenerationRow>(
		"SELECT id, r2_key FROM generations WHERE status = 'completed' AND cover_phash IS NULL AND deleted_at IS NULL AND r2_key IS NOT NULL",
		[],
	);

	const results: Array<{
		id: string;
		r2_key: string;
		status: "ok" | "error";
		error?: string;
	}> = [];

	for (const gen of generations) {
		try {
			// Fetch image from R2 via worker
			const resp = await fetch(
				`${WORKER_URL}/image?key=${encodeURIComponent(gen.r2_key)}`,
				{
					headers: { Authorization: `Bearer ${WORKER_TOKEN}` },
				},
			);

			if (!resp.ok) {
				results.push({
					id: gen.id,
					r2_key: gen.r2_key,
					status: "error",
					error: `R2 fetch failed: ${resp.status}`,
				});
				continue;
			}

			const imageBytes = new Uint8Array(await resp.arrayBuffer());

			// Compute phash via worker (photon only works in Workers runtime)
			const hashResp = await fetch(`${WORKER_URL}/hash`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${WORKER_TOKEN}`,
					"Content-Type": "application/octet-stream",
				},
				body: imageBytes,
			});

			if (!hashResp.ok) {
				results.push({
					id: gen.id,
					r2_key: gen.r2_key,
					status: "error",
					error: `Hash computation failed: ${hashResp.status}`,
				});
				continue;
			}

			const { phash } = (await hashResp.json()) as { phash: string };

			await queryD1("UPDATE generations SET cover_phash = ? WHERE id = ?", [
				phash,
				gen.id,
			]);

			results.push({ id: gen.id, r2_key: gen.r2_key, status: "ok" });
		} catch (err) {
			results.push({
				id: gen.id,
				r2_key: gen.r2_key,
				status: "error",
				error: err instanceof Error ? err.message : String(err),
			});
		}

		// Rate limit: 200ms between generations
		await new Promise((r) => setTimeout(r, 200));
	}

	// Seed last_seen_cover_url for playlists with completed generations
	const playlistsToSeed = await queryD1<{
		id: string;
		spotify_cover_url: string | null;
	}>(
		`SELECT DISTINCT p.id, p.spotify_cover_url
		 FROM playlists p
		 JOIN generations g ON g.playlist_id = p.id
		 WHERE g.status = 'completed' AND g.deleted_at IS NULL
		   AND p.last_seen_cover_url IS NULL AND p.deleted_at IS NULL`,
		[],
	);

	let seeded = 0;
	for (const p of playlistsToSeed) {
		if (p.spotify_cover_url) {
			await queryD1(
				"UPDATE playlists SET last_seen_cover_url = ?, cover_verified_at = datetime('now') WHERE id = ?",
				[p.spotify_cover_url, p.id],
			);
			seeded++;
		}
	}

	const ok = results.filter((r) => r.status === "ok").length;
	const errors = results.filter((r) => r.status === "error");

	return NextResponse.json({
		total: generations.length,
		backfilled: ok,
		failed: errors.length,
		errors: errors.slice(0, 20),
		urlsSeeded: seeded,
	});
});
