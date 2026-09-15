# Steam play evidence: Phase 1 checkpoint

Date: 2026-09-13. Local implementation only, on `Dev` at
`ef2c075743bd19ee7f20b3450ceba6f8775be597` plus the working-tree changes below.
No commit, push, deployment, migration runner, or live Steam/RAWG request.

## Completed behavior

- Candidate imports lock only the candidate side of the joined SQL query.
- Playing imports use frozen source first-play observation evidence, not a
  candidate's later last-played value. Historical play without that evidence
  leaves the start date unknown.
- Notification approval reads its saved event evidence on the backend and
  preserves an existing personal date. A later client date cannot replace it.
- Steam timestamps become calendar dates in `Asia/Jerusalem`, including DST.
  Explicit calendar dates remain unchanged.
- Wishlist moves into Playing can use one unambiguous current-connection source's
  first-play observation, including legacy Wishlist games. Local intentions,
  Steam membership, and existing Backlog dates/statuses remain preserved.
- Missing Steam timestamps use the snapshot observation time, retained through
  processing/reclaim and later sessions. This is approximate evidence, not an
  exact Steam first-session timestamp; no historical dates were backfilled.
- Activity predecessors must belong to the same account/connection. Replacement
  and reconnection create zero-delta baselines while keeping old observations.

## Dirty-file scope

The starting worktree already modified `backend/services/steamService.js` and
`backend/services/steamService.test.js`; this phase builds on those edits.

Other runtime files: `backend/services/steamLibrarySyncService.js`,
`backend/services/steamActivityService.js`,
`backend/services/steamWishlistService.js`, `backend/utils/steamPlayDate.js`,
`src/utils/steamSync.js`, and
`src/features/notifications/NotificationActions.jsx`.

Other tests: `backend/steamPlayEvidence.contract.test.js`,
`backend/utils/steamPlayDate.test.js`, `src/utils/steamSync.test.js`, and
`tests/e2e/notifications.spec.js`. This handoff is also new.
Inspect the mixed original/new diff before any future staging.

## Verification

Tested the working tree above; no later runtime changes followed these checks.

- `node --test backend/utils/steamPlayDate.test.js src/utils/steamSync.test.js backend/services/steamService.test.js backend/services/steamLibrarySyncService.test.js backend/services/steamActivityService.test.js backend/services/steamWishlistService.test.js backend/steamPlayEvidence.contract.test.js`: 59 passed, zero failed/skipped.
- The new PostgreSQL contract creates/drops only a uniquely named localhost
  fixture database using the fresh schema. It does not invoke migrations. All
  provider responses are fixtures; unexpected requests fail the contract.
- `npx playwright test tests/e2e/notifications.spec.js --project=chromium --grep "notifications (desktop|mobile):"`: two passed. The first attempt could not
  start Vite because esbuild lacked filesystem access; the access-approved retry
  passed. Browser API responses are mocked.
- Targeted ESLint on all changed JS/JSX initially found one test declaration error;
  corrected to an async function expression. The narrow rerun passed. Six existing
  JSX unused-import warnings remain in NotificationActions; no unrelated cleanup.
- `node --test backend/steamPlayEvidence.contract.test.js` after the test-only
  lint correction: seven passed, zero failed/skipped (parent plus six cases).
- `git diff --check`: passed; Git reports LF/CRLF conversion warnings.
- Full suite/build, migration contracts, exact-candidate CI, and production checks
  were not run. Node on this machine is 22.23.1; package target remains Node 20.x.

## Next action

Start Phase 2 with `backend/services/wishlistMetadataService.js` and its contract
tests: reclaim expired running work and fence every completion against its lease
and item revision so late workers cannot overwrite manual RAWG choices. Then
repair actual due refresh/cached reuse, keep RAWG identity independent of price
targets, and add durable bounded follow-up for new Library candidates.

Keep Wishlist Match RAWG as a separate user-control feature. Do not enable cron,
metadata maintenance settings, or release changes incidentally. UI/status/bulk
diagnostics and remaining price/cleanup review findings stay for later checkpoints.
