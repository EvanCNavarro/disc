# Changelog

All notable changes to DISC will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
