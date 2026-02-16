import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

interface ReplicatePrediction {
	id: string;
	status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
	output: string[] | string | null;
	error: string | null;
}

/** POST /api/styles/[id]/generate -- triggers 4 parallel Replicate generations */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	void id; // style ID reserved for future per-style model config

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

	// Resolve model version once (shared across all 4 predictions)
	const modelResp = await fetch(
		`${REPLICATE_API_BASE}/models/black-forest-labs/flux-dev`,
		{ headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` } },
	);
	if (!modelResp.ok) {
		return NextResponse.json(
			{ error: "Failed to resolve model version" },
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

	// Generate all images in parallel
	const results = await Promise.allSettled(
		subjects.map(async (subject: string) => {
			const fullPrompt = prompt.replace("{subject}", subject);

			// Create prediction with Prefer: wait (blocks up to 60s)
			const predResp = await fetch(`${REPLICATE_API_BASE}/predictions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${REPLICATE_TOKEN}`,
					"Content-Type": "application/json",
					Prefer: "wait",
				},
				body: JSON.stringify({
					version,
					input: {
						prompt: fullPrompt,
						aspect_ratio: "1:1",
						output_format: "png",
						guidance: 3.5,
						num_inference_steps: 28,
					},
				}),
				signal: AbortSignal.timeout(120_000),
			});

			if (!predResp.ok) {
				const errBody = await predResp.text();
				throw new Error(`Prediction failed (${predResp.status}): ${errBody}`);
			}

			let prediction = (await predResp.json()) as ReplicatePrediction;

			// Poll if not yet complete
			while (
				prediction.status !== "succeeded" &&
				prediction.status !== "failed" &&
				prediction.status !== "canceled"
			) {
				await new Promise((r) => setTimeout(r, 2000));
				const pollResp = await fetch(
					`${REPLICATE_API_BASE}/predictions/${prediction.id}`,
					{
						headers: {
							Authorization: `Bearer ${REPLICATE_TOKEN}`,
						},
					},
				);
				prediction = (await pollResp.json()) as ReplicatePrediction;
			}

			if (prediction.status === "failed") {
				throw new Error(prediction.error ?? "Prediction failed");
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

	return NextResponse.json({ images });
}
