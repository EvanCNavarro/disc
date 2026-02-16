import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

const MAX_NOTES_LENGTH = 500;

/** POST /api/playlists/[spotifyPlaylistId]/regenerate — trigger regeneration for a single playlist */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ spotifyPlaylistId: string }> },
) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { spotifyPlaylistId } = await params;

	const body = (await request.json()) as {
		mode?: "rerun" | "revision";
		notes?: string;
		styleId?: string;
	};

	const mode = body.mode ?? "rerun";

	if (mode === "revision" && !body.notes) {
		return NextResponse.json(
			{ error: "Revision notes required for revision mode" },
			{ status: 400 },
		);
	}

	if (body.notes && body.notes.length > MAX_NOTES_LENGTH) {
		return NextResponse.json(
			{ error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer` },
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

	// Resolve Spotify playlist ID → D1 internal ID
	const playlists = await queryD1<{ id: string; name: string }>(
		"SELECT id, name FROM playlists WHERE spotify_playlist_id = ? AND user_id = ?",
		[spotifyPlaylistId, userId],
	);
	if (playlists.length === 0) {
		return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
	}

	const playlist = playlists[0];

	const workerUrl = process.env.DISC_WORKER_URL;
	const workerToken = process.env.WORKER_AUTH_TOKEN;

	if (!workerUrl || !workerToken) {
		return NextResponse.json(
			{ error: "Worker not configured" },
			{ status: 500 },
		);
	}

	// Worker now runs pipeline synchronously — use a 15s timeout since
	// setupTrigger marks the playlist as "processing" almost immediately.
	// If the worker is still running the pipeline, the timeout is fine.
	try {
		const response = await fetch(`${workerUrl}/trigger`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${workerToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				playlist_id: playlist.id,
				style_id: body.styleId,
				revision_notes: mode === "revision" ? body.notes : undefined,
				trigger_type: "manual",
			}),
			signal: AbortSignal.timeout(15_000),
		});

		if (!response.ok) {
			const err = await response.text();
			return NextResponse.json(
				{ error: `Worker trigger failed: ${err}` },
				{ status: 502 },
			);
		}

		const result = await response.json();
		return NextResponse.json({
			success: true,
			playlistId: playlist.id,
			playlistName: playlist.name,
			mode,
			...result,
		});
	} catch (error) {
		// TimeoutError = worker is still running the pipeline (playlist
		// is already "processing"). This is a success case.
		if (error instanceof DOMException && error.name === "TimeoutError") {
			return NextResponse.json({
				success: true,
				playlistId: playlist.id,
				playlistName: playlist.name,
				mode,
				accepted: true,
			});
		}
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Trigger failed" },
			{ status: 502 },
		);
	}
}
