# DISC — Build Plan

> **Current version**: 0.5.0 (changelog + footer + unread indicator)
> **Phase 3**: Complete — pipeline, dashboard, settings, deployed to disc.400.dev
> **Phase 3.5**: Complete — changelog page, structured changelog.json, footer, unread tracking, breadcrumbs
> **Phase 4**: Not started — playlist detail, image serving, manual triggers (Tier 1 below)

Phase 3 built the pipeline (lyrics → extraction → convergence → image) and the dashboard overview. Phase 3.5 adds the **transparency layer**: every piece of data the pipeline produces should be visible, navigable, and actionable from the UI.

---

## Architecture Context

```
apps/web/src/
├── app/(dashboard)/
│   ├── page.tsx                     # Dashboard overview (exists)
│   ├── playlists/
│   │   ├── page.tsx                 # Playlist grid (exists)
│   │   └── [slug]/                  # ← NEW: Playlist detail page
│   │       ├── page.tsx
│   │       └── loading.tsx
│   └── settings/
│       └── page.tsx                 # Settings (exists)
├── components/
│   ├── NavDock.tsx                  # (exists)
│   ├── NavItems.tsx                 # (exists)
│   ├── PlaylistCard.tsx             # (exists) — will link to /playlists/[slug]
│   └── PlaylistGrid.tsx             # (exists)
├── lib/
│   ├── db.ts                        # queryD1() helper (exists)
│   ├── auth.ts                      # Auth.js v5 (exists)
│   └── spotify.ts                   # Spotify API helpers (exists)
```

```
workers/cron/src/
├── index.ts        # Entrypoint: scheduled() + fetch(/trigger)
├── pipeline.ts     # 12-step orchestrator
├── extraction.ts   # extractThemes() + convergeAndSelect() + detectChanges()
├── lyrics.ts       # fetchLyricsBatch()
├── openai.ts       # chatCompletionJSON()
├── replicate.ts    # generateImage()
├── spotify.ts      # fetchPlaylistTracks() + uploadPlaylistCover() + refreshAccessToken()
├── image.ts        # compressForSpotify()
└── crypto.ts       # encrypt() + decrypt()
```

**Database**: Cloudflare D1 (SQLite). Web app accesses via REST API (`queryD1()`). Worker accesses via D1 binding (`env.DB`).

**Key tables**: `users`, `playlists`, `generations`, `jobs`, `styles`, `playlist_analyses`, `claimed_objects`.

---

## Tier 1 — Must Have (Build First)

### B1. Playlist Detail Page — `/playlists/[slug]`

**The core transparency feature.** Clicking a playlist shows everything the pipeline knows about it.

#### B1.1 Route Setup

**File**: `apps/web/src/app/(dashboard)/playlists/[slug]/page.tsx`

The `slug` is the playlist's internal DB `id` (hex string). Pass it as a dynamic segment.

```typescript
// page.tsx — server component
export default async function PlaylistDetailPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  // ... fetch all data below
}
```

**Data fetching** — single server component, all queries via `queryD1()`:
1. `SELECT * FROM playlists WHERE id = ? AND user_id = ?` → playlist row
2. `SELECT * FROM playlist_analyses WHERE playlist_id = ? ORDER BY created_at DESC LIMIT 1` → latest analysis
3. `SELECT * FROM generations WHERE playlist_id = ? ORDER BY created_at DESC` → generation history
4. `SELECT * FROM claimed_objects WHERE playlist_id = ? ORDER BY created_at DESC` → current + superseded objects
5. `SELECT * FROM styles WHERE id = ?` → style info

**Update `PlaylistCard.tsx`**: Wrap each card in `<Link href={"/playlists/" + playlist.id}>`.

#### B1.2 Header Section

Display:
- Playlist name (h1), track count from `playlists.track_count`
- External Spotify link: `https://open.spotify.com/playlist/${playlist.spotify_playlist_id}`
- Current cover image. **Two sources**: `playlists.spotify_cover_url` (Spotify's CDN thumbnail) or the latest generation's R2 image via `/api/images/[key]` (see B4). Prefer R2 if available.

#### B1.3 Action Bar

Two buttons:
- **"Nominate for Next Run"** — server action: `UPDATE playlists SET status = 'queued' WHERE id = ?`. Revalidate path.
- **"Generate Now"** — calls `POST /api/playlists/[id]/generate` (see B8). Shows loading state.

Both are disabled if `status = 'processing'`.

#### B1.4 Current Analysis Summary

Parse the latest `playlist_analyses` row:
- `chosen_object` + `aesthetic_context` — displayed prominently
- Style name — join with `styles.name` via `style_id`
- When generated — `created_at` formatted with relative time ("3 days ago")

These JSON columns need parsing:
- `convergence_result` → `ConvergenceResult` (from `@disc/shared`)
- `track_extractions` → `TrackExtraction[]` (from `@disc/shared`)

#### B1.5 Generation History Timeline

Query: all rows from `generations WHERE playlist_id = ? ORDER BY created_at DESC`.

Each entry shows:
- **Thumbnail**: from R2 via `/api/images/${gen.r2_key}?w=80` (see B4) or placeholder if no `r2_key`
- **Chosen object**: `gen.symbolic_object`
- **Style**: join `styles.name` via `gen.style_id`
- **Date**: `gen.created_at` with relative time
- **Duration active**: calculate from `gen.created_at` to next generation's `created_at` (or "to present")
- **Status badge**: reuse `StatusBadge` from dashboard page

Click to expand → B1.6 detail view.

Use `<details>/<summary>` or client-side state toggle. When expanded, show full breakdown.

#### B1.6 Expanded Generation Detail

When a timeline entry is clicked/expanded, show:
- **Full image**: `<img src="/api/images/${gen.r2_key}" />` (see B4)
- **Style name + description**: from `styles` table join
- **Timestamp**: absolute + relative ("Feb 12, 2026 at 4:20 AM — 3 days ago")
- **Duration**: `gen.duration_ms` formatted as seconds ("12.4s")
- **Cost**: `gen.cost_usd` or "—" if not yet tracked (see B6)
- **Chosen object + aesthetic context**: from linked `playlist_analyses` row via `gen.analysis_id`
- **Convergence candidates**: parse `playlist_analyses.convergence_result` JSON → show all 3 candidates with `rank`, `reasoning`. Highlight selected (index matches `selectedIndex`).
- **Collision notes**: from `convergence_result.collisionNotes`

#### B1.7 Track Listing

Parse `playlist_analyses.track_snapshot` → JSON array of track objects.
Cross-reference with `playlist_analyses.track_extractions` to get per-song extracted objects.

Each track row:
- Song name, artist, album (from `track_snapshot`)
- Album art thumbnail (requires B7 — album images in snapshot). For now, placeholder.
- Genre (requires B7 — artist genre lookup). For now, omit.
- Duration (requires B7 — `duration_ms` in snapshot). For now, omit.
- Extracted objects per song from `track_extractions`: show as pills, colored by tier (high=green, medium=yellow, low=gray)
- Lyrics excerpt: `track_extractions[i].lyrics?.slice(0, 200)` — only if stored. Currently lyrics are NOT persisted in the analysis. **To enable this, update `TrackExtraction` type and pipeline to include lyrics in the JSON.**
- "Outlier" badge: if `playlist_analyses.tracks_added` JSON includes this track name

#### B1.8 Object Inventory

Parse all `track_extractions` → collect every `TieredObject.object` across all tracks.

Group by semantic category. **Approach**: use a simple keyword-based categorizer in `packages/shared/src/object-categories.ts`:
```typescript
const CATEGORIES: Record<string, string[]> = {
  "Animals": ["wolf", "hawk", "serpent", "lion", ...],
  "Nature": ["mountain", "ocean", "forest", "river", ...],
  "Emotions": ["grief", "joy", "rage", "longing", ...],
  // ...
};
export function categorizeObject(obj: string): string { ... }
```

Display:
- Category header + count
- Comma-separated objects within each category
- The `chosen_object` highlighted with accent color + "(chosen)" label
- Objects that appear in multiple tracks get a count: "wolf (×3)"

#### B1.9 Change Detection Panel

From `playlist_analyses`:
- `tracks_added` (JSON array) — list of songs added since last analysis
- `tracks_removed` (JSON array) — list of songs removed
- `outlier_count` vs `outlier_threshold` — show as fraction and percentage
- `regeneration_triggered` — "Auto-regen: Yes/No"

Simple card with 4 stats. Only shown if there was a previous analysis.

---

### B4. Image Serving

The pipeline archives full-resolution PNGs to R2 with keys like:
`generations/{user_id}/{spotify_playlist_id}/{timestamp}.png`

The web app (Vercel) cannot access R2 directly. Need an API proxy.

#### B4.1 API Route

**File**: `apps/web/src/app/api/images/[...key]/route.ts`

```typescript
import { auth } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { key } = await params;
  const r2Key = key.join("/");

  // Security: verify the key starts with "generations/{userId}/"
  // to prevent path traversal
  const userId = await getUserIdFromSession(session);
  if (!r2Key.startsWith(`generations/${userId}/`)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Fetch from R2 via Cloudflare API
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/disc-images/objects/${encodeURIComponent(r2Key)}`,
    { headers: { Authorization: `Bearer ${API_TOKEN}` } }
  );

  // Stream through with cache headers
  return new Response(response.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

**Alternative (simpler)**: Use R2 public bucket URL if public access is enabled. Configure in R2 dashboard: `disc-images.{account}.r2.dev`. Then just store the public URL. Cheaper and avoids the proxy.

**Decision**: Start with API proxy for security (images are private per user). Migrate to public bucket + signed URLs later if needed.

#### B4.2 Dashboard Thumbnails

Update dashboard's Recent Generations section. Each generation row should show a small thumbnail if `r2_key` is set:

```tsx
{gen.r2_key && (
  <img
    src={`/api/images/${gen.r2_key}`}
    alt={`Cover for ${gen.playlist_name}`}
    className="h-10 w-10 rounded-[var(--radius-sm)] object-cover"
    loading="lazy"
  />
)}
```

#### B4.3 Full-Size Image on Detail Page

On `/playlists/[slug]`, the header shows the current cover large:
```tsx
<img
  src={latestGeneration?.r2_key
    ? `/api/images/${latestGeneration.r2_key}`
    : playlist.spotify_cover_url ?? "/placeholder-cover.svg"
  }
  alt={`Cover art for ${playlist.name}`}
  className="aspect-square w-full max-w-sm rounded-[var(--radius-lg)] object-cover"
/>
```

#### B4.4 Image Comparison (Future)

Side-by-side previous vs current. Use CSS grid with two columns. Click to toggle between generations. Not a priority for initial launch.

---

### B8. Manual Generation Trigger from UI

#### B8.1 API Route

**File**: `apps/web/src/app/api/playlists/[id]/generate/route.ts`

```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify playlist belongs to user
  const rows = await queryD1<{ id: string }>(
    "SELECT id FROM playlists WHERE id = ? AND user_id = (SELECT id FROM users WHERE spotify_user_id = ?)",
    [id, session.spotifyId],
  );
  if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });

  // Call the worker's /trigger endpoint
  const workerUrl = process.env.WORKER_URL ?? "https://disc-cron.evancnavarro.workers.dev";
  const response = await fetch(`${workerUrl}/trigger?playlist_id=${id}&limit=1`);
  const result = await response.json();

  return Response.json(result);
}
```

**Worker side**: Update `workers/cron/src/index.ts` to accept `playlist_id` filter in addition to `playlist` (name filter). The trigger endpoint already supports `playlist` name filter. Add:
```typescript
const playlistIdFilter = url.searchParams.get("playlist_id");
// In the query, add: AND p.id = ? if playlistIdFilter is set
```

#### B8.2 "Generate Now" Button

On the playlist detail page action bar. Client component with loading state:

```tsx
"use client";
function GenerateButton({ playlistId }: { playlistId: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleGenerate() {
    setStatus("loading");
    const res = await fetch(`/api/playlists/${playlistId}/generate`, { method: "POST" });
    setStatus(res.ok ? "done" : "error");
  }
  // ... render button with status indicator
}
```

#### B8.3 "Nominate" Button

Server action on playlist detail page:
```typescript
async function nominateAction() {
  "use server";
  await queryD1("UPDATE playlists SET status = 'queued' WHERE id = ?", [playlistId]);
  revalidatePath(`/playlists/${playlistId}`);
}
```

#### B8.4 Progress Indicator

Poll `GET /api/playlists/[id]/status` every 2 seconds while status is 'processing'. The status endpoint returns the latest generation's status:
```typescript
const gen = await queryD1<{ status: string }>(
  "SELECT status FROM generations WHERE playlist_id = ? ORDER BY created_at DESC LIMIT 1",
  [id],
);
```

---

## Tier 2 — High Value (Build Next)

### B2. Song-Level Caching & Reuse

**Goal**: If the same song appears in 5 playlists, analyze it once.

#### B2.1 New Table: `song_analyses`

**Migration file**: `migrations/003_song_analyses.sql`

```sql
CREATE TABLE IF NOT EXISTS song_analyses (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  spotify_track_id TEXT NOT NULL UNIQUE,
  track_name TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  lyrics TEXT,
  extracted_objects TEXT NOT NULL,  -- JSON: TieredObject[]
  lyrics_found INTEGER NOT NULL DEFAULT 0,
  analyzed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_song_analyses_track ON song_analyses(spotify_track_id);
```

#### B2.2 Pipeline Integration

**File**: `workers/cron/src/pipeline.ts` — between steps 3 and 4.

Before fetching lyrics:
1. Query `song_analyses` for all track IDs in this playlist
2. For cached songs: skip lyrics fetch + extraction, use cached `extracted_objects`
3. For uncached songs: fetch lyrics, extract themes, then INSERT into `song_analyses`
4. Merge cached + new extractions, proceed to convergence

```typescript
// Pseudocode for cache-aware pipeline
const trackIds = tracks.map(t => t.id);
const cached = await env.DB.prepare(
  `SELECT * FROM song_analyses WHERE spotify_track_id IN (${trackIds.map(() => '?').join(',')})`
).bind(...trackIds).all();

const cachedMap = new Map(cached.results.map(r => [r.spotify_track_id, r]));
const uncachedTracks = tracks.filter(t => !cachedMap.has(t.id));

// Only fetch lyrics + extract for uncached
// ... then merge
```

**Prerequisite**: `fetchPlaylistTracks()` in `workers/cron/src/spotify.ts` must return Spotify track IDs. Currently returns `{ name, artist, album }`. Add `id` field to the return type and the Spotify API `fields` parameter:
```
fields=items(track(id,name,artists(name),album(name)))
```

#### B2.3 Song Detail View

Accessible from playlist detail page. Click a song → expand to show:
- Full extracted objects with tiers
- Lyrics (if cached)
- When analyzed

This doesn't need its own route — use expandable rows in the track listing (B1.7).

#### B2.4 Cross-Playlist Song Reference

Query: `SELECT p.name FROM playlists p JOIN playlist_analyses pa ON pa.playlist_id = p.id WHERE pa.track_snapshot LIKE '%"trackId":"' || ? || '"%'`

Better approach: when saving `track_snapshot`, include track IDs. Then query `song_analyses` for the track ID and find all playlists that have it in their snapshot.

Display as: "Also in: GROWL, VELVET, SMOKE"

---

### B3. Incremental Analysis

**Goal**: When only 1-2 songs change, don't re-analyze the whole playlist.

#### B3.1 Incremental Path (below threshold)

In `pipeline.ts`, after change detection (step 3):

```typescript
if (changeDetection && !changeDetection.shouldRegenerate) {
  // Only process new songs
  const newTracks = tracks.filter(t =>
    changeDetection.tracksAdded.some(a => a.name === t.name && a.artist === t.artist)
  );

  // Fetch lyrics only for new songs
  const newLyrics = await fetchLyricsBatch(newTracks);

  // Extract only for new songs
  const newExtractions = await extractThemes(
    newTracks.map((t, i) => ({ ...t, lyrics: newLyrics[i].lyrics, lyricsFound: newLyrics[i].found })),
    env.OPENAI_API_KEY,
  );

  // Merge with previous extractions
  const prevExtractions = JSON.parse(previousAnalysis.track_extractions) as TrackExtraction[];
  const mergedExtractions = [...prevExtractions, ...newExtractions.extractions];

  // Re-run convergence with merged data
  // ... continue from step 7
}
```

Mark the resulting analysis with `status = 'partial'` to distinguish from full re-analysis.

#### B3.2 Full Path (above threshold)

No change — runs the complete 12-step pipeline as today.

#### B3.3 UI Indicator

On playlist detail page, show a badge next to the analysis:
- "Full Analysis" (green) when `status = 'completed'`
- "Incremental" (yellow) when `status = 'partial'`

---

### B6. Cost Tracking

#### B6.1 Calculate Costs

In `pipeline.ts`, after all LLM + Replicate calls:

```typescript
// GPT-4o-mini pricing (as of Feb 2026):
// Input: $0.15 / 1M tokens, Output: $0.60 / 1M tokens
const gptCost =
  (extractTokensIn + convTokensIn) * 0.15 / 1_000_000 +
  (extractTokensOut + convTokensOut) * 0.60 / 1_000_000;

// Replicate Flux Schnell: ~$0.003 per image
const replicateCost = 0.003;

const totalCost = gptCost + replicateCost;
```

#### B6.2 Store in Generation

Update the generation record (step 12d in pipeline.ts):
```sql
UPDATE generations SET cost_usd = ? WHERE id = ?
```

The `cost_usd` column already exists in the schema.

#### B6.3 Display Per-Generation

On playlist detail page (B1.6), show cost: `$${gen.cost_usd?.toFixed(4) ?? "—"}`.

On dashboard recent generations list, add cost column.

#### B6.4 Monthly Summary

On dashboard or settings page:
```sql
SELECT
  strftime('%Y-%m', created_at) as month,
  SUM(cost_usd) as total_cost,
  COUNT(*) as generation_count
FROM generations
WHERE user_id = ? AND status = 'completed'
GROUP BY month
ORDER BY month DESC
LIMIT 6
```

Display as a compact table or stat card.

---

### B7. Song Metadata Expansion

**Goal**: Richer track data for the playlist detail page.

#### B7.1 Album Art Images

**File**: `workers/cron/src/spotify.ts` → `fetchPlaylistTracks()`

Update the `fields` parameter:
```
fields=items(track(id,name,artists(name),album(name,images),duration_ms))
```

Update the return type:
```typescript
export interface PlaylistTrack {
  id: string;  // Spotify track ID (new — needed for B2 song caching)
  name: string;
  artist: string;
  album: string;
  albumImageUrl: string | null;  // New: smallest album image URL
  durationMs: number;  // New: track duration
}
```

Parse: `track.album.images.at(-1)?.url ?? null` (smallest image = last in array).

#### B7.2 Genres

Genres are on the **artist** object, not the track. Requires a separate API call per unique artist:
`GET /v1/artists/{id}` → `artist.genres[]`

**Approach**: batch unique artist IDs from the playlist tracks, then `GET /v1/artists?ids=id1,id2,...` (max 50 per request).

Update `fetchPlaylistTracks()` to also return `artistId`:
```
fields=items(track(id,name,artists(id,name),album(name,images),duration_ms))
```

Then fetch genres in a second call:
```typescript
const uniqueArtistIds = [...new Set(tracks.map(t => t.artistId))];
const artistsResponse = await fetch(
  `https://api.spotify.com/v1/artists?ids=${uniqueArtistIds.join(",")}`,
  { headers: { Authorization: `Bearer ${accessToken}` } },
);
```

Map genres back to tracks. Store in `track_snapshot`.

#### B7.3 Duration

Already in Spotify's track object (`duration_ms`). Just include in `fields` param and return type. Display as "3:42" format.

#### B7.4 Display on Playlist Detail Page

Update B1.7 track listing to show:
- Album art thumbnail (40x40, from `albumImageUrl`)
- Duration (formatted from `durationMs`)
- Genre tags (from artist genres, deduplicated)

---

## Tier 3 — Nice to Have

### B5. Job Detail Page

**Route**: `/jobs/[id]`
**File**: `apps/web/src/app/(dashboard)/jobs/[id]/page.tsx`

Minimal page showing:
- Job ID, trigger type (cron/manual), start/end time, duration
- Per-playlist results: name, status, duration, chosen object, thumbnail
- Total cost: sum of all `generations.cost_usd` in this job

Data: `SELECT * FROM jobs WHERE id = ?` + `SELECT * FROM generations WHERE job_id = ?` (requires adding `job_id` column to generations — currently not linked).

**Schema change needed**: `ALTER TABLE generations ADD COLUMN job_id TEXT REFERENCES jobs(id);`
**Pipeline change**: Pass `jobId` to `generateForPlaylist()` and include in generation INSERT.

Low priority — the dashboard recent generations list covers most use cases.

---

### B9. Object Scoring System

**Goal**: Quantify how strongly each object represents the playlist.

#### B9.1 Numeric Scoring

In `extraction.ts`, when processing `extractThemes()` output:
```typescript
const TIER_SCORES = { high: 3, medium: 2, low: 1 } as const;
```

#### B9.2 Aggregate Scoring

After extraction, compute aggregate scores:
```typescript
const objectScores = new Map<string, number>();
for (const track of extractions) {
  for (const obj of track.objects) {
    const current = objectScores.get(obj.object) ?? 0;
    objectScores.set(obj.object, current + TIER_SCORES[obj.tier]);
  }
}
```

#### B9.3 Include in Convergence Prompt

Pass scores to `convergeAndSelect()` as additional context:
```
"Object scores (sum across all tracks): wolf=12, moon=8, serpent=5..."
```

This gives the LLM a quantitative signal alongside qualitative reasoning.

#### B9.4 Display on Playlist Detail

In B1.8 Object Inventory, show score next to each object: "wolf (12pts, ×4 tracks)".

---

### B10. Loading Skeletons

**Files**:
- `apps/web/src/app/(dashboard)/loading.tsx` — already exists, update for overview layout
- `apps/web/src/app/(dashboard)/playlists/loading.tsx` — playlist grid skeleton
- `apps/web/src/app/(dashboard)/settings/loading.tsx` — form cards skeleton
- `apps/web/src/app/(dashboard)/playlists/[slug]/loading.tsx` — playlist detail skeleton

Use glass cards with `animate-pulse` and `bg-[var(--color-surface)]` placeholder blocks.

Pattern:
```tsx
export default function Loading() {
  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      {/* Title skeleton */}
      <div className="h-8 w-48 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface)]" />
      {/* Content skeleton */}
      <div className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
        <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--color-surface)]" />
        <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-[var(--color-surface)]" />
      </div>
    </div>
  );
}
```

---

## Tier 4 — Future

### B11. Theme Grouping & Visual Collage

- **B11.1**: Semantic grouping (see B1.8 `object-categories.ts` above)
- **B11.2**: Object frequency dashboard — which objects appear most across all playlists
- **B11.3**: Collage style option — compose image from multiple objects (requires Replicate model that supports composition)
- **B11.4**: Trend analysis — how a playlist's objects evolve over time. Query all `playlist_analyses` for a playlist, extract `chosen_object` + `track_extractions` from each, plot changes.

These are exploratory. No concrete implementation plan until Tier 1-3 are done.

---

## Implementation Order

```
B4.1 (Image API route)           ← Unblocks thumbnails everywhere
B1.1-B1.4 (Detail page shell)    ← Core page structure
B1.5-B1.6 (Generation history)   ← Timeline + expanded detail
B8.1-B8.4 (Manual trigger)       ← Generate Now button
B1.7-B1.9 (Track list + objects) ← Full transparency
B6.1-B6.2 (Cost calculation)     ← Pipeline change, quick
B2.1-B2.2 (Song caching)         ← Pipeline change, saves API calls
B7.1-B7.3 (Metadata expansion)   ← Pipeline change, richer data
B3.1-B3.3 (Incremental analysis) ← Pipeline change, efficiency
B6.3-B6.4 (Cost display)         ← UI, depends on B6.1
B7.4 (Metadata display)          ← UI, depends on B7.1
B2.3-B2.4 (Song detail + xref)   ← UI, depends on B2.1
B9 (Object scoring)              ← Enhancement
B10 (Loading skeletons)          ← Polish
B5 (Job detail page)             ← Low priority
B11 (Theme grouping)             ← Future
```

---

## Version Strategy

MINOR bumps for user-visible feature groups, PATCH for fixes/infra between:
- **0.5.0**: Changelog, footer, unread indicator, versioning refinement *(done)*
- **0.5.x**: Any bug fixes or infra tweaks before Tier 1
- **0.6.0**: B1 + B4 + B8 (playlist detail + images + trigger) — Tier 1 complete
- **0.6.x**: Patches between Tier 1 and 2
- **0.7.0**: B2 + B3 + B6 + B7 (caching + incremental + cost + metadata) — Tier 2 complete
- **0.8.0**: B5 + B9 + B10 (job detail + scoring + skeletons) — Tier 3 complete
