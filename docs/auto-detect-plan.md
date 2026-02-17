# Auto-Detect & Smart Cron — Implementation Plan

*Audit-corrected. Gaps from scrutiny audit incorporated.*

## Three Workstreams

### Workstream 1: Playlist Watcher (Auto-Detect New Playlists)

**Goal:** Create a playlist on Spotify → DISC detects it → generates cover art automatically within ~15–20 minutes.

#### Architecture
- Add `*/5 * * * *` cron schedule to existing CF Worker
- Branch in `scheduled()` on `controller.cron` to route watcher vs. existing hourly cron
- Rename `_controller` → `controller` in handler signature
- Watcher polls `GET /me/playlists`, compares to D1, detects new playlists
- Stabilization: wait for `snapshot_id` unchanged across 2 consecutive ticks (10 min)
- Once stable + `track_count >= 1` → trigger single APLOTOCA pipeline

#### User Selection
Single-user app. Watcher runs for all users with `cron_enabled = 1`. No separate `watcher_enabled` column needed — if you opt into cron, you opt into watching.

#### Changes Required

**`workers/cron/wrangler.toml`**
```toml
crons = ["0 * * * *", "*/5 * * * *"]
```

**`workers/cron/src/spotify.ts`** — Add `fetchUserPlaylists()`
- ~20 lines duplicated from `apps/web/src/lib/spotify.ts`
- Paginated fetch of `GET /me/playlists?limit=50`
- MUST use dual-field handling: `raw.items?.total ?? raw.tracks?.total` (Feb 2026 Spotify migration)
- Returns `{ id, name, collaborative, owner, snapshot_id, track_count }[]`

**`workers/cron/src/index.ts`** — Add watcher logic
- Rename `_controller` → `controller` (currently unused, need `.cron` property)
- `watchForNewPlaylists(env, ctx)` function (~80 lines)
- Route in `scheduled()`: `if (controller.cron === "*/5 * * * *") watchForNewPlaylists(env, ctx)`
- For each user with `cron_enabled = 1`:
  - Expand `UserRow` interface to include `spotify_user_id` (audit gap #8)
  - Refresh token → fetch Spotify playlists → compare to D1
  - Filter: skip `collaborative === true` AND skip `owner.id !== user.spotify_user_id`
  - New playlists: INSERT into D1 with `auto_detected_at = now`, save `snapshot_id`
  - Already-detected playlists: compare snapshot_id → if changed, update; if stable for 10min, trigger
- **Create a `jobs` record before triggering pipeline** (audit gap #3)
  - `type: 'auto'`, `status: 'processing'`
  - This makes watcher runs visible in queue UI
- Call `generateForPlaylist()` directly (no HTTP self-invocation — audit confirmed this is blocked)

**D1 Migration** — `014_auto_detect.sql`
```sql
ALTER TABLE playlists ADD COLUMN auto_detected_at TEXT;
ALTER TABLE playlists ADD COLUMN auto_detect_snapshot TEXT;
ALTER TABLE playlists ADD COLUMN auto_detect_status TEXT DEFAULT NULL;
-- auto_detect_status: NULL (not auto-detected), 'watching', 'stable', 'triggered'
-- State machine: NULL → 'watching' (new detected) → 'stable' (snapshot unchanged 2 ticks) → 'triggered' (pipeline fired)
```

**Trigger type threading** (audit gap #7 — 6 touch points):
1. `packages/shared/src/types.ts` → `GenerationTrigger`: add `"auto"`
2. `packages/shared/src/types.ts` → `JobType`: add `"auto"`
3. `packages/shared/src/types.ts` → `QueueActiveJob.type`: add `"auto"`
4. `workers/cron/src/pipeline.ts` → `PipelineOptions.triggerType`: add `"auto"`
5. `workers/cron/src/index.ts` → `TriggerOptions.triggerType`: add `"auto"`
6. `apps/web/src/app/api/queue/status/route.ts` → job type casting: include `"auto"`
7. UI components that branch on job type: `QueueBoard.tsx`, `QueueCard.tsx`, `CronProgressPanel.tsx`

#### Edge Cases
1. **Following someone else's playlist** — Check `owner.id === user.spotify_user_id`. Skip if not owner.
2. **Empty playlist** — Require `track_count >= 1` before triggering.
3. **Multiple new playlists at once** — Process sequentially, one per tick. Queue the rest.
4. **Songs added over a long time** — Snapshot keeps changing, stabilization keeps resetting. Daily cron is the safety net.
5. **Token expiry** — Access tokens last 1hr, watcher runs every 5min. `refreshAccessToken()` handles this.
6. **Collaborative playlists** — Skip. Can't upload cover art.
7. **Worker restart** — State is in D1 (not memory). Survives restarts.
8. **Spotify 429** — Retry utility already handles. At 1 req/5min, essentially impossible.
9. **Watcher re-triggers already generated playlist** — After triggering, set `auto_detect_status = 'triggered'`. Watcher ignores 'triggered' playlists. Resets to NULL on next generation via different vector.

#### Timing
```
00:00  Create playlist, add songs
05:00  Watcher detects new playlist. Records snapshot. Status = 'watching'.
10:00  Snapshot unchanged → Status = 'stable' → Triggers APLOTOCA.
12:00  Cover art on Spotify.
Typical: ~12–17 minutes from finishing adding songs.
Worst case: ~22 minutes.
```

---

### Workstream 2: Smart Nightly Cron (Style-Aware Regeneration)

**Goal:** Nightly cron only regenerates playlists that DON'T have a cover from the current default style+version. Nights with nothing to do → immediate exit.

#### Current Problem
The cron processes ALL `cron_enabled` playlists every night, regardless of whether they already have a current cover. Wasteful if you just ran manual generations during the day.

#### Architecture

The cron already has: `user.style_preference` (current default style ID) and `generations.style_id` (which style was used). BUT there's a gap:

**Critical gap: Style VERSION tracking.**
If you update KGO from v2 to v3 (same `style_id`, bumped `styles.version`), the `generations` table has no `style_version` column. You can't distinguish "generated with v2" from "generated with v3."

**Solution:** Compare `generations.created_at` against `styles.updated_at`. If the style was updated AFTER the last generation for a playlist, that playlist needs regeneration. Audit verified both columns exist.

#### Smart Cron Query
```sql
SELECT p.id, p.spotify_playlist_id, p.name
FROM playlists p
WHERE p.user_id = ?
  AND p.cron_enabled = 1
  AND p.is_collaborative = 0
  AND p.track_count > 0
  AND NOT EXISTS (
    SELECT 1 FROM generations g
    WHERE g.playlist_id = p.id
      AND g.style_id = ?                    -- Current default style
      AND g.status = 'completed'
      AND g.created_at > ?                  -- Style's updated_at timestamp
  )
```

Audit confirmed: `NOT EXISTS` returns true for zero-generation playlists (correct). `style_id` format matches between tables. No migration needed.

#### Changes Required

**`workers/cron/src/index.ts`** — Modify `processUser()`
- Fetch `styles.updated_at` alongside the style (it's already in DbStyle type)
- Replace the current playlist query with the smart query above
- If zero playlists match → log "nothing to do", update job as completed with 0 playlists, return early
- Skip job creation entirely if no playlists to process (avoid empty job records)

**No migration needed** — `generations.created_at` and `styles.updated_at` already exist.

#### Edge Cases
1. **Brand new style (no generations at all)** — `NOT EXISTS` returns true → all playlists get regenerated. Correct.
2. **Style updated mid-day after some manual runs** — Manual runs after the update have `created_at > styles.updated_at`, so they're skipped. Correct.
3. **Per-playlist style override** — `playlists.style_override` exists but isn't used in cron. Leave as future enhancement.
4. **Playlist with only failed generations** — `status = 'completed'` filter means failed gens don't count. Playlist gets retried. Correct.
5. **Empty playlists** — `track_count > 0` filter skips them. Correct.

#### Cost Impact
- Nights with nothing to do: 1 DB query + 0 API calls. ~$0.
- Nights with 2 playlists to regenerate instead of 10: 80% reduction in OpenAI/Replicate costs.

---

### Workstream 3: Edge Cases, Cleanup & UI

#### 3a. Playlist Deletion Handling

**Current state:** Deleted/unfollowed Spotify playlists linger in D1 forever. No cleanup.

**Fix:** Soft delete with `deleted_at` column.

**Migration (in 014_auto_detect.sql):**
```sql
ALTER TABLE playlists ADD COLUMN deleted_at TEXT;
```

**Sync logic change:** After upsert loop, find D1 playlists not in Spotify response → set `deleted_at = datetime('now')`.

**CRITICAL (audit gap #9): 8+ query sites need `AND deleted_at IS NULL` filter:**
1. `apps/web/src/app/api/playlists/route.ts` — GET handler (dashboard list)
2. `apps/web/src/app/(dashboard)/page.tsx` — stats query
3. `apps/web/src/lib/sync.ts` — existing playlist lookup
4. `workers/cron/src/index.ts` — cron playlist query
5. `apps/web/src/app/api/queue/status/route.ts` — queue status
6. `apps/web/src/app/api/playlists/generate-batch/route.ts` — batch validation
7. `apps/web/src/app/api/playlists/[spotifyPlaylistId]/regenerate/route.ts` — regenerate
8. `apps/web/src/app/api/playlists/[spotifyPlaylistId]/generations/route.ts` — generations list

Each of these needs `AND deleted_at IS NULL` added to their WHERE clause.

#### 3b. Playlist Rename Handling

**No action needed.** Sync already updates `name`. Watcher/cron checks by style+generation, not name.

#### 3c. Watcher Countdown UI

**Goal:** Show when next watcher check will happen.

**Approach:** Add to existing queue area:
- "Next check in ~X min" with minimal circular progress indicator
- On hover: "Auto-detect checks every 5 minutes for new playlists"
- When a new playlist is detected: "New playlist detected — watching for stability"
- When triggered: flows into existing queue UI as `type: 'auto'` job

**Lowest priority.** Watcher works without UI.

#### 3d. "Locked" / Pin Mechanism

Use existing `cron_enabled = 0`. Sufficient for now.

---

## Implementation Order

1. **Workstream 2** (smart cron) — smallest change, immediate value, testable now
2. **Workstream 1** (watcher) — main feature, includes migration 014
3. **Workstream 3a** (deletion cleanup) — important but can be same migration
4. **Workstream 3c** (countdown UI) — polish, last

## Verification Plan

### After Workstream 2 (Smart Cron):
- Typecheck + lint
- Review the query manually against D1 data
- Verify: playlist with recent generation on current style → SKIPPED
- Verify: playlist with no generation on current style → INCLUDED
- Verify: zero playlists to process → early exit with clean log

### After Workstream 1 (Watcher):
- Typecheck + lint
- Deploy worker with `wrangler deploy`
- Check worker logs for watcher ticks
- Bobby creates a new playlist on Spotify, adds songs
- Watch: does it appear in queue within ~15 min?
- Check: is the cover art on Spotify?

### After Workstream 3 (Cleanup):
- Delete/unfollow a playlist on Spotify → sync → verify D1 marks it deleted
- Verify deleted playlists don't appear in dashboard, queue, or generation lists
- Verify cron and watcher both skip deleted playlists

## Audit Trail

Scrutiny audit found 4 critical gaps (all addressed above):
1. ~~Deletion blast radius~~ → Enumerated all 8 query sites in 3a
2. ~~Trigger type threading~~ → Listed all 7 touch points in Workstream 1
3. ~~Missing jobs record~~ → Explicitly called out in Workstream 1 changes
4. ~~Watcher user selection~~ → Stated: reuse `cron_enabled`, expand `UserRow` interface
