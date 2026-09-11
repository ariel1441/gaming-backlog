# Release review fix phase — 2026-09-11

Local work on `fix/steam-candidate-account-isolation`, above `21dfd7e`.
No commits, pushes, releases, normal development data mutations or live provider
calls were performed in this phase. Existing C.5, notification and artwork changes
remain in the worktree.

## Fixes

- Personal genres are fenced by user and request identity, with cancellation and
  immediate hiding of another user's data during logout/login.
- Playing acceptance locks the current account and game, validates the open event,
  originating account/job, current ownership and original status, then updates and
  resolves atomically. Replays and stale events cannot overwrite a later status.
  Completed games require an explicit editor action. Notification acceptance keeps
  dates unchanged; the existing explicit optional date API remains supported.
- Local Wishlist retirement requires a linked game outside the legacy Wishlist
  status. Notifications move legacy Wishlist games into the selected Backlog status
  before optional retirement. Retirement failure can be retried without reimporting.
- The migration runner checks legacy games with over ten distinct personal genres
  before migration 025 and stops without truncating them. Applied migration files
  remain unchanged. This guard cannot restore any data already lost by an earlier
  migration, and raw SQL execution bypasses the runner's preflight.
- Wishlist loading selects one representative Steam membership per item, preferring
  active membership. New migration 035 produces one price target per item; multiple
  exact Steam identities remain unresolved instead of choosing an arbitrary price.
  The fresh-install schema includes the same view definition.
- Notification candidate lookup uses an exact validated app ID, avoiding exclusion
  by the fifty-result substring search limit. Existing owner/account guards remain.
- Desktop pages outside Backlog/Wishlist expose the shared notification bell in the
  sidebar. Toolbar bells, mobile header and profile sizing are retained.

## Verification actually run

Focused Node commands:

```text
node --test backend/reviewFixes.contract.test.js backend/services/steamService.test.js backend/steamExperience.contract.test.js backend/steamSync.contract.test.js
node --test backend/reviewFixes.contract.test.js backend/services/steamService.test.js backend/steamSync.contract.test.js
node --test backend/steamPrices.contract.test.js
```

The first run caught a missing status helper import and a legacy status fixture
missing from a fresh database. The Steam sync test's error cleanup also masked its
failure with a connection-termination error. After the import/fixture corrections,
the affected three files passed all 40 tests. The unchanged C.5 contract had already
passed its 8 tests; pricing passed 15. Total: 63 distinct passing Node tests including
parent contracts. These use mocks and randomly named disposable localhost databases,
which are removed afterward. The contracts execute `scripts/db-migrate.js` (the
`db:migrate:local` implementation), including migration 035, and test reapplication.
The new regression contract blocks provider fetches completely.

Browser commands (all API responses mocked):

```text
npx playwright test tests/e2e/review-fixes.spec.js tests/e2e/notifications.spec.js --project=chromium
npx playwright test tests/e2e/notifications.spec.js --project=chromium --grep "legacy wishlist"
```

Four tests passed: desktop and mobile notification actions/keyboard/recovery,
delayed account-A genres delivered after account-B login, and legacy Wishlist
acquisition with retirement retry and no duplicate import. The initial sandbox
attempt could not start Vite because of directory access; the permitted run outside
the sandbox passed. No backend server or live Steam sync was required.

Focused ESLint on changed service/route/validator, migration runner/preflight, hook,
sidebar, notification action and regression files: zero errors, twenty JSX-related
unused-variable warnings. `git diff --check` passed. No full suite or build was run;
CI remains the full verification gate.

## Before release

- Review mixed files before staging: services, schema, Sidebar, notification actions,
  tests and handoff docs also contain earlier implementation work. Avoid a blanket
  staging command for a supposedly isolated fix commit.
- Keep migration 035/schema and the one-row Wishlist reader together; keep exact app
  lookup API/validation and its notification caller together.
- Run the approved migration runner. If 025 preflight stops, explicitly resolve the
  over-limit assignments before retrying; do not discard them automatically.
- Obtain CI for the exact committed candidate through a PR or Dev/main workflow.
  No production migration, scheduling, hosting or smoke verification is implied by
  these local tests. Migration 035 has not been applied to the normal development DB.
- Steam scheduling, saved-data polling, metadata refresh and metadata repairs remain
  separate concerns. No automation defaults or production configuration changed.
- Loaded remains Phase D, Fanatical E and remaining polish F. Broader Gaming Activity,
  metadata repairs and acquisition/status automation remain separate.
