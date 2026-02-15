import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
	interface Session {
		accessToken?: string;
		spotifyId?: string;
		displayName?: string;
		error?: string;
	}
}

declare module "next-auth/jwt" {
	interface JWT {
		accessToken?: string;
		refreshToken?: string;
		expiresAt?: number;
		spotifyId?: string;
		displayName?: string;
		error?: string;
	}
}
