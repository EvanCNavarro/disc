import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

const MAX_BATCH_SIZE = 50;

interface PlaylistConfig {
	playlistId: string;
	lightExtractionText?: string;
}

/** POST /api/playlists/generate-batch — trigger generation for multiple playlists */
export async function POST(request: Request) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as {
		playlistIds?: string[];
		playlistConfigs?: PlaylistConfig[];
		styleId?: string;
	};

	// Support both legacy (playlistIds) and new (playlistConfigs) format
	const configs: PlaylistConfig[] = body.playlistConfigs
		? body.playlistConfigs
		: (body.playlistIds ?? []).map((id) => ({ playlistId: id }));

	if (configs.length === 0) {
		return NextResponse.json(
			{ error: "playlistIds or playlistConfigs is required" },
			{ status: 400 },
		);
	}

	if (configs.length > MAX_BATCH_SIZE) {
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
	const ids = configs.map((c) => c.playlistId);
	const placeholders = ids.map(() => "?").join(",");
	const playlists = await queryD1<{
		id: string;
		name: string;
		is_collaborative: number;
		owner_spotify_id: string | null;
	}>(
		`SELECT id, name, is_collaborative, owner_spotify_id FROM playlists WHERE id IN (${placeholders}) AND user_id = ?`,
		[...ids, userId],
	);

	if (playlists.length !== ids.length) {
		return NextResponse.json(
			{ error: "Some playlists not found or not owned by user" },
			{ status: 400 },
		);
	}

	// Filter out collaborative or non-owned playlists
	const eligibleSet = new Set<string>();
	for (const p of playlists) {
		if (p.is_collaborative) {
			console.warn(
				`[generate-batch] Skipping collaborative playlist "${p.name}" (${p.id})`,
			);
			continue;
		}
		if (p.owner_spotify_id && p.owner_spotify_id !== session.spotifyId) {
			console.warn(
				`[generate-batch] Skipping non-owned playlist "${p.name}" (${p.id}), owner: ${p.owner_spotify_id}`,
			);
			continue;
		}
		eligibleSet.add(p.id);
	}

	const eligibleConfigs = configs.filter((c) => eligibleSet.has(c.playlistId));
	const skipped = configs.length - eligibleConfigs.length;

	if (eligibleConfigs.length === 0) {
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

	// Dispatch per-playlist to worker. Each playlist may have different
	// light_extraction_text, so we make individual calls. The worker marks
	// playlists as "queued" immediately in setupTrigger, so timeout is a
	// success case (pipeline keeps running).
	let succeeded = 0;
	let failed = 0;

	for (const config of eligibleConfigs) {
		try {
			const response = await fetch(`${workerUrl}/trigger`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${workerToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					playlist_id: config.playlistId,
					style_id: body.styleId,
					light_extraction_text: config.lightExtractionText,
					trigger_type: "manual",
				}),
				signal: AbortSignal.timeout(15_000),
			});

			if (response.ok) {
				succeeded++;
			} else {
				// Timeout is a success case — worker already queued the playlist
				failed++;
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === "TimeoutError") {
				// Timeout = worker is processing (playlist already queued)
				succeeded++;
			} else {
				console.error(
					`[generate-batch] Failed to trigger playlist ${config.playlistId}:`,
					error,
				);
				failed++;
			}
		}
	}

	return NextResponse.json({
		total: configs.length,
		succeeded,
		skipped,
		failed,
	});
}
