# Dev push preparation — 2026-10-09

## Candidate and scope

Local preparation only; no push, merge, migration, deployment or production
verification was performed. `Dev` is based on freshly fetched `origin/Dev`
`b9f2f96`, with no incoming commits at preparation time. The complete candidate
is the commit containing this record, including its four preceding local commits.

Preserved existing commits:
- `f55bb9b`: collection loading and explicitly invoked local UI-test seeding.
- `d6abf7c`: HLTB cache refresh/import tooling and current Steam activity artwork
  and title presentation.

Organized subsequent changes:
- `3dc852d`: Backlog > More filters > Missing HLTB hours, including RAWG fallback
  and absent estimates; desktop/mobile search, reset and keyboard coverage.
- `a47543c`: stable Backlog reorder, optimistic cache updates, atomic snapshot
  replacement and rollback on failed saves, including failed recovery refreshes.
- This record's commit: score-based initial placement when newly finishing a game.
  Exact matches insert below the last match; otherwise use the nearest rated peer,
  preferring the higher score on ties. Unrated peers retain relative order, and
  later score edits or finish replay do not reposition the game. No schema changes.

The bundled HLTB cache is public reference metadata, 56,519 titles and about
16.3 MB. Its source is the March 2026 snapshot documented in the manifest; these
are snapshot averages with retained legacy fallback values, not live estimates.
Periodic refresh and user-selectable completion categories remain deferred.

## Verification record

Checks below ran on `d6abf7c` plus the implementation now organized into these
commits. Commit organization changed no application behavior; the additional
changes in this phase are documentation only.

- `node --test --test-concurrency=1 src/utils/reorder.test.js src/pages/Backlog/useInfiniteGames.test.js backend/utils/finishedPosition.test.js backend/routes/games.integration.test.js`: 43 passed, zero failures/skips.
- `playwright test tests/e2e/smoke.spec.js --project=chromium --grep 'large scrolled Backlog reorder|reorders same-rank|status-only filter|finishing a game keeps'`:
  six distinct desktop cases passed across the corrected runs. The 160-row tests
  cover delayed successful refresh, failed refresh and failed save plus failed
  recovery GET. Existing card reorder, complete-rank filtering and finish-result
  dialog behavior also passed.
- Initial browser/lint failures came from test regex escaping, assertions shorter
  than the existing GET retry lifecycle, and cold lazy-bundle loading. Corrected
  setup/readiness checks resolved them. One anchored grep selected no tests; the
  final card invocation used `--grep 'reorders same-rank games'` and passed.
- Targeted ESLint on the ordering API/hooks/helpers/tests: zero remaining errors;
  existing unused-variable/JSX warnings remain. The final card readiness change
  only extends the initial-load timeout.
- Prior filter verification: `node --test src/utils/gameList.test.js backend/utils/gameAccess.test.js`, targeted ESLint and two mocked desktop/mobile browser
  cases passed; see the historical checkpoint in `hltb-cache-refresh.md`.
- Prior HLTB import verification: eight distinct fixture tests and actual-loader
  checks passed; source provenance, retained values and rollback are documented
  in `hltb-cache-refresh.md`.
- Preparation: fresh `git fetch origin`, outgoing filename/credential-pattern
  scan, cache-size check and `git diff --check` passed. No secrets, environment
  files, dumps or ordinary user-data exports are part of the outgoing changes.

Providers and API/database boundaries were mocked or fixture-based. No ordinary
saved data was changed by verification. Full lint/test/build/browser CI, Node 20
execution, mobile ordering checks and production checks remain unverified here;
local implementation checks used Node 22.23.1. Existing collection-loading and
Steam metadata commits are preserved; this preparation did not rerun their full
coverage or the full application gate.

## Next action

After explicit push authorization, publish only `Dev` with `git push origin Dev`
and inspect CI for the exact pushed SHA. The existing Dev push workflow runs
lint, Node tests, build and Playwright. Read current Git state again first if the
workspace or remote has changed. Preparing/pushing Dev does not authorize main
promotion, deployment, production database access or production verification.
