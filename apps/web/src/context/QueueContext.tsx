"use client";

import type { QueueStatus } from "@disc/shared";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

const POLL_ACTIVE_MS = 5_000;
const POLL_IDLE_MS = 30_000;

interface QueueContextValue {
	status: QueueStatus | null;
	loading: boolean;
	refresh: () => Promise<void>;
}

const QueueContext = createContext<QueueContextValue>({
	status: null,
	loading: true,
	refresh: async () => {},
});

export function useQueue(): QueueContextValue {
	return useContext(QueueContext);
}

export function QueueProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<QueueStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const isActive = status?.activeJob !== null;

	const fetchStatus = useCallback(async () => {
		try {
			const res = await fetch("/api/queue/status");
			if (res.ok) {
				const data = (await res.json()) as QueueStatus;
				setStatus(data);
			}
		} catch {
			// Silently fail — will retry on next poll
		} finally {
			setLoading(false);
		}
	}, []);

	// Initial fetch
	useEffect(() => {
		fetchStatus();
	}, [fetchStatus]);

	// Adaptive polling
	useEffect(() => {
		const interval = isActive ? POLL_ACTIVE_MS : POLL_IDLE_MS;
		pollRef.current = setInterval(fetchStatus, interval);

		return () => {
			if (pollRef.current) {
				clearInterval(pollRef.current);
				pollRef.current = null;
			}
		};
	}, [isActive, fetchStatus]);

	return (
		<QueueContext.Provider value={{ status, loading, refresh: fetchStatus }}>
			{children}
		</QueueContext.Provider>
	);
}
