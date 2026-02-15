/**
 * AES-256-GCM Encrypt/Decrypt (Worker-compatible)
 *
 * Uses Web Crypto API (crypto.subtle) — available in all CF Workers.
 * Format: Base64(IV || Tag || Ciphertext) — matches apps/web/src/lib/encryption.ts
 */

const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Decrypts an AES-256-GCM encrypted string using Web Crypto API.
 *
 * @param encryptedText - Base64(IV || Tag || Ciphertext)
 * @param keyHex - 64-char hex string (32 bytes)
 * @returns Decrypted plaintext, or empty string on failure
 */
export async function decrypt(
	encryptedText: string,
	keyHex: string,
): Promise<string> {
	if (!encryptedText) return "";

	try {
		const keyBytes = hexToBytes(keyHex);
		const combined = Uint8Array.from(atob(encryptedText), (c) =>
			c.charCodeAt(0),
		);

		const iv = combined.slice(0, IV_LENGTH);
		const tag = combined.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
		const ciphertext = combined.slice(IV_LENGTH + TAG_LENGTH);

		// AES-GCM expects ciphertext + tag concatenated
		const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
		ciphertextWithTag.set(ciphertext);
		ciphertextWithTag.set(tag, ciphertext.length);

		const cryptoKey = await crypto.subtle.importKey(
			"raw",
			keyBytes,
			{ name: "AES-GCM" },
			false,
			["decrypt"],
		);

		const decrypted = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv, tagLength: TAG_LENGTH * 8 },
			cryptoKey,
			ciphertextWithTag,
		);

		return new TextDecoder().decode(decrypted);
	} catch (error) {
		console.error("[Crypto] Decryption failed:", error);
		return "";
	}
}

/**
 * Encrypts a string using AES-256-GCM via Web Crypto API.
 * Format: Base64(IV || Tag || Ciphertext)
 */
export async function encrypt(text: string, keyHex: string): Promise<string> {
	if (!text) return "";

	const keyBytes = hexToBytes(keyHex);
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const encoder = new TextEncoder();

	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "AES-GCM" },
		false,
		["encrypt"],
	);

	const encryptedWithTag = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv, tagLength: TAG_LENGTH * 8 },
			cryptoKey,
			encoder.encode(text),
		),
	);

	const ciphertext = encryptedWithTag.slice(
		0,
		encryptedWithTag.length - TAG_LENGTH,
	);
	const tag = encryptedWithTag.slice(encryptedWithTag.length - TAG_LENGTH);

	const combined = new Uint8Array(IV_LENGTH + TAG_LENGTH + ciphertext.length);
	combined.set(iv);
	combined.set(tag, IV_LENGTH);
	combined.set(ciphertext, IV_LENGTH + TAG_LENGTH);

	return btoa(String.fromCharCode(...combined));
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
	}
	return bytes;
}
