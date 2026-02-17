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
			// Delegate to base callback (handles sign-in capture only)
			const token = (await authConfig.callbacks.jwt?.(params)) as Record<
				string,
				unknown
			>;

			// Token refresh: Spotify access tokens expire in 1 hour.
			// This MUST run server-side (not in middleware) so rotated
			// refresh tokens get persisted to D1 for the cron worker.
			if (token.expiresAt && Date.now() / 1000 > (token.expiresAt as number)) {
				const previousRefreshToken = token.refreshToken as string | undefined;

				try {
					const response = await fetch(
						"https://accounts.spotify.com/api/token",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/x-www-form-urlencoded",
								Authorization: `Basic ${Buffer.from(
									`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
								).toString("base64")}`,
							},
							body: new URLSearchParams({
								grant_type: "refresh_token",
								refresh_token: (token.refreshToken as string) ?? "",
							}),
						},
					);

					if (!response.ok) {
						throw new Error(`Token refresh failed: ${response.status}`);
					}

					const data = (await response.json()) as {
						access_token: string;
						expires_in: number;
						refresh_token?: string;
					};

					token.accessToken = data.access_token;
					token.expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

					if (data.refresh_token) {
						token.refreshToken = data.refresh_token;
					}

					// Persist rotated refresh token to D1 for cron worker
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
				} catch {
					token.error = "RefreshTokenError";
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
