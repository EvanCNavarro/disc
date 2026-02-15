"use client";

import type {
	ChangelogEntry,
	ChangelogEntryType,
	ChangelogVersion,
} from "@disc/shared";
import { CHANGELOG_DATA, ENTRY_TYPE_META } from "@disc/shared";
import { useMemo, useState } from "react";
import { ChangelogEntryBadge } from "./ChangelogEntryBadge";

const FILTER_OPTIONS: Array<{
	value: ChangelogEntryType | "all";
	label: string;
}> = [
	{ value: "all", label: "All" },
	{ value: "feat", label: "Features" },
	{ value: "fix", label: "Fixes" },
	{ value: "perf", label: "Performance" },
	{ value: "refactor", label: "Refactors" },
	{ value: "chore", label: "Chores" },
];

/** Split query into lowercase tokens for fuzzy word matching. */
function tokenize(query: string): string[] {
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter((t) => t.length > 0);
}

/**
 * Find all match ranges for a set of tokens within text.
 * Returns sorted, non-overlapping [start, end] ranges.
 */
function findMatchRanges(
	text: string,
	tokens: string[],
): Array<[number, number]> {
	const lower = text.toLowerCase();
	const ranges: Array<[number, number]> = [];

	for (const token of tokens) {
		let pos = 0;
		while (pos < lower.length) {
			const idx = lower.indexOf(token, pos);
			if (idx === -1) break;
			ranges.push([idx, idx + token.length]);
			pos = idx + 1;
		}
	}

	// Sort by start, then merge overlaps
	ranges.sort((a, b) => a[0] - b[0]);
	const merged: Array<[number, number]> = [];
	for (const range of ranges) {
		const last = merged[merged.length - 1];
		if (last && range[0] <= last[1]) {
			last[1] = Math.max(last[1], range[1]);
		} else {
			merged.push([...range]);
		}
	}

	return merged;
}

/** Check if all tokens appear in any of the searchable fields. */
function matchesQuery(entry: ChangelogEntry, tokens: string[]): boolean {
	if (tokens.length === 0) return true;
	const haystack =
		`${entry.message} ${entry.scope} ${ENTRY_TYPE_META[entry.type].label}`.toLowerCase();
	return tokens.every((t) => haystack.includes(t));
}

/** Render text with highlighted match ranges. */
function HighlightedText({ text, tokens }: { text: string; tokens: string[] }) {
	if (tokens.length === 0) return <>{text}</>;

	const ranges = findMatchRanges(text, tokens);
	if (ranges.length === 0) return <>{text}</>;

	const parts: React.ReactNode[] = [];
	let cursor = 0;

	for (const [start, end] of ranges) {
		if (cursor < start) {
			parts.push(text.slice(cursor, start));
		}
		parts.push(
			<mark
				key={start}
				className="rounded-sm bg-[var(--color-accent-glow)] text-[var(--color-text)] px-0.5"
			>
				{text.slice(start, end)}
			</mark>,
		);
		cursor = end;
	}

	if (cursor < text.length) {
		parts.push(text.slice(cursor));
	}

	return <>{parts}</>;
}

function formatDate(dateStr: string): string {
	const date = new Date(`${dateStr}T00:00:00`);
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function VersionSection({
	version,
	tokens,
	filter,
}: {
	version: ChangelogVersion;
	tokens: string[];
	filter: ChangelogEntryType | "all";
}) {
	const filtered = version.entries.filter((e) => {
		if (filter !== "all" && e.type !== filter) return false;
		return matchesQuery(e, tokens);
	});

	if (filtered.length === 0) return null;

	return (
		<section className="flex flex-col gap-[var(--space-md)]">
			<div className="flex items-baseline gap-[var(--space-md)]">
				<h2 className="text-lg font-semibold">v{version.version}</h2>
				<span className="text-sm text-[var(--color-text-muted)]">
					{formatDate(version.date)}
				</span>
			</div>
			<div className="flex flex-col gap-[var(--space-sm)]">
				{filtered.map((entry, i) => (
					<div
						key={`${version.version}-${entry.scope}-${i}`}
						className="flex items-start gap-[var(--space-sm)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-[var(--space-md)] transition-colors hover:bg-[var(--color-surface)]"
					>
						<ChangelogEntryBadge type={entry.type} />
						<div className="flex flex-col gap-0.5">
							<span className="text-sm leading-relaxed">
								<HighlightedText text={entry.message} tokens={tokens} />
							</span>
							<span className="text-xs text-[var(--color-text-faint)]">
								<HighlightedText text={entry.scope} tokens={tokens} />
							</span>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

export function ChangelogList() {
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<ChangelogEntryType | "all">("all");

	const tokens = useMemo(() => tokenize(search), [search]);

	const hasResults = useMemo(() => {
		return CHANGELOG_DATA.versions.some((v) =>
			v.entries.some((e) => {
				if (filter !== "all" && e.type !== filter) return false;
				return matchesQuery(e, tokens);
			}),
		);
	}, [tokens, filter]);

	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			{/* Search + Filters */}
			<div className="glass sticky top-16 z-10 flex flex-col gap-[var(--space-sm)] rounded-[var(--radius-lg)] p-[var(--space-md)]">
				<input
					type="search"
					placeholder="Search changelog..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-glow)]"
				/>
				<div className="flex flex-wrap gap-1">
					{FILTER_OPTIONS.map((opt) => (
						<button
							key={opt.value}
							type="button"
							onClick={() => setFilter(opt.value)}
							className={`rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium transition-colors ${
								filter === opt.value
									? "bg-[var(--color-accent)] text-white"
									: "bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
							}`}
						>
							{opt.label}
						</button>
					))}
				</div>
			</div>

			{/* Version Sections */}
			{hasResults ? (
				CHANGELOG_DATA.versions.map((v) => (
					<VersionSection
						key={v.version}
						version={v}
						tokens={tokens}
						filter={filter}
					/>
				))
			) : (
				<div className="py-[var(--space-3xl)] text-center text-[var(--color-text-muted)]">
					No changes match your search.
				</div>
			)}
		</div>
	);
}
