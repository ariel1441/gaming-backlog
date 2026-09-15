# Wishlist metadata worker checkpoint

Goal: recover interrupted Wishlist metadata work, protect manual RAWG choices from late worker results, and refresh stale metadata while honoring retry delays.

Revision: `Dev`, HEAD `ef2c075743bd19ee7f20b3450ceba6f8775be597`; recorded tracking status is ahead of `origin/Dev` by two commits. Changes remain uncommitted. Preserve all existing Phase 1 changes listed in `steam-play-evidence-phase1-handoff.md`; this checkpoint changes only `backend/services/wishlistMetadataService.js`, its test file, and this handoff.

Completed:

- Expired running jobs can be reclaimed. Lease renewal protects long requests; worker ID plus attempt count fence late successes and failures, including reused worker IDs.
- Catalog linking and queue completion commit together. A manual catalog choice invalidates an old worker's result. Ownership is checked before manual-selection ingestion.
- Fresh shared metadata is reused without sliding its refresh date. Stale, incomplete-due, and explicit refreshes fetch again. Shared provider backoff and item retry delays are respected; failed hydration preserves an existing exact identity.
- Lost leases are skipped rather than reported as successful processing or saved in attempt history.

Verification against the uncommitted checkpoint:

- `node --test backend/services/wishlistMetadataService.test.js`: 12 passed before the final item-backoff guard and heartbeat test.
- After those additions, `node --test --test-name-pattern="failure preserves exact|fresh catalog reuse|Wishlist work is owner|long provider request" backend/services/wishlistMetadataService.test.js`: 4 passed. Together these verify 13 distinct tests; unchanged passing tests were not rerun.
- `npx eslint --rulesdir scripts/eslint-rules backend/services/wishlistMetadataService.js backend/services/wishlistMetadataService.test.js`: passed.
- `git diff --check`: passed before handoff creation; repeated after documentation only.
- Providers were mocked. Database tests used a disposable local schema. No migration runner, live provider calls, browser checks, full suite, build, CI, commit, push, or deployment.

Price identity checkpoint (2026-09-13 continuation):

- Steam price targets now derive exact app identities from retained Steam Wishlist membership
  only. Manual RAWG/catalog selection cannot add, replace, or make an inactive/local Steam
  price identity ambiguous.
- Added a focused regression covering an inactive/local Wishlist item. It verifies that manual
  RAWG selection changes only the catalog link while preserving the Steam target, membership,
  price monitor/history, Library source/playtime, activity, game status/dates, and play history.
- Added `backend/migrations/041_separate_wishlist_price_identity.sql` as the forward-only source
  equivalent of the fresh-install schema change. It was not executed; no database was migrated.

Verification on the dirty worktree:

- `node --test --test-name-pattern="manual RAWG selection preserves inactive local Steam price identity" backend/services/wishlistMetadataService.test.js`: passed (1 test).
- `npx eslint --rulesdir scripts/eslint-rules backend/services/wishlistMetadataService.test.js`: passed.
- `git diff --check`: passed.
- No full suite, migration runner, provider call, commit, push, deployment, or production check.

Library candidate follow-up checkpoint (2026-09-13 continuation):

- Library finalization now drains the current pending Steam candidate queue in bounded runs,
  rather than only attempting candidates discovered by the current job. Existing proposed or
  user-selected matches remain excluded, so completed matching is not repeated.
- Added `backend/steamLibraryCandidateFollowUp.contract.test.js`. It covers a 251-item budget
  carry-over, interruption/retry, pending identity retry, and current-account fencing after
  Steam replacement. The fixture uses the fresh schema directly, mocks provider access, and
  does not introduce a schema change or run migrations.

Verification on the dirty worktree:

- `node --test backend/steamLibraryCandidateFollowUp.contract.test.js`: passed (1 test).
- `node --check backend/steamLibraryCandidateFollowUp.contract.test.js`: passed.
- `npx eslint --rulesdir scripts/eslint-rules backend/services/steamLibrarySyncService.js backend/steamLibraryCandidateFollowUp.contract.test.js`: passed.
- `git diff --check`: passed.
- No migration runner, live Steam/RAWG call, full suite, build, CI, commit, push, deployment, or production check.

Wishlist/Backlog metadata UX checkpoint (2026-09-13 continuation):

- Shared RAWG filters now keep `review`, `metadata incomplete`, and worker `failed`
  states distinct. A failed refresh is no longer classified as merely missing or linked
  because an identity happens to exist; incomplete worker outcomes remain filterable too.
- Wishlist detail footers show the same RAWG metadata state, and single/bulk refresh
  feedback reports linked, review, match-needed, and failed/retry-scheduled counts from
  the existing queue response.
- Added focused frontend regressions for the failed/incomplete filter cases and batch
  feedback aggregation. No backend, schema, or provider behavior changed in this checkpoint.

Verification on the dirty worktree:

- `node --test src/utils/gameList.test.js`: 20 passed.
- `node --test src/pages/Wishlist/wishlistPresentation.test.js`: passed (4 tests when run with the shared focused command).
- `npx eslint --rulesdir scripts/eslint-rules src/utils/filterOptions.js src/utils/gameList.test.js src/pages/Wishlist/wishlistPresentation.js src/pages/Wishlist/wishlistPresentation.test.js src/pages/Wishlist/WishlistCardFooter.jsx src/pages/WishlistPage.jsx`: no errors; existing JSX import warnings remain.
- `npm run build`: passed, including the bundle budget check. Browserslist emitted its existing stale-data notice.
- `git diff --check`: passed. No migrations, live Steam/RAWG calls, commit, push, deployment, or production check.

Wishlist duplicate-match cleanup checkpoint (2026-09-13 continuation):

- `/api/games/search` accepts an optional current Wishlist item id and returns a
  user-scoped `alreadyInWishlist` marker for catalog candidates used by another
  Wishlist item. The current item is excluded from that marker, so changing an
  existing match remains possible.
- The manual Wishlist RAWG chooser sends that context, disables duplicate candidates
  with an `Already matched` reason, and retains the save-time conflict as the race-safe
  backstop. Existing add/edit game search behavior remains unchanged.
- Added focused route and presentation regressions using cached/mock data only; no
  provider request, schema change, or migration was introduced.

Verification on the dirty worktree:

- `node --check` run individually on `backend/routes/games.js`, `backend/services/catalogService.js`, `backend/validators/games.js`, `src/services/gameService.js`, and `src/pages/Wishlist/wishlistPresentation.js`: passed.
- `node --test backend/routes/games.integration.test.js src/pages/Wishlist/wishlistPresentation.test.js`: 21 passed.
- `npx eslint --rulesdir scripts/eslint-rules` on the touched backend/frontend files: no errors; existing JSX unused-import warnings remain.
- `npm run build`: passed, including the bundle budget check. Browserslist emitted its existing stale-data notice.
- `git diff --check`: passed. No migrations, live Steam/RAWG calls, commit, push, deployment, or production check.

Next implementation order:

1. Review the combined dirty worktree for final integration risks, especially the unapplied price-identity migration and interactions between Steam membership, Wishlist history, and manual RAWG links.

This completes the worker checkpoint and the Wishlist metadata/duplicate UX portions, not release preparation. Automatic-attempt history and inactive-item eligibility remain documented concerns; no release, migration, or deployment action has been performed.
