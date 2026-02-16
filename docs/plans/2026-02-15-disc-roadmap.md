# DISC Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete all remaining DISC features from infrastructure through v1.0, ordered by critical path dependencies and front-loading easy wins.

**Architecture:** Vercel (Next.js 16 frontend) + Cloudflare Workers (pipeline) + D1 (database) + R2 (image storage). Web app reaches Cloudflare services via REST API. Pipeline runs on cron or manual trigger.

**Tech Stack:** Next.js 16, TypeScript, Biome, Cloudflare D1/R2/Workers, Replicate (image gen), OpenAI GPT-4o-mini (text analysis), GitHub Actions CI.

---

## Critical Path

```
Migration 006 ──┬── B4 Image Proxy ── B1 Detail Page ──┬── ImageReviewModal
                │                                       ├── B7 Metadata Display
                │                                       ├── B9 Object Scoring Display
                │                                       └── Object Repository
                └── Cost Dashboard (independent)

CI Pipeline (independent, protects all work)
B2 Song Caching ── B3 Incremental Analysis
Style Creation (needs B4 + design spec)
```

## Version Map

| Version | Phase | Content |
|---------|-------|---------|
| v0.8.0 | 0+1 | Migration 006, CI fixes, B4 Image Proxy |
| v0.9.0 | 2 | B1 Playlist Detail Page (full 9 sub-tasks) |
| v0.10.0 | 3+4 | B2 Song Caching, B9 Scoring, ImageReviewModal, B7 Metadata |
| v0.11.0 | 5a | Style Creation Gallery |
| v0.12.0 | 5b | Cost Analytics Dashboard |
| v0.13.0 | 6+7 | B3 Incremental, Object Repository, B5 Job Detail, Skeletons |
| v1.0.0 | 8 | Doc cleanup, final polish |

---

## Phase 0: Quick Wins (v0.8.0 part 1)

### Task 1: Run Migration 006 Against Production D1

**Files:**
- Execute: `migrations/006_generation_cost_tracking.sql`

**Step 1: Run the migration**

```bash
wrangler d1 execute disc-db --file=migrations/006_generation_cost_tracking.sql --config=workers/cron/wrangler.toml
```

**Step 2: Verify columns exist**

```bash
wrangler d1 execute disc-db --command="PRAGMA table_info(generations)" --config=workers/cron/wrangler.toml
```

Expected: Output includes `model_name`, `llm_input_tokens`, `llm_output_tokens`, `image_model`, `cost_breakdown` columns.

**Step 3: Verify no data loss**

```bash
wrangler d1 execute disc-db --command="SELECT COUNT(*) as cnt FROM generations" --config=workers/cron/wrangler.toml
```

Expected: Same count as before migration.

**Success Metrics:**
- [ ] All 5 new columns visible in schema
- [ ] Existing generation rows intact
- [ ] Next pipeline run populates cost_usd and cost_breakdown for new generations

---

### Task 2: Fix CI Pipeline

**Files:**
- Modify: `.github/workflows/ci.yml`

CI exists but may not be running (BUILDPLAN says "NOT YET CREATED" but file exists). Verify it works, add Cloudflare Workers deployment on main push.

**Step 1: Check if CI is actually running**

```bash
gh run list --limit 5
```

**Step 2: Update CI to add Workers deployment (if not present)**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run typecheck

  deploy-worker:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: ci
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          workingDirectory: workers/cron
```

**Step 3: Verify CI runs locally**

```bash
npm run lint && npm run typecheck
```

Expected: Both pass with zero errors.

**Step 4: Bump package.json version to 0.8.0**

The root `package.json` still says `0.6.0`. Update to reflect actual state.

**Success Metrics:**
- [ ] `npm run lint` passes with zero errors
- [ ] `npm run typecheck` passes with zero errors
- [ ] GitHub Actions CI runs on push to main
- [ ] package.json version matches latest shipped version

---

## Phase 1: Image Serving (v0.8.0 part 2)

### Task 3: B4.1 — R2 Image Proxy API Route

**Files:**
- Create: `apps/web/src/app/api/images/[...key]/route.ts`

**Step 1: Create the API route**

The route receives a catch-all path like `/api/images/generations/userId/playlistId/timestamp.png`, authenticates the user, validates the path belongs to them, fetches from R2 via Cloudflare API, and streams back with immutable cache headers.

```typescript
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { key } = await params;
  const r2Key = key.join("/");

  // Get user's internal ID for path validation
  const users = await queryD1<{ id: string }>(
    "SELECT id FROM users WHERE spotify_user_id = ?",
    [session.user.id],
  );
  if (users.length === 0) {
    return new Response("Forbidden", { status: 403 });
  }

  // Security: verify the key starts with "generations/{userId}/"
  if (!r2Key.startsWith(`generations/${users[0].id}/`)) {
    return new Response("Forbidden", { status: 403 });
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const bucketName = "disc-images";

  if (!accountId || !apiToken) {
    return new Response("Server configuration error", { status: 500 });
  }

  const r2Url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects/${encodeURIComponent(r2Key)}`;

  const r2Response = await fetch(r2Url, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });

  if (!r2Response.ok) {
    return new Response("Image not found", { status: 404 });
  }

  return new Response(r2Response.body, {
    headers: {
      "Content-Type": r2Response.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

**Step 2: Verify typecheck passes**

```bash
cd apps/web && npx tsc --noEmit
```

**Step 3: Test manually**

Start dev server at `http://127.0.0.1:4993`, then:
- Unauthenticated: `curl -I http://127.0.0.1:4993/api/images/generations/test/test.png` → 401
- After signing in via browser, check network tab for image requests

**Success Metrics:**
- [ ] Authenticated request to valid R2 key returns image with `Content-Type: image/png`
- [ ] Unauthenticated request returns 401
- [ ] Path traversal (wrong userId) returns 403
- [ ] Missing image returns 404
- [ ] Response includes `Cache-Control: public, max-age=31536000, immutable`
- [ ] TypeScript compiles clean

---

### Task 4: B4.2 — Dashboard Thumbnails

**Files:**
- Modify: `apps/web/src/components/dashboard/GenerationHistoryTable.tsx`

**Step 1: Add thumbnail column to desktop table**

In the generation table, add an image column that shows a small thumbnail if `r2_key` is set on the generation row.

```tsx
{row.r2_key && (
  <img
    src={`/api/images/${row.r2_key}`}
    alt={`Cover for ${row.playlist_name}`}
    className="h-10 w-10 rounded-[var(--radius-sm)] object-cover"
    loading="lazy"
  />
)}
```

**Step 2: Verify the API route returns generation r2_key**

Check that `/api/generations` SELECT includes `g.r2_key` in its query.

**Step 3: Test visually**

Navigate to dashboard at `http://127.0.0.1:4993/`. Generations that have `r2_key` should show thumbnails. Generations without should show no image (graceful fallback).

**Success Metrics:**
- [ ] Thumbnails render for generations with `r2_key`
- [ ] No broken images for generations without `r2_key`
- [ ] Images lazy-load (don't block page render)
- [ ] Mobile layout not broken by thumbnail column

---

### Task 5: Commit v0.8.0

**Step 1: Run full quality checks**

```bash
npm run lint && npm run typecheck
```

**Step 2: Commit and tag**

```bash
git add -A
git commit -m "feat: v0.8.0 — migration 006, CI deploy, R2 image proxy"
```

**Step 3: Update REMAINING-WORK.md**

Mark Migration 006, CI, B4.1, B4.2 as complete.

---

## Phase 2: Playlist Detail Page (v0.9.0)

### Task 6: B1.1 — Route Setup + Data Fetching

**Files:**
- Create: `apps/web/src/app/(dashboard)/playlists/[slug]/page.tsx`
- Create: `apps/web/src/app/(dashboard)/playlists/[slug]/loading.tsx`
- Modify: `apps/web/src/components/PlaylistCard.tsx` (add Link wrapper)

**Step 1: Create the page as a server component**

Fetch all data via `queryD1()`:
1. Playlist row (name, track count, spotify IDs)
2. Latest analysis (convergence result, track extractions, chosen object)
3. All generations (timeline)
4. Claimed objects
5. Style info

**Step 2: Create loading skeleton**

Glass card with pulse animations matching the page layout.

**Step 3: Update PlaylistCard to link to detail page**

Wrap each card in `<Link href={`/playlists/${playlist.id}`}>`.

**Step 4: Test navigation**

Click a playlist card → navigates to `/playlists/[id]` → shows data or loading skeleton.

**Success Metrics:**
- [ ] Route resolves and renders
- [ ] All 5 queries execute without error
- [ ] Loading skeleton shows during data fetch
- [ ] Back button returns to playlists grid
- [ ] 404 for invalid playlist IDs

---

### Task 7: B1.2 + B1.3 — Header + Action Bar

**Files:**
- Modify: `apps/web/src/app/(dashboard)/playlists/[slug]/page.tsx`
- Create: `apps/web/src/components/playlist-detail/PlaylistHeader.tsx`
- Create: `apps/web/src/components/playlist-detail/ActionBar.tsx`

**Step 1: Build PlaylistHeader**

Display: playlist name (h1), track count, Spotify external link, cover image (from R2 via B4 or Spotify fallback).

**Step 2: Build ActionBar**

Two buttons: "Generate Now" (POST to `/api/playlists/[id]/regenerate`) and "Nominate for Next Run" (server action to update status). Both disabled during `processing` state.

**Step 3: Test**

- Header renders with all data
- Buttons show loading states
- Disabled when playlist is processing
- Mobile: responsive layout, touch targets ≥48px

**Success Metrics:**
- [ ] Cover art displays from R2 (or Spotify fallback)
- [ ] Action buttons trigger correct API calls
- [ ] Loading states visible during async operations
- [ ] Responsive on mobile

---

### Task 8: B1.4 — Analysis Summary

**Files:**
- Create: `apps/web/src/components/playlist-detail/AnalysisSummary.tsx`

**Step 1: Build the summary component**

Parse `playlist_analyses` row. Display:
- Chosen object (prominent, large text)
- Aesthetic context
- Style name (from styles table join)
- When generated (formatTimestamp)

**Step 2: Handle edge case — no analysis exists**

Show "No analysis yet — generate to see results" CTA.

**Success Metrics:**
- [ ] Chosen object and aesthetic context clearly visible
- [ ] Style name resolved from ID
- [ ] Empty state handles gracefully

---

### Task 9: B1.5 + B1.6 — Generation Timeline + Expanded Detail

**Files:**
- Create: `apps/web/src/components/playlist-detail/GenerationTimeline.tsx`
- Create: `apps/web/src/components/playlist-detail/GenerationDetail.tsx`

**Step 1: Build timeline component**

Chronological list of all generations. Each entry shows: thumbnail (from B4), chosen object, style name, date, duration active, status badge, cost.

**Step 2: Build expanded detail component**

On click/expand, show: full image, style description, timestamp (absolute + relative), duration, cost with breakdown tooltip (reuse CostTooltip from GenerationHistoryTable), convergence candidates with rank/reasoning, collision notes.

**Step 3: Progressive disclosure**

Use `<details>/<summary>` or client-side state toggle. Only load full image when expanded.

**Step 4: Test**

- Timeline renders all generations in order
- Click expands to show full detail
- Convergence candidates visible with ranking
- Cost tooltip works (for generations with cost data)
- Empty state for playlists with no generations

**Success Metrics:**
- [ ] All generations appear in chronological order
- [ ] Expand/collapse works smoothly
- [ ] Full convergence reasoning visible
- [ ] Cost breakdown tooltip functional
- [ ] Accessible: keyboard navigation, focus management

---

### Task 10: B1.7 — Track Listing

**Files:**
- Create: `apps/web/src/components/playlist-detail/TrackListing.tsx`

**Step 1: Build track listing**

Parse `track_snapshot` and `track_extractions` from analysis. Each row shows: song name, artist, album, extracted objects as colored pills (high=green, medium=yellow, low=gray), outlier badge if in `tracks_added`.

**Step 2: Test**

- All tracks render
- Extraction pills color-coded by tier
- Outlier badges visible for added tracks

**Success Metrics:**
- [ ] Track count matches playlist header
- [ ] Tier colors correct (green/yellow/gray)
- [ ] Scrollable on mobile without horizontal overflow

---

### Task 11: B1.8 + B1.9 — Object Inventory + Change Detection

**Files:**
- Create: `apps/web/src/components/playlist-detail/ObjectInventory.tsx`
- Create: `apps/web/src/components/playlist-detail/ChangeDetection.tsx`
- Create: `packages/shared/src/object-categories.ts`

**Step 1: Build object categorizer**

Simple keyword-based categorizer in shared package. Maps objects to categories (Animals, Nature, Emotions, etc.).

**Step 2: Build ObjectInventory**

Group all extracted objects by category. Show frequency counts. Highlight the chosen object.

**Step 3: Build ChangeDetection panel**

Show tracks added/removed, outlier count vs threshold, whether regeneration was triggered. Only visible when previous analysis exists.

**Step 4: Test**

- Objects grouped correctly
- Chosen object highlighted
- Change detection shows diff accurately
- Hidden when no previous analysis

**Success Metrics:**
- [ ] Categorization covers common objects
- [ ] Chosen object visually distinct
- [ ] Change panel shows correct add/remove counts
- [ ] Panel hidden for first-ever analysis

---

### Task 12: Commit v0.9.0

**Step 1: Run quality checks**

```bash
npm run lint && npm run typecheck
```

**Step 2: Test full page end-to-end**

Navigate through: Playlists grid → click card → detail page loads → scroll through all sections → expand generation → see convergence → back to grid.

**Step 3: Commit and update docs**

```bash
git commit -m "feat: v0.9.0 — playlist detail page with full transparency"
```

Update REMAINING-WORK.md: mark B1.1-B1.9 complete.

---

## Phase 3: Pipeline Intelligence (v0.10.0 part 1)

### Task 13: B2 — Song-Level Caching

**Files:**
- Create: `migrations/007_song_analyses.sql`
- Modify: `workers/cron/src/pipeline.ts`
- Modify: `workers/cron/src/spotify.ts` (add track ID to return type)

**Step 1: Create migration**

New `song_analyses` table with `spotify_track_id` as unique key, storing extracted objects per song.

**Step 2: Update Spotify API to return track IDs**

Add `id` to the `fields` parameter in `fetchPlaylistTracks()`.

**Step 3: Add cache-check logic to pipeline**

Before lyrics fetch: query `song_analyses` for all track IDs. Skip cached songs. Only fetch lyrics + extract for uncached. Merge results.

**Step 4: Run migration against D1**

```bash
wrangler d1 execute disc-db --file=migrations/007_song_analyses.sql --config=workers/cron/wrangler.toml
```

**Step 5: Test**

Trigger pipeline for a playlist. Check `song_analyses` table is populated. Trigger again — verify second run skips lyrics fetch for cached songs (check worker logs for timing difference).

**Success Metrics:**
- [ ] `song_analyses` table populated after first run
- [ ] Second run for same playlist is faster (skips cached songs)
- [ ] Same song in different playlists uses cached extraction
- [ ] Convergence result still correct with mixed cached/fresh extractions

---

### Task 14: B9 — Object Scoring

**Files:**
- Modify: `workers/cron/src/extraction.ts`
- Modify: `apps/web/src/components/playlist-detail/ObjectInventory.tsx`

**Step 1: Add scoring logic**

`TIER_SCORES = { high: 3, medium: 2, low: 1 }`. Aggregate scores across all tracks.

**Step 2: Include scores in convergence prompt**

Pass object scores as additional context to `convergeAndSelect()`.

**Step 3: Display scores on detail page**

In ObjectInventory, show score next to each object: "wolf (12pts, x4 tracks)".

**Success Metrics:**
- [ ] Scores calculated correctly
- [ ] Convergence prompt includes scores
- [ ] Scores visible on detail page

---

## Phase 4: UI Enrichment (v0.10.0 part 2)

### Task 15: ImageReviewModal Redesign

**Files:**
- Modify: `apps/web/src/components/queue/ImageReviewModal.tsx`
- Create: `apps/web/src/app/api/playlists/[spotifyPlaylistId]/generations/route.ts`

**Step 1: Create generations-per-playlist API route**

Returns all generations for a specific playlist, ordered by date.

**Step 2: Redesign modal to horizontal timeline**

Show all past generations as a scrollable horizontal strip. Current generation highlighted. Click any to compare.

**Step 3: Test**

Modal opens → timeline shows all generations → clicking switches displayed image.

**Success Metrics:**
- [ ] Timeline renders all generations
- [ ] Current generation highlighted
- [ ] Comparison between generations works
- [ ] Modal accessible (keyboard, focus trap)

---

### Task 16: B7 — Song Metadata Expansion

**Files:**
- Modify: `workers/cron/src/spotify.ts`
- Modify: `apps/web/src/components/playlist-detail/TrackListing.tsx`

**Step 1: Expand Spotify API fields**

Add `album.images`, `artists.id`, `duration_ms` to fetch query.

**Step 2: Batch fetch artist genres**

`GET /v1/artists?ids=id1,id2,...` (max 50 per request).

**Step 3: Update track listing display**

Show album art thumbnails, formatted duration, genre tags.

**Success Metrics:**
- [ ] Album art renders per track
- [ ] Duration displays as "3:42" format
- [ ] Genres show as tags

---

### Task 17: Commit v0.10.0

```bash
git commit -m "feat: v0.10.0 — song caching, object scoring, modal redesign, metadata"
```

Update REMAINING-WORK.md.

---

## Phase 5a: Style Creation Gallery (v0.11.0)

> **Requires design spec** — use brainstorming skill before implementation.

### Overview

Bobby's vision:
- **Styles gallery page** showing all styles with generated thumbnails
- Each style card: title, prompt text, auto-generated thumbnail
- **Add new style** flow: paste images, text, or both
- On save/prompt change: quick AI call → best object for prompt → generate that object in style → save as thumbnail
- CRUD operations: create, read, update, delete styles

### Key Tasks (to be detailed in design spec):
1. New page: `/styles` with gallery grid
2. Style card component with thumbnail, title, preview
3. Add/edit style modal with prompt editor
4. API route: generate style thumbnail (AI object pick → image gen)
5. Background thumbnail regeneration on prompt change
6. Styles table schema updates (add thumbnail_r2_key, description fields)

### Success Metrics:
- [ ] All styles visible in gallery with thumbnails
- [ ] New style creation works end-to-end
- [ ] Prompt change triggers thumbnail regeneration
- [ ] Style selectable in queue StylePicker

---

## Phase 5b: Cost Analytics Dashboard (v0.12.0)

> **Requires design spec** — use brainstorming skill before implementation.

### Overview

Bobby's vision:
- **Timeline chart** with day/week/month/quarter/year granularity toggle
- **Multiple lines**: each cost category gets own line (LLM calls, image gen, fixed subscriptions)
- **Toggle**: all lines or single averaged line
- **Breakdown table** below chart with same filters
- **Shared filters/search** above both chart and table
- **Cost categories**: fixed monthly (Spotify, Cloudflare, Vercel plans) vs usage-based (API calls)
- **Usage sub-types**: one-time manual vs recurring cron, with counts

### Key Tasks (to be detailed in design spec):
1. Chart library selection (recharts, visx, or lightweight custom SVG)
2. Cost aggregation API route with time bucket params
3. Fixed cost configuration (settings page or DB table)
4. Chart component with granularity toggle
5. Breakdown table with shared filter state
6. Filter controls (date range, category, type)

### Success Metrics:
- [ ] Chart renders with correct cost data
- [ ] Granularity toggle works (day/week/month/quarter/year)
- [ ] Filters apply to both chart and table
- [ ] Fixed and usage costs distinguished
- [ ] Manual vs cron costs distinguishable

---

## Phase 6: Advanced Features (v0.13.0)

### Task: B3 — Incremental Analysis

**Depends on:** B2 Song Caching

When only 1-2 songs change (below threshold), only analyze new songs. Merge with cached results. Mark analysis as "Incremental" vs "Full".

### Task: Object Repository

Global view of all objects ever referenced across all playlists. Frequency counts, recurrence patterns. A thematic index of your music library.

### Task: B5 — Job Detail Page

`/jobs/[id]` showing per-job results. Needs `job_id` column on generations.

### Task: B10 — Loading Skeletons

Per-page skeleton loaders for all dynamic pages. Built incrementally with each page.

---

## Phase 7: Production Ready (v1.0.0)

### Task: Doc Cleanup

- Update CHANGELOG.md with all versions since v0.5.1
- Update SPEC.md to match current architecture
- Re-baseline BUILDPLAN.md version strategy
- Remove stale plan files

### Task: Final Polish

- Cross-page consistency audit
- Mobile responsiveness verification
- Accessibility audit (WCAG 2.2 AA)
- Performance audit (Core Web Vitals)

---

## Testing Strategy

### Per-Task Testing

Every task includes:
1. **TypeScript compilation**: `npm run typecheck` passes
2. **Lint**: `npm run lint` passes (Biome zero errors)
3. **Visual verification**: Check at `http://127.0.0.1:4993/`
4. **Mobile check**: Browser DevTools responsive mode

### Per-Phase Testing

Each version bump includes:
1. Full quality check: `npm run lint && npm run typecheck`
2. End-to-end user flow test
3. REMAINING-WORK.md updated
4. ELI5 progress report to Bobby

### Integration Testing

- Pipeline runs after B2/B3/B7 changes → verify cost tracking still works
- Cross-page navigation → verify no broken links
- Auth flow → verify protected routes still block unauthenticated access

---

## Progress Tracking

After each task completion:
1. Mark task complete in todo list
2. Update `docs/REMAINING-WORK.md`
3. ELI5 progress report: what was done, what's next, any blockers
4. Commit if task produces shippable code
