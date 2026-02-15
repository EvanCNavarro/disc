/**
 * AES-256-GCM encryption for Spotify refresh tokens.
 * Ported from KGOSPCG/app/lib/encryption.server.ts
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/** Encrypt a string using AES-256-GCM. Returns base64-encoded IV + tag + ciphertext. */
export function encrypt(text: string, key: string): string {
	if (!text) return "";

	const keyBuffer = Buffer.from(key, "hex");
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);

	let encrypted = cipher.update(text, "utf8", "hex");
	encrypted += cipher.final("hex");

	const tag = cipher.getAuthTag();
	const combined = Buffer.concat([iv, tag, Buffer.from(encrypted, "hex")]);
	return combined.toString("base64");
}

/** Decrypt a base64-encoded AES-256-GCM string. Returns empty string on failure. */
export function decrypt(encryptedText: string, key: string): string {
	if (!encryptedText) return "";

	try {
		const keyBuffer = Buffer.from(key, "hex");
		const combined = Buffer.from(encryptedText, "base64");

		const iv = combined.subarray(0, IV_LENGTH);
		const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
		const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);

		const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
		decipher.setAuthTag(tag);

		let decrypted = decipher.update(encrypted, undefined, "utf8");
		decrypted += decipher.final("utf8");

		return decrypted;
	} catch (error) {
		console.error("Decryption failed:", error);
		return "";
	}
}

/** Read ENCRYPTION_KEY from env. Throws if missing. */
export function getEncryptionKey(): string {
	const key = process.env.ENCRYPTION_KEY;
	if (!key) {
		throw new Error("ENCRYPTION_KEY environment variable is required");
	}
	return key;
}
