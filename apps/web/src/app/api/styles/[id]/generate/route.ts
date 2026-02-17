import type { DbStyle } from "@disc/shared";
import { CONFIG, calculateImageCost } from "@disc/shared";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";
import { insertUsageEvent } from "@/lib/usage";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

interface ReplicatePrediction {
	id: string;
	status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
	output: string[] | string | null;
	error: string | null;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = CONFIG.REPLICATE_TIMEOUT_MS;
const MAX_POLL_ERRORS = 3;

/** POST /api/styles/[id]/generate -- triggers 4 parallel Replicate generations using the style's own model config */
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
		prompt: string;
		subjects: string[];
	};
	const { prompt, subjects } = body;

	if (!prompt || !Array.isArray(subjects) || subjects.length === 0) {
		return NextResponse.json(
			{ error: "prompt and subjects[] are required" },
			{ status: 400 },
		);
	}

	const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
	if (!REPLICATE_TOKEN) {
		return NextResponse.json(
			{ error: "Missing Replicate token" },
			{ status: 500 },
		);
	}

	// Fetch style config from D1
	const styles = await queryD1<DbStyle>("SELECT * FROM styles WHERE id = ?", [
		id,
	]);
	if (styles.length === 0) {
		return NextResponse.json({ error: "Style not found" }, { status: 404 });
	}
	const style = styles[0];

	// Resolve model version once (shared across all 4 predictions)
	const modelResp = await fetch(
		`${REPLICATE_API_BASE}/models/${style.replicate_model}`,
		{ headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` } },
	);
	if (!modelResp.ok) {
		return NextResponse.json(
			{ error: `Failed to resolve model version (${modelResp.status})` },
			{ status: 502 },
		);
	}
	const modelData = (await modelResp.json()) as {
		latest_version?: { id: string };
	};
	const version = modelData.latest_version?.id;
	if (!version) {
		return NextResponse.json(
			{ error: "No model version found" },
			{ status: 502 },
		);
	}

	// Build input using the style's model params
	const isFlux2 = style.replicate_model.includes("flux-2-");

	// Generate all images in parallel
	const results = await Promise.allSettled(
		subjects.map(async (subject: string) => {
			const fullPrompt = prompt.replace("{subject}", subject);

			const input: Record<string, unknown> = {
				prompt: fullPrompt,
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

			// Create prediction with Prefer: wait (blocks up to 60s)
			const predResp = await fetch(`${REPLICATE_API_BASE}/predictions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${REPLICATE_TOKEN}`,
					"Content-Type": "application/json",
					Prefer: "wait",
				},
				body: JSON.stringify({ version, input }),
				signal: AbortSignal.timeout(120_000),
			});

			if (!predResp.ok) {
				const errBody = await predResp.text();
				throw new Error(`Prediction failed (${predResp.status}): ${errBody}`);
			}

			let prediction = (await predResp.json()) as ReplicatePrediction;

			// Poll if not yet complete (with timeout + error tolerance)
			const deadline = Date.now() + POLL_TIMEOUT_MS;
			let consecutiveErrors = 0;

			while (
				prediction.status !== "succeeded" &&
				prediction.status !== "failed" &&
				prediction.status !== "canceled" &&
				Date.now() < deadline
			) {
				await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
				const pollResp = await fetch(
					`${REPLICATE_API_BASE}/predictions/${prediction.id}`,
					{
						headers: {
							Authorization: `Bearer ${REPLICATE_TOKEN}`,
						},
					},
				);

				if (!pollResp.ok) {
					consecutiveErrors++;
					if (consecutiveErrors >= MAX_POLL_ERRORS) {
						throw new Error(
							`Poll failed ${MAX_POLL_ERRORS} times (last: ${pollResp.status})`,
						);
					}
					continue;
				}

				consecutiveErrors = 0;
				prediction = (await pollResp.json()) as ReplicatePrediction;
			}

			if (prediction.status === "failed") {
				throw new Error(prediction.error ?? "Prediction failed");
			}

			if (prediction.status !== "succeeded") {
				throw new Error(`Prediction timed out (status: ${prediction.status})`);
			}

			const url = Array.isArray(prediction.output)
				? prediction.output[0]
				: prediction.output;

			return { subject, url };
		}),
	);

	const images = results.map((result, i) => {
		if (result.status === "fulfilled") return result.value;
		return {
			subject: subjects[i],
			url: null,
			error:
				result.reason instanceof Error
					? result.reason.message
					: "Unknown error",
		};
	});

	// Look up internal user ID for usage tracking
	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	const userId = users[0]?.id;

	// Record usage events for each image generated
	if (userId) {
		for (const result of results) {
			const succeeded = result.status === "fulfilled";
			await insertUsageEvent({
				userId,
				actionType: "style_preview",
				model: style.replicate_model,
				costUsd: calculateImageCost(style.replicate_model),
				styleId: id,
				modelUnitCost: calculateImageCost(style.replicate_model),
				triggerSource: "user",
				status: succeeded ? "success" : "failed",
				errorMessage: succeeded
					? undefined
					: result.reason instanceof Error
						? result.reason.message
						: "Unknown error",
			});
		}
	}

	return NextResponse.json({ images });
}
