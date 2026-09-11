# Weekly metadata refresh checkpoint

2026-09-11. Local implementation; no publishing or schedule enablement.

- Branch: `fix/steam-candidate-account-isolation`.
- Base SHA: `716cb5b5fafd061e6979adf1649e5ae7f92d049e`; checks cover the
  uncommitted backend/frontend/tests change in this checkpoint.
- Pre-existing dirty files preserved: `docs/NEXT_TASKS.md`, `docs/ROADMAP.md`,
  `docs/SYSTEM_CONTEXT.md`, and untracked `docs/AUTOMATION.md`.
  Inspect mixed working-tree scope before staging. The automation guide describes
  the earlier schedule; this checkpoint supersedes those timing details locally.

## Completed behavior

- RAWG success becomes due after seven days, regardless of release date.
  Legacy success timestamps adopt weekly eligibility without a migration/backfill.
- Automatic eligibility includes Backlog, active local Wishlist intentions and
  active Wishlist membership on the current connected Steam account. Catalog
  identities are shared; retired and unreferenced entries are excluded.
- Incomplete metadata cannot bypass failure retry time. Automatic retry honors
  provider Retry-After; Discover respects the persisted retry time. Discovery
  freshness also uses seven days. Empty passes no longer create empty jobs.
- Existing worker pacing remains two games per hourly tick, with 25 items/attempts
  per job by default. Weekly is eligibility, not a guaranteed completion deadline.
  No new global provider budget, worker infrastructure or HLTB updater was added.
- Settings shows enabled/disabled/configuration state, owner-scoped linked/due/
  failed counts and the most recent metadata update for the owner's games.
  The timestamp includes Discover/repair; the UI explicitly does not present it
  as proof of an automatic run. The panel remounts when the account changes.
- Saved estimates retain precedence. RAWG fallback is labeled; Wishlist uses the
  same fallback after saved/local HLTB hours. Unrelated edits omit unchanged hours,
  and rename-only API updates do not replace existing hours with local HLTB.
- Shared provider data, personal values and Steam actual playtime remain separate.
  Historical saved-estimate provenance is still unknown; no source backfill.

## Checks

- `npm run env:check`: localhost Postgres, RAWG key configured, metadata refresh
  unset/default off. Redacted check only; no environment edits.
- `node --test backend/services/metadataRefreshService.test.js backend/services/metadataIngestionService.test.js backend/services/catalogService.test.js backend/routes/catalog.integration.test.js backend/routes/games.integration.test.js backend/routes/metadata.integration.test.js src/utils/hours.test.js src/pages/Backlog/backlogForm.test.js`
  initially 50/51 passed. One assertion expected the old 120-day schedule.
- After updating that assertion and adding Discover retry coverage:
  `node --test --test-name-pattern="exact RAWG ingestion persists|Discover detail and manual" backend/services/metadataIngestionService.test.js backend/routes/catalog.integration.test.js`:
  2/2 passed. Combined distinct Node coverage: 52 passed, none skipped.
  Providers mocked; database tests use disposable localhost schemas.
- `npx playwright test tests/e2e/routes.smoke.spec.js tests/e2e/smoke.spec.js --grep "settings game metadata|editing a RAWG fallback"`:
  sandbox initially blocked Vite config access; authorized escalation resolved it.
  Then 6 passed, one selector failed because card source text is a tooltip.
- Corrected selector; `npx playwright test tests/e2e/smoke.spec.js --project chromium --grep "editing a RAWG fallback"`:
  1 passed. Combined browser cases: 7 passed, including desktop/mobile Settings.
  Only the frontend was started; API responses were mocked.
- Focused ESLint on changed runtime modules and the new metadata route test:
  zero errors, 78 unused-variable warnings. Initial invocation omitted the required
  `--rulesdir scripts/eslint-rules`; corrected invocation passed.
- `git diff --check`: passed. No full local gate, migration or production checks.

## Next action

Review this local change and separately authorize any Git publishing/deployment.
Main promotion remains on hold. No Railway connector or CLI was available here;
production enablement and execution history remain unverified. Verify those through
an authorized deployment connection before deciding whether to enable refresh.
Enabling it was not part of this implementation.
