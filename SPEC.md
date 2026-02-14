# DISC — Project Specification

> **DISC** = Daily Image Spotify Covers
> **URL**: `disc.400.dev`
> **Repo**: `EvanCNavarro/disc`
> **Version**: 0.1.0

---

## 1. Project Overview

DISC generates AI-powered playlist cover art for Spotify. Users authenticate with Spotify, select playlists, and DISC analyzes track lyrics/metadata to extract a symbolic theme, generates a DALL-E 3 image in a chosen art style, compresses it to meet Spotify's requirements, and uploads it as the playlist cover. This can run manually or on a nightly schedule.

### 1.1 Goals

| Goal | Metric |
|------|--------|
| User can generate a cover from any owned playlist | End-to-end in <60s |
| Generated covers are visually distinct per style | 6 art styles available |
| Nightly cron regenerates covers automatically | Zero manual intervention after setup |
| Costs are tracked and visible | Per-generation cost in dashboard |
| Images meet Spotify requirements | JPEG, <256KB, uploaded via API |

### 1.2 Non-Goals

- Multi-tenant SaaS (Spotify dev mode caps at 5 users)
- Mobile app
- Real-time collaboration
- Image editing / manual prompt tweaking
- Social features

---

## 2. Tech Stack

| Layer | Choice | Version | Rationale |
|-------|--------|---------|-----------|
| **Frontend** | Next.js | 16.x | App Router, React 19, Vercel deployment |
| **Auth** | Auth.js (NextAuth) | 5.x beta | Spotify OAuth with scopes in code. Free. |
| **Database** | Cloudflare D1 | — | SQLite at edge. $5/mo paid plan. No inactivity pause (unlike Supabase free tier). |
| **Image Storage** | Cloudflare R2 | — | Zero egress. 10GB free. Archive generated covers. |
| **Background Jobs** | CF Workers + Cron Triggers | Wrangler 4.x | Nightly generation. 15-min cron timeout. |
| **Queue** | CF Queues | — | Per-playlist fan-out with retries. |
| **Image Compression** | @cf-wasm/photon | 0.1.x | WASM. PNG→JPEG at quality 40. Proven <256KB output. |
| **AI: Theme** | OpenAI GPT-4o-mini | — | Symbolic object extraction from lyrics/metadata. |
| **AI: Image** | OpenAI DALL-E 3 | — | 1024x1024 standard. $0.04/generation. |
| **Lyrics** | lyrics.ovh | v1 | Free API. Non-blocking fallback to metadata. |
| **Styling** | Tailwind CSS | 4.x | PostCSS plugin. CSS custom properties for tokens. |
| **Linting** | Biome | 2.x | Replaces ESLint + Prettier. Tabs, double quotes. |
| **Testing** | Vitest | 3.x | Coverage via @vitest/coverage-v8. |
| **Monorepo** | npm workspaces | — | `apps/*`, `workers/*`, `packages/*` |
| **CI** | GitHub Actions | — | Lint + typecheck on PR/push to main. |
| **Versioning** | SemVer + Husky | — | Pre-push gate blocks unversioned pushes. |

---

## 3. Architecture

```
                    disc.400.dev (Vercel)
                           │
                    ┌──────┴──────┐
                    │  Next.js    │
                    │  App Router │
                    │  + Auth.js  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        Spotify API   D1 (REST)   CF Worker
        (playlists,   (users,     (cron trigger)
         upload)      settings)        │
                                       │
                                 ┌─────┴─────┐
                                 │  Pipeline  │
                                 │            │
                           ┌─────┼─────┬──────┐
                           │     │     │      │
                        lyrics  GPT  DALL-E  Photon
                        .ovh   4o-m   3     compress
                                              │
                                        Spotify PUT
                                        /images
```

### 3.1 Monorepo Structure

```
disc/
├── apps/web/                    # Next.js frontend (deployed to Vercel)
│   ├── src/app/                 # Pages (login, dashboard, settings, gallery)
│   ├── src/lib/                 # Auth, DB access, encryption, Spotify helpers
│   └── src/components/          # UI components
├── workers/cron/                # CF Worker (deployed to Cloudflare)
│   └── src/
│       ├── index.ts             # Entrypoints: scheduled(), fetch()
│       ├── pipeline.ts          # Orchestrator
│       └── services/            # lyrics, theme, image, spotify, token-refresh
├── packages/shared/             # Shared across web + worker
│   └── src/
│       ├── types.ts             # DB types, Spotify types, enums
│       ├── styles.ts            # Art style definitions + DALL-E prompt blocks
│       └── version.ts           # APP_VERSION source of truth
├── migrations/                  # D1 SQL migration files
├── scripts/                     # version-bump.sh, version-check.sh
├── .husky/                      # Git hooks (pre-commit, commit-msg, pre-push)
├── SPEC.md                      # This file
├── CHANGELOG.md                 # Keep a Changelog format
└── biome.json                   # Linting + formatting config
```

### 3.2 Data Flow: Manual Generation

```
1. User clicks "Generate" on playlist card
2. POST /api/generate/[playlistId]
   → Creates generation record (status: pending)
   → Calls CF Worker via HTTP
3. Worker pipeline:
   a. Refresh Spotify token (encrypted_refresh_token → access_token)
   b. Fetch playlist tracks from Spotify API
   c. Fetch lyrics for top N tracks (lyrics.ovh, parallel, 5s timeout each)
   d. Extract symbolic objects (GPT-4o-mini, per-track)
   e. Select final theme (GPT-4o-mini, considers all objects + playlist context)
   f. Generate image (DALL-E 3, style prompt from user preference)
   g. Fetch PNG → compress to JPEG <256KB (Photon WASM)
   h. Upload to Spotify (PUT /v1/playlists/{id}/images, base64 JPEG)
   i. Update generation record (status: completed, cost, duration)
4. Dashboard polls or receives webhook → shows new cover
```

### 3.3 Data Flow: Cron Generation

```
1. CF Cron Trigger fires (hourly)
2. Query D1: users WHERE cron_enabled=true AND cron_time matches current hour
3. For each user:
   a. Refresh Spotify token
   b. Find playlists WHERE cron_enabled=true
   c. Enqueue one CF Queue message per playlist
4. Queue consumer runs pipeline (same as steps 3a-3i above)
5. Job record tracks aggregate progress
```

### 3.4 Token Refresh Strategy

Auth.js stores the Spotify refresh token on sign-in. We encrypt it (AES-256-GCM) and persist to D1. The cron worker uses it to get a fresh access token directly from Spotify's token endpoint — no Auth.js needed at runtime. If the token is revoked (401), the user's `cron_enabled` is set to false and they see a "Reconnect Spotify" banner on next login.

---

## 4. Database Schema

Cloudflare D1 (SQLite). See `migrations/001_initial.sql` for full DDL.

### 4.1 Tables

**users**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | hex(randomblob(16)) |
| spotify_user_id | TEXT UNIQUE | From Spotify /v1/me |
| display_name | TEXT | |
| email | TEXT | |
| avatar_url | TEXT | Nullable |
| encrypted_refresh_token | TEXT | AES-256-GCM encrypted |
| style_preference | TEXT | Default: 'bleached-crosshatch' |
| cron_enabled | INTEGER | 0 or 1 |
| cron_time | TEXT | Default: '04:20' (24h format) |
| created_at, updated_at, last_login_at | TEXT | ISO 8601 |
| deleted_at | TEXT | Nullable, soft delete |

**playlists**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| user_id | TEXT FK→users | |
| spotify_playlist_id | TEXT | |
| name, description | TEXT | |
| track_count | INTEGER | |
| spotify_cover_url | TEXT | Current cover URL |
| status | TEXT | idle/queued/processing/generated/failed |
| last_generated_at | TEXT | Nullable |
| generation_count | INTEGER | |
| style_override | TEXT | Nullable, overrides user default |
| cron_enabled | INTEGER | Default 1 |
| UNIQUE(user_id, spotify_playlist_id) | | |

**generations**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| playlist_id, user_id | TEXT FK | |
| style_id | TEXT | Which art style was used |
| symbolic_object | TEXT | The chosen theme object |
| dall_e_prompt | TEXT | Full prompt sent to DALL-E |
| image_url | TEXT | R2 URL or Spotify URL |
| status | TEXT | pending/processing/completed/failed |
| error_message | TEXT | Nullable |
| duration_ms | INTEGER | Total pipeline time |
| cost_usd | REAL | GPT + DALL-E cost |
| trigger_type | TEXT | manual/cron |

**jobs**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| user_id | TEXT FK | |
| type | TEXT | manual/cron/bulk |
| status | TEXT | pending/processing/completed/failed |
| total/completed/failed_playlists | INTEGER | Progress tracking |
| total_cost_usd | REAL | |
| started_at, completed_at | TEXT | |

---

## 5. Spotify API Compliance (Feb 2026)

All code must use updated field names:

| Old (pre-2026) | New (Feb 2026) |
|-----------------|----------------|
| `playlist.tracks` | `playlist.items` |
| `playlist.tracks.items[].track` | `playlist.items.items[].item` |

**Removed from `/v1/me`**: `email`, `country`, `followers`, `product` — do not depend on these.

**Still available**: `GET /v1/me/playlists`, `GET /v1/playlists/{id}`, `PUT /v1/playlists/{id}/images`.

---

## 6. Art Styles

| # | ID | Name | Description |
|---|-----|------|-------------|
| 1 | `bleached-crosshatch` | Bleached Cross-Hatch | High-contrast B&W line art with cross-hatching. Default. |
| 2 | `vibrant-oil` | Vibrant Oil | Bold, saturated oil painting |
| 3 | `minimalist-line` | Minimalist Line | Clean line art, single color |
| 4 | `retro-halftone` | Retro Halftone | Screenprint dots, limited palette |
| 5 | `neon-noir` | Neon Noir | Dark background with neon accents |
| 6 | `watercolor-dream` | Watercolor Dream | Soft, bleeding edges |

Style 1 is fully defined with DALL-E prompt block. Styles 2-6 are added in Phase 3.

---

## 7. Phased Implementation

### Phase 0 — Scaffolding [COMPLETE]

**Deliverables**: Monorepo structure, all workspaces building, CI green, version management wired.

**Success criteria**:
- [x] `npm install` succeeds (0 vulnerabilities)
- [x] `npm run typecheck` passes all 3 workspaces
- [x] `npm run lint` passes (0 errors)
- [x] `npm run dev:web` starts Next.js, returns HTTP 200
- [x] CI workflow defined (.github/workflows/ci.yml)
- [x] Version management: version.ts + bump script + check script + Husky hooks
- [x] CHANGELOG.md initialized

---

### Phase 1 — Auth + See Playlists

**Goal**: User logs in with Spotify, sees their playlist grid with cover thumbnails.

**Tasks**:

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.1 | Auth.js config with Spotify provider | `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts` | |
| 1.2 | D1 access layer (CF REST API from Vercel) | `src/lib/db.ts` | |
| 1.3 | AES-256-GCM encryption (port from KGOSPCG) | `src/lib/encryption.ts` | |
| 1.4 | Spotify API helpers (fetch playlists, paginated) | `src/lib/spotify.ts` | |
| 1.5 | Auth middleware (protect /dashboard/*) | `src/middleware.ts` | |
| 1.6 | Login page with Spotify button | `src/app/login/page.tsx` | |
| 1.7 | Dashboard layout (nav, header) | `src/app/dashboard/layout.tsx` | |
| 1.8 | Playlist grid page | `src/app/dashboard/page.tsx` | |
| 1.9 | Playlist sync API (Spotify → D1) | `src/app/api/playlists/route.ts` | |
| 1.10 | PlaylistCard + PlaylistGrid components | `src/components/Playlist*.tsx` | |

**Test criteria**:
- [ ] Can sign in with Spotify at `localhost:3000/login`
- [ ] Auth callback stores user in D1 with encrypted refresh token
- [ ] Dashboard shows real playlists with Spotify cover images
- [ ] Playlist data syncs to D1 (name, track count, cover URL)
- [ ] Signing out and back in works
- [ ] Unauthenticated users redirected to /login
- [ ] Authenticated users on /login redirected to /dashboard

**Success metrics**:
- Spotify OAuth flow completes in <3s
- Dashboard loads playlists in <2s
- Refresh token encrypted at rest (verify via D1 query: column is not plaintext)

---

### Phase 2 — Manual Generation

**Goal**: Click "Generate" on a playlist, watch it process, see the new cover appear on Spotify.

**Tasks**:

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 2.1 | Generation pipeline orchestrator | `workers/cron/src/pipeline.ts` | |
| 2.2 | Spotify service (fetch tracks, upload cover) | `workers/cron/src/services/spotify.ts` | |
| 2.3 | Lyrics fetcher (lyrics.ovh) | `workers/cron/src/services/lyrics.ts` | |
| 2.4 | Theme extractor (GPT-4o-mini) | `workers/cron/src/services/theme-extractor.ts` | |
| 2.5 | Image generator (DALL-E 3 + Photon) | `workers/cron/src/services/image-generator.ts` | |
| 2.6 | Token refresh service | `workers/cron/src/services/token-refresh.ts` | |
| 2.7 | Retry utility (port from KGOSPCG) | `workers/cron/src/utils/retry.ts` | |
| 2.8 | Cost tracker (port from KGOSPCG) | `workers/cron/src/utils/metrics.ts` | |
| 2.9 | Generate API endpoint | `apps/web/src/app/api/generate/[playlistId]/route.ts` | |
| 2.10 | GenerateButton + GenerationStatus components | `apps/web/src/components/Generate*.tsx` | |

**Test criteria**:
- [ ] Click Generate → worker fetches tracks from Spotify
- [ ] Lyrics fetched for available tracks (non-blocking failures)
- [ ] Theme extracted via GPT-4o-mini (JSON response parsed correctly)
- [ ] DALL-E 3 generates 1024x1024 image
- [ ] Photon compresses PNG → JPEG <256KB
- [ ] Compressed image uploaded to Spotify successfully
- [ ] New cover visible on Spotify within 30 seconds
- [ ] Generation record created in D1 with: style, object, prompt, cost, duration
- [ ] Failed generations have error_message populated

**Success metrics**:
- Full pipeline completes in <60s
- Compressed JPEG consistently <256KB
- Cost per generation: ~$0.04-0.05 (DALL-E $0.04 + GPT pennies)
- Lyrics found for >50% of tracks

---

### Phase 3 — Style System

**Goal**: User picks from 6 visual styles. Per-playlist overrides possible.

**Tasks**:

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 3.1 | Expand style definitions (5 new styles) | `packages/shared/src/styles.ts` | |
| 3.2 | Settings page with style picker | `apps/web/src/app/dashboard/settings/page.tsx` | |
| 3.3 | User preferences API | `apps/web/src/app/api/user/preferences/route.ts` | |
| 3.4 | StylePicker + StylePreview components | `apps/web/src/components/Style*.tsx` | |
| 3.5 | Static preview images per style | `public/style-previews/` | |
| 3.6 | Per-playlist style override UI | PlaylistCard enhancement | |

**Test criteria**:
- [ ] Settings page shows 6 styles in a visual grid
- [ ] Selecting a style updates D1 user.style_preference
- [ ] Generating with different styles produces visually distinct output
- [ ] Per-playlist style_override works (takes precedence over user default)
- [ ] Default style (bleached-crosshatch) used when no override set

**Success metrics**:
- All 6 styles produce coherent, recognizable output
- Style selection persists across sessions

---

### Phase 4 — Recurring Generation

**Goal**: Nightly cron. Set it and forget it.

**Tasks**:

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 4.1 | Enable cron triggers in wrangler.toml | `workers/cron/wrangler.toml` | |
| 4.2 | Implement scheduled() handler | `workers/cron/src/index.ts` | |
| 4.3 | Queue producer (enqueue playlists) | `workers/cron/src/index.ts` | |
| 4.4 | Queue consumer (run pipeline per playlist) | `workers/cron/src/index.ts` | |
| 4.5 | Cron settings UI (toggle + time picker) | `apps/web/src/components/CronSettings.tsx` | |
| 4.6 | Job tracking (progress, costs) | D1 jobs table | |
| 4.7 | Token revocation detection + reconnect banner | Middleware + UI | |

**Test criteria**:
- [ ] Cron fires at configured time
- [ ] Only users with cron_enabled=true are processed
- [ ] Each playlist gets its own queue message
- [ ] Pipeline runs per-playlist (same as manual)
- [ ] Job record created with progress tracking
- [ ] Token revocation (401) disables cron and flags user
- [ ] "Reconnect Spotify" banner appears on next login

**Success metrics**:
- Cron processes all enabled playlists within 15-min timeout
- Failed playlists don't block others (queue isolation)
- Cost tracked per-job: sum of all generation costs

---

### Phase 5 — Polish

**Goal**: Gallery, history, error handling, account management.

**Tasks**:

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 5.1 | Gallery page (all generated covers) | `apps/web/src/app/dashboard/gallery/page.tsx` | |
| 5.2 | History/timeline page with costs | `apps/web/src/app/dashboard/history/page.tsx` | |
| 5.3 | GalleryGrid component | `apps/web/src/components/GalleryGrid.tsx` | |
| 5.4 | GenerationTimeline component | `apps/web/src/components/GenerationTimeline.tsx` | |
| 5.5 | Error states (failed generations, API errors) | Various | |
| 5.6 | Performance indexes | `migrations/002_indexes.sql` | |

**Test criteria**:
- [ ] Gallery shows all past covers in a grid
- [ ] History shows timeline with cost per generation
- [ ] Failed generations show error messages
- [ ] "Reconnect Spotify" banner on revoked token
- [ ] Dashboard performance acceptable with 100+ generations in history

**Success metrics**:
- Gallery loads in <1s
- Total cost visible in history view
- No unhandled error states (every failure has a UI message)

---

## 8. What Gets Ported from KGOSPCG

| Source (KGOSPCG) | Target (DISC) | Changes |
|------------------|---------------|---------|
| `workers/services/image-generation.service.ts` | `workers/cron/src/services/image-generator.ts` | Parameterize style prompt (was hardcoded) |
| `workers/services/theme-extraction.service.ts` | `workers/cron/src/services/theme-extractor.ts` | None — clean fetch() calls |
| `workers/services/lyrics.service.ts` | `workers/cron/src/services/lyrics.ts` | Drop AudD fallback (expired Nov 2025) |
| `workers/services/spotify-upload.service.ts` | `workers/cron/src/services/spotify.ts` | Fix Feb 2026 field renames |
| `workers/utils/retry.ts` | `workers/cron/src/utils/retry.ts` | None |
| `workers/utils/metrics.ts` | `workers/cron/src/utils/metrics.ts` | None |
| `workers/types.ts` | `packages/shared/src/types.ts` | Update Spotify field names, add DB types |
| `app/lib/encryption.server.ts` | `apps/web/src/lib/encryption.ts` | Port as-is |

### Do NOT Port

| File | Why |
|------|-----|
| `app/lib/services/image-compressor.service.ts` | Placeholder, never implemented |
| `app/lib/services/openai.service.ts` | Uses `openai` npm, not edge-compatible |
| `app/lib/services/storage.service.ts` | R2 was never configured |
| `app/types/database.ts` | Stale, doesn't match schema |
| All Clerk auth code | Replaced by Auth.js |

---

## 9. Environment Variables

### Next.js (Vercel)

```
AUTH_SECRET=                     # openssl rand -base64 32
AUTH_URL=https://disc.400.dev

SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=            # D1 REST API access
CLOUDFLARE_D1_DATABASE_ID=

ENCRYPTION_KEY=                  # 64 hex chars (openssl rand -hex 32)
```

### CF Worker (wrangler.toml secrets)

```
OPENAI_API_KEY=
ENCRYPTION_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

D1 and R2 are bound via wrangler.toml, not env vars.

---

## 10. Versioning Rules

**Source of truth**: `packages/shared/src/version.ts`

**Workflow**:
1. Make changes
2. `./scripts/version-bump.sh [patch|minor|major]` (interactive if no arg)
3. Update `CHANGELOG.md` under `[Unreleased]`
4. Commit with conventional format: `feat(scope): description`
5. Push → pre-push hook enforces: version bumped, lint passes, typecheck passes

**Decision tree**:
- **PATCH**: Bug fixes, infrastructure, refactors, dependency updates, admin-only changes
- **MINOR**: User-facing new features, significant UX changes, new pages
- **MAJOR**: Breaking changes, major architecture shifts

**Commit format**: `<type>(scope): <description>` — enforced by commitlint.

---

## 11. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Spotify Dev Mode 5-user limit | Can't scale beyond 5 users | Certain | Apply for Extended Quota when ready |
| lyrics.ovh goes down | Worse theme extraction | Medium | Metadata fallback (extractObjectFromMetadata) still works |
| DALL-E cost at scale | 50 playlists x $0.04 = $2/night | Low (personal use) | Track costs in generations table, add budget caps |
| Token revocation | Cron fails silently | Medium | Detect 401, disable cron, show reconnect banner |
| D1 migration breaking changes | Data loss | Low | Raw SQL migrations, no ORM magic. Test locally first. |
| Photon WASM memory limits | Compression fails | Low | 128MB Worker memory. DALL-E PNGs are ~2-4MB. Proven in KGOSPCG. |
| Spotify API field renames | 404/500 errors | Already happened | All types use Feb 2026 field names |

---

## 12. Cost Estimate (Monthly, Personal Use)

| Service | Usage | Cost |
|---------|-------|------|
| Cloudflare Workers (paid plan) | Cron + generation | $5.00 |
| Cloudflare D1 | Included in Workers plan | $0.00 |
| Cloudflare R2 | <10GB storage, zero egress | $0.00 |
| OpenAI DALL-E 3 | 50 images/day x 30 days | ~$60.00 |
| OpenAI GPT-4o-mini | Theme extraction | ~$0.50 |
| Vercel | Hobby plan | $0.00 |
| **Total** | | **~$65.50/mo** |

DALL-E is 92% of the cost. Reducing to 20 playlists/day → ~$25/mo.
