# Changelog

All notable changes to DISC will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
