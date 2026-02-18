# Cover Integrity System Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure every DISC-managed playlist always shows the correct generated cover art, with automatic detection and recovery when covers are removed or replaced externally.

**Architecture:** Two-layer passive detection (lightweight URL domain check + phash verification on change) integrated into the existing watcher. Perceptual hashing computed at generation time and verified against Spotify's live state. No manual removal — Spotify's API has no DELETE endpoint for images, and regeneration is already handled by the existing queue flow.

**Tech Stack:** @cf-wasm/photon (existing), Cloudflare Workers, D1, Spotify Web API

---

## Problem Statement

DISC generates cover art and uploads it to Spotify playlists. But covers can change outside DISC's control:

1. **User removes cover via Spotify app** — playlist reverts to auto-generated mosaic
2. **User uploads different cover via Spotify** — DISC's cover is overwritten
3. **Spotify API quirk** — CDN URLs for the same image rotate (documented: "expire in less than a day")

When this happens, DISC's database still shows the old generation as active, causing:
- **Detail page shows stale cover** (from D1 `generations.r2_key`)
- **Queue shows playlist as "Done"** (has a completed generation) when it should be "To Do"
- **Smart cron skips the playlist** (thinks it has a current cover)
- **Watcher ignores it** (auto_detect_status stuck at 'triggered')

## Architecture Overview

```
                    Watcher Tick (every 5-15 min)
                            │
                    Fetch Spotify playlists
                    (includes images[0].url)
                            │
              ┌─────────────┼─────────────┐
              │             │             │
         No generation   Has generation  Has generation
         (skip)          + mosaic URL    + custom URL
                         ┌───────┐       ┌───────────────┐
                         │REMOVED│       │URL changed     │
                         │Reset  │       │since last tick?│
                         │status │       └───────┬────────┘
                         └───────┘          No   │   Yes
                                           (ok)  │
                                                 ▼
                                          Fetch Spotify
                                          cover image
                                          Compute phash
                                          Compare to stored
                                                 │
                                          ┌──────┴──────┐
                                       Same           Different
                                    (CDN rotate)    (REPLACED)
                                    Update URL      Reset status
```

---

## Phase 1: Schema & Infrastructure

**Goal:** Add the columns, migration, and phash utility needed by all later phases.

### Tasks

#### 1.1 D1 Migration (018_cover_integrity.sql)

```sql
-- Perceptual hash of the generated cover image
ALTER TABLE generations ADD COLUMN cover_phash TEXT;

-- Soft delete for generations (distinct from playlists.deleted_at)
ALTER TABLE generations ADD COLUMN deleted_at TEXT;

-- Track last-seen Spotify cover URL for change detection
ALTER TABLE playlists ADD COLUMN last_seen_cover_url TEXT;

-- Timestamp of last integrity verification
ALTER TABLE playlists ADD COLUMN cover_verified_at TEXT;

-- Integrity check counts on watcher ticks
ALTER TABLE worker_ticks ADD COLUMN integrity_checked INTEGER DEFAULT 0;
ALTER TABLE worker_ticks ADD COLUMN integrity_flagged INTEGER DEFAULT 0;
```

#### 1.2 Phash Utility (workers/cron/src/image.ts)

Add `computeAverageHash(imageBytes: Uint8Array): string`

Algorithm (average hash / aHash):
1. Decode image → PhotonImage
2. Resize to 8x8 with Lanczos3
3. Convert to grayscale
4. Extract raw pixels (64 values)
5. Compute mean luminance
6. Each pixel above mean = 1, below = 0
7. Return 16-character hex string (64 bits)

Uses existing `@cf-wasm/photon` — no new dependencies.

#### 1.3 Update Generation Pipeline (workers/cron/src/pipeline.ts)

After generating and compressing the image but before uploading to Spotify:
1. Compute phash of the JPEG bytes
2. Store `cover_phash` on the generation row in D1

This means every NEW generation automatically has a phash. Old ones are backfilled in Phase 3.

#### 1.4 Extend SpotifyPlaylistSummary (workers/cron/src/spotify.ts)

Add `imageUrl: string | null` to the `SpotifyPlaylistSummary` type:
```typescript
export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  collaborative: boolean;
  ownerId: string;
  snapshotId: string;
  trackCount: number;
  imageUrl: string | null;  // NEW: images[0]?.url
}
```

Extract from raw response: `images?.[0]?.url ?? null`

#### 1.5 Update Soft-Delete Queries

All queries that select from `generations` where `status = 'completed'` need an additional filter:
```sql
AND deleted_at IS NULL
```

Query sites (from prior audit):
- `/api/playlists` route — `latest_r2_key` subquery
- `/api/playlists/[spotifyPlaylistId]/page.tsx` — detail page subquery
- `/api/playlists/[spotifyPlaylistId]/generations` — generation history
- Smart cron query in `workers/cron/src/index.ts`
- Any other `SELECT ... FROM generations WHERE status = 'completed'`

### Success Criteria (Phase 1)
- [ ] Migration 018 applied to D1 (verify with `list_migrations`)
- [ ] `computeAverageHash()` returns consistent 16-char hex for same image
- [ ] New generations have `cover_phash` populated
- [ ] `SpotifyPlaylistSummary` includes `imageUrl`
- [ ] All generation queries exclude `deleted_at IS NOT NULL`
- [ ] Typecheck passes, lint passes

---

## Phase 2: Watcher Integration (Passive Detection)

**Goal:** The watcher automatically detects removed or replaced covers and resets playlists for regeneration.

### Tasks

#### 2.1 Mosaic Detection (Lightweight, Every Tick)

In `watchUser()`, after fetching Spotify playlists:

For each playlist with a completed, non-deleted generation:
1. Get current `imageUrl` from the Spotify response
2. If `imageUrl` contains `mosaic.scdn.co` → **cover was removed**
3. Execute cover reset (see 2.3)

This is a string check — zero image fetching, runs on every tick.

#### 2.2 URL Change Detection + Phash Verification

For each playlist with a completed generation AND a non-mosaic cover URL:
1. Compare `imageUrl` to `playlists.last_seen_cover_url`
2. If **same URL** → no change → update `cover_verified_at`, skip
3. If **URL changed** OR `last_seen_cover_url IS NULL` (first check):
   a. Fetch the Spotify cover image (~80KB)
   b. Compute phash
   c. Compare to `generations.cover_phash`
   d. If **phash matches** → CDN URL rotation → update `last_seen_cover_url`
   e. If **phash differs** → **cover was replaced** → execute cover reset
   f. If **generation has no phash yet** (pre-backfill) → store this URL, skip comparison

#### 2.3 Cover Reset Procedure

When a cover mismatch is detected (removal or replacement):
1. Soft-delete the latest completed generation: `UPDATE generations SET deleted_at = datetime('now') WHERE id = ?`
2. Reset playlist: `UPDATE playlists SET status = 'idle', auto_detect_status = 'watching', last_seen_cover_url = NULL, cover_verified_at = NULL WHERE id = ?`
3. Log: `integrity_flagged += 1` on the current tick
4. The playlist naturally:
   - Moves to "To Do" in the queue (no completed generation)
   - Becomes eligible for smart cron (NOT EXISTS check passes)
   - Enters watcher state machine at 'watching' (re-stabilization required before auto-trigger)

#### 2.4 Tick Logging

At the end of each watcher tick, include:
- `integrity_checked`: count of playlists with generations that were verified
- `integrity_flagged`: count of playlists where covers failed verification

These flow through to the Activity page via the existing `worker_ticks` → API → UI pipeline.

### Success Criteria (Phase 2)
- [ ] Watcher detects mosaic cover (playlist with generation reverts to To Do)
- [ ] Watcher detects replaced cover (phash mismatch triggers reset)
- [ ] CDN URL rotation does NOT trigger false reset (phash match → URL update only)
- [ ] Cover reset correctly soft-deletes generation and resets playlist status
- [ ] Activity page shows integrity_checked and integrity_flagged counts
- [ ] No Spotify rate limit issues under normal operation (~50 playlists)

---

## Phase 3: Retroactive Backfill

**Goal:** Compute and store phash for all existing completed generations so passive detection works for historical data.

### Tasks

#### 3.1 Admin Backfill Endpoint

`POST /api/admin/backfill-phash`

Pattern: follows existing `backfill-contributors` endpoint.

1. Auth gate: `session.spotifyId === "evancnavarro"`
2. Query: `SELECT id, r2_key FROM generations WHERE status = 'completed' AND cover_phash IS NULL AND deleted_at IS NULL`
3. For each generation:
   a. Fetch image from R2 via worker `/image?key=...` endpoint
   b. Decode bytes → compute phash
   c. Update: `UPDATE generations SET cover_phash = ? WHERE id = ?`
   d. Track success/failure
4. Return: `{ total, backfilled, failed, errors: [...] }`

#### 3.2 Initial URL Seeding

Also populate `playlists.last_seen_cover_url` for all playlists with completed generations:

1. For each playlist with a completed generation:
   a. Get `spotify_cover_url` from the playlists table (already synced by web app)
   b. Set `last_seen_cover_url = spotify_cover_url`
   c. Set `cover_verified_at = datetime('now')`

This ensures the watcher's URL-change detection has a baseline on its first tick after deployment.

#### 3.3 Error Handling

- If R2 image is missing (404): log error, skip, continue
- If phash computation fails (corrupted image): log error, skip, continue
- If D1 update fails: log error, skip, continue
- Return full error list in response for manual review

### Success Criteria (Phase 3)
- [ ] All completed generations have `cover_phash` populated (or documented failure reason)
- [ ] All playlists with generations have `last_seen_cover_url` seeded
- [ ] Backfill endpoint returns accurate counts
- [ ] No R2 or D1 errors in steady state

---

## Phase 4: UI Consistency & Frontend Audit

**Goal:** Ensure all pages display the correct cover state, and the Activity page shows integrity data.

### Tasks

#### 4.1 Activity Page — Integrity Columns

Extend the `TimelinePoint` interface and `TicksTable` to display:
- `integrity_checked`: number of covers verified this tick
- `integrity_flagged`: number of covers that failed verification

Display as a subtle annotation in the tick log, not a new column (to avoid table bloat):
```
Watcher | success | 6.2s | 3 playlists | 3 covers checked
Watcher | success | 6.5s | 3 playlists | 1 cover flagged ⚠
```

#### 4.2 Detail Page — Cover Source Indicator

Small indicator showing where the displayed cover comes from:
- "Generated by DISC" (showing R2 image)
- "Spotify cover" (showing spotify_cover_url)
- No indicator when showing placeholder

#### 4.3 Queue Page — Consistent Image Source

Verify all queue columns use the same logic:
- If playlist has a completed, non-deleted generation → show R2 image
- Else → show `spotify_cover_url`
- Else → show placeholder

The current code already does this for Done/In Progress columns. Verify To Do/Scheduled columns are also consistent.

#### 4.4 Frontend Design Audit

Run the design skill audit on all modified components:
- Activity page integrity annotations
- Cover source indicator styling
- Accessibility: aria labels, screen reader text for cover state
- Responsive: indicator placement on mobile

### Success Criteria (Phase 4)
- [ ] Activity page displays integrity check data
- [ ] Detail page shows correct cover with source indicator
- [ ] Queue page shows correct cover in all columns
- [ ] A11y audit passes (aria labels, contrast, focus states)

---

## Error Handling Strategy

| Failure Point | Impact | Recovery |
|--------------|--------|----------|
| Spotify API down during watcher | Can't fetch image URLs | Skip integrity check this tick, retry next tick |
| Spotify image fetch fails (for phash) | Can't verify cover | Skip this playlist, retry next tick |
| Phash computation fails (corrupted image) | Can't compare | Log error, skip, investigate manually |
| D1 write fails during cover reset | Status not updated | Retry next tick (idempotent operation) |
| R2 image missing during backfill | Can't compute phash | Log error, mark generation for manual review |

All operations are **idempotent** — running them again produces the same result. The watcher naturally retries on the next tick. No catastrophic failure modes.

**Tracking:** Failures are visible in:
- `worker_ticks.error_message` — for watcher-level failures
- Activity page tick log — shows error status per tick
- Backfill endpoint response — returns full error list

---

## Billing & Cost Impact

| Operation | Cost | Tracking |
|-----------|------|----------|
| URL domain check (every tick) | Zero | N/A |
| Spotify image fetch (on URL change) | Zero (HTTP GET, no API cost) | N/A |
| Phash computation (CPU only) | Zero | N/A |
| Cover reset → regeneration | Standard pipeline cost (~$0.002-0.05) | Existing `usage_events` with `trigger_source: 'auto_detect'` |

The integrity system itself has **zero monetary cost**. Regenerations triggered by integrity failures are tracked by the existing billing pipeline and tagged with `trigger_source: 'auto_detect'` to distinguish from user-initiated generations.

---

## Migration Strategy

1. Apply migration 018 (adds columns — non-breaking, all nullable)
2. Deploy worker with phash utility and updated pipeline (new generations get phash)
3. Run retroactive backfill (populates phash for existing generations, seeds URLs)
4. Deploy watcher integration (passive detection begins)
5. Run frontend audit

Steps 1-3 are invisible to the user. Step 4 activates the new behavior. Step 5 validates UX.
