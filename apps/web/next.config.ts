import { resolve } from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
	// .nosync suffix prevents iCloud Drive from evicting Turbopack cache files (dev only)
	...(isDev && { distDir: ".next.nosync" }),
	turbopack: {
		root: resolve(import.meta.dirname, "../.."),
	},
	allowedDevOrigins: ["127.0.0.1"],
	transpilePackages: ["@disc/shared"],
	images: {
		remotePatterns: [
			{ protocol: "https", hostname: "i.scdn.co" },
			{ protocol: "https", hostname: "mosaic.scdn.co" },
			{ protocol: "https", hostname: "image-cdn-ak.spotifycdn.com" },
			{ protocol: "https", hostname: "image-cdn-fa.spotifycdn.com" },
			{ protocol: "https", hostname: "wrapped-images.spotifycdn.com" },
		],
	},
};

export default nextConfig;
