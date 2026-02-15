/**
 * Changelog types and utilities.
 *
 * Entry types follow Conventional Commits:
 *   feat     — new user-facing feature
 *   fix      — bug fix
 *   perf     — performance improvement
 *   refactor — code change that neither fixes nor adds
 *   chore    — tooling, deps, CI, docs
 *   docs     — documentation only
 */

export type ChangelogEntryType =
	| "feat"
	| "fix"
	| "perf"
	| "refactor"
	| "chore"
	| "docs";

export interface ChangelogEntry {
	type: ChangelogEntryType;
	scope: string;
	message: string;
}

export interface ChangelogVersion {
	version: string;
	date: string;
	entries: ChangelogEntry[];
}

export interface ChangelogData {
	versions: ChangelogVersion[];
}

/** Compare two semver strings. Returns true if `a` is newer than `b`. */
export function isNewerThan(a: string, b: string | null): boolean {
	if (!b) return true;
	const [aMaj, aMin, aPat] = a.split(".").map(Number);
	const [bMaj, bMin, bPat] = b.split(".").map(Number);
	if (aMaj !== bMaj) return aMaj > bMaj;
	if (aMin !== bMin) return aMin > bMin;
	return aPat > bPat;
}

/** Label and color metadata for each entry type. */
export const ENTRY_TYPE_META: Record<
	ChangelogEntryType,
	{ label: string; color: string }
> = {
	feat: { label: "Feature", color: "accent" },
	fix: { label: "Fix", color: "destructive" },
	perf: { label: "Performance", color: "warning" },
	refactor: { label: "Refactor", color: "muted" },
	chore: { label: "Chore", color: "muted" },
	docs: { label: "Docs", color: "info" },
};

import rawChangelog from "./changelog.json";

/** Structured changelog data, loaded from changelog.json. */
export const CHANGELOG_DATA: ChangelogData = rawChangelog as ChangelogData;
