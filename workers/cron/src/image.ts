/**
 * Image Processing Module
 *
 * Compresses images for Spotify upload using @cf-wasm/photon.
 * Resizes to 640x640, encodes as JPEG, ensures < 192KB base64.
 */

import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";
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

function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}
