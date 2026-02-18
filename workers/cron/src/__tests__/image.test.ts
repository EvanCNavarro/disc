import { describe, expect, it, vi } from "vitest";

// Mock @cf-wasm/photon since it requires WASM runtime (Workers only)
const mockPixels = new Uint8Array(64 * 4); // 64 pixels, RGBA
// Set up a pattern: first 32 pixels bright (200), last 32 dark (50)
for (let i = 0; i < 64; i++) {
	const val = i < 32 ? 200 : 50;
	mockPixels[i * 4] = val; // R
	mockPixels[i * 4 + 1] = val; // G
	mockPixels[i * 4 + 2] = val; // B
	mockPixels[i * 4 + 3] = 255; // A
}

const mockPhotonImage = {
	free: vi.fn(),
	get_raw_pixels: vi.fn(() => mockPixels),
};

vi.mock("@cf-wasm/photon", () => ({
	PhotonImage: {
		new_from_byteslice: vi.fn(() => mockPhotonImage),
	},
	resize: vi.fn(() => mockPhotonImage),
	grayscale: vi.fn(),
	SamplingFilter: { Lanczos3: 3 },
}));

// Must import AFTER mock setup
const { computeAverageHash } = await import("../image");

describe("computeAverageHash", () => {
	it("returns a 16-character hex string", () => {
		const hash = computeAverageHash(new Uint8Array([1, 2, 3]));
		expect(hash).toMatch(/^[0-9a-f]{16}$/);
	});

	it("returns the same hash for identical input", () => {
		const input = new Uint8Array([1, 2, 3]);
		const hash1 = computeAverageHash(input);
		const hash2 = computeAverageHash(input);
		expect(hash1).toBe(hash2);
	});

	it("produces expected hash for known pixel pattern", () => {
		// First 32 pixels = 200 (above mean of 125), last 32 = 50 (below mean)
		// Expected: first 32 bits = 1, last 32 bits = 0
		// = 0xffffffff00000000
		const hash = computeAverageHash(new Uint8Array([1, 2, 3]));
		expect(hash).toBe("ffffffff00000000");
	});
});
