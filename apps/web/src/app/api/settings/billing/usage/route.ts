import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-route";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface ChartRow {
	date: string;
	openai_usd: number;
	replicate_usd: number;
	total_usd: number;
}

interface EventRow {
	id: string;
	action_type: string;
	model: string;
	tokens_in: number | null;
	tokens_out: number | null;
	duration_ms: number | null;
	cost_usd: number;
	trigger_source: string;
	status: string;
	error_message: string | null;
	playlist_name: string | null;
	style_name: string | null;
	created_at: string;
}

function getDateRange(range: string): { start: string; end: string } {
	const now = new Date();
	const end = new Date(now);
	end.setDate(end.getDate() + 1);

	let start: Date;
	switch (range) {
		case "day":
			start = new Date(now);
			start.setHours(0, 0, 0, 0);
			break;
		case "week":
			start = new Date(now);
			start.setDate(start.getDate() - 7);
			break;
		case "month":
			start = new Date(now);
			start.setMonth(start.getMonth() - 1);
			break;
		case "quarter":
			start = new Date(now);
			start.setMonth(start.getMonth() - 3);
			break;
		case "year":
			start = new Date(now);
			start.setFullYear(start.getFullYear() - 1);
			break;
		case "lifetime":
			start = new Date("2024-01-01");
			break;
		default:
			start = new Date(now);
			start.setMonth(start.getMonth() - 1);
	}

	return {
		start: start.toISOString().slice(0, 10),
		end: end.toISOString().slice(0, 10),
	};
}

export const GET = apiRoute(async function GET(request) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}
	const userId = users[0].id;

	const url = new URL(request.url);
	const range = url.searchParams.get("range") ?? "month";
	const actionFilter = url.searchParams.get("action") ?? "";
	const statusFilter = url.searchParams.get("status") ?? "";
	const search = url.searchParams.get("search") ?? "";
	const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
	const limit = Math.min(
		100,
		Math.max(1, Number(url.searchParams.get("limit") ?? "50")),
	);
	const offset = (page - 1) * limit;

	const { start, end } = getDateRange(range);

	// Build WHERE clause fragments
	let whereExtra = "";
	const baseParams: unknown[] = [userId, start, end];
	const filterParams: unknown[] = [];

	if (actionFilter) {
		whereExtra += " AND ue.action_type = ?";
		filterParams.push(actionFilter);
	}
	if (statusFilter) {
		whereExtra += " AND ue.status = ?";
		filterParams.push(statusFilter);
	}
	if (search) {
		whereExtra += " AND (ue.model LIKE ? OR ue.action_type LIKE ?)";
		filterParams.push(`%${search}%`, `%${search}%`);
	}

	const whereClause = `ue.user_id = ? AND ue.created_at >= ? AND ue.created_at < ?${whereExtra}`;
	const allParams = [...baseParams, ...filterParams];

	// 1. Chart data (aggregated by day) — no filters except range
	const chartData = await queryD1<ChartRow>(
		`SELECT
       date(ue.created_at) as date,
       SUM(CASE WHEN ue.action_type LIKE 'llm_%' THEN ue.cost_usd ELSE 0 END) as openai_usd,
       SUM(CASE WHEN ue.action_type NOT LIKE 'llm_%' THEN ue.cost_usd ELSE 0 END) as replicate_usd,
       SUM(ue.cost_usd) as total_usd
     FROM usage_events ue
     WHERE ue.user_id = ? AND ue.created_at >= ? AND ue.created_at < ?
     GROUP BY date(ue.created_at)
     ORDER BY date ASC`,
		[userId, start, end],
	);

	// 2. Summary stats
	const summaryRows = await queryD1<{
		total_cost: number;
		event_count: number;
	}>(
		`SELECT
       COALESCE(SUM(ue.cost_usd), 0) as total_cost,
       COUNT(*) as event_count
     FROM usage_events ue
     WHERE ${whereClause}`,
		allParams,
	);

	const topModelRows = await queryD1<{ model: string }>(
		`SELECT ue.model, COUNT(*) as cnt
     FROM usage_events ue
     WHERE ${whereClause}
     GROUP BY ue.model ORDER BY cnt DESC LIMIT 1`,
		allParams,
	);

	const topActionRows = await queryD1<{ action_type: string }>(
		`SELECT ue.action_type, COUNT(*) as cnt
     FROM usage_events ue
     WHERE ${whereClause}
     GROUP BY ue.action_type ORDER BY cnt DESC LIMIT 1`,
		allParams,
	);

	const totalCost = summaryRows[0]?.total_cost ?? 0;
	const eventCount = summaryRows[0]?.event_count ?? 0;

	const summary = {
		totalCost,
		eventCount,
		avgCostPerEvent: eventCount > 0 ? totalCost / eventCount : 0,
		topModel: topModelRows[0]?.model ?? "—",
		topAction: topActionRows[0]?.action_type ?? "—",
	};

	// 3. Total count for pagination
	const countRows = await queryD1<{ total: number }>(
		`SELECT COUNT(*) as total FROM usage_events ue WHERE ${whereClause}`,
		allParams,
	);
	const total = countRows[0]?.total ?? 0;

	// 4. Paginated events with JOINs
	const events = await queryD1<EventRow>(
		`SELECT
       ue.id,
       ue.action_type,
       ue.model,
       ue.tokens_in,
       ue.tokens_out,
       ue.duration_ms,
       ue.cost_usd,
       ue.trigger_source,
       ue.status,
       ue.error_message,
       p.name as playlist_name,
       s.name as style_name,
       ue.created_at
     FROM usage_events ue
     LEFT JOIN playlists p ON ue.playlist_id = p.id
     LEFT JOIN styles s ON ue.style_id = s.id
     WHERE ${whereClause}
     ORDER BY ue.created_at DESC
     LIMIT ? OFFSET ?`,
		[...allParams, limit, offset],
	);

	return NextResponse.json({
		chartData,
		summary,
		events: events.map((e) => ({
			id: e.id,
			actionType: e.action_type,
			model: e.model,
			tokensIn: e.tokens_in,
			tokensOut: e.tokens_out,
			durationMs: e.duration_ms,
			costUsd: e.cost_usd,
			triggerSource: e.trigger_source,
			status: e.status,
			errorMessage: e.error_message,
			playlistName: e.playlist_name,
			styleName: e.style_name,
			createdAt: e.created_at,
		})),
		pagination: { page, limit, total },
	});
});
