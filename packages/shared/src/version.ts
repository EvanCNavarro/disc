/**
 * App version - auto-updated by version-bump script
 * DO NOT EDIT MANUALLY - use `./scripts/version-bump.sh`
 *
 * Semantic Versioning (X.Y.Z):
 *
 *   Z (PATCH) — default for most changes
 *     Bug fixes, typos, config tweaks, dep updates, refactors,
 *     infra changes, CI fixes. Users won't notice.
 *     Accumulates freely: 0.4.1, 0.4.2, ... 0.4.9
 *
 *   Y (MINOR) — user-visible additions
 *     New features, new pages, visible UX changes, new API endpoints.
 *     Users will see something new. Resets Z to 0.
 *     Examples: changelog page, playlist detail, manual trigger button.
 *
 *   X (MAJOR) — breaking changes
 *     Data migrations, API contract changes, removed features,
 *     architecture overhaul. Existing behavior changes or breaks.
 *     Resets Y and Z to 0.
 *
 * Decision tree:
 *   Does existing behavior break?  → MAJOR
 *   Will users notice something?   → MINOR
 *   Everything else                → PATCH
 */
export const APP_VERSION = "0.11.2";
