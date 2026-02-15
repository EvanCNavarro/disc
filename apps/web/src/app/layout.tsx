import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NavDock } from "@/components/NavDock";
import { Providers } from "@/components/Providers";
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
					<a href="#main-content" className="skip-link">
						Skip to content
					</a>
					<NavDock />
					<div
						id="main-content"
						className="pt-[calc(var(--nav-height)+var(--space-md)*2)]"
					>
						{children}
					</div>
				</Providers>
			</body>
		</html>
	);
}
