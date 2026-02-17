"use client";

import { APP_VERSION } from "@disc/shared";
import { useEffect, useRef } from "react";

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const DEBOUNCE_MS = 10_000; // Max once per 10 seconds

/**
 * Invisible component that detects when a new version is deployed
 * and hard-refreshes the page so the user always runs the latest code.
 *
 * Triggers: tab re-focus, window focus, 5-minute interval.
 */
export function VersionChecker() {
	const lastCheck = useRef(0);

	useEffect(() => {
		async function checkVersion() {
			const now = Date.now();
			if (now - lastCheck.current < DEBOUNCE_MS) return;
			lastCheck.current = now;

			try {
				const res = await fetch("/api/version", {
					cache: "no-store",
					headers: { "Cache-Control": "no-cache" },
				});
				if (!res.ok) return;

				const { version } = await res.json();
				if (version && version !== APP_VERSION) {
					console.log(
						`[VersionChecker] New version detected: ${version} (current: ${APP_VERSION})`,
					);
					window.location.reload();
				}
			} catch {
				// Non-critical — silently ignore network errors
			}
		}

		function handleVisibilityChange() {
			if (document.visibilityState === "visible") {
				checkVersion();
			}
		}

		function handleFocus() {
			checkVersion();
		}

		// Initial check on mount
		checkVersion();

		// Periodic polling
		const interval = setInterval(checkVersion, CHECK_INTERVAL);

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("focus", handleFocus);

		return () => {
			clearInterval(interval);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("focus", handleFocus);
		};
	}, []);

	return null;
}
