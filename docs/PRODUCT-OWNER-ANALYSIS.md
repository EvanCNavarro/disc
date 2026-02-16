# DISC — Product Owner Analysis

> **For**: A product owner who's never seen this project
> **Generated**: 2026-02-15 (post v0.7.1)
> **Status**: 9 versions shipped, ~60% of planned features complete

---

## What Is DISC?

DISC is a single-user web app that **automatically generates cover art for your Spotify playlists** using AI. It works like this:

1. **Reads your playlists** from Spotify (song titles, artists, lyrics)
2. **Extracts themes** using GPT-4o-mini (finds symbolic objects like "wolf", "moonlight", "grief")
3. **Picks one object** that best represents the playlist's vibe
4. **Generates cover art** using Stable Diffusion in a chosen visual style (e.g., "Neon Noir", "Ukiyo-e Wave")
5. **Uploads it back** to Spotify as the playlist's cover image

The app tracks every generation — what object was chosen, why, what it cost — so you can see the full decision chain. Think of it as an AI art pipeline with full audit trail.

**Stack**: Next.js 16 (frontend), Cloudflare Workers (pipeline), D1 (database), R2 (image storage), Replicate (image generation), OpenAI (text analysis).

---

## Version History & Drift

| Planned (BUILDPLAN) | Actual | What Happened |
|---------------------|--------|---------------|
| v0.1.0 | v0.1.0 | Scaffolding — on track |
| v0.2.0 | v0.2.0 | Auth + Playlists — on track |
| v0.3.0 | v0.3.0 | Design system — on track |
| v0.4.0 | v0.4.0 | Pipeline + dashboard — on track |
| v0.5.0 | v0.5.0 | Changelog — on track |
| v0.5.1 | v0.5.1 | UI polish — on track |
| v0.6.0 = B4+B8+B1 | v0.6.0 = B8 only | **Drift starts.** Queue + manual triggers shipped, but Image Serving (B4) and Playlist Detail (B1) did NOT. |
| v0.6.1 (not planned) | v0.6.1 | Queue UX polish (unplanned patch) |
| v0.7.0 = B2+B3+B6+B7 | v0.7.1 | **More drift.** Only B6.1-B6.2 (cost tracking) shipped, bundled with unrelated work (useCachedFetch, timestamp fix, UX polish). Skipped v0.7.0. |

**Assessment**: Version strategy is ~2 versions ahead of reality. BUILDPLAN says "v0.6.0" should include the playlist detail page, but the detail page hasn't been started. The actual v0.6.0 only shipped the queue/trigger system (B8). Need to re-baseline.

---

## Remaining Work — ELI5 Breakdown

### ITEM 1: Run Migration 006

**The 30-second version**: The cost tracking code is written and deployed, but the database doesn't have the columns yet. It's like installing a cash register but forgetting to plug it in. One SQL command fixes it.

#### Objective Overview

| Question | Answer |
|----------|--------|
| **Who** | You (single user), affects production database |
| **What** | Run a SQL migration that adds 5 columns to the `generations` table: `model_name`, `llm_input_tokens`, `llm_output_tokens`, `image_model`, `cost_breakdown` |
| **When** | Immediate — blocks all cost tracking in production |
| **Where** | Cloudflare D1 production database |
| **Why** | Without this, every generation stores `NULL` for cost. The code to calculate and display costs (shipped in v0.7.1) has nothing to write to. |
| **How** | `wrangler d1 execute disc-db --file=migrations/006_generation_cost_tracking.sql` |
| **Effort** | Trivial — 5 minutes, one command |
| **Risk** | Near zero. `ALTER TABLE ADD COLUMN` is non-destructive in SQLite. |

#### Recommendation

No research needed. Just do it.

**Decision: [A] Run it now**

- [A] Run it now (recommended) — unblocks cost tracking immediately
- [B] Skip — cost tracking stays broken in production indefinitely

---

### ITEM 2: B4 — Image Serving (R2 Proxy)

**The 30-second version**: The pipeline already generates cover art and stores it in cloud storage (R2). But the web app can't display those images — it has no way to reach R2. This builds a secure tunnel so the dashboard can show actual generated artwork instead of Spotify's default thumbnails.

#### Objective Overview

| Question | Answer |
|----------|--------|
| **Who** | End user viewing dashboard, detail pages, queue |
| **What** | API route (`/api/images/[...key]`) that authenticates the user, fetches the image from R2, and streams it to the browser with cache headers |
| **When** | Before playlist detail page — detail page needs images |
| **Where** | `apps/web/src/app/api/images/[...key]/route.ts` (new), then updates to dashboard + queue components |
| **Why** | Without this, generated cover art is invisible in the app. The pipeline uploads to R2 and Spotify, but the web UI only shows Spotify's small thumbnails. Users can't see their full-res AI art. |
| **How** | Next.js API route → Cloudflare R2 REST API → stream response with `Cache-Control: immutable` |
| **Effort** | Low-medium — 4 sub-tasks, ~1 session |
| **Risk** | Low. Read-only proxy. Security via auth + path validation (`generations/{userId}/...`). |

#### Research-Backed Recommendation

**Approach: Authenticated API proxy with immutable caching** (not signed URLs, not public bucket)

| Source | Key Finding |
|--------|-------------|
| [Cloudflare R2 Presigned URLs Docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) | Presigned URLs work but create unique URLs per request, defeating browser/CDN caching. |
| [S3 Uploads — Proxies vs Presigned URLs](https://zaccharles.medium.com/s3-uploads-proxies-vs-presigned-urls-vs-presigned-posts-9661e2b37932) | Proxy gives stable URLs → better cache hit rates. Signed URLs vary, so each is treated as a new resource. |
| [Cloudflare R2 Image Delivery Architecture](https://developers.cloudflare.com/reference-architecture/diagrams/content-delivery/optimizing-image-delivery-with-cloudflare-image-resizing-and-r2/) | R2 + Cloudflare CDN = optimal for image delivery. Proxy through edge for auth + caching. |
| [Next.js Image Custom Loaders](https://www.fullstackfoundations.com/blog/nextjs-image-component-tutorial) | Custom loader functions let you point `<Image>` at your proxy route with width/quality params. |
| [Solving Image Loading with Next.js and S3](https://medium.com/@nomanmonis8/solving-image-loading-challenges-with-next-js-and-s3-ba88d2cd32c7) | For private images, proxy through API route is the standard pattern. `unoptimized` prop needed if auth headers can't be forwarded. |
| [CloudFront vs S3 Presigned URLs](https://www.examcollection.com/blog/understanding-the-differences-s3-pre-signed-urls-vs-cloudfront-signed-urls-vs-oai-vs-oac/) | CDN-level signing outperforms S3 presigned URLs for repeated access patterns. |

**Consensus**: For a single-user app with private images, an authenticated API proxy with `Cache-Control: public, max-age=31536000, immutable` is the simplest and most effective pattern. Generated images never change (they're versioned by timestamp in the key), so immutable caching is safe. Signed URLs add complexity without benefit here.

**Decision:**

- [A] API proxy with immutable caching (recommended) — simple, secure, cacheable
- [B] Public R2 bucket — simpler but images become world-readable
- [C] Signed URLs per request — more complex, worse caching
- [D] Defer — images stay invisible in the app

---

### ITEM 3: B1 — Playlist Detail Page (`/playlists/[slug]`)

**The 30-second version**: This is the app's reason for existing. Right now you can see a grid of playlists and a table of past generations, but you can't click into a playlist to see *why* the AI chose a specific object, *what* it extracted from each song, or *how* the final image came to be. This page is the full transparency layer — the audit trail.

#### Objective Overview

| Question | Answer |
|----------|--------|
| **Who** | End user exploring their playlists |
| **What** | A new page at `/playlists/[slug]` with 9 sections: header, action bar, analysis summary, generation timeline, expanded detail, track listing, object inventory, change detection |
| **When** | After B4 (image proxy) — needs images to be meaningful |
| **Where** | `apps/web/src/app/(dashboard)/playlists/[slug]/page.tsx` + supporting components |
| **Why** | The entire app is about making AI decisions transparent. Without this page, you can see *that* art was generated but not *why*. This is the core value proposition. |
| **How** | Server component fetches from D1 (playlists, analyses, generations, claimed_objects, styles). Client components for interactive sections (timeline expand, action buttons). |
| **Effort** | Heavy — 9 sub-tasks, largest single feature remaining. ~2-3 sessions. |
| **Risk** | Medium. Complex data joins. Depends on B4 for images. Some sub-tasks (B1.8 Object Inventory) need a categorizer that doesn't exist yet. |

#### Research-Backed Recommendation

**Approach: Three-tiered progressive disclosure with chronological audit trail**

| Source | Key Finding |
|--------|-------------|
| [Progressive Disclosure — NN/g](https://www.nngroup.com/articles/progressive-disclosure/) | Improves 3 of 5 usability components: learnability, efficiency, error rate. Defer advanced features to secondary screens. |
| [AI Transparency: 5 Design Lessons (Eleken)](https://www.eleken.co/blog-posts/ai-transparency) | Three-layer transparency: Visibility (reveal what), Explainability (clarify why), Accountability (let users question and influence). |
| [AI Transparency in UX (UX Collective)](https://uxdesign.cc/ai-transparency-in-ux-designing-clear-ai-interactions-ba9b6ba4761b) | Design transparency that scales with curiosity — surface-level rationale for everyone, optional deeper insights for power users. |
| [Timeline Navigators: UI Design Patterns for Time](https://journals.sagepub.com/doi/10.1177/21165067231192451) | Chronological log is most intuitive for temporal data. Users immediately understand timeline interfaces. |
| [Lessons Learned Designing a Timeline (UX Collective)](https://uxdesign.cc/lessons-learned-while-designing-a-timeline-3a330d4a2918) | Icons, images, and color-coded status badges aid comprehension in timeline UIs. |
| [Balancing Information Density (LogRocket)](https://blog.logrocket.com/balancing-information-density-in-web-development/) | Desktop-ideal density becomes overly dense on mobile. Test that users can move between summary and detail views while maintaining context. |
| [The AI Audit Trail (Medium)](https://medium.com/@kuldeep.paul08/the-ai-audit-trail-how-to-ensure-compliance-and-transparency-with-llm-observability-74fd5f1968ef) | Audit trail = recorded history of decisions, actions, data, and changes. Version control for data and models helps track what changed when and why. |

**Consensus**: Build the page in three layers:
1. **Summary** (visible immediately): playlist name, current cover art, chosen object, style, "when"
2. **Timeline** (scrollable): chronological generation history with thumbnails, status badges, cost
3. **Deep dive** (expand on click): full convergence candidates with reasoning, per-song extractions, collision notes

This matches the progressive disclosure pattern (NN/g) and the three-layer AI transparency model (Eleken). Interactive targets ≥48px for mobile (WCAG 2.5.8).

**Decision:**

- [A] Build with progressive disclosure (recommended) — 3 layers: summary → timeline → deep dive
- [B] Build as flat page — all data visible at once, simpler but overwhelming
- [C] Build summary only — defer timeline and deep dive to later
- [D] Defer entirely — app remains a "black box" for AI decisions

---

### ITEM 4: ImageReviewModal Redesign

**The 30-second version**: The queue page has a modal that shows a generated image. Currently it's a simple 2-column layout. The plan is to redesign it as a horizontal timeline showing all past generations for that playlist, so you can compare the current result against history.

#### Objective Overview

| Question | Answer |
|----------|--------|
| **Who** | User reviewing generated images in the queue |
| **What** | Redesign modal from 2-column layout to multi-generation horizontal timeline |
| **When** | After B4 (needs image proxy) and partially after B1 (shares data patterns) |
| **Where** | `apps/web/src/components/queue/ImageReviewModal.tsx` + new API route |
| **Why** | Seeing just the current image without history makes it hard to judge quality over time. A timeline lets you see improvement/regression. |
| **How** | New API route for generation history per playlist, horizontal scroll timeline in modal |
| **Effort** | Medium — 5 steps, plan file already exists (`PLAN-image-review-modal.md`) |
| **Risk** | Low-medium. Depends on B4 for image display. |

#### Recommendation

This shares infrastructure with B1 (generation history API, image display). Build after B4 and B1 to reuse components.

**Decision:**

- [A] Build after B1, reuse components (recommended)
- [B] Build independently now — duplicates some B1 work
- [C] Defer — current modal is functional

---

### ITEM 5: Style Creation via Paste

**The 30-second version**: Currently the app has 6 hardcoded art styles. This feature would let you paste a reference image and describe the style you want, then the system would try to recreate it, let you refine the prompt iteratively, and save it as a new selectable style.

#### Objective Overview

| Question | Answer |
|----------|--------|
| **Who** | User wanting custom art styles beyond the 6 built-in options |
| **What** | Upload/paste reference image → extract visual characteristics → generate test image → side-by-side comparison → iterate → save as reusable style |
| **When** | Future — needs design spec before implementation |
| **Where** | New page/modal + API routes + `styles` table changes |
| **Why** | Personalization. The 6 built-in styles are limiting. Users should be able to define their own aesthetic. |
| **How** | Image analysis (possibly via multimodal LLM), prompt template editor, iterative refinement loop |
| **Effort** | Heavy — full feature with no existing plan. Needs design spec, new APIs, complex UI. |
| **Risk** | High. Novel UX pattern, prompt engineering is unpredictable, multimodal analysis adds cost. |

#### Research-Backed Recommendation

| Source | Key Finding |
|--------|-------------|
| [Midjourney Style Reference Docs](https://docs.midjourney.com/hc/en-us/articles/32180011136653-Style-Reference) | `--sref` captures visual vibe (colors, medium, textures, lighting) without copying content. Industry-standard approach. |
| [PromptCharm: Multi-modal Prompting and Refinement (ACM)](https://dl.acm.org/doi/10.1145/3613904.3642803) | Academic research: version control for prompts, side-by-side comparison, single-variable iteration. |
| [Compare Prompts Side-by-Side (Arize)](https://arize.com/docs/ax/develop/prompt-playground/compare-prompts-side-by-side) | Up to 3 prompts compared simultaneously accelerates iteration and reduces guesswork. |
| [Iterative Prompt Refinement Research (arXiv)](https://arxiv.org/html/2504.20340v1) | Single-shot prompting falls short for precise target visuals. Iterative refinement substantially improves alignment. |
| [ComfyUI Prompt Control (GitHub)](https://github.com/asagi4/comfyui-prompt-control) | JSON-based template systems with `{prompt}` placeholder injection for reusable styles. |
| [Automatic1111 Styles (Promptus)](https://www.promptus.ai/blog/where-can-i-find-downloadable-styles-for-automatic1111) | CSV-based preset management for Stable Diffusion — simple and effective. |
| [Ideogram Batch Generation](https://docs.ideogram.ai/using-ideogram/features-and-tools/batch-generation) | Spreadsheet upload for batch consistency across 40+ images with same style. |

**Consensus**: Iterative refinement is the proven UX pattern — not one-shot style extraction. Build it as:
1. Upload reference image(s) + text description
2. System generates initial prompt template (multimodal LLM or manual)
3. Generate 2-4 test images with the prompt
4. Side-by-side comparison with reference
5. User tweaks one variable at a time, regenerates
6. Save finalized template as a style (JSON with `{subject}` placeholder)

This needs a full design spec before any code is written.

**Decision:**

- [A] Write design spec first, then build (recommended) — high-risk feature needs planning
- [B] Build a minimal version (text-only, no reference image) — faster but less useful
- [C] Defer until Tier 1-2 complete — focus on core features first
- [D] Skip — 6 built-in styles are sufficient

---

### ITEM 6: B6.4 — Monthly Cost Summary Widget

**The 30-second version**: Cost tracking per-generation shipped in v0.7.1. This adds a dashboard widget showing "you spent $X this month on Y generations" — a simple aggregate query.

#### Objective Overview

| Question | Answer |
|----------|--------|
| **Who** | User monitoring spending |
| **What** | Dashboard stat card or small table showing monthly cost totals |
| **When** | After migration 006 is run (needs real cost data) |
| **Where** | `apps/web/src/app/(dashboard)/page.tsx` |
| **Why** | Per-generation costs are tracked but there's no summary view. Users need to see total spending at a glance. |
| **How** | SQL aggregate query (`SUM(cost_usd) GROUP BY month`), display as stat card |
| **Effort** | Low — one query, one component. Quick win. |
| **Risk** | Near zero. Read-only display of existing data. |

#### Research-Backed Recommendation

| Source | Key Finding |
|--------|-------------|
| [OpenAI Usage API Cookbook](https://cookbook.openai.com/examples/completions_usage_api) | Daily spend breakdown + model-level attribution is the standard pattern. |
| [Replicate Billing Docs](https://replicate.com/docs/topics/billing) | Real-time dashboard with prepaid credit tracking and per-model costs. |
| [Vercel Usage Dashboard](https://vercel.com/changelog/new-usage-dashboard-for-pro-customers) | 30-day rolling view with filtering and CSV export. |
| [LLM Cost Tracking — Langfuse](https://langfuse.com/docs/observability/features/token-and-cost-tracking) | Input/output token split visualization, time-series trends. |
| [Budget Limits and Alerts — Portkey](https://portkey.ai/docs/product/administration/enforce-budget-and-rate-limit) | Industry standard: 50/80/100% budget threshold alerts. |
| [AI Cost Management Best Practices (Skywork)](https://skywork.ai/blog/ai-api-cost-throughput-pricing-token-math-budgets-2025/) | Three-layer dashboards: summary → detail → alerts. Daily/weekly/monthly budget periods. |

**Consensus**: For a single-user app, a simple stat card with monthly total + generation count is sufficient. Don't over-engineer with charts or alerts — that's for multi-user platforms. Show: current month total, previous month total, average cost per generation.

**Decision:**

- [A] Simple stat card (recommended) — monthly total + count + avg per generation
- [B] Full dashboard with charts — overkill for single user
- [C] Defer — per-generation tooltip is enough for now

---

### ITEM 7: CHANGELOG + SPEC Cleanup

**The 30-second version**: The documentation is stale. CHANGELOG.md is missing 3 versions. SPEC.md still says "v0.1.0" and references file paths that don't exist. BUILDPLAN version strategy doesn't match reality.

#### Objective Overview

| Question | Answer |
|----------|--------|
| **Who** | Future-you, or anyone reading the repo |
| **What** | Update CHANGELOG.md (add v0.6.0, v0.6.1, v0.7.1), fix SPEC.md version/paths, re-baseline BUILDPLAN version strategy |
| **When** | Low urgency but increasing tech debt |
| **Where** | Root-level docs: `CHANGELOG.md`, `SPEC.md`, `BUILDPLAN.md` |
| **Why** | Stale docs erode trust and cause confusion. The BUILDPLAN currently promises v0.6.0 includes the playlist detail page, which it does not. |
| **How** | Manual text editing |
| **Effort** | Low — housekeeping, ~30 minutes |
| **Risk** | Near zero. |

**Decision:**

- [A] Fix now alongside next feature work (recommended)
- [B] Defer — it's not blocking anything

---

### ITEM 8: B2 + B3 — Song Caching + Incremental Analysis

**The 30-second version**: Right now, if the same song appears in 5 playlists, the pipeline analyzes it 5 times (fetches lyrics, calls GPT). Song caching (B2) makes it analyze once and reuse. Incremental analysis (B3) means when 1 song changes in a 50-song playlist, it only analyzes the new song instead of all 50.

#### Objective Overview

| Question | Answer |
|----------|--------|
| **Who** | The pipeline (cost savings), indirectly the user (faster generations) |
| **What** | B2: New `song_analyses` table, cache per-song extraction. B3: Delta-only processing when below change threshold. |
| **When** | After core features (B1, B4). This is optimization. |
| **Where** | `workers/cron/src/pipeline.ts`, new DB table, minor UI changes |
| **Why** | Saves API costs (GPT calls) and time. Currently re-analyzes everything every run. |
| **How** | B2: Hash by Spotify track ID, cache in DB. B3: Diff current vs previous track list, only process delta, merge with cached results. |
| **Effort** | Medium — pipeline changes, new table, merge logic |
| **Risk** | Medium. Merge logic for incremental analysis is tricky (what if the convergence result changes with different song mix?). |

#### Research-Backed Recommendation

| Source | Key Finding |
|--------|-------------|
| [Incremental Load Strategy (Skyvia)](https://blog.skyvia.com/incremental-load-strategy-for-data-warehouses/) | High watermark tracking with timestamp columns to process only new/changed data. |
| [Semantic Caching for LLMs (Redis)](https://redis.io/blog/what-is-semantic-caching/) | Vector embeddings + cosine similarity (0.85-0.95 threshold) to match semantically similar queries. Can cut LLM costs 60-90%. |
| [LLM Cost Optimization (FutureAGI)](https://futureagi.com/blogs/llm-cost-optimization-2025) | Prompt caching can reduce costs by 60-90% for applications with substantial static content. |
| [dbt Incremental Models](https://docs.getdbt.com/docs/build/incremental-models) | Merge strategy: use unique keys to identify records across runs, merge new results with existing. |
| [Content Addressable Storage (Terragrunt)](https://terragrunt.gruntwork.io/docs/features/cas/) | Hash inputs → deterministic keys → automatic deduplication. Same hash = same content, guaranteed. |
| [GPTCache (GitHub)](https://github.com/zilliztech/GPTCache) | Open-source semantic cache for LLMs with modular embedding generation and similarity evaluation. |

**Consensus**: For DISC's use case, content-addressable caching by Spotify track ID is the right approach — simpler than semantic caching (which is overkill when you have exact track IDs). Hash track ID → check `song_analyses` table → skip if cached. For incremental analysis, the delta-merge pattern from dbt is directly applicable: identify changed tracks, process only those, merge with previous results.

**Decision:**

- [A] Build B2 first, B3 later (recommended) — song caching is simpler and provides most of the savings
- [B] Build both together — more efficient if you're already in the pipeline code
- [C] Defer both — current costs are low for a single user
- [D] Build B3 only — incremental analysis without per-song caching

---

### ITEM 9: CI Pipeline (GitHub Actions)

**The 30-second version**: The project has no automated CI. Every push goes unchecked — no lint, no typecheck, no tests run automatically. This was listed as a Phase 0 deliverable but was never built.

#### Objective Overview

| Question | Answer |
|----------|--------|
| **Who** | Developer (you), ensures code quality on every push |
| **What** | GitHub Actions workflows: lint (Biome), typecheck (tsc), and eventually tests |
| **When** | Important for quality but not blocking any features |
| **Where** | `.github/workflows/ci.yml` |
| **Why** | Currently relies on manual `npm run lint` and pre-commit hooks. If hooks are bypassed (--no-verify), broken code can land on main. |
| **How** | GitHub Actions + Turborepo for affected-package detection |
| **Effort** | Low-medium — standard workflow config |
| **Risk** | Near zero. Read-only checks, doesn't affect production. |

#### Research-Backed Recommendation

| Source | Key Finding |
|--------|-------------|
| [GitHub Actions + Turborepo Guide (WarpBuild)](https://www.warpbuild.com/blog/github-actions-monorepo-guide) | Use `turbo run build test lint --filter=[origin/main]...[HEAD]` for affected-only execution. |
| [Turborepo GitHub Actions Docs](https://turbo.build/repo/docs/guides/ci-vendors/github-actions) | Cache `.turbo` directory with `actions/cache`. Use `pnpm/action-setup`. |
| [Cloudflare Workers CI/CD](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) | Use `wrangler-action` with `CLOUDFLARE_API_TOKEN` as GitHub secret. |
| [Vercel Monorepo Docs](https://vercel.com/docs/monorepos) | Vercel auto-detects monorepos and uses Turborepo for intelligent builds. |
| [Nx vs Turborepo Comparison](https://www.wisp.blog/blog/nx-vs-turborepo-a-comprehensive-guide-to-monorepo-tools) | Turborepo is simpler for small monorepos. Nx is 7x faster for large ones but adds complexity. |
| [GitHub Actions Cache Best Practices (WarpBuild)](https://www.warpbuild.com/blog/github-actions-cache) | Cache pnpm store via `setup-node`, NOT `node_modules` directly. |

**Consensus**: For a small monorepo (3 packages), Turborepo + GitHub Actions is the standard approach. Workflow: pnpm install → turbo run lint typecheck → cache .turbo directory. Add Cloudflare Workers deployment via wrangler-action on push to main. ~30 minutes to set up.

**Decision:**

- [A] Build basic CI (lint + typecheck) now (recommended) — catches issues early
- [B] Build full CI + CD (lint + typecheck + deploy Workers + deploy Vercel) — more complete but more setup
- [C] Defer — pre-commit hooks are sufficient for a single developer

---

### ITEM 10: B7 — Song Metadata Expansion

**The 30-second version**: Track listings currently show song name and artist. This adds album art thumbnails, genres, and duration — richer data for the playlist detail page.

#### Objective Overview

| Question | Answer |
|----------|--------|
| **Who** | User viewing track listings on playlist detail page |
| **What** | Fetch album art, genres (from artist lookup), and duration from Spotify API |
| **When** | After B1 (needs the track listing to display in) |
| **Where** | `workers/cron/src/spotify.ts` (data fetching), playlist detail page (display) |
| **Why** | Visual richness. Bare text listings of song names are less engaging than seeing album art. Genres help explain why certain themes were extracted. |
| **How** | Expand Spotify API `fields` parameter to include `album.images`, `artists.id`, `duration_ms`. Batch artist genre lookup. |
| **Effort** | Low-medium — API changes + display updates |
| **Risk** | Low. Additional Spotify API calls (1 per 50 unique artists). |

**Decision:**

- [A] Build alongside B1 track listing (recommended) — natural integration point
- [B] Defer — text-only track listing is functional
- [C] Build genres only — most valuable metadata for theme explanation

---

### ITEM 11: B5, B9, B10 — Nice-to-Haves

These are lower-priority items that improve quality but aren't core features.

| Item | What | Effort | Recommendation |
|------|------|--------|----------------|
| **B5. Job Detail Page** | `/jobs/[id]` showing per-job results. Needs `job_id` column on generations. | Medium | Defer. Dashboard covers most use cases. |
| **B9. Object Scoring** | Numeric scores (high=3, medium=2, low=1) aggregated across tracks, passed to convergence prompt. | Low | Build during B1 if convenient — improves convergence quality. |
| **B10. Loading Skeletons** | Per-page skeleton loaders matching page layout. | Low | Build as you build each page — don't batch separately. |

**Decision:**

- [A] Build B9 + B10 incrementally during other work (recommended)
- [B] Batch all three as a polish sprint
- [C] Defer all — focus on core features

---

### ITEM 12: B11 — Theme Grouping & Visual Collage (Future)

**The 30-second version**: Advanced analytics — which objects appear most across all playlists, how themes evolve over time, generating collage-style images from multiple objects. No concrete plan exists.

**Decision:**

- [A] Defer until Tier 1-3 complete (recommended) — exploratory, no plan exists
- [B] Start design spec now

---

## Recommended Priority Order

| # | Item | Effort | Unlocks |
|---|------|--------|---------|
| 1 | Run migration 006 | 5 min | Cost tracking in production |
| 2 | B4 Image Serving | 1 session | Images visible everywhere |
| 3 | B1 Playlist Detail Page | 2-3 sessions | Core value proposition |
| 4 | Doc cleanup (CHANGELOG, SPEC, BUILDPLAN) | 30 min | Accurate docs |
| 5 | ImageReviewModal redesign | 1 session | Better queue UX |
| 6 | B6.4 Monthly cost summary | 30 min | Spending visibility |
| 7 | CI pipeline | 1 hour | Automated quality checks |
| 8 | B2 Song caching | 1 session | Pipeline cost savings |
| 9 | B7 Song metadata | 1 session | Richer track listings |
| 10 | B3 Incremental analysis | 1 session | Pipeline efficiency |
| 11 | Style Creation via Paste | 2-3 sessions | Custom styles (needs spec first) |
| 12 | B5/B9/B10/B11 | Incremental | Polish + future |

---

## Version Re-Baseline Proposal

The current BUILDPLAN version strategy is out of sync. Proposed fix:

| Version | Content | Notes |
|---------|---------|-------|
| ~~v0.6.0~~ | ~~B4+B8+B1~~ → B8 + QueueBoard (shipped) | Already shipped |
| ~~v0.7.0~~ | Skipped | |
| v0.7.1 | Cost tracking + dashboard polish (shipped) | Already shipped |
| **v0.8.0** | B4 Image Serving | Unblocks images |
| **v0.9.0** | B1 Playlist Detail Page + B6.4 cost summary | Core transparency feature |
| **v0.10.0** | ImageReviewModal redesign + B7 metadata | Queue + data richness |
| **v0.11.0** | B2 + B3 song caching + incremental | Pipeline optimization |
| **v0.12.0** | Style Creation via Paste | New feature |
| **v1.0.0** | CI + final polish (B9, B10) | Production-ready |

---

## Sources Index

### Image Proxy & CDN
- [Cloudflare R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [R2 Image Delivery Architecture](https://developers.cloudflare.com/reference-architecture/diagrams/content-delivery/optimizing-image-delivery-with-cloudflare-image-resizing-and-r2/)
- [Proxies vs Presigned URLs](https://zaccharles.medium.com/s3-uploads-proxies-vs-presigned-urls-vs-presigned-posts-9661e2b37932)
- [Next.js Image Custom Loaders](https://www.fullstackfoundations.com/blog/nextjs-image-component-tutorial)
- [Image Loading with Next.js + S3](https://medium.com/@nomanmonis8/solving-image-loading-challenges-with-next-js-and-s3-ba88d2cd32c7)
- [CloudFront vs S3 Presigned URLs](https://www.examcollection.com/blog/understanding-the-differences-s3-pre-signed-urls-vs-cloudfront-signed-urls-vs-oai-vs-oac/)

### UX & Transparency
- [Progressive Disclosure — NN/g](https://www.nngroup.com/articles/progressive-disclosure/)
- [AI Transparency: 5 Design Lessons (Eleken)](https://www.eleken.co/blog-posts/ai-transparency)
- [AI Transparency in UX (UX Collective)](https://uxdesign.cc/ai-transparency-in-ux-designing-clear-ai-interactions-ba9b6ba4761b)
- [Timeline UI Design Research (SAGE)](https://journals.sagepub.com/doi/10.1177/21165067231192451)
- [Designing a Timeline (UX Collective)](https://uxdesign.cc/lessons-learned-while-designing-a-timeline-3a330d4a2918)
- [Information Density (LogRocket)](https://blog.logrocket.com/balancing-information-density-in-web-development/)
- [AI Audit Trail (Medium)](https://medium.com/@kuldeep.paul08/the-ai-audit-trail-how-to-ensure-compliance-and-transparency-with-llm-observability-74fd5f1968ef)

### Style Creation & Prompt Engineering
- [Midjourney Style Reference](https://docs.midjourney.com/hc/en-us/articles/32180011136653-Style-Reference)
- [PromptCharm (ACM)](https://dl.acm.org/doi/10.1145/3613904.3642803)
- [Side-by-Side Prompt Comparison (Arize)](https://arize.com/docs/ax/develop/prompt-playground/compare-prompts-side-by-side)
- [Iterative Prompt Refinement Research (arXiv)](https://arxiv.org/html/2504.20340v1)
- [ComfyUI Prompt Control (GitHub)](https://github.com/asagi4/comfyui-prompt-control)
- [Automatic1111 Styles](https://www.promptus.ai/blog/where-can-i-find-downloadable-styles-for-automatic1111)
- [Ideogram Batch Generation](https://docs.ideogram.ai/using-ideogram/features-and-tools/batch-generation)

### Cost Tracking Dashboards
- [OpenAI Usage API](https://cookbook.openai.com/examples/completions_usage_api)
- [Replicate Billing](https://replicate.com/docs/topics/billing)
- [Vercel Usage Dashboard](https://vercel.com/changelog/new-usage-dashboard-for-pro-customers)
- [LLM Cost Tracking — Langfuse](https://langfuse.com/docs/observability/features/token-and-cost-tracking)
- [Budget Alerts — Portkey](https://portkey.ai/docs/product/administration/enforce-budget-and-rate-limit)
- [AI API Cost Management (Skywork)](https://skywork.ai/blog/ai-api-cost-throughput-pricing-token-math-budgets-2025/)

### Incremental Processing & Caching
- [Incremental Load Strategy (Skyvia)](https://blog.skyvia.com/incremental-load-strategy-for-data-warehouses/)
- [Semantic Caching (Redis)](https://redis.io/blog/what-is-semantic-caching/)
- [LLM Cost Optimization (FutureAGI)](https://futureagi.com/blogs/llm-cost-optimization-2025)
- [dbt Incremental Models](https://docs.getdbt.com/docs/build/incremental-models)
- [Content Addressable Storage (Terragrunt)](https://terragrunt.gruntwork.io/docs/features/cas/)
- [GPTCache (GitHub)](https://github.com/zilliztech/GPTCache)

### CI/CD for Monorepos
- [GitHub Actions + Turborepo (WarpBuild)](https://www.warpbuild.com/blog/github-actions-monorepo-guide)
- [Turborepo CI Docs](https://turbo.build/repo/docs/guides/ci-vendors/github-actions)
- [Cloudflare Workers CI/CD](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Vercel Monorepo Support](https://vercel.com/docs/monorepos)
- [Nx vs Turborepo](https://www.wisp.blog/blog/nx-vs-turborepo-a-comprehensive-guide-to-monorepo-tools)
- [GitHub Actions Cache](https://www.warpbuild.com/blog/github-actions-cache)
