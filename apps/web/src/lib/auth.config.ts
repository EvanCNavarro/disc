/**
 * Auth.js v5 config — Edge-safe (no node:crypto dependency).
 * Used by both middleware and the full auth module.
 */

import type { NextAuthConfig } from "next-auth";
import Spotify from "next-auth/providers/spotify";

const SPOTIFY_SCOPES = [
	"user-read-private",
	"user-read-email",
	"playlist-read-private",
	"playlist-read-collaborative",
	"ugc-image-upload",
	"playlist-modify-public",
	"playlist-modify-private",
].join(" ");

export const authConfig = {
	trustHost: true,

	providers: [
		Spotify({
			clientId: process.env.SPOTIFY_CLIENT_ID,
			clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
			authorization: {
				url: "https://accounts.spotify.com/authorize",
				params: {
					scope: SPOTIFY_SCOPES,
				},
			},
		}),
	],

	pages: {
		signIn: "/login",
	},

	session: {
		strategy: "jwt" as const,
	},

	callbacks: {
		async jwt({ token, account, profile, trigger }) {
			// On sign-in: store tokens and profile data
			if (trigger === "signIn" && account) {
				token.accessToken = account.access_token as string;
				token.refreshToken = account.refresh_token as string;
				token.expiresAt = account.expires_at as number;
				token.spotifyId = profile?.id as string;
				token.displayName = profile?.display_name as string;
			}

			// Token refresh: Spotify access tokens expire in 1 hour
			if (token.expiresAt && Date.now() / 1000 > token.expiresAt) {
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
								refresh_token: token.refreshToken ?? "",
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
				} catch {
					token.error = "RefreshTokenError";
				}
			}

			return token;
		},

		session({ session, token }) {
			session.accessToken = token.accessToken;
			session.spotifyId = token.spotifyId;
			session.displayName = token.displayName;
			session.error = token.error;
			return session;
		},

		// Used by middleware: return false → redirect to pages.signIn
		authorized({ auth }) {
			return !!auth;
		},
	},
} satisfies NextAuthConfig;
