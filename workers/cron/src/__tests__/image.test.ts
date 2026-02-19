import { describe, expect, it, vi } from "vitest";

// Mock @cf-wasm/photon since it requires WASM runtime (Workers only)
// pHash resizes to 32×32 = 1024 pixels, RGBA (4096 bytes)
const N = 32;
const mockPixels = new Uint8Array(N * N * 4);

// Set up a gradient pattern: pixel luminance = row * 8 + col
// This produces a predictable 2D gradient for DCT testing
for (let row = 0; row < N; row++) {
	for (let col = 0; col < N; col++) {
		const i = (row * N + col) * 4;
		const val = Math.min(255, row * 8 + col);
		mockPixels[i] = val; // R
		mockPixels[i + 1] = val; // G
		mockPixels[i + 2] = val; // B
		mockPixels[i + 3] = 255; // A
	}
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
const { computePerceptualHash, hammingDistance, PHASH_MATCH_THRESHOLD } =
	await import("../image");

describe("computePerceptualHash (pHash/DCT)", () => {
	it("returns a 16-character hex string", () => {
		const hash = computePerceptualHash(new Uint8Array([1, 2, 3]));
		expect(hash).toMatch(/^[0-9a-f]{16}$/);
	});

	it("returns the same hash for identical input", () => {
		const input = new Uint8Array([1, 2, 3]);
		const hash1 = computePerceptualHash(input);
		const hash2 = computePerceptualHash(input);
		expect(hash1).toBe(hash2);
	});

	it("produces a non-zero hash for gradient pattern", () => {
		const hash = computePerceptualHash(new Uint8Array([1, 2, 3]));
		// DCT of a gradient should produce non-trivial frequency content
		expect(hash).not.toBe("0000000000000000");
	});

	it("produces hash with expected bit distribution", () => {
		const hash = computePerceptualHash(new Uint8Array([1, 2, 3]));
		// Count set bits — for a gradient pattern, roughly half should be set
		const bigint = BigInt(`0x${hash}`);
		let bits = 0;
		let val = bigint;
		while (val > 0n) {
			bits += Number(val & 1n);
			val >>= 1n;
		}
		// DC bit is always 0, so 63 AC bits compared to median → ~31 set
		expect(bits).toBeGreaterThan(15);
		expect(bits).toBeLessThan(49);
	});
});

describe("hammingDistance", () => {
	it("returns 0 for identical hashes", () => {
		expect(hammingDistance("ffffffffffffffff", "ffffffffffffffff")).toBe(0);
	});

	it("returns 1 for single-bit difference", () => {
		expect(hammingDistance("0000000000000001", "0000000000000000")).toBe(1);
	});

	it("returns 64 for completely opposite hashes", () => {
		expect(hammingDistance("ffffffffffffffff", "0000000000000000")).toBe(64);
	});

	it("correctly computes multi-bit distances", () => {
		// 0xff = 11111111 vs 0x00 = 00000000 in last byte = 8 bits different
		expect(hammingDistance("00000000000000ff", "0000000000000000")).toBe(8);
	});
});

describe("PHASH_MATCH_THRESHOLD", () => {
	it("is set to 10", () => {
		expect(PHASH_MATCH_THRESHOLD).toBe(10);
	});
});
