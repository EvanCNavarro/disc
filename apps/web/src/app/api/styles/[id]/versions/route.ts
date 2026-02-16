import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

/** POST /api/styles/[id]/versions -- saves a version snapshot */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const body = (await request.json()) as {
		version: string;
		heuristics: Record<string, unknown>;
		promptTemplate: string;
		previewUrls: string[];
		notes: string | null;
	};
	const { version, heuristics, promptTemplate, previewUrls, notes } = body;

	if (!version || !heuristics || !promptTemplate) {
		return NextResponse.json(
			{ error: "version, heuristics, and promptTemplate are required" },
			{ status: 400 },
		);
	}

	const versionId = crypto.randomUUID();

	// Save to style_versions
	await queryD1(
		`INSERT INTO style_versions (id, style_id, version, prompt_template, heuristics, preview_urls, notes)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[
			versionId,
			id,
			version,
			promptTemplate,
			JSON.stringify(heuristics),
			JSON.stringify(previewUrls ?? []),
			notes,
		],
	);

	// Update the style's current version and heuristics
	await queryD1(
		`UPDATE styles SET version = ?, heuristics = ?, prompt_template = ?, updated_at = datetime('now') WHERE id = ?`,
		[version, JSON.stringify(heuristics), promptTemplate, id],
	);

	return NextResponse.json({ versionId });
}
