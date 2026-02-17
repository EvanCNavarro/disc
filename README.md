# DISC

AI-generated playlist cover art from your Spotify library.

## What It Does

DISC analyzes your Spotify playlists — lyrics, track metadata, and thematic patterns — then generates unique cover art using custom-trained LoRA models. The **APLOTOCA** pipeline (Analysis > Playlist > Objects > Themes > Object > Cover > Art) extracts symbolic objects from your music and renders them in your chosen visual style.

## Features

- **Automatic cover generation** — Create a Spotify playlist, DISC detects it and generates art within ~15 minutes
- **Smart cron** — Nightly regeneration only for playlists missing current-style covers
- **Style system** — Custom LoRA models with per-style prompt templates, guidance, and inference settings
- **Collaborative detection** — Identifies playlists with multiple contributors via `added_by` analysis, blocks generation
- **Watcher controls** — Pause/resume auto-detection, configurable 5/10/15 min poll interval
- **Pipeline transparency** — Full visibility into object extraction, theme convergence, and generation costs

## Architecture

```
apps/web/          Next.js 16 (Vercel)
workers/cron/      Cloudflare Worker (pipeline + cron)
packages/shared/   Shared types, config, constants
```

- **Auth:** Auth.js v5, Spotify OAuth (single-user gate)
- **Database:** Cloudflare D1 via REST API
- **Images:** Cloudflare R2 + Replicate (Flux models with LoRA)
- **Text Analysis:** OpenAI GPT-4o-mini (lyrics → objects → themes)

## Development

```bash
npm install
npm run dev:web        # http://127.0.0.1:4993
npm run dev:worker     # Cloudflare Worker local
```

Requires `.env.local` in `apps/web/` with Spotify, Cloudflare, Replicate, and OpenAI credentials.

## Deployment

- **Vercel** auto-deploys on push to main
- **GitHub Actions** runs lint + typecheck + Worker deploy
- **`/api/version`** returns current version for deploy verification
