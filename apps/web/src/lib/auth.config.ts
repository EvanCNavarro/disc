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

			// Token refresh is handled ONLY in fullAuthConfig (auth.ts) which
			// can persist rotated refresh tokens to D1. Middleware uses this
			// edge-safe config and must NOT refresh tokens — doing so would
			// rotate the Spotify refresh token without updating D1, breaking
			// the cron worker's stored token.

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
			if (!auth) return false;
			if (auth.error) return false; // Force re-login on token refresh failure
			return true;
		},
	},
} satisfies NextAuthConfig;
