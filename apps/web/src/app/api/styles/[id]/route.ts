import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

/** PATCH /api/styles/[id] -- updates style (publish, save heuristics) */
export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const body = (await request.json()) as {
		status?: "active" | "draft" | "archived";
		heuristics?: Record<string, unknown>;
		promptTemplate?: string;
	};

	const updates: string[] = [];
	const values: unknown[] = [];

	if (body.status) {
		updates.push("status = ?");
		values.push(body.status);
	}
	if (body.heuristics) {
		updates.push("heuristics = ?");
		values.push(JSON.stringify(body.heuristics));
	}
	if (body.promptTemplate) {
		updates.push("prompt_template = ?");
		values.push(body.promptTemplate);
	}

	if (updates.length === 0) {
		return NextResponse.json({ error: "No fields to update" }, { status: 400 });
	}

	updates.push("updated_at = datetime('now')");
	values.push(id);

	await queryD1(`UPDATE styles SET ${updates.join(", ")} WHERE id = ?`, values);

	return NextResponse.json({ success: true });
}
