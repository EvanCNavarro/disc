/**
 * Generates a canonical thumbnail for a style by rendering a boombox
 * using the style's own model, LoRA, and prompt template.
 * Updates the style's thumbnail_url in D1.
 */

import type { DbStyle } from "@disc/shared";
import { CANONICAL_SUBJECT, CONFIG } from "@disc/shared";
import { queryD1 } from "./db";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

interface ReplicatePrediction {
	id: string;
	status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
	output: string[] | string | null;
	error: string | null;
}

/**
 * Generate a canonical thumbnail for the given style and persist it to D1.
 * Returns the image URL on success, null on failure.
 */
export async function generateThumbnail(
	styleId: string,
): Promise<string | null> {
	const apiToken = process.env.REPLICATE_API_TOKEN;
	if (!apiToken) {
		console.error("[Thumbnail] Missing REPLICATE_API_TOKEN");
		return null;
	}

	// Fetch style from D1
	const styles = await queryD1<DbStyle>("SELECT * FROM styles WHERE id = ?", [
		styleId,
	]);
	if (styles.length === 0) {
		console.error(`[Thumbnail] Style ${styleId} not found`);
		return null;
	}
	const style = styles[0];

	// Build prompt from template
	const prompt = style.prompt_template.replace("{subject}", CANONICAL_SUBJECT);

	// Build Replicate input using the style's own model params
	const isFlux2 = style.replicate_model.includes("flux-2-");
	const input: Record<string, unknown> = {
		prompt,
		aspect_ratio: "1:1",
		output_format: "png",
		guidance: style.guidance_scale,
		...(isFlux2
			? { steps: style.num_inference_steps }
			: { num_inference_steps: style.num_inference_steps }),
	};

	if (style.lora_url) {
		input.hf_lora = style.lora_url;
		input.lora_scale = style.lora_scale;
	}

	if (style.negative_prompt) {
		input.negative_prompt = style.negative_prompt;
	}

	if (style.seed !== null) {
		input.seed = style.seed;
	}

	// Resolve model version
	const modelResp = await fetch(
		`${REPLICATE_API_BASE}/models/${style.replicate_model}`,
		{
			headers: { Authorization: `Bearer ${apiToken}` },
			signal: AbortSignal.timeout(15_000),
		},
	);
	if (!modelResp.ok) {
		console.error(`[Thumbnail] Model lookup failed (${modelResp.status})`);
		return null;
	}
	const modelData = (await modelResp.json()) as {
		latest_version?: { id: string };
	};
	const version = modelData.latest_version?.id;
	if (!version) {
		console.error("[Thumbnail] No model version found");
		return null;
	}

	// Create prediction with Prefer: wait (blocks up to 60s)
	const predResp = await fetch(`${REPLICATE_API_BASE}/predictions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiToken}`,
			"Content-Type": "application/json",
			Prefer: "wait",
		},
		body: JSON.stringify({ version, input }),
		signal: AbortSignal.timeout(60_000),
	});

	if (!predResp.ok) {
		const errBody = await predResp.text();
		console.error(`[Thumbnail] Prediction create failed: ${errBody}`);
		return null;
	}

	let prediction = (await predResp.json()) as ReplicatePrediction;

	// Poll if not yet complete (with error tolerance)
	const deadline = Date.now() + CONFIG.REPLICATE_TIMEOUT_MS;
	let consecutiveErrors = 0;
	const MAX_POLL_ERRORS = 3;

	while (
		prediction.status !== "succeeded" &&
		prediction.status !== "failed" &&
		prediction.status !== "canceled" &&
		Date.now() < deadline
	) {
		await new Promise((r) => setTimeout(r, CONFIG.REPLICATE_POLL_INTERVAL_MS));
		const pollResp = await fetch(
			`${REPLICATE_API_BASE}/predictions/${prediction.id}`,
			{ headers: { Authorization: `Bearer ${apiToken}` } },
		);

		if (!pollResp.ok) {
			consecutiveErrors++;
			console.warn(
				`[Thumbnail] Poll error ${consecutiveErrors}/${MAX_POLL_ERRORS}: ${pollResp.status}`,
			);
			if (consecutiveErrors >= MAX_POLL_ERRORS) break;
			continue;
		}

		consecutiveErrors = 0;
		prediction = (await pollResp.json()) as ReplicatePrediction;
	}

	if (prediction.status !== "succeeded") {
		console.error(
			`[Thumbnail] Prediction ${prediction.status}: ${prediction.error}`,
		);
		return null;
	}

	const replicateUrl = Array.isArray(prediction.output)
		? prediction.output[0]
		: prediction.output;

	if (!replicateUrl) {
		console.error("[Thumbnail] No output URL from prediction");
		return null;
	}

	// Download image from Replicate and upload to R2 for permanent storage
	const r2Key = `styles/${styleId}/thumbnail.png`;
	const workerUrl = process.env.DISC_WORKER_URL;
	const workerToken = process.env.WORKER_AUTH_TOKEN;

	if (!workerUrl || !workerToken) {
		console.error("[Thumbnail] Missing DISC_WORKER_URL or WORKER_AUTH_TOKEN");
		return null;
	}

	const imageResp = await fetch(replicateUrl);
	if (!imageResp.ok) {
		console.error(`[Thumbnail] Failed to download image: ${imageResp.status}`);
		return null;
	}
	const imageBytes = await imageResp.arrayBuffer();

	const uploadResp = await fetch(
		`${workerUrl}/upload?key=${encodeURIComponent(r2Key)}`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${workerToken}`,
				"Content-Type": "image/png",
			},
			body: imageBytes,
		},
	);

	if (!uploadResp.ok) {
		console.error(`[Thumbnail] R2 upload failed: ${uploadResp.status}`);
		return null;
	}

	// Persist R2 key to D1 (not the expiring Replicate URL)
	await queryD1(
		"UPDATE styles SET thumbnail_url = ?, updated_at = datetime('now') WHERE id = ?",
		[r2Key, styleId],
	);

	console.log(`[Thumbnail] Generated for style ${styleId}: ${r2Key}`);
	return r2Key;
}
