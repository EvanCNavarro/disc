/**
 * Model pricing constants for cost tracking.
 * Rates sourced from OpenAI and Replicate (as of Feb 2026).
 */

/** LLM model used for theme extraction and convergence */
export const LLM_MODEL = "gpt-4o-mini";

export const MODEL_PRICING: Record<
	string,
	{ inputPerMillion: number; outputPerMillion: number }
> = {
	"gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
};

export const IMAGE_PRICING: Record<string, number> = {
	"stability-ai/stable-diffusion-3.5-large": 0.035,
};

const DEFAULT_IMAGE_COST = 0.04;

/**
 * Returns 0 for unknown LLM models (we control which LLMs we call,
 * so an unrecognized model means a pricing table update was missed —
 * returning 0 makes the gap visible rather than guessing).
 */
export function calculateLLMCost(
	model: string,
	inputTokens: number,
	outputTokens: number,
): number {
	const pricing = MODEL_PRICING[model];
	if (!pricing) return 0;
	return (
		(inputTokens / 1_000_000) * pricing.inputPerMillion +
		(outputTokens / 1_000_000) * pricing.outputPerMillion
	);
}

/**
 * Falls back to DEFAULT_IMAGE_COST for unknown image models.
 * Unlike LLMs, image models are user-configurable via styles,
 * so a reasonable fallback avoids $0 costs for valid generations.
 */
export function calculateImageCost(model: string): number {
	return IMAGE_PRICING[model] ?? DEFAULT_IMAGE_COST;
}
