import { describe, expect, test } from "vitest";
import {
	getDefaultHeuristics,
	reconstructPrompt,
	type StyleHeuristics,
} from "../prompt-reconstruction";

describe("reconstructPrompt", () => {
	test("generates KGO-like prompt from heuristics", () => {
		const heuristics: StyleHeuristics = {
			renderType: "3D render",
			material: "volcanic basalt",
			textures: ["granular", "ashy", "faceted"],
			lightingDirection: "rim light from behind",
			lightingQuality: 0.3,
			lightColor: "ember-orange",
			background: "deep void",
			depthOfField: 0.2,
			framing: "centered three-quarter",
			tonalRange: 0.1,
			colorPalette: "obsidian + ember-orange",
			colorRatio: [72, 20, 8],
			moods: ["cinematic", "contemplative", "moody"],
			constraints: ["no text", "no words", "no letters"],
		};

		const prompt = reconstructPrompt(heuristics);

		expect(prompt).toContain("{subject}");
		expect(prompt).toContain("volcanic basalt");
		expect(prompt).toContain("ember-orange");
		expect(prompt).toContain("72%");
		expect(prompt).toContain("No text");
		expect(prompt).toContain("Square 1:1");
	});

	test("generates autumn-clay-like prompt from heuristics", () => {
		const heuristics: StyleHeuristics = {
			renderType: "macro photograph",
			material: "handmade clay and plasticine",
			textures: ["fingerprints", "tool marks", "rough"],
			lightingDirection: "golden hour backlight",
			lightingQuality: 0.7,
			lightColor: "warm amber",
			background: "autumn diorama",
			depthOfField: 0.9,
			framing: "centered straight-on",
			tonalRange: 0.5,
			colorPalette: "autumn warm",
			colorRatio: [50, 35, 15],
			moods: ["whimsical", "cozy", "nostalgic"],
			constraints: ["no text"],
		};

		const prompt = reconstructPrompt(heuristics);

		expect(prompt).toContain("{subject}");
		expect(prompt).toContain("handmade clay");
		expect(prompt.toLowerCase()).toContain("golden hour");
		expect(prompt.toLowerCase()).toContain("shallow depth of field");
		expect(prompt).toContain("Square 1:1");
	});

	test("prompt contains exactly one {subject} placeholder", () => {
		const heuristics = getDefaultHeuristics();
		const prompt = reconstructPrompt(heuristics);
		const matches = prompt.match(/\{subject\}/g);
		expect(matches).toHaveLength(1);
	});

	test("constraints are capitalized in output", () => {
		const heuristics = getDefaultHeuristics();
		heuristics.constraints = ["no text", "no words"];
		const prompt = reconstructPrompt(heuristics);
		expect(prompt).toContain("No text");
		expect(prompt).toContain("no words");
		// Only first constraint word is capitalized as a sentence
		expect(prompt).toMatch(/No text, no words\./);
	});

	test("slider values produce appropriate text for extreme low", () => {
		const heuristics = getDefaultHeuristics();
		heuristics.depthOfField = 0.0;
		const prompt = reconstructPrompt(heuristics);
		expect(prompt.toLowerCase()).toContain("deep sharp focus");
	});

	test("slider values produce appropriate text for extreme high", () => {
		const heuristics = getDefaultHeuristics();
		heuristics.depthOfField = 1.0;
		const prompt = reconstructPrompt(heuristics);
		expect(prompt).toContain("shallow depth of field");
		expect(prompt).toContain("bokeh");
	});

	test("prompt always ends with Square 1:1.", () => {
		const heuristics = getDefaultHeuristics();
		const prompt = reconstructPrompt(heuristics);
		expect(prompt.trimEnd()).toMatch(/Square 1:1\.$/);
	});

	test("getDefaultHeuristics returns a valid StyleHeuristics object", () => {
		const defaults = getDefaultHeuristics();
		expect(defaults.renderType).toBeTruthy();
		expect(defaults.material).toBeTruthy();
		expect(defaults.textures.length).toBeGreaterThan(0);
		expect(defaults.colorRatio).toHaveLength(3);
		expect(
			defaults.colorRatio[0] + defaults.colorRatio[1] + defaults.colorRatio[2],
		).toBe(100);
		expect(defaults.constraints.length).toBeGreaterThan(0);
	});
});
