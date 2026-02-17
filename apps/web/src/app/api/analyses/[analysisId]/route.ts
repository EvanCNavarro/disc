import type {
	AnalysisDetail,
	ConvergenceResult,
	DbPlaylistAnalysis,
	TrackExtraction,
} from "@disc/shared";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

/** GET /api/analyses/[analysisId] — full analysis detail for a generation */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ analysisId: string }> },
) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { analysisId } = await params;

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
	const userId = users[0].id;

	const rows = await queryD1<DbPlaylistAnalysis & { style_name: string }>(
		`SELECT
			pa.*,
			COALESCE(s.name, pa.style_id) AS style_name
		 FROM playlist_analyses pa
		 LEFT JOIN styles s ON pa.style_id = s.id
		 WHERE pa.id = ? AND pa.user_id = ?
		 LIMIT 1`,
		[analysisId, userId],
	);

	if (rows.length === 0) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const row = rows[0];

	let analysis: AnalysisDetail;
	try {
		analysis = {
			id: row.id,
			trackSnapshot: JSON.parse(
				row.track_snapshot,
			) as AnalysisDetail["trackSnapshot"],
			trackExtractions: JSON.parse(row.track_extractions) as TrackExtraction[],
			convergenceResult: row.convergence_result
				? (JSON.parse(row.convergence_result) as ConvergenceResult)
				: null,
			chosenObject: row.chosen_object,
			aestheticContext: row.aesthetic_context,
			styleName: row.style_name,
			tracksAdded: row.tracks_added
				? (JSON.parse(row.tracks_added) as string[])
				: null,
			tracksRemoved: row.tracks_removed
				? (JSON.parse(row.tracks_removed) as string[])
				: null,
			outlierCount: row.outlier_count,
			status: row.status,
			triggerType: row.trigger_type,
			createdAt: row.created_at,
		};
	} catch {
		return NextResponse.json(
			{ error: "Corrupted analysis data" },
			{ status: 500 },
		);
	}

	return NextResponse.json({ analysis });
}
