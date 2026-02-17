import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";
import { generateThumbnail } from "@/lib/generate-thumbnail";

const WORKER_URL = process.env.DISC_WORKER_URL;
const WORKER_TOKEN = process.env.WORKER_AUTH_TOKEN;

/** Download an image and upload to R2 via the worker. Returns R2 key on success, null on failure. */
async function persistToR2(
	imageUrl: string,
	r2Key: string,
): Promise<string | null> {
	if (!WORKER_URL || !WORKER_TOKEN) return null;
	try {
		const imgResp = await fetch(imageUrl);
		if (!imgResp.ok) return null;
		const bytes = await imgResp.arrayBuffer();
		const uploadResp = await fetch(
			`${WORKER_URL}/upload?key=${encodeURIComponent(r2Key)}`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${WORKER_TOKEN}`,
					"Content-Type": "image/png",
				},
				body: bytes,
			},
		);
		return uploadResp.ok ? r2Key : null;
	} catch {
		return null;
	}
}

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

	// Persist preview images to R2 (Replicate URLs expire after ~1 hour)
	const r2Keys = await Promise.all(
		(previewUrls ?? []).map((url, i) =>
			persistToR2(url, `styles/${id}/versions/${versionId}/${i}.png`),
		),
	);
	const persistedUrls = r2Keys.filter((k): k is string => k !== null);

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
			JSON.stringify(persistedUrls),
			notes,
		],
	);

	// Update the style's current version and heuristics
	await queryD1(
		`UPDATE styles SET version = ?, heuristics = ?, prompt_template = ?, updated_at = datetime('now') WHERE id = ?`,
		[version, JSON.stringify(heuristics), promptTemplate, id],
	);

	// Fire-and-forget thumbnail regeneration — don't block the response
	generateThumbnail(id).catch((err) =>
		console.error("[Versions] Thumbnail regeneration failed:", err),
	);

	return NextResponse.json({ versionId });
}
