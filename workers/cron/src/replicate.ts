/**
 * Replicate API Client
 *
 * Stateless module for generating images via Replicate's REST API.
 * No SDK dependency — CF Worker fetch-only.
 */

import type { DbStyle } from "@disc/shared";
import { CONFIG } from "@disc/shared";
import { withRetry } from "./retry";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

interface ReplicatePrediction {
	id: string;
	status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
	output: string[] | string | null;
	error: string | null;
}

async function getLatestVersion(
	model: string,
	apiToken: string,
): Promise<string> {
	return withRetry(
		async () => {
			const response = await fetch(`${REPLICATE_API_BASE}/models/${model}`, {
				headers: { Authorization: `Bearer ${apiToken}` },
				signal: AbortSignal.timeout(15_000),
			});

			if (!response.ok) {
				throw new Error(`Replicate model lookup failed (${response.status})`);
			}

			const data = (await response.json()) as {
				latest_version?: { id: string };
			};
			if (!data.latest_version?.id) {
				throw new Error(`No latest version found for model ${model}`);
			}

			return data.latest_version.id;
		},
		{
			maxAttempts: CONFIG.REPLICATE_RETRY_ATTEMPTS,
			onRetry: (attempt, error, delayMs) => {
				console.warn(
					`[Replicate] getLatestVersion retry ${attempt}/${CONFIG.REPLICATE_RETRY_ATTEMPTS} after ${Math.round(delayMs)}ms:`,
					error instanceof Error ? error.message : error,
				);
			},
		},
	);
}

async function createPrediction(
	version: string,
	input: Record<string, unknown>,
	apiToken: string,
): Promise<ReplicatePrediction> {
	return withRetry(
		async () => {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 60_000);

			let response: Response;
			try {
				response = await fetch(`${REPLICATE_API_BASE}/predictions`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiToken}`,
						"Content-Type": "application/json",
						Prefer: "wait",
					},
					body: JSON.stringify({ version, input }),
					signal: controller.signal,
				});
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					throw new Error(
						"Replicate prediction request timed out after 60s (cold start too long)",
					);
				}
				throw error;
			} finally {
				clearTimeout(timeoutId);
			}

			if (!response.ok) {
				const errorBody = await response.text();
				throw new Error(
					`Replicate create prediction failed (${response.status}): ${errorBody}`,
				);
			}

			return response.json() as Promise<ReplicatePrediction>;
		},
		{
			maxAttempts: CONFIG.REPLICATE_RETRY_ATTEMPTS,
			baseDelayMs: 5000,
			onRetry: (attempt, error, delayMs) => {
				console.warn(
					`[Replicate] createPrediction retry ${attempt}/${CONFIG.REPLICATE_RETRY_ATTEMPTS} after ${Math.round(delayMs)}ms:`,
					error instanceof Error ? error.message : error,
				);
			},
		},
	);
}

// Uses inline consecutive-error tolerance instead of withRetry because
// polling is a long-running loop (up to REPLICATE_TIMEOUT_MS), not a
// single request — individual poll failures should be tolerated without
// resetting the entire polling window.
async function pollPrediction(
	predictionId: string,
	apiToken: string,
): Promise<ReplicatePrediction> {
	const deadline = Date.now() + CONFIG.REPLICATE_TIMEOUT_MS;
	const MAX_CONSECUTIVE_ERRORS = 3;
	let consecutiveErrors = 0;

	while (Date.now() < deadline) {
		let response: Response;
		try {
			response = await fetch(
				`${REPLICATE_API_BASE}/predictions/${predictionId}`,
				{ headers: { Authorization: `Bearer ${apiToken}` } },
			);
		} catch (error) {
			consecutiveErrors++;
			if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
				throw new Error(
					`Replicate poll failed after ${MAX_CONSECUTIVE_ERRORS} consecutive network errors: ${error instanceof Error ? error.message : error}`,
				);
			}
			console.warn(
				`[Replicate] Poll network error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`,
				error instanceof Error ? error.message : error,
			);
			await new Promise((resolve) =>
				setTimeout(resolve, CONFIG.REPLICATE_POLL_INTERVAL_MS),
			);
			continue;
		}

		if (!response.ok) {
			consecutiveErrors++;
			if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
				throw new Error(
					`Replicate poll failed after ${MAX_CONSECUTIVE_ERRORS} consecutive HTTP errors (${response.status})`,
				);
			}
			console.warn(
				`[Replicate] Poll HTTP error ${response.status} (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`,
			);
			await new Promise((resolve) =>
				setTimeout(resolve, CONFIG.REPLICATE_POLL_INTERVAL_MS),
			);
			continue;
		}

		consecutiveErrors = 0;
		const prediction = (await response.json()) as ReplicatePrediction;

		if (prediction.status === "succeeded") {
			return prediction;
		}

		if (prediction.status === "failed" || prediction.status === "canceled") {
			throw new Error(
				`Replicate prediction ${prediction.status}: ${prediction.error}`,
			);
		}

		await new Promise((resolve) =>
			setTimeout(resolve, CONFIG.REPLICATE_POLL_INTERVAL_MS),
		);
	}

	throw new Error(
		`Replicate prediction timed out after ${CONFIG.REPLICATE_TIMEOUT_MS}ms`,
	);
}

function buildInput(style: DbStyle, prompt: string): Record<string, unknown> {
	// flux-dev uses "num_inference_steps"; flux-2-pro/flux-2-max use "steps"
	const isFlux2 = style.replicate_model.includes("flux-2-");
	const input: Record<string, unknown> = {
		prompt,
		aspect_ratio: "1:1",
		...(isFlux2
			? { steps: style.num_inference_steps }
			: { num_inference_steps: style.num_inference_steps }),
		guidance: style.guidance_scale,
		output_format: "png",
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

	return input;
}

/**
 * Generates an image using the given style and returns the output URL.
 */
export async function generateImage(
	style: DbStyle,
	subject: string,
	apiToken: string,
): Promise<{ imageUrl: string; predictionId: string; prompt: string }> {
	const prompt = style.prompt_template.replace("{subject}", subject);
	const input = buildInput(style, prompt);

	console.log(
		`[Replicate] Resolving latest version for ${style.replicate_model}`,
	);
	const version = await getLatestVersion(style.replicate_model, apiToken);

	console.log(
		`[Replicate] Creating prediction with version ${version.slice(0, 12)}...`,
	);
	let prediction = await createPrediction(version, input, apiToken);

	if (prediction.status !== "succeeded") {
		console.log(`[Replicate] Polling prediction ${prediction.id}...`);
		prediction = await pollPrediction(prediction.id, apiToken);
	}

	// Replicate returns output as string for some models (flux-2-pro)
	// and as string[] for others (flux-dev). Normalize to string.
	const imageUrl = Array.isArray(prediction.output)
		? prediction.output[0]
		: prediction.output;
	if (!imageUrl) {
		throw new Error("Replicate returned no output");
	}
	console.log(`[Replicate] Image generated: ${prediction.id}`);

	return { imageUrl, predictionId: prediction.id, prompt };
}
