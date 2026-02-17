import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

const MAX_BATCH_SIZE = 50;

/** POST /api/playlists/generate-batch — trigger generation for multiple playlists */
export async function POST(request: Request) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as {
		playlistIds?: string[];
		styleId?: string;
	};

	if (!body.playlistIds || body.playlistIds.length === 0) {
		return NextResponse.json(
			{ error: "playlistIds is required" },
			{ status: 400 },
		);
	}

	if (body.playlistIds.length > MAX_BATCH_SIZE) {
		return NextResponse.json(
			{ error: `Max ${MAX_BATCH_SIZE} playlists per batch` },
			{ status: 400 },
		);
	}

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}
	const userId = users[0].id;

	// Validate all playlists belong to this user
	const placeholders = body.playlistIds.map(() => "?").join(",");
	const playlists = await queryD1<{
		id: string;
		name: string;
		is_collaborative: number;
		owner_spotify_id: string | null;
	}>(
		`SELECT id, name, is_collaborative, owner_spotify_id FROM playlists WHERE id IN (${placeholders}) AND user_id = ?`,
		[...body.playlistIds, userId],
	);

	if (playlists.length !== body.playlistIds.length) {
		return NextResponse.json(
			{ error: "Some playlists not found or not owned by user" },
			{ status: 400 },
		);
	}

	// Filter out collaborative or non-owned playlists (Spotify API rejects cover uploads for these)
	const eligible = playlists.filter((p) => {
		if (p.is_collaborative) {
			console.warn(
				`[generate-batch] Skipping collaborative playlist "${p.name}" (${p.id})`,
			);
			return false;
		}
		if (p.owner_spotify_id && p.owner_spotify_id !== session.spotifyId) {
			console.warn(
				`[generate-batch] Skipping non-owned playlist "${p.name}" (${p.id}), owner: ${p.owner_spotify_id}`,
			);
			return false;
		}
		return true;
	});

	if (eligible.length === 0) {
		return NextResponse.json(
			{
				error:
					"No eligible playlists — collaborative and non-owned playlists cannot receive generated covers",
			},
			{ status: 400 },
		);
	}

	const workerUrl = process.env.DISC_WORKER_URL;
	const workerToken = process.env.WORKER_AUTH_TOKEN;

	if (!workerUrl || !workerToken) {
		return NextResponse.json(
			{ error: "Worker not configured" },
			{ status: 500 },
		);
	}

	const eligibleIds = eligible.map((p) => p.id);
	const skipped = playlists.length - eligible.length;

	// Send one trigger with eligible playlist IDs — worker marks them as "queued"
	// immediately, then processes them sequentially. Use a 15s timeout since
	// setupTrigger (queuing) is fast but the full pipeline takes minutes.
	try {
		const response = await fetch(`${workerUrl}/trigger`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${workerToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				playlist_ids: eligibleIds,
				style_id: body.styleId,
				trigger_type: "manual",
			}),
			signal: AbortSignal.timeout(15_000),
		});

		if (response.ok) {
			return NextResponse.json({
				total: playlists.length,
				succeeded: eligible.length,
				skipped,
				failed: 0,
			});
		}

		const err = await response.text();
		return NextResponse.json(
			{ error: `Worker trigger failed: ${err}` },
			{ status: 502 },
		);
	} catch (error) {
		// TimeoutError = worker is running pipelines (playlists already "queued")
		if (error instanceof DOMException && error.name === "TimeoutError") {
			return NextResponse.json({
				total: playlists.length,
				succeeded: eligible.length,
				skipped,
				failed: 0,
			});
		}
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Trigger failed" },
			{ status: 502 },
		);
	}
}
