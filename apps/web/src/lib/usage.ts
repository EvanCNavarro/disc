/**
 * Fire-and-forget usage event insertion for the web app.
 * Uses queryD1() (Cloudflare D1 REST API).
 * Errors are logged but never thrown.
 */

import type { UsageActionType, UsageTriggerSource } from "@disc/shared";
import { queryD1 } from "./db";

interface UsageEventParams {
	userId: string;
	actionType: UsageActionType;
	model: string;
	costUsd: number;
	generationId?: string;
	playlistId?: string;
	styleId?: string;
	jobId?: string;
	tokensIn?: number;
	tokensOut?: number;
	durationMs?: number;
	modelUnitCost?: number;
	triggerSource?: UsageTriggerSource;
	status?: "success" | "failed";
	errorMessage?: string;
}

export async function insertUsageEvent(
	params: UsageEventParams,
): Promise<void> {
	try {
		await queryD1(
			`INSERT INTO usage_events
       (user_id, action_type, model, cost_usd, generation_id, playlist_id,
        style_id, job_id, tokens_in, tokens_out, duration_ms,
        model_unit_cost, trigger_source, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				params.userId,
				params.actionType,
				params.model,
				params.costUsd,
				params.generationId ?? null,
				params.playlistId ?? null,
				params.styleId ?? null,
				params.jobId ?? null,
				params.tokensIn ?? null,
				params.tokensOut ?? null,
				params.durationMs ?? null,
				params.modelUnitCost ?? null,
				params.triggerSource ?? "user",
				params.status ?? "success",
				params.errorMessage ?? null,
			],
		);
	} catch (error) {
		console.error(
			"[UsageEvent] Failed to insert:",
			error instanceof Error ? error.message : error,
		);
	}
}
