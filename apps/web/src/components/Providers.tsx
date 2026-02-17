"use client";

import { SessionProvider } from "next-auth/react";
import { type ReactNode, useEffect, useRef } from "react";
import { QueueProvider } from "@/context/QueueContext";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MIN_SYNC_GAP_MS = 60_000; // 60s debounce

function usePlaylistSync() {
	const lastSyncRef = useRef(0);

	useEffect(() => {
		const sync = () => {
			const now = Date.now();
			if (now - lastSyncRef.current < MIN_SYNC_GAP_MS) return;
			lastSyncRef.current = now;
			fetch("/api/playlists", { method: "POST" }).catch(() => {});
		};

		sync();

		const interval = setInterval(sync, SYNC_INTERVAL_MS);
		window.addEventListener("focus", sync);

		return () => {
			clearInterval(interval);
			window.removeEventListener("focus", sync);
		};
	}, []);
}

function GlobalSync() {
	usePlaylistSync();
	return null;
}

export function Providers({ children }: { children: ReactNode }) {
	return (
		<SessionProvider>
			<QueueProvider>
				<GlobalSync />
				{children}
			</QueueProvider>
		</SessionProvider>
	);
}
