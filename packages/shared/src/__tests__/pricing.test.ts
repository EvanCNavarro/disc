import { describe, expect, test } from "vitest";
import {
	calculateImageCost,
	calculateLLMCost,
	IMAGE_PRICING,
	LLM_MODEL,
	MODEL_PRICING,
} from "../pricing";

describe("pricing", () => {
	test("LLM_MODEL is gpt-4o-mini", () => {
		expect(LLM_MODEL).toBe("gpt-4o-mini");
	});

	test("MODEL_PRICING has gpt-4o-mini rates", () => {
		expect(MODEL_PRICING["gpt-4o-mini"]).toEqual({
			inputPerMillion: 0.15,
			outputPerMillion: 0.6,
		});
	});

	test("IMAGE_PRICING has flux-dev rate", () => {
		expect(IMAGE_PRICING["black-forest-labs/flux-dev"]).toBe(0.055);
	});

	test("calculateLLMCost computes correctly for gpt-4o-mini", () => {
		const cost = calculateLLMCost("gpt-4o-mini", 1000, 500);
		expect(cost).toBeCloseTo(0.00045, 6);
	});

	test("calculateLLMCost returns 0 for unknown model", () => {
		expect(calculateLLMCost("unknown-model", 1000, 500)).toBe(0);
	});

	test("calculateImageCost returns known model price", () => {
		expect(calculateImageCost("black-forest-labs/flux-dev")).toBe(0.055);
	});

	test("calculateImageCost falls back to $0.04 for unknown model", () => {
		expect(calculateImageCost("unknown/model")).toBe(0.04);
	});
});
