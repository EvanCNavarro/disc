import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/Providers";
import { VersionChecker } from "@/components/VersionChecker";
import "./globals.css";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	display: "swap",
});

export const metadata: Metadata = {
	title: {
		default: "DISC",
		template: "%s | DISC",
	},
	description: "AI-generated playlist cover art from your Spotify library",
	metadataBase: new URL(
		process.env.VERCEL_PROJECT_PRODUCTION_URL
			? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
			: "http://127.0.0.1:4993",
	),
	openGraph: {
		title: "DISC",
		description: "AI-generated playlist cover art from your Spotify library",
		siteName: "DISC",
		type: "website",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={`${inter.variable} antialiased`}>
				<Providers>
					<VersionChecker />
					{children}
				</Providers>
			</body>
		</html>
	);
}
