"use client";

import { useEffect } from "react";

/**
 * Global error boundary — catches unhandled errors in the app shell.
 *
 * If the error is a ChunkLoadError (stale client requesting deleted JS chunks
 * after a deployment), auto-reload once. Uses sessionStorage to prevent
 * infinite reload loops.
 */
export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		const isChunkError =
			error.name === "ChunkLoadError" ||
			error.message?.includes("Loading chunk") ||
			error.message?.includes("Failed to fetch dynamically imported module");

		if (isChunkError) {
			const key = "disc-chunk-reload";
			if (!sessionStorage.getItem(key)) {
				sessionStorage.setItem(key, "1");
				window.location.reload();
				return;
			}
			// Already reloaded once — clear flag and show error UI
			sessionStorage.removeItem(key);
		}
	}, [error]);

	return (
		<html lang="en">
			<body>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						minHeight: "100dvh",
						fontFamily: "system-ui, sans-serif",
						gap: "1rem",
						padding: "2rem",
						textAlign: "center",
					}}
				>
					<h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
						Something went wrong
					</h2>
					<p style={{ color: "#888", maxWidth: "24rem" }}>
						This may be caused by a recent update. Try refreshing the page.
					</p>
					<button
						type="button"
						onClick={() => reset()}
						style={{
							padding: "0.5rem 1rem",
							borderRadius: "0.5rem",
							border: "1px solid #333",
							background: "#111",
							color: "#fff",
							cursor: "pointer",
						}}
					>
						Try again
					</button>
				</div>
			</body>
		</html>
	);
}
