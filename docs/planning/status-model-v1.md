# Status model v1 implementation handoff

2026-10-11. Local implementation complete on `Dev`, based on `07641d9`.
The working tree was clean at the start. All current dirty files belong to this
change; nothing has been staged, committed, pushed or deployed.

## Implemented behavior

The database controls default status rank. Stored legacy keys remain stable;
shorter labels and group semantics are shared by the frontend and backend.

| Order | Label | Group |
| --- | --- | --- |
| 1 | Playing | Playing |
| 2 | Play soon | Planned |
| 3 | Planned | Planned |
| 4 | When in the mood | Planned |
| 5 | On hold | Returning |
| 6 | Occasional | Occasional |
| 7 | Someday | Planned |
| 8 | Finished | Done |
| 9 | Played enough | Done |
| 10 | Played a bit | Tried |
| 11 | Not anytime soon | Other |
| 12 | Dropped | Tried |

- Played enough means enough experience to judge/rate, without finishing. Its
  completion flow has no finish date. Legacy dates remain stored but are excluded
  from completion reporting for that outcome. Finished counts remain distinct
  from the broader Done group.
- Occasional is manually chosen, independent of genre. It has a collapsed shelf
  in Play Next and is excluded from recommendations and the Main/Side picker.
  Launching it preserves its status. Explicit promotion to Main/Side or clearing
  its occasional focus returns it to Playing. These changes invalidate only the
  owner's Insights cache.
- Played a bit keeps its name. Tried and Occasional stay outside completion ETA.
- Available Steam activity below one hour is visible for experienced/active
  statuses, including Played a bit. Raw minutes avoid rounding away short sessions.
  Hours and achievements never automatically imply Finished, Played enough or
  an intention to return. Imports requiring a decision ask for a status.
- Recommended by someone is removed from new choices; existing assignments remain
  valid and editable without data loss.

## Migration and dirty-file scope

`backend/migrations/052_game_status_model_v1.sql` updates reference ranks and maps
only existing owner-matched Playing games with an explicit occasional focus role
into Occasional. It preserves positions, dates, ratings and reviews; rerunning it
is safe. `backend/seed.sql` matches its reference ranks. Schema shape is unchanged.

Dirty files cover shared status definitions/tests, game and focus APIs/validators,
status-driven filters/statistics/timelines, status displays and completion UI,
Steam import/display helpers, and focused tests. The migration/API contract uses
only fictitious users in a disposable localhost database. Ordinary development
and production databases were not modified.

## Verification

Tested checkpoint: `07641d9` plus this uncommitted implementation. 193 distinct
focused Node tests and 7 distinct Playwright cases passed after corrections.
Initial failures exposed metadata resolver handling, fixtures missing active
statuses, changed label expectations and browser selectors; narrow reruns passed.

- Initial Node scope (192 tests): `node --test --test-concurrency=1 shared/statusModel.test.js backend/statusModel.contract.test.js backend/utils/status.test.js backend/utils/gameAccess.test.js backend/validators/games.test.js backend/routes/games.integration.test.js backend/routes/nextUp.integration.test.js backend/routes/insights.integration.test.js backend/services/steamService.test.js backend/services/steamLibrarySyncService.test.js src/utils/statusSemantics.test.js src/utils/statusDisplay.test.js src/utils/automaticLists.test.js src/utils/gameDateInsights.test.js src/utils/gameTimeline.test.js src/utils/gameList.test.js src/utils/hours.test.js src/utils/playNext.test.js src/utils/reviews.test.js src/utils/steamAchievements.test.js src/utils/steamDisplay.test.js src/contexts/StatusGroupsContext.test.js`. All initially failing scopes passed their corrected focused reruns.
- Final transition checkpoint: `node --test --test-concurrency=1 shared/statusModel.test.js backend/statusModel.contract.test.js backend/routes/insights.integration.test.js backend/routes/nextUp.integration.test.js backend/routes/games.integration.test.js`: 42 passed.
- Steam inference regression: `node --test --test-name-pattern="Steam hours alone" backend/services/steamService.test.js`: 1 passed.
- Final cache correction: `node --test --test-concurrency=1 backend/statusModel.contract.test.js backend/routes/nextUp.integration.test.js`: 11 passed, including the real migration runner, idempotency, preservation and owner isolation. Counts overlap earlier checkpoints.
- Browser scope: `node node_modules/@playwright/test/cli.js test tests/e2e/status-model-v1.spec.js tests/e2e/play-next-focus.spec.js`. The 5 existing focus cases passed; corrected completion tests passed with `node node_modules/@playwright/test/cli.js test tests/e2e/status-model-v1.spec.js` (2 desktop/mobile cases). Final picker exclusion passed with `node node_modules/@playwright/test/cli.js test tests/e2e/play-next-focus.spec.js --project=chromium --grep="focuses two games"`.
- Focused ESLint passed with zero errors. The initial changed-file check reported
  214 warnings; the final 11-file import/transition check reported 86 warnings.
  Existing warning patterns remain. `git diff --check` passed; Git emitted only
  repository LF/CRLF conversion notices.
- Full suite/build/CI and live provider/production verification were not run.

## Next action

Review the local diff. Applying migration 052 to a saved database and publishing
require the corresponding authorized workflow; no such action has been taken.
Full replay/completion history and user-created statuses remain future work.
