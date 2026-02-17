import type { StyleHeuristics } from "@disc/shared";
import { reconstructPrompt } from "@disc/shared";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";
import { generateThumbnail } from "@/lib/generate-thumbnail";

interface ImageInput {
	base64: string;
	/** MIME type, e.g. "image/png", "image/jpeg" */
	type: string;
}

const SYSTEM_PROMPT = `You are an expert at analyzing visual aesthetics and extracting structured style parameters from reference images.

Analyze the provided reference images and extract style properties that would recreate this aesthetic in an AI image generation system.

Return a JSON object with these exact fields:
{
  "renderType": one of "3D render", "photograph", "illustration", "macro photograph",
  "material": string describing the primary material/surface (e.g., "volcanic basalt", "handmade clay", "glass"),
  "textures": array of texture descriptors (e.g., ["granular", "faceted", "smooth"]),
  "lightingDirection": string (e.g., "rim light from behind", "golden hour backlight", "overhead spotlight"),
  "lightingQuality": number 0-1 where 0=harsh and 1=very soft,
  "lightColor": string (e.g., "ember-orange", "warm amber", "cool blue"),
  "background": string describing the scene background (e.g., "deep void", "autumn diorama"),
  "depthOfField": number 0-1 where 0=deep sharp focus and 1=extreme shallow bokeh,
  "framing": string (e.g., "centered three-quarter", "centered straight-on", "environmental wide"),
  "tonalRange": number 0-1 where 0=very dark and 1=very bright,
  "colorPalette": string describing the overall color scheme,
  "colorRatio": [number, number, number] representing [primary%, secondary%, accent%] summing to 100,
  "moods": array of mood descriptors (e.g., ["cinematic", "contemplative", "moody"]),
  "constraints": array of constraints (e.g., ["no text", "no words", "no letters"])
}

Always include "no text", "no words", "no letters" in constraints.
Return ONLY valid JSON, no markdown, no explanation.`;

/** POST /api/styles/analyze — analyze reference images via Claude and create a draft style */
export async function POST(request: Request) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json();
	const { name, images, notes } = body as {
		name: string;
		images: ImageInput[];
		notes: string;
	};

	if (!name?.trim() || !images?.length) {
		return NextResponse.json(
			{ error: "Name and at least one image required" },
			{ status: 400 },
		);
	}

	// Resolve user ID from Spotify ID
	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return NextResponse.json({ error: "User not found" }, { status: 404 });
	}

	const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
	if (!ANTHROPIC_API_KEY) {
		return NextResponse.json(
			{ error: "Missing Anthropic API key" },
			{ status: 500 },
		);
	}

	// Build multimodal content blocks for Claude
	const userContent: Array<Record<string, unknown>> = [];

	for (const img of images) {
		userContent.push({
			type: "image",
			source: {
				type: "base64",
				media_type: img.type,
				data: img.base64,
			},
		});
	}

	if (notes?.trim()) {
		userContent.push({
			type: "text",
			text: `Additional context from the creator: ${notes}`,
		});
	}

	userContent.push({
		type: "text",
		text: "Analyze these reference images and return the style heuristics as JSON.",
	});

	const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"x-api-key": ANTHROPIC_API_KEY,
			"anthropic-version": "2023-06-01",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			model: "claude-sonnet-4-5-20250929",
			max_tokens: 1024,
			system: SYSTEM_PROMPT,
			messages: [{ role: "user", content: userContent }],
		}),
	});

	if (!claudeResponse.ok) {
		const errorText = await claudeResponse.text();
		console.error("Claude API error:", errorText);
		return NextResponse.json(
			{ error: "Style analysis failed" },
			{ status: 502 },
		);
	}

	const claudeData = (await claudeResponse.json()) as {
		content?: Array<{ type: string; text?: string }>;
	};
	const textBlock = claudeData.content?.find((b) => b.type === "text");
	if (!textBlock?.text) {
		return NextResponse.json(
			{ error: "No analysis response" },
			{ status: 502 },
		);
	}

	let heuristics: StyleHeuristics;
	try {
		heuristics = JSON.parse(textBlock.text) as StyleHeuristics;
	} catch {
		return NextResponse.json(
			{ error: "Failed to parse analysis" },
			{ status: 502 },
		);
	}

	const promptTemplate = reconstructPrompt(heuristics);

	// Create style in D1
	const styleId = crypto.randomUUID();
	const heuristicsJson = JSON.stringify(heuristics);

	await queryD1(
		`INSERT INTO styles (id, user_id, name, description, replicate_model, lora_url, lora_scale, prompt_template, negative_prompt, guidance_scale, num_inference_steps, seed, is_default, status, heuristics, version, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, NULL, 1.0, ?, NULL, 3.5, 28, NULL, 0, 'draft', ?, '0.1', datetime('now'), datetime('now'))`,
		[
			styleId,
			users[0].id,
			name.trim(),
			`AI-analyzed style: ${name.trim()}`,
			"black-forest-labs/flux-dev",
			promptTemplate,
			heuristicsJson,
		],
	);

	// Create initial version entry
	const versionId = crypto.randomUUID();
	await queryD1(
		`INSERT INTO style_versions (id, style_id, version, prompt_template, heuristics, notes, created_at)
		 VALUES (?, ?, '0.1', ?, ?, 'Initial AI analysis', datetime('now'))`,
		[versionId, styleId, promptTemplate, heuristicsJson],
	);

	// Fire-and-forget thumbnail generation — don't block the response
	generateThumbnail(styleId).catch((err) =>
		console.error("[Analyze] Thumbnail generation failed:", err),
	);

	return NextResponse.json({ styleId });
}
