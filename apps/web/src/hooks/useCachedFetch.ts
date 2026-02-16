"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CacheEntry<T = unknown> {
	data: T;
	json: string;
}

const MAX_CACHE_ENTRIES = 50;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function evictIfNeeded() {
	while (cache.size > MAX_CACHE_ENTRIES) {
		// Map iterates in insertion order — first key is oldest
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
		else break;
	}
}

export function useCachedFetch<T>(url: string | null): {
	data: T | null;
	loading: boolean;
	error: Error | null;
	refresh: () => Promise<T>;
} {
	const cached = url
		? (cache.get(url) as CacheEntry<T> | undefined)
		: undefined;
	const [data, setData] = useState<T | null>(cached?.data ?? null);
	const [loading, setLoading] = useState(url !== null && !cached);
	const [error, setError] = useState<Error | null>(null);
	const urlRef = useRef(url);
	urlRef.current = url;

	const doFetch = useCallback(async (fetchUrl: string): Promise<T> => {
		// Dedup concurrent requests to same URL
		const existing = inflight.get(fetchUrl);
		if (existing) return existing as Promise<T>;

		const promise = fetch(fetchUrl)
			.then(async (r) => {
				if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
				const json = await r.text();
				const parsed = JSON.parse(json) as T;

				const prev = cache.get(fetchUrl);
				if (!prev || prev.json !== json) {
					cache.set(fetchUrl, { data: parsed, json });
					evictIfNeeded();
					if (urlRef.current === fetchUrl) {
						setData(parsed);
					}
				}
				setError(null);
				return parsed;
			})
			.catch((err: unknown) => {
				const e = err instanceof Error ? err : new Error(String(err));
				if (urlRef.current === fetchUrl) setError(e);
				throw e;
			})
			.finally(() => {
				inflight.delete(fetchUrl);
				if (urlRef.current === fetchUrl) setLoading(false);
			});

		inflight.set(fetchUrl, promise);
		return promise;
	}, []);

	useEffect(() => {
		if (!url) return;

		// Serve from cache immediately
		const entry = cache.get(url) as CacheEntry<T> | undefined;
		if (entry) {
			setData(entry.data);
			setLoading(false);
		} else {
			setLoading(true);
		}

		// Always revalidate in background
		doFetch(url).catch(() => {
			// Error already captured in state
		});
	}, [url, doFetch]);

	const refresh = useCallback(async (): Promise<T> => {
		if (!url) throw new Error("Cannot refresh: no URL");
		return doFetch(url);
	}, [url, doFetch]);

	return { data, loading, error, refresh };
}
