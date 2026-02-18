import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface GenerationRow {
	id: string;
	playlist_id: string;
	playlist_name: string;
	style_id: string;
	style_name: string;
	symbolic_object: string;
	prompt: string;
	r2_key: string | null;
	status: string;
	error_message: string | null;
	duration_ms: number | null;
	cost_usd: number | null;
	trigger_type: string;
	created_at: string;
	model_name: string | null;
	llm_input_tokens: number | null;
	llm_output_tokens: number | null;
	image_model: string | null;
	cost_breakdown: string | null;
}

/** GET /api/generations — list recent generations for the authenticated user */
export async function GET() {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ generations: [] });
	}

	const generations = await queryD1<GenerationRow>(
		`SELECT
			g.id,
			g.playlist_id,
			p.name AS playlist_name,
			g.style_id,
			COALESCE(s.name, g.style_id) AS style_name,
			g.symbolic_object,
			g.prompt,
			g.r2_key,
			g.status,
			g.error_message,
			g.duration_ms,
			g.cost_usd,
			g.trigger_type,
			g.created_at,
			g.model_name,
			g.llm_input_tokens,
			g.llm_output_tokens,
			g.image_model,
			g.cost_breakdown
		 FROM generations g
		 JOIN playlists p ON g.playlist_id = p.id
		 LEFT JOIN styles s ON g.style_id = s.id
		 WHERE g.user_id = ? AND g.deleted_at IS NULL
		 ORDER BY g.created_at DESC
		 LIMIT 100`,
		[users[0].id],
	);

	return NextResponse.json({ generations });
}
