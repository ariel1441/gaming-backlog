# Gaming Backlog — Steam Library Daily Sync Foundation

## Scope

This plan covers only the non-wishlist Steam automation foundation:

- incremental Steam owned-library/activity sync
- automatic playtime/last-played refresh
- achievement refresh only for relevant changed linked games
- detection of newly observed Steam games
- detection of newly observed play activity
- review suggestions without silently changing personal backlog status/dates
- persistent review/activity items
- manual and scheduled sync using the same service
- operational run history, failure visibility, request deadlines, and concurrency protection

Out of scope for this implementation:

- Steam wishlist import or prices
- Loaded/Fanatical
- deal history/notifications
- owned-game removal/refund inference
- automatic backlog status/date changes
- achievement detail/history beyond the existing summary model
- a broad app-wide Timeline/Journal redesign

## Approved Pre-Implementation Live-Code Findings That Drive The Design

Before Phase A implementation, the live codebase already had a solid Steam V1
foundation:

- `user_external_accounts` stores linked Steam accounts and sync state.
- `user_game_sources` stores Steam ownership, playtime, last played, first-play observation, and achievement summaries.
- `steam_import_candidates` stores the reviewed import queue and user decisions.
- `external_game_ids` can associate Steam AppIDs with catalog games.
- `syncSteamLibrary()` already detects some first-play/status-review cases.
- `/steam/import` already contains a Steam Sync Review UI.

The live repository has advanced beyond the older uploaded snapshot. In
particular, migration `018_add_steam_sync_jobs.sql` already provides a durable,
checkpointed, resumable Steam library execution queue; `POST /api/steam/sync`
returns `202 { job }`; and the client polls `GET /api/steam/sync/:jobId` until
the job is terminal. That architecture must be reused rather than replaced.

The pre-Phase-A manual job should not simply be scheduled unchanged:

1. `syncSteamLibrary()` loops through every owned app and repeats matching, duplicate checks, source updates, and candidate work every sync.
2. `POST /api/steam/sync` then calls `syncSteamAchievementsForLinkedGames()`, potentially checking a large linked library even when only a few games changed.
3. sync review data is returned to the browser and persisted only in `localStorage`, so unattended daily runs cannot create durable review items.
4. an empty/private Steam library currently advances `last_library_sync_at`; that must not become the baseline for future change detection.
5. Steam provider requests already have an explicit timeout and response-size bound, but they do not yet have the approved bounded retry/backoff policy.
6. related source/candidate/review writes are not sufficiently atomic for unattended work.
7. ignored source state is preserved by the source upsert, but the current review-classification path can still emit suggestions for an ignored source.
8. `steamService.js` is already very large, so the existing queue worker and new incremental orchestration should be extracted rather than duplicated or expanded in place.

The previously reported `games.updated_at` status-suggestion bug is already
fixed in the live repository and covered by a regression test. It is not part
of this phase.

## Product Contract

### Definitions

- **New Steam game** means newly observed in the user's visible Steam owned-games response since the previous successful local baseline. Do not claim an exact purchase timestamp.
- **Activity changed** means playtime increased and/or Steam `lastPlayedAt` advanced compared with the persisted source row. A lower playtime value is persisted as a factual correction but does not create a new-activity signal.
- **Baseline sync** is the first successful, non-empty, valid library snapshot for a user. It populates sources/import candidates but must not flood the review inbox with "new game" or "started playing" events.
- Existing `source_status = 'ignored'` is respected. Telemetry may refresh, but ignored games should not automatically create new backlog suggestions.
- A game missing from one successful owned-games response is **not** automatically marked unowned/refunded in this phase.

### Automatic vs reviewed behavior

Steam facts may update automatically:

- ownership/source presence
- playtime
- last played
- existing achievement summary
- source sync timestamps

Personal backlog decisions remain reviewed:

- adding a new Steam game to the backlog
- changing a backlog status to `playing`
- changing started/finished dates

### Decision matrix

| Detected change | Backlog relationship | Automatic work | Review item |
| --- | --- | --- | --- |
| Newly observed Steam game, 0 playtime | Not in backlog | store source/candidate | suggest reviewing/importing as `plan to play` |
| Newly observed Steam game, playtime > 0 | Not in backlog | store source/candidate; refresh achievements after link/import, not required now | suggest reviewing/importing as `playing` |
| Newly observed Steam game | Already in backlog, unplayed | attach/update Steam ownership | none unless matching needs review |
| Newly observed Steam game with playtime | Already in backlog, status `playing` or `finished` | update Steam facts; refresh achievements | none |
| Newly observed Steam game with playtime | Already in backlog, stale/non-active status | update Steam facts; refresh achievements | suggest `playing` |
| Existing Steam source changes 0 -> >0 | Not in backlog | update Steam facts | suggest reviewing/importing as `playing` |
| Existing Steam source changes 0 -> >0 | In backlog, status `playing`/`finished`/`played alot but didnt finish` | update Steam facts; refresh achievements | none |
| Existing Steam source changes 0 -> >0 | In backlog, another status | update Steam facts; refresh achievements | suggest `playing` |
| Existing Steam source playtime increases | In backlog, status `playing` or `finished` | update Steam facts; refresh achievements | none |
| Existing Steam source playtime increases | In backlog, stale/non-active status | update Steam facts; refresh achievements | suggest `playing`, deduped for that AppID + current status |
| Existing source unchanged | Any | source can be marked seen/synced in bulk | none; no achievement call |
| Ignored Steam source changes | Ignored | update factual telemetry only | none |

`finished` should remain valid when a user replays a finished game. Never silently turn it back into `playing`.

## Why Local Diffing Is The Correct Optimization

Do not add a second Steam "recent activity" request just to discover changes. The owned-games fetch is already the canonical cheap snapshot needed for both new ownership and playtime comparison. Fetch it once, compare it against local `user_game_sources`, and only run expensive per-game work for the changed/new subset.

Target daily shape for a user with hundreds of owned games but only a few changes:

```text
1 GetOwnedGames request
-> one bulk/local comparison
-> source telemetry update
-> matching/import work only for newly observed apps
-> achievement calls only for changed linked games
-> persistent review events only when user attention is useful
```

## Database Changes

Use migration `028_add_steam_daily_sync_foundation.sql` while the existing
uncommitted `027_add_backlog_table_preferences.sql` work remains present. If
that work is removed before implementation, recalculate the next migration
number from the live repository. Keep `backend/schema.sql` in sync without
overwriting the unrelated `027` changes.

### 1. `user_external_accounts`

Add:

```sql
auto_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE
```

`last_library_sync_at` should mean **last successful valid, non-empty library snapshot** going forward. It may advance when noncritical matching or achievement work leaves the overall run partial. Failed/private snapshot attempts must not advance it. Attempt history belongs in sync runs.

Do not attempt a destructive historical cleanup of existing timestamps in the migration. For backward compatibility, baseline detection should also consider whether Steam source rows already exist.

In the live repository, consider a prior baseline established only when
`last_library_sync_at` exists and at least one active Steam source (`owned` or
`ignored`, not `disconnected`) exists. This prevents an older private/empty
attempt or an abandoned partial first run from being treated as a successful
baseline.

### 2. `integration_sync_runs`

A small generic run table that can later support Steam wishlist and store syncs
without introducing a second queue system now.

Suggested columns:

```text
id BIGSERIAL PK
user_id FK users
provider TEXT                 -- currently steam
sync_kind TEXT                -- currently library
trigger_type TEXT             -- manual | scheduled
status TEXT                   -- running | succeeded | partial | failed | skipped
started_at TIMESTAMPTZ
finished_at TIMESTAMPTZ
items_seen INTEGER
items_changed INTEGER
errors_count INTEGER
summary_json JSONB DEFAULT {}
error_code TEXT
error_message TEXT
created_at TIMESTAMPTZ
```

Link each generic run to the existing execution job by adding a nullable
`sync_run_id` foreign key to `steam_sync_jobs`. Store the trigger on the job (or
otherwise durably before claim) so a claimed job can create the correct manual
or scheduled run. `steam_sync_jobs` remains execution/checkpoint state;
`integration_sync_runs` is provider/domain-neutral audit history.

Indexes:

- `(user_id, provider, sync_kind, started_at DESC)`
- recent failed/partial runs if useful

Use application validation for provider/sync-kind extensibility rather than a DB CHECK that has to be migrated every time a future store is added.

### 3. `user_activity_events`

Persist only useful user-facing review/activity events, not every routine playtime update.

Suggested columns:

```text
id BIGSERIAL PK
user_id FK users
source TEXT                   -- steam_library now; future steam_wishlist / loaded / fanatical
 event_type TEXT
 game_id FK games NULL
 catalog_game_id FK catalog_games NULL
 external_id TEXT NULL        -- Steam AppID for this phase
 sync_run_id FK integration_sync_runs NULL
 dedupe_key TEXT NOT NULL
 payload_json JSONB NOT NULL DEFAULT {}
 state TEXT                   -- open | resolved | dismissed
 seen_at TIMESTAMPTZ NULL
 observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 resolved_at TIMESTAMPTZ NULL
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Indexes:

- `(user_id, state, created_at DESC)`
- `(user_id, source, created_at DESC)`
- unique `(user_id, source, dedupe_key)` only while `state = 'open'`

Initial event types:

- `steam_new_game`
- `steam_started_playing`
- `steam_status_suggestion`

Do not create events for routine playtime/achievement changes when no action is needed.

Dedupe rules:

- newly observed game: `new-game:{steamAppId}`
- first play: `first-play:{steamAppId}`
- status mismatch: `status-suggestion:{steamAppId}:{normalizedCurrentStatus}`

This prevents a daily sync from nagging the user with the same unresolved
recommendation repeatedly while still allowing a later, genuinely new activity
change to create a fresh suggestion after an earlier suggestion was resolved or
dismissed.

## Backend Architecture

Preserve the existing durable `steam_sync_jobs` queue, checkpoint, resume,
cancellation, lease-recovery, and polling behavior. Prefer a focused extraction
rather than expanding the existing 3k+ line `steamService.js` further or adding
a parallel execution path.

### New `backend/services/steamLibrarySyncService.js`

Own the existing Steam library job lifecycle, orchestration, and local diffing.

Primary entry point:

```js
enqueueSteamSync(userId, {
  trigger: "manual" | "scheduled",
  force?: boolean,
})
```

Responsibilities:

1. enqueue one durable `steam_sync_jobs` row with the trigger type
2. claim/checkpoint/resume it through the existing database worker
3. create and link an `integration_sync_runs` row when execution starts
4. load the active Steam account
5. fetch player summary best-effort and owned games as the critical request
6. load existing Steam sources + linked backlog statuses in bulk
7. determine baseline vs incremental run
8. diff remote apps against persisted sources in memory before expensive work
9. persist source telemetry safely
10. run matching/import-candidate work only for newly observed apps
11. create deduped activity events
12. refresh achievements only for activity-changed linked games
13. update account and generic run success/error fields
14. complete the existing job with the compatible result payload

Manual and scheduled calls must enqueue this same job type. Do not create a
second direct `runSteamLibrarySync()` path alongside the queue.

### Concurrency and recovery

Manual and scheduled sync can overlap even if Railway itself skips overlapping
cron executions. Protect the same user/domain by routing both triggers through
the existing `steam_sync_jobs` table. Its one-active-job constraint and
`FOR UPDATE SKIP LOCKED` claim/lease flow provide database-level coordination
and crash recovery. Migration `029_add_steam_sync_job_lease_token.sql` adds the
per-claim fencing needed to prevent a stale worker from checkpointing or
finalizing after lease recovery or cancellation.

Do not add a second advisory-lock path or hold a dedicated database connection
across Steam/RAWG calls. Do not remove the current short-interval web worker:
it drains and recovers queued execution jobs; it is not the daily scheduler.
Do not introduce Redis or another queue system for this scale.

### Local diff

Load existing rows in one query, keyed by `provider_app_id`.

For every remote app classify:

```text
new
playtime_changed
last_played_changed
unchanged
```

Also retain `previousPlaytime`, `previousLastPlayedAt`, linked `game_id`, catalog id, source status, and current backlog status for decisions.

Do not run `findCatalogMatch()` / duplicate matching for every unchanged owned game.

Store only the work necessary for checkpoint/resume. The job result should
retain the existing high-level fields where inexpensive and add a clear
`run`/incremental `summary`. Progress must distinguish total snapshot items from
the smaller changed/new work set.

### Source persistence

Prefer bulk writes or a transaction containing only DB work. Do not hold a transaction open while calling Steam/RAWG.

For each changed/new app, perform provider/catalog discovery first. Then commit
the local source telemetry, candidate changes, and derived activity event as one
atomic database unit. This prevents a source transition from becoming
"unchanged" on retry before its event was saved.

Preserve:

- ignored state
- existing user/catalog links unless the focused matching path deliberately repairs them
- first-play semantics

First play:

- existing source `<= 0` -> remote `> 0`: set `first_play_observed_at` once
- newly observed source with playtime > 0 during an established baseline: it may set the observation timestamp and create a started-playing review event
- first successful baseline: do not set first-play review signals for the entire historical library

For `playtime_minutes_forever`, now that concurrent syncs are locked, prefer the current valid Steam value rather than permanently relying on `GREATEST()` as stale-write protection. Never overwrite a valid value with `null`. If Codex finds a concrete Steam/API reason the monotonic rule is needed, document it before retaining it.

Missing local sources that are absent from the remote response should remain unchanged in this phase; do not infer refunds/removals from one response.

If `last_synced_at` is retained/updated for unchanged sources, it means **last
successfully observed during a Steam sync**. It is not a gameplay/activity
change timestamp. Playtime and `last_played_at` remain the factual activity
signals.

### Matching/import work

For incremental runs, only newly observed AppIDs should enter expensive discovery/matching work.

Reuse the existing import-candidate and duplicate-protection behavior. Avoid rewriting the matching system in this feature unless needed to expose a small scoped helper.

The current global:

```js
autoMatchSteamCandidates(... limit: 150, useCatalogSearch: true)
```

should not run against the entire old queue every morning. If automatic search
is retained, scope it to candidate IDs created by the current run and keep it
bounded. Otherwise leave unresolved new candidates for the existing review UI.

For the first-ever baseline, all library items are necessarily new to the DB; preserve the existing import-queue behavior but suppress activity notifications. Do not invent a complex worker queue solely for first-time import in this patch.

### Achievements

Add a focused helper such as:

```js
syncSteamAchievementsForSourceIds(userId, sourceIds, options)
```

Daily library sync should call it only for linked Steam sources whose playtime changed or whose last-played timestamp advanced.

Rules:

- linked + activity changed -> refresh achievements, respecting existing cooldown and concurrency
- unchanged -> no achievement request
- unlinked new game -> no achievement request required yet
- one game's achievement failure must not fail the library snapshot
- achievement failures make the overall run `partial` when the library sync itself succeeded

When the owned-library snapshot and its local persistence complete
successfully, advance `last_library_sync_at` even if noncritical achievement
work makes the generic run `partial`. The run summary must make the library and
achievement outcomes explicit.

Keep the existing explicit/manual full achievement endpoint for users who want a broader refresh.

### Steam request reliability

Keep the existing provider timeout/response-size protection and add Steam-local
retry behavior supporting:

- explicit timeout/deadline, around 10 seconds per HTTP request
- at most 2 retries for network failures, 429, and 5xx
- exponential backoff with small jitter
- no retry for ordinary 4xx that indicate a bad request/configuration
- stable error codes used in sync-run/account state

`fetchPlayerSummary()` remains best-effort; failure should preserve old profile fields and not block a successful owned-library snapshot.

The owned-games request is critical. If it fails, do not mutate library source state and do not create events.

An empty result should continue to be treated conservatively as private/empty rather than as "the user owns nothing". Do not deactivate all prior rows.

## Persistent Review / Activity Behavior

The daily job cannot depend on a browser being open.

Replace the current localStorage-only Steam Sync Review persistence in both
`/steam/import` and `/steam/library` with DB-backed events.

### Recommended API surface

A generic activity read endpoint is justified because wishlist/deal changes will use the same table later, but keep the first UI Steam-focused.

Example:

```text
GET   /api/activity?source=steam_library&state=open&limit=100
PATCH /api/activity/:id
```

PATCH actions initially:

```text
mark_seen
dismiss
```

Existing Steam status/import actions remain the authoritative mutation endpoints.

When `applySteamStatusSuggestion()` succeeds and an `activityEventId` is supplied, resolve that activity event in the same DB transaction.

The Steam Import page can keep the existing Sync Review modal/presentation, but load review rows from the API instead of localStorage. After a manual sync, reload the persistent inbox.

For an unlinked new game, `Review import` should continue into the current reviewed candidate flow rather than bypassing catalog/duplicate safety. It is acceptable in this first version for the event to remain open until the user dismisses/resolves it; do not create a large cross-service auto-resolution mechanism unless the live code makes it trivial.

### Date suggestion behavior

Do not treat Steam `lastPlayedAt` as an exact start date. If the UI offers a date action, label it as an explicit approximation and do not make it the default action. The primary suggestion should be status-only unless a trustworthy start timestamp exists.

## Manual Sync API

Keep the existing asynchronous contract:

```text
POST   /api/steam/sync          -> 202 { job }
GET    /api/steam/sync/:jobId   -> poll queued/running/terminal job
DELETE /api/steam/sync/:jobId   -> cancel when allowed
```

Manual sync and the scheduled runner must enqueue the same durable library job.
Do not add a synchronous direct-run endpoint.

It should no longer automatically perform a broad achievement sweep after library sync.

The completed `job.result` should add this shape while retaining inexpensive
legacy summary fields during migration:

```json
{
  "account": {},
  "run": {
    "id": 123,
    "status": "succeeded"
  },
  "summary": {
    "total": 680,
    "newlyObserved": 2,
    "activityChanged": 3,
    "matchingAttempted": 2,
    "achievementsAttempted": 3,
    "achievementFailures": 0,
    "reviewItemsCreated": 2,
    "librarySnapshotSucceeded": true
  }
}
```

The frontend should continue polling and then consume this terminal result.

## Scheduled Runner

### New script

```text
scripts/sync-steam-daily.js
```

Package script:

```json
"steam:sync:daily": "node scripts/sync-steam-daily.js"
```

Behavior:

1. select non-guest users with an active linked Steam account and `auto_sync_enabled = true`
2. process users sequentially initially
3. enqueue the same durable job used by manual sync with `trigger: "scheduled"`
4. drain/wait for those jobs through the existing worker path
5. continue to the next user if one user's Steam account fails/private
6. print a concise final summary
7. close the Postgres pool and exit

The script must not import/start the Express server. The existing web worker
remains enabled for manual-job recovery; Railway cron supplies the daily trigger
and exits after its scheduled jobs are terminal.

For a handful of users, sequential processing is safer than increasing concurrency against one Steam API key. Revisit only if actual runtime becomes a problem.

### Railway

Use a separate Railway cron service/deployment target running `npm run steam:sync:daily`, not `setInterval()` inside the web API.

Configure the cron service so it exits after completion and does not restart endlessly on provider failures. A failed user's run is already persisted in Postgres.

Railway cron schedules are UTC; exact 08:00 Israel time will shift with DST unless the schedule is changed seasonally. For this feature exact minute/hour is not important, so choose a stable morning UTC schedule and document the expected local-time shift.

## Auto Sync Setting

Store and expose `auto_sync_enabled` on `user_external_accounts` through the
Steam account API and the existing Steam integration settings section. Do not
put this provider-specific setting in `user_preferences`.

Recommended default: `false` for migration safety and explicit opt-in. The user can enable "Daily Steam sync" after linking Steam.

Manual Sync remains available regardless of the automatic setting.

Do not add configurable hourly/12-hour/custom frequency yet. One daily scheduler is enough.

## Expected File Surface

Exact names may be adjusted after Codex checks the live repo, but changes should remain close to this shape:

```text
backend/migrations/028_add_steam_daily_sync_foundation.sql
backend/migrations/029_add_steam_sync_job_lease_token.sql   review hardening for claim ownership
backend/schema.sql
backend/services/steamLibrarySyncService.js        NEW; extracted durable job/diff orchestration
backend/services/integrationSyncService.js         NEW, small generic run helpers
backend/services/activityEventService.js           NEW, small generic event helpers
backend/services/steamService.js                    focused modifications only
backend/routes/steam.js
backend/validators/steam.js
backend/routes/activity.js                         NEW
backend/validators/activity.js                     NEW
backend/index.js
scripts/sync-steam-daily.js                        NEW
package.json

src/services/steamService.js
src/services/activityService.js                    NEW
src/features/steam/hooks/useSteamActivity.js       NEW if it matches current hook style
src/features/steam/hooks/useSteamSync.js
src/pages/SteamImportPage.jsx
src/pages/SteamImport/SteamSyncReview.jsx
src/pages/SteamLibraryPage.jsx
src/pages/Settings/SettingsDataSections.jsx
src/utils/steamSync.js

focused backend/frontend tests for the files above
README/DEVELOPMENT or Steam handoff docs if deployment/setup behavior changes
```

Do not perform a repository-wide TypeScript migration or unrelated Steam/UI refactor as part of this feature.

## Tests / Acceptance Cases

### Diff/service tests

1. first successful baseline populates sources/candidates but creates zero historical activity-review events
2. second run with identical Steam payload creates no new events and makes zero achievement calls
3. new 0h unlinked app creates one `steam_new_game` event
4. new played unlinked app creates one playing-oriented review event, not duplicate new-game + started-playing noise
5. existing source 0 -> >0, linked `plan to play`, creates one status suggestion and queues achievement refresh
6. same transition while linked `playing` creates no suggestion but refreshes achievements
7. increased playtime while linked `finished` updates telemetry/achievements without suggesting `playing`
8. increased playtime while linked stale status creates one deduped status suggestion
9. ignored source changes telemetry but creates no suggestion
10. same payload run twice cannot duplicate a prior event
11. absent remote AppID does not deactivate/delete an existing source
12. empty/private owned-games response changes no game/source state and does not advance successful baseline
13. owned-games request failure changes no game/source state and records a failed run
14. one achievement failure produces a partial run but does not roll back successful library telemetry
15. player-summary failure does not fail the library sync
16. concurrent manual/scheduled runs for the same user/domain return/share one active execution job and cannot both execute

### Route/UI tests

17. manual sync returns run + incremental summary
18. persistent review events survive reload/browser restart
19. dismissing an event persists
20. applying a status suggestion changes only status unless the user explicitly chose a date action, and resolves the supplied event
21. applying a status suggestion can resolve its supplied activity event atomically
22. auto-sync setting is private, account-scoped, user-scoped, and guest-safe

### Runner tests

23. daily runner selects only eligible linked non-guest users with auto sync enabled
24. one failed user does not prevent later eligible users from running
25. runner closes DB resources and exits

### Verification

- focused unit tests
- `npm run check`
- migration against localhost DB: `npm run db:migrate:local`
- at least one real-Postgres integration test for sync/event transactional behavior if practical in the existing test setup
- local manual sync against a real linked Steam account
- run the daily script manually once before enabling Railway cron
- production verification of migration, Railway cron logs, backend API, and review inbox separately

## Observability / Run Summary

A successful run should make it easy to answer:

```text
Steam library daily sync
User: <id>
Seen: 680
Newly observed: 2
Activity changed: 3
Achievements attempted: 3
Achievement failures: 0
Review items created: 2
Duration: ...
Status: succeeded
```

Do not log Steam API keys or sensitive account data.

## Intentional Deferrals

Do not implement these during this phase:

- wishlist relationships or migration of any existing wishlist status
- wishlist polling/pricing
- Loaded/Fanatical adapters
- deal snapshots/events
- automatic inference that a missing owned app was refunded/removed
- detailed achievement history
- app-wide notification delivery
- Redis or an additional queue system
- microservices

The reusable pieces intentionally created now are only:

- generic sync-run history
- generic user activity-event persistence
- scheduled-run entry point
- durable per-user/provider/domain job coordination and error conventions

These are directly useful to the upcoming wishlist/deal work and are not speculative infrastructure.

## Approved Live-Review Decisions

The live-repository review is complete. Implementation must:

1. use migration `028` while the existing `027` work is present
2. reuse and extract the existing durable Steam execution queue
3. preserve the asynchronous manual API and polling contract
4. keep the current worker for queued-job recovery
5. use the same enqueue path for manual and scheduled triggers
6. keep generic run history separate from, but linked to, execution jobs
7. replace localStorage review persistence in both Steam pages
8. stop private/empty/invalid responses from advancing the baseline
9. scope matching and achievements to the new/changed work set
10. suppress ignored-source suggestions
11. use open-event deduplication
12. store auto-sync configuration on `user_external_accounts`

The `games.updated_at` defect is already fixed and must not be reintroduced or
treated as unfinished Phase A work.

## Recommended Delivery Order

### Patch 1 — Incremental correctness foundation

- migration/schema
- request timeout/retry
- generic sync-run + activity-event persistence
- per-user lock
- new incremental library orchestrator
- scoped achievement refresh
- fix status-suggestion schema bug
- backend tests

### Patch 2 — Persisted review UX

- activity read/dismiss API
- replace localStorage review persistence
- keep existing Steam Sync Review presentation where possible
- resolve status-suggestion events when applied
- frontend tests/build

### Patch 3 — Scheduled execution

- auto-sync account setting + Settings toggle
- `scripts/sync-steam-daily.js`
- package script
- docs/deployment instructions
- local/manual scheduled-run verification
- Railway cron setup and production smoke verification

This ordering ensures the scheduled job is the last step, after the same service has already been proven through manual sync and durable review behavior.
