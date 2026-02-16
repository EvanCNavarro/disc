# DISC — Remaining Work Summary

Generated: 2026-02-15 (post v0.7.1 commit)

---

## Completed (Shipped)

| Version | What Shipped |
|---------|-------------|
| v0.1.0 | Phase 0 — Monorepo, CI stubs, versioning |
| v0.2.0 | Phase 1 — Auth.js + Spotify OAuth, playlist grid, sync |
| v0.3.0 | Phase 2 — Design system (DiscLogo, glass, NavDock, UserDropdown) |
| v0.4.0 | Phase 3 — Full pipeline (lyrics → extraction → convergence → Replicate), dashboard, settings, R2, 6 styles |
| v0.5.0 | Phase 3.5 — Changelog page, search, unread indicators, per-user tracking |
| v0.5.1 | Phase 3.75 — UI polish (buttons, login redesign, BackToTop, staleTimes) |
| v0.6.0 | Phase 4A — Worker `/trigger`, batch generate API, QueueBoard kanban, StylePicker, ImageReviewModal |
| v0.6.1 | Queue UX polish |
| v0.7.1 | Dashboard polish: useCachedFetch, cost tracking (DB + pipeline + API + tooltip), formatTimestamp, sticky header, responsive stats grid, Biome zero errors |

---

## Remaining — Tier 1 (Must Have)

### B1. Playlist Detail Page (`/playlists/[slug]`)

The core transparency feature. 9 sub-tasks, none started.

| Sub-task | Description |
|----------|-------------|
| B1.1 | Route setup + data fetching |
| B1.2 | Playlist header (name, art, stats) |
| B1.3 | Action bar (regenerate, style override) |
| B1.4 | Analysis summary (chosen object, aesthetic context) |
| B1.5 | Generation history timeline |
| B1.6 | Expanded generation detail |
| B1.7 | Track listing with extraction data |
| B1.8 | Object inventory (claimed objects across playlists) |
| B1.9 | Change detection panel |

### B4. Image Serving (R2 Proxy)

| Sub-task | Description |
|----------|-------------|
| B4.1 | API route `/api/images/[...key]` to proxy R2 → Vercel |
| B4.2 | Dashboard thumbnails using proxied images |
| B4.3 | Full-size display on detail page |
| B4.4 | Image comparison (before/after) — future |

---

## Remaining — Tier 2 (High Value)

### B2. Song-Level Caching & Reuse

New `song_analyses` table, pipeline caches per-song extraction, song detail view, cross-playlist song references. Not started.

### B3. Incremental Analysis

Skip full re-analysis when only 1-2 songs change. Merge new extractions with previous. UI badge for "Full" vs "Incremental". Not started.

### B6. Cost Tracking (remaining)

B6.1-B6.2 shipped in v0.7.1 (calculate + store + display per-generation). Still pending:

| Sub-task | Description |
|----------|-------------|
| B6.3 | Per-generation cost display with breakdown (done for table tooltip, NOT done for playlist detail page) |
| B6.4 | Monthly cost summary dashboard widget |

### B7. Song Metadata Expansion

Album art images, genres (artist lookup), duration in track data. Pipeline changes to fetch richer Spotify data. Not started.

---

## Remaining — Tier 3 (Nice to Have)

| Item | Description | Status |
|------|-------------|--------|
| B5. Job Detail Page | `/jobs/[id]` — needs `job_id` column on generations | Not started |
| B9. Object Scoring System | Numeric tier scoring (high=3, medium=2, low=1), aggregate, pass to convergence | Not started |
| B10. Loading Skeletons | Per-page skeleton loaders for playlists, settings, playlist detail | Not started |

---

## Remaining — Tier 4 (Future)

### B11. Theme Grouping & Visual Collage

Semantic grouping, object frequency dashboard, collage style, trend analysis. No concrete plan exists.

### Style Creation via Paste (NEW — not yet planned)

User-described feature: paste an image and/or text → system extracts the visual style → attempts to recreate it → user fine-tunes the prompt structure → saves as a selectable style for manual/cron generation.

Steps (conceptual):
1. Upload/paste reference image(s) + text description
2. Extract visual characteristics (colors, textures, composition, mood)
3. Generate a test image using extracted style prompt
4. Show side-by-side comparison with reference
5. User iterates on prompt text to refine
6. Save finalized prompt template as a new style in the `styles` table
7. Style becomes selectable in StylePicker for queue and cron jobs

This needs a full design spec before implementation.

---

## Active Plan Files (Uncommitted)

### PLAN-image-review-modal.md

Redesign ImageReviewModal from 2-column layout to multi-generation horizontal timeline.

| Step | Description | Status |
|------|-------------|--------|
| 1 | Add `GenerationVersion` type to shared types | Not started |
| 2 | New API route `/api/playlists/[spotifyPlaylistId]/generations` | Not started |
| 3 | Extract `formatRelative` to shared util | Done |
| 4 | Redesign ImageReviewModal (timeline, visual hierarchy) | Not started |
| 5 | Update QueueBoard to fetch generations on modal open | Not started |

---

## Infrastructure Gaps

| Item | Status |
|------|--------|
| GitHub Actions CI (`.github/workflows/`) | NOT CREATED — listed in Phase 0 deliverables but never built |
| CHANGELOG.md | Stale — missing v0.6.0, v0.6.1, v0.7.1 entries |
| SPEC.md | Stale — version says 0.1.0, file paths outdated, module names don't match reality |
| CF Queues | SPEC calls for queue fan-out; actual uses direct HTTP triggers |
| Token revocation detection | In SPEC Phase 4 but not confirmed built |
| DB migration 006 | SQL file exists but NOT yet run against production D1 |

---

## Priority Order (Recommended)

1. **Run migration 006** against D1 (unblocks cost tracking in production)
2. **B4 Image Serving** (R2 proxy — enables actual cover art display everywhere)
3. **B1 Playlist Detail Page** (the core transparency feature the app is built for)
4. **ImageReviewModal redesign** (PLAN file exists, depends on B4)
5. **Style Creation via Paste** (new feature, needs design spec first)
6. **B6.4 Monthly cost summary** (quick win, data already captured)
7. **CHANGELOG + SPEC cleanup** (housekeeping)
8. **B2/B3 Song caching + Incremental** (optimization, lower priority)
9. **CI pipeline** (important for quality but not blocking features)
