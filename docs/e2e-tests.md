# DISC — E2E Test Matrix

Manual sweep checklist for every page and flow. Each test is a future candidate for GitHub Actions CI automation.

Status key: `[ ]` = not yet tested, `[x]` = passing, `[!]` = failing

---

## 1. Auth Flow (4 tests)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1.1 | Login redirect | Visit `/` unauthenticated | Redirects to `/login` with Spotify OAuth button |
| 1.2 | OAuth callback | Click "Sign in with Spotify" → authorize | Redirected to dashboard, session cookie set |
| 1.3 | Session persistence | Refresh page after login | Still authenticated, no re-login required |
| 1.4 | Logout | Click profile → sign out | Session cleared, redirected to `/login` |

---

## 2. Dashboard / Overview (8 tests)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 2.1 | Stats load | Visit `/` authenticated | Playlist count, generation count, total cost display |
| 2.2 | Style display | Dashboard header area | Current default style name shown |
| 2.3 | Recent generations | Dashboard table | Last N generations with thumbnails, status badges |
| 2.4 | Cron status | Dashboard cron section | Shows enabled/disabled, next run time |
| 2.5 | Live stat updates during job | Trigger a job, watch dashboard | Stats update in real-time as jobs complete |
| 2.6 | Table refetch after job | Complete a generation job | Dashboard table refreshes with new entry |
| 2.7 | Empty state | New user with no generations | Graceful empty state, no errors |
| 2.8 | Navigation | Click playlist name in table | Navigates to playlist detail page |

---

## 3. Playlist List (6 tests)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 3.1 | All playlists load | Visit `/playlists` | All Spotify playlists displayed |
| 3.2 | Cover images | Playlist cards | Spotify cover images render (or placeholder) |
| 3.3 | Track counts | Playlist cards | Track count shown per playlist |
| 3.4 | Collaborative badge | Collaborative playlists | Visual indicator for collaborative playlists |
| 3.5 | Detail navigation | Click a playlist card | Navigates to `/playlists/[spotifyId]` |
| 3.6 | Sync button | Click sync/refresh | Playlists re-fetched from Spotify API |

---

## 4. Playlist Detail (8 tests)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 4.1 | Metadata display | Visit playlist detail | Name, description, track count, cover image |
| 4.2 | Generation history | Scroll to history section | All generations listed with thumbnails, status, cost |
| 4.3 | Analysis view (with convergence) | View analysis for APLOTOCA generation | Track list, extracted themes, convergence candidates, image prompt sections all render |
| 4.4 | Analysis view (without convergence) | View analysis for custom-subject generation | Track list and image prompt render; convergence section absent, no crash |
| 4.5 | Claimed objects | Playlist with claimed objects | Object inventory displayed, superseded objects crossed out |
| 4.6 | Regenerate button | Click "Generate Now" | POST fires, status updates, new generation appears |
| 4.7 | Back navigation | Click "Back to playlists" | Returns to `/playlists` |
| 4.8 | Spotify link | Click "Open in Spotify" | Opens correct Spotify playlist URL in new tab |

---

## 5. Queue Page (15 tests)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 5.1 | Column layout | Visit `/queue` | Available / Scheduled / Processing / Completed columns |
| 5.2 | Card selection | Click a playlist card checkbox | Card gets accent ring, moves to Scheduled column |
| 5.3 | Card deselection | Click scheduled card "Remove" | Card returns to Available column |
| 5.4 | Schedule with APLOTOCA | Select card, choose "APLOTOCA — Full Analysis" | Config dropdown shows, no text input |
| 5.5 | Schedule with custom subject | Select card, choose "Custom Subject" | Text input appears, validates non-empty |
| 5.6 | Batch run trigger | Click "Run" with scheduled cards | POST to generate-batch, cards move to Processing |
| 5.7 | Progress polling | During processing | Step progress updates (1/6 through 6/6) with labels |
| 5.8 | Completion transition | Job finishes | Cards move to Completed, success state shown |
| 5.9 | Retry failed | Card in failed state, click "Retry" | Re-triggers generation for that playlist |
| 5.10 | Image review modal | Click "View" on completed card | Modal opens with generated image |
| 5.11 | Analysis tab in modal | Switch to "Analysis" tab in modal | AnalysisView renders with version picker |
| 5.12 | Collaborative cards | Collaborative playlists in queue | Dashed border, "Not eligible" badge, "Collaborative or non-owned" text, no checkbox |
| 5.13 | Real-time step updates | Watch processing card | Step label and progress bar update without manual refresh |
| 5.14 | Navbar badge updates | Trigger a job | Navbar shows spinner + count badge during processing |
| 5.15 | Completion banner | All scheduled cards finish | CronIdleBanner or completion summary appears |

---

## 6. Styles Page (5 tests)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 6.1 | Style list | Visit `/styles` | All active styles displayed |
| 6.2 | Default indicator | Default style card | Visual indicator (badge or highlight) for default |
| 6.3 | Style switching | Click a non-default style → set as default | Default updates, persisted on reload |
| 6.4 | Thumbnail display | Style cards | Thumbnail images render for each style |
| 6.5 | Style metadata | Style cards | Name, description, model info displayed |

---

## 7. Settings Page (6 tests)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 7.1 | Cron toggle | Toggle cron on/off | Persisted, reflected in dashboard cron status |
| 7.2 | Cron time selection | Change cron time | Saved, next-run time updates accordingly |
| 7.3 | Style preference | Change default style | Saved, new generations use selected style |
| 7.4 | Per-playlist cron toggle | Toggle cron for individual playlist | Only that playlist included/excluded from cron runs |
| 7.5 | Settings persistence | Change settings, reload page | All settings retained |
| 7.6 | Validation | Enter invalid cron time | Appropriate error shown, invalid value rejected |

---

## 8. Changelog (2 tests)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 8.1 | Version list | Visit `/changelog` | All versions listed, most recent first |
| 8.2 | Entry display | Expand a version entry | Changes listed with descriptions |

---

## 9. Cross-Page Awareness (6 tests)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 9.1 | Queue job visible from dashboard | Start job on queue page, navigate to dashboard | Dashboard reflects active job status |
| 9.2 | Navbar spinner during jobs | Start job, navigate between pages | Spinner + count badge persists in navbar across routes |
| 9.3 | Style change mid-job | Change style while job is processing | Current job unaffected, next job uses new style |
| 9.4 | Simultaneous cron + manual | Manual trigger while cron is active | Appropriate error or queueing behavior |
| 9.5 | API error handling | Simulate API failure (e.g., revoked Spotify token) | User-facing error message, no unhandled crash |
| 9.6 | Job completion from other page | Complete a job, navigate to playlists | Updated generation counts and latest covers shown |

---

## 10. Edge Cases (5 tests)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 10.1 | Empty state (no playlists) | User with no Spotify playlists | Graceful empty state with guidance |
| 10.2 | No generations yet | Playlist with zero generations | Detail page shows empty analysis section, no crash |
| 10.3 | Expired session | Wait for session expiry, interact | Redirected to login, no data loss |
| 10.4 | Network error recovery | Kill network mid-request, restore | Retry or error message, app remains functional |
| 10.5 | Concurrent tab behavior | Open app in two tabs, trigger job in one | Other tab reflects state on next poll/navigation |

---

## Notes

- Tests 4.4 and 5.12 cover the two bugs fixed in this version (null convergence + collaborative card styling)
- Test IDs are stable — add new tests at the end of each section
- Future: convert to Playwright test files under `tests/e2e/`
