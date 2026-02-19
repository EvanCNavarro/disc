import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-route";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

/** DELETE /api/styles/[id] — permanently deletes a user-created style */
export const DELETE = apiRoute(async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
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

	const { id } = await params;

	const styles = await queryD1<{ id: string }>(
		"SELECT id FROM styles WHERE id = ?",
		[id],
	);
	if (styles.length === 0) {
		return NextResponse.json({ error: "Style not found" }, { status: 404 });
	}

	// Cascade: delete version history, then the style itself
	await queryD1("DELETE FROM style_versions WHERE style_id = ?", [id]);
	await queryD1("DELETE FROM styles WHERE id = ?", [id]);

	// Bust the RSC cache so /styles shows fresh data immediately
	revalidatePath("/styles");
	revalidatePath("/settings");

	return NextResponse.json({ success: true });
});

/** PATCH /api/styles/[id] -- updates style (publish, save heuristics) */
export const PATCH = apiRoute(async function PATCH(
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
});
