"use client";

import { useEffect } from "react";
import { useChangelogSeen } from "@/hooks/useChangelogSeen";

/** Invisible component that marks changelog as seen on mount. */
export function ChangelogMarkSeen() {
	const { hasUnread, markAsSeen } = useChangelogSeen();

	useEffect(() => {
		if (hasUnread) markAsSeen();
	}, [hasUnread, markAsSeen]);

	return null;
}
