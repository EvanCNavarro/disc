#!/usr/bin/env node

/**
 * Generate canonical boombox thumbnails for all styles.
 *
 * Fetches every style from D1, generates a thumbnail via Replicate
 * using each style's own model/LoRA/params, and writes the URL back.
 *
 * Usage:
 *   node scripts/generate-style-thumbnails.mjs
 *   node scripts/generate-style-thumbnails.mjs --force   # regenerate even if thumbnail exists
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Load env from .env.local + ~/.claude/.env ──

const localEnvPath = join(process.cwd(), "apps", "web", ".env.local");
const globalEnvPath = join(homedir(), ".claude", ".env");
let envContent = "";
try { envContent += readFileSync(localEnvPath, "utf-8") + "\n"; } catch {}
try { envContent += readFileSync(globalEnvPath, "utf-8") + "\n"; } catch {}
for (const line of envContent.split("\n")) {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith("#")) continue;
	const eqIdx = trimmed.indexOf("=");
	if (eqIdx === -1) continue;
	const key = trimmed.slice(0, eqIdx).trim();
	let val = trimmed.slice(eqIdx + 1).trim();
	if (
		(val.startsWith('"') && val.endsWith('"')) ||
		(val.startsWith("'") && val.endsWith("'"))
	) {
		val = val.slice(1, -1);
	}
	process.env[key] = val;
}

// ── Config ──

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_D1_DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID;

if (!REPLICATE_TOKEN || !CF_ACCOUNT_ID || !CF_API_TOKEN || !CF_D1_DB_ID) {
	console.error(
		"Missing env vars. Need: REPLICATE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_D1_DATABASE_ID",
	);
	process.exit(1);
}

const REPLICATE_API_BASE = "https://api.replicate.com/v1";
const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DB_ID}/query`;

// Duplicated from packages/shared/src/common-objects.ts — keep in sync
const CANONICAL_SUBJECT =
	"a classic 1980s JVC RC-M90 boombox with chrome details, dual front-facing speakers, and a central cassette deck";

const force = process.argv.includes("--force");

// ── Helpers ──

async function queryD1(sql, params = []) {
	const resp = await fetch(D1_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${CF_API_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ sql, params }),
	});
	if (!resp.ok) throw new Error(`D1 query failed (${resp.status})`);
	const data = await resp.json();
	if (!data.success) {
		throw new Error(`D1 error: ${data.errors.map((e) => e.message).join(", ")}`);
	}
	return data.result[0]?.results ?? [];
}

async function getLatestVersion(model) {
	const resp = await fetch(`${REPLICATE_API_BASE}/models/${model}`, {
		headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
	});
	if (!resp.ok) throw new Error(`Model lookup failed for ${model}`);
	const data = await resp.json();
	return data.latest_version?.id;
}

async function generateImage(style) {
	const prompt = style.prompt_template.replace("{subject}", CANONICAL_SUBJECT);

	const isFlux2 = style.replicate_model.includes("flux-2-");
	const input = {
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
	if (style.negative_prompt) input.negative_prompt = style.negative_prompt;
	if (style.seed !== null) input.seed = style.seed;

	const version = await getLatestVersion(style.replicate_model);
	if (!version) throw new Error(`No version for ${style.replicate_model}`);

	console.log(`  Creating prediction (${style.replicate_model})...`);
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
		const body = await predResp.text();
		throw new Error(`Prediction failed: ${body}`);
	}

	let prediction = await predResp.json();

	// Poll if not yet complete
	while (
		prediction.status !== "succeeded" &&
		prediction.status !== "failed" &&
		prediction.status !== "canceled"
	) {
		await new Promise((r) => setTimeout(r, 2000));
		const pollResp = await fetch(
			`${REPLICATE_API_BASE}/predictions/${prediction.id}`,
			{ headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` } },
		);
		prediction = await pollResp.json();
	}

	if (prediction.status !== "succeeded") {
		throw new Error(`Prediction ${prediction.status}: ${prediction.error}`);
	}

	return Array.isArray(prediction.output)
		? prediction.output[0]
		: prediction.output;
}

// ── Main ──

async function main() {
	console.log("Fetching styles from D1...");
	const styles = await queryD1(
		"SELECT id, name, replicate_model, lora_url, lora_scale, prompt_template, negative_prompt, guidance_scale, num_inference_steps, seed, thumbnail_url FROM styles ORDER BY name",
	);
	console.log(`Found ${styles.length} styles\n`);

	let generated = 0;
	let skipped = 0;
	let failed = 0;

	for (const style of styles) {
		if (style.thumbnail_url && !force) {
			console.log(`[SKIP] ${style.name} — already has thumbnail`);
			skipped++;
			continue;
		}

		console.log(`[GEN] ${style.name}`);
		try {
			const imageUrl = await generateImage(style);
			await queryD1(
				"UPDATE styles SET thumbnail_url = ?, updated_at = datetime('now') WHERE id = ?",
				[imageUrl, style.id],
			);
			console.log(`  -> ${imageUrl}\n`);
			generated++;
		} catch (err) {
			console.error(`  [FAIL] ${err.message}\n`);
			failed++;
		}
	}

	console.log(`\nDone: ${generated} generated, ${skipped} skipped, ${failed} failed`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
