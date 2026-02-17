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
	title: "DISC - Daily Image Spotify Covers",
	description: "AI-generated playlist covers, refreshed daily",
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
