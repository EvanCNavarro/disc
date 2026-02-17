# Changelog

All notable changes to DISC will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] - 2026-02-16

### Added
- Canonical thumbnails: every style card shows a generated boombox image in that style's aesthetic
- Style deletion with custom confirmation modal and cascading version cleanup
- Default style picker in Settings using custom searchable dropdown
- Style creator → analysis → editor flow: upload images, Claude analyzes, generates heuristics
- Reusable ConfirmDialog component using native dialog element with destructive variant
- Custom Dropdown component with keyboard navigation, search filtering, and ARIA support

### Fixed
- KGO thumbnail now uses Flux 2 Pro model (migration 010 applied to D1)
- Stale RSC cache after style deletion — added revalidatePath and router.refresh

## [0.7.0] - 2026-02-16

### Added
- Kuro Gin Orenjiiro style: FLUX LoRA trained on 16 reference images
- Seed all 7 styles into D1 database
- Generation history table with stale-while-revalidate caching, cost tracking, and breakdown tooltips
- Playlist detail page with full analysis transparency
- Song-level extraction caching via song_extractions table
- Object scoring with tier weights aggregated into convergence prompt
- Cost tracking end-to-end: token counts, per-step breakdown, total cost per generation

### Fixed
- Dark-mode safe colors replacing hardcoded Tailwind green/yellow/red
- R2 key path validation in image proxy — reject traversal and non-PNG paths

## [0.6.1] - 2026-02-15

### Added
- Mobile responsive kanban: horizontal snap-scroll below md breakpoint
- Dynamic footer clearance via ResizeObserver
- ARIA landmarks: region roles, aria-live progress summary, role=alert on errors

### Fixed
- Done bucket thumbnails now show generated images instead of original Spotify covers
- Progress summary hidden when no playlists loaded

### Changed
- Scale pass: 48px cover art, 24px checkboxes (WCAG 2.5.8), text-sm status labels
- Color consistency: amber-* replaced with --color-warning tokens
- Layout fix: viewport-filling dvh-based sizing
- Footer uses .glass class, safe-area padding for macOS dock

## [0.6.0] - 2026-02-15

### Added
- Queue page with 3-column kanban board for batch cover generation
- Batch trigger: select multiple playlists, choose style override, generate all at once
- Live progress tracking: step-by-step status updates
- Image review modal with side-by-side comparison and revision notes
- Worker /trigger endpoint: POST-only with bearer token authentication
- Revision notes support for iterative refinement
- New API routes: generate-batch, regenerate, generations, styles
- Queue nav link and dashboard quick action cards

### Fixed
- Stale processing detection: playlists stuck >5 minutes auto-reset to idle

### Changed
- Renamed dall_e_prompt column to prompt (migration 004)

## [0.5.1] - 2026-02-15

### Added
- Universal button standard (px-3 py-2 text-xs font-medium, 32px height) across all components
- Login page redesign: zen breathing DISC logo background, large Spotify CTA button, "Welcome to DISC" heading
- DISC logo footer button with green fireworks easter egg (fireworks-js)
- BackToTop only renders on scrollable pages (ResizeObserver)

### Changed
- Max-width standardized to 1280px (max-w-7xl) across dashboard, changelog, and footer
- Footer description text constrained to 4 lines (max-w-[60ch])
- "What's New?" nav link visible on all pages (authenticated and unauthenticated)
- Changelog page accessible without authentication
- Footer visible on login page with version badge
- Combined "Changelog v0.5.0" clickable badge in footer

### Performance
- Lighter skeleton loader (3 minimal placeholders instead of 15 cards)
- staleTimes RSC caching (30s) for instant back/forward navigation

## [0.5.0] - 2026-02-15

### Added
- Changelog page at `/changelog` with search, fuzzy word matching, and highlighted results
- "What's New" nav link in NavDock
- 5 new art styles: Neon Noir, Soft Watercolor, Brutalist Collage, Chromatic Glass, Ukiyo-e Wave
- Structured changelog.json with types, utilities, and version-bump.sh integration
- Production deployment: disc.400.dev live with Spotify OAuth, TLS, and all worker secrets
- Footer with 400 Faces branding, DISC description, version, and changelog link
- Pulsing blue unread indicator on user avatar when new changelog entries exist
- "What's New" menu item in user dropdown with unread dot
- Auto-mark changelog as seen on visit, per-user tracking in D1
- Breadcrumb navigation on changelog page (Home > Changelog)

### Fixed
- Vercel env vars with trailing newline causing INVALID_CLIENT on Spotify OAuth
- AUTH_URL set to production domain for correct OAuth redirect

### Changed
- Refined versioning strategy: PATCH for invisible changes, MINOR for user-visible, MAJOR for breaking
- version-bump.sh now scaffolds changelog.json entries automatically

## [0.4.0] - 2026-02-15

### Added
- Enhanced pipeline: lyrics → tiered object extraction → collision-aware convergence → image generation
- 9 worker modules: crypto, image, replicate, spotify, pipeline, lyrics, openai, extraction, index
- Replicate Flux Schnell (LoRA) for image generation (replaced DALL-E 3)
- @cf-wasm/photon JPEG compression for Spotify upload (<192KB)
- lyrics.ovh integration with 5s timeout, concurrency 5, metadata fallback
- GPT-4o-mini batch extraction + convergence (2 LLM calls per playlist, ~$0.002 total)
- Collision detection: cross-playlist claimed objects registry with supersede logic
- Change detection: tiered thresholds (50% for ≤2 tracks, 33% for 3, 25% for 4+)
- D1 schema: styles, playlist_analyses, claimed_objects tables; generations audit columns
- Dashboard overview at `/`: active style card, pipeline timeline, playlist stats, recent generations
- Settings page at `/settings`: schedule, style selector, account management
- NavItems client component with active state indicator (aria-current="page")
- Design tokens: --color-warning, --color-info, --color-destructive-muted (light + dark)
- R2 image archival with structured key paths
- AES-256-GCM encryption via Web Crypto API (worker-compatible)
- BUILDPLAN.md with full Phase 3.5 implementation notes

### Changed
- Playlists grid moved from `/` to `/playlists`
- NavDock updated: logo→/, playlists→/playlists, settings→/settings
- Focus-visible rule extended to input/select/textarea
- getDashboardData wrapped in try/catch with error state fallback

### Removed
- Unused hono dependency from worker

## [0.3.0] - 2026-02-15

### Added
- Design system: glassmorphism, Spotify green aura, 4-concentric-ring logo
- CSS custom properties for all design tokens (colors, spacing, radii, typography)
- Glass utility class with backdrop blur, border, and shadow
- Aura utility class with gradient glow effect
- Text hierarchy: --color-text (15:1), --text-secondary (7.8:1), --text-muted (4.7:1)
- Global focus-visible: Spotify green outline on all interactive elements
- Skip-to-content link for keyboard navigation
- NavDock with server-side auth + client-side UserDropdown

## [0.2.0] - 2026-02-14

### Added
- Auth.js v5 (beta.30) with Spotify OAuth provider
- Single-user gate: only evancnavarro can sign in
- AES-256-GCM encrypted refresh token storage in D1
- D1 REST API access layer (Vercel can't bind D1 natively)
- Spotify API helpers: fetch playlists, paginated
- Dashboard layout with auth middleware protection
- Playlist grid with Spotify cover thumbnails
- Playlist sync: Spotify → D1 via after() callback
- Edge Runtime compatibility: split auth.config.ts (Edge-safe) from auth.ts (Node)

## [0.1.0] - 2026-02-14

### Added
- Monorepo scaffolding: apps/web, workers/cron, packages/shared
- Next.js 16 with Tailwind v4 and DISC design tokens
- CF Worker stub with D1 database binding
- Shared types (Spotify Feb 2026 compliant), styles, and version module
- D1 migration: users, playlists, generations, jobs tables
- Biome linting + formatting
- GitHub Actions CI (lint + typecheck)
- Version management: version-bump.sh, version-check.sh pre-push gate
- Husky hooks: pre-commit (lint-staged), commit-msg (commitlint), pre-push (version + lint + typecheck)
