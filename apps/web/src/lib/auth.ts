/**
 * Auth.js v5 — full config with signIn callback (server-only, uses node:crypto).
 * Middleware must use auth.config.ts instead.
 */

import type { DbUser } from "@disc/shared";
import type { NextAuthConfig } from "next-auth";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { queryD1 } from "./db";
import { encrypt, getEncryptionKey } from "./encryption";

/** Full config including server-only signIn callback. Exported for direct Auth() calls. */
export const fullAuthConfig = {
	...authConfig,
	callbacks: {
		...authConfig.callbacks,

		async jwt(
			params: Parameters<
				NonNullable<NonNullable<NextAuthConfig["callbacks"]>["jwt"]>
			>[0],
		) {
			const previousRefreshToken = (params.token as Record<string, unknown>)
				.refreshToken as string | undefined;

			// Delegate to base callback (handles sign-in capture + Spotify token refresh)
			const token = (await authConfig.callbacks.jwt?.(params)) as Record<
				string,
				unknown
			>;

			// If refresh token was rotated, persist to D1 so the cron worker stays current
			if (
				token.refreshToken &&
				token.refreshToken !== previousRefreshToken &&
				token.spotifyId
			) {
				try {
					const encryptionKey = getEncryptionKey();
					const encryptedToken = encrypt(
						token.refreshToken as string,
						encryptionKey,
					);
					await queryD1(
						"UPDATE users SET encrypted_refresh_token = ?, updated_at = datetime('now') WHERE spotify_user_id = ?",
						[encryptedToken, token.spotifyId],
					);
					console.log("[Auth] Rotated refresh token persisted to D1");
				} catch (error) {
					console.error("[Auth] Failed to persist rotated token:", error);
				}
			}

			return token;
		},

		async signIn({ profile, account }) {
			// Single-user gate: only allow this Spotify account
			if (profile?.id !== "evancnavarro") {
				return false;
			}

			// User provisioning — store/update encrypted refresh token in D1
			try {
				if (account?.refresh_token) {
					const encryptionKey = getEncryptionKey();
					const encryptedToken = encrypt(account.refresh_token, encryptionKey);

					const existing = await queryD1<Pick<DbUser, "id">>(
						"SELECT id FROM users WHERE spotify_user_id = ?",
						[profile.id],
					);

					if (existing.length === 0) {
						await queryD1(
							"INSERT INTO users (spotify_user_id, display_name, email, encrypted_refresh_token) VALUES (?, ?, ?, ?)",
							[profile.id, profile.display_name ?? "", "", encryptedToken],
						);
					} else {
						await queryD1(
							"UPDATE users SET encrypted_refresh_token = ?, display_name = ?, last_login_at = datetime('now'), updated_at = datetime('now') WHERE spotify_user_id = ?",
							[encryptedToken, profile.display_name ?? "", profile.id],
						);
					}
				}
			} catch (error) {
				// Don't block sign-in if D1 provisioning fails
				console.error("User provisioning failed:", error);
			}

			return true;
		},
	},
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(fullAuthConfig);
