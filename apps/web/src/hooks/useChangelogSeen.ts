"use client";

import { APP_VERSION, isNewerThan } from "@disc/shared";
import { useCallback, useEffect, useState } from "react";

export function useChangelogSeen() {
	const [lastSeenVersion, setLastSeenVersion] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		fetch("/api/changelog-seen")
			.then((res) => res.json())
			.then((data: { changelog_last_seen_version: string | null }) => {
				setLastSeenVersion(data.changelog_last_seen_version);
			})
			.catch(() => {
				// Intentionally silent — changelog dot is non-critical UI decoration
			})
			.finally(() => setIsLoading(false));
	}, []);

	const hasUnread = !isLoading && isNewerThan(APP_VERSION, lastSeenVersion);

	const markAsSeen = useCallback(() => {
		setLastSeenVersion(APP_VERSION);
		fetch("/api/changelog-seen", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ version: APP_VERSION }),
		}).catch(() => {
			// Intentionally silent — best-effort persistence, no user impact if fails
		});
	}, []);

	return { lastSeenVersion, hasUnread, markAsSeen, isLoading };
}
