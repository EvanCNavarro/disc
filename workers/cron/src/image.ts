/**
 * Image Processing Module
 *
 * Compresses images for Spotify upload using @cf-wasm/photon.
 * Resizes to 640x640, encodes as JPEG, ensures < 192KB base64.
 */

import {
	grayscale,
	PhotonImage,
	resize,
	SamplingFilter,
} from "@cf-wasm/photon";
import { CONFIG } from "@disc/shared";

/**
 * Compresses an image for Spotify playlist cover upload.
 *
 * 1. Decode PNG/WebP from Replicate output
 * 2. Resize to 640x640 (Lanczos3)
 * 3. Encode as JPEG at CONFIG.JPEG_QUALITY (40)
 * 4. If > 192KB, reduce quality in steps of 5 until under limit
 * 5. Return raw base64 string (no data URI prefix)
 */
export async function compressForSpotify(
	imageBytes: Uint8Array,
): Promise<string> {
	const img = PhotonImage.new_from_byteslice(imageBytes);

	const resized = resize(
		img,
		CONFIG.IMAGE_DIMENSIONS,
		CONFIG.IMAGE_DIMENSIONS,
		SamplingFilter.Lanczos3,
	);
	img.free();

	let quality = CONFIG.JPEG_QUALITY;
	let jpegBytes: Uint8Array;

	while (quality > 5) {
		jpegBytes = resized.get_bytes_jpeg(quality);

		if (jpegBytes.length <= CONFIG.IMAGE_MAX_BYTES) {
			resized.free();
			return uint8ArrayToBase64(jpegBytes);
		}

		console.log(
			`[Image] JPEG at quality ${quality} is ${jpegBytes.length} bytes (limit: ${CONFIG.IMAGE_MAX_BYTES}), reducing...`,
		);
		quality -= 5;
	}

	jpegBytes = resized.get_bytes_jpeg(5);
	resized.free();

	if (jpegBytes.length > CONFIG.IMAGE_MAX_BYTES) {
		throw new Error(
			`Cannot compress image under ${CONFIG.IMAGE_MAX_BYTES} bytes (got ${jpegBytes.length})`,
		);
	}

	return uint8ArrayToBase64(jpegBytes);
}

/**
 * Computes a DCT-based perceptual hash (pHash) for an image.
 *
 * pHash operates in the frequency domain — the same domain JPEG uses.
 * This makes it inherently robust to JPEG re-encoding, resizing, and
 * compression quality changes (exactly what Spotify's CDN does).
 *
 * 1. Decode image bytes → PhotonImage
 * 2. Resize to 32×32 with Lanczos3
 * 3. Convert to grayscale
 * 4. Apply 2D Discrete Cosine Transform (DCT)
 * 5. Keep top-left 8×8 low-frequency coefficients
 * 6. Compare each to the median → 64-bit hash
 * 7. Return 16-character hex string
 *
 * Same image after CDN re-encoding: typically 0-5 bits different.
 * Different images: typically 25-40 bits different.
 * Separation gap: ~22 bits (vs ~7 for dHash).
 */
export function computePerceptualHash(imageBytes: Uint8Array): string {
	const img = PhotonImage.new_from_byteslice(imageBytes);
	const tiny = resize(img, 32, 32, SamplingFilter.Lanczos3);
	img.free();

	grayscale(tiny);

	const pixels = tiny.get_raw_pixels();
	tiny.free();

	// Extract luminance from RGBA pixels (R=G=B after grayscale)
	const N = 32;
	const matrix: number[][] = [];
	for (let row = 0; row < N; row++) {
		matrix[row] = [];
		for (let col = 0; col < N; col++) {
			matrix[row][col] = pixels[(row * N + col) * 4];
		}
	}

	// Apply 2D DCT via separable 1D DCTs (rows then columns)
	const dctRows: number[][] = [];
	for (let row = 0; row < N; row++) {
		dctRows[row] = dct1d(matrix[row]);
	}
	const dct2d: number[][] = [];
	for (let col = 0; col < N; col++) {
		const column: number[] = [];
		for (let row = 0; row < N; row++) {
			column[row] = dctRows[row][col];
		}
		const transformed = dct1d(column);
		for (let row = 0; row < N; row++) {
			if (!dct2d[row]) dct2d[row] = [];
			dct2d[row][col] = transformed[row];
		}
	}

	// Extract top-left 8×8 low-frequency coefficients (skip [0][0] DC component)
	const lowFreq: number[] = [];
	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			if (row === 0 && col === 0) continue; // skip DC
			lowFreq.push(dct2d[row][col]);
		}
	}

	// Median of the 63 AC coefficients
	const sorted = [...lowFreq].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)];

	// Build 64-bit hash: DC bit is always 0, then 63 AC bits
	let hash = 0n;
	let bit = 63;
	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			if (row === 0 && col === 0) {
				// DC component — always 0 (not useful for comparison)
				bit--;
				continue;
			}
			if (dct2d[row][col] > median) {
				hash |= 1n << BigInt(bit);
			}
			bit--;
		}
	}

	return hash.toString(16).padStart(16, "0");
}

/**
 * 1D Type-II Discrete Cosine Transform.
 * DCT[u] = C(u) * sum_x( f[x] * cos( (2x+1)*u*pi / (2N) ) )
 * where C(0) = sqrt(1/N), C(u>0) = sqrt(2/N)
 */
function dct1d(input: number[]): number[] {
	const N = input.length;
	const output: number[] = new Array(N);
	for (let u = 0; u < N; u++) {
		let sum = 0;
		for (let x = 0; x < N; x++) {
			sum += input[x] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
		}
		const cu = u === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
		output[u] = cu * sum;
	}
	return output;
}

/**
 * Computes the Hamming distance between two 16-char hex phash strings.
 * Returns the number of differing bits (0 = identical, 64 = completely different).
 * pHash same image after CDN re-encoding: typically 0-5.
 * Different images: typically 25-40.
 */
export function hammingDistance(hash1: string, hash2: string): number {
	const a = BigInt(`0x${hash1}`);
	const b = BigInt(`0x${hash2}`);
	let xor = a ^ b;
	let count = 0;
	while (xor > 0n) {
		count += Number(xor & 1n);
		xor >>= 1n;
	}
	return count;
}

/**
 * Maximum Hamming distance to consider two hashes as the "same" image.
 * pHash same image after CDN re-encoding: typically 0-5.
 * Different images: typically 25-40.
 * Threshold of 10 gives a 15-bit safety margin on both sides.
 */
export const PHASH_MATCH_THRESHOLD = 10;

function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}
