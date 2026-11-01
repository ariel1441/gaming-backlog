# Railway cost efficiency: audit and implementation handoff

Audited 2026-10-21 through 2026-10-23. Updated 2026-10-24: cache retention,
bulk price-feed persistence and idle backoff for metadata repair, Wishlist metadata
and Steam sync, count-only closed-notification refreshes and summary saved-health
polling outside Settings are implemented with focused local tests. Other
optimization candidates remain unimplemented. Local list-query profiling is now
complete as a diagnostic checkpoint; list runtime behavior is unchanged.
The audit evidence below remains
historical unless explicitly updated here.

## Completed checkpoint: list-query profiling (diagnostic only)

Goal/phase: eighth checkpoint, completed 2026-10-24; no application optimization
implemented in this phase. Branch `Dev`, HEAD
`07641d9d257608b916ec8f33678cf1ab668b7c21`, uncommitted. Added
`scripts/profile-backlog-list-queries.js` and
[the local profile/dependency report](railway-list-query-profile.md), plus this
handoff. All pre-existing status-model and seven implementation checkpoints remain
untouched and unstaged. In particular, gameAccess.js was already modified by the
status-model work: the profiler uses that exact live builder, fingerprinted in the
report, and makes no edits to it. No commit/push/deploy/Railway change, production
data access or real-provider call occurred.

- `node scripts/profile-backlog-list-queries.js` completed with exit 0: six
  synthetic size/content scenarios, 90 EXPLAIN ANALYZE samples, 21 transactional
  revision/isolation probes, and pagination/facet parity assertions. It verified
  localhost and output ignore status, migrated a newly created disposable database,
  seeded only synthetic data and dropped that database afterward. No ordinary
  development game data was read or changed.
- At 5000 games/16 KiB description bodies, local median PostgreSQL execution was
  1992.7 ms for the first 12 rows, 2011.0 ms for the next 100, and 2088.9 ms for
  facets. Each plan processed the entire 5000-row collection. The diagnostic
  no-hash control took 75.1 ms but has no valid revision semantics and is not a fix.
  See the report for smaller scenarios, buffer/temp behavior and measurement limits.
- Probes confirm off-page game/catalog/Steam/focus/genre/rank mutations affect
  revision, shared catalog fan-out affects both owners, and foreign game edits
  do not invalidate another owner's result. No timestamp-only or narrower hash
  was substituted. Source families, time-relative filters, cache-key requirements
  and unproven mutation/concurrency coverage are mapped in the report.
- Corrected the initial audit's hydration wording: unchanged refreshes reuse
  already-loaded later rows; initial/changed snapshots can rehydrate the collection.
  Unchanged polls still pay first-page plus facet hash work.
- Raw synthetic plans are in ignored
  `test-results/railway-list-query-profile.json`; Playwright may clear that folder,
  so the report retains the concise evidence and reproduction command.
- Focused whitespace checks passed. No app suites/build/browser/CI were run for
  this diagnostic-only change. No production CPU/RAM/latency, actual HTTP bytes or
  Railway savings were measured, and no replacement-query speedup is promised.

Next action: investigate a single coherent first-page/facet read reusing joined
rows and exact row digests before considering persistent per-user revisions.
Require filtered/full facet and revision parity, empty results, sorting/paging,
owner isolation and concurrent-write coverage, then compare plans. Keep existing
hash inputs and hydration/search UX. A durable revision design additionally needs
transactional writer coverage, global catalog/status fan-out and time boundaries;
avoid MAX(updated_at), partial hashes and an unbounded snapshot cache. Publishing,
production/config changes and real-provider calls remain out of scope.

## Completed checkpoint: selective saved-health diagnostics

Goal/phase: seventh local cost-efficiency checkpoint, complete. Branch `Dev`, HEAD
`07641d9d257608b916ec8f33678cf1ab668b7c21`, uncommitted. Scope:
`backend/services/steamExperienceService.js`, new adjacent `.test.js`,
`backend/routes/steam.js`, `backend/validators/steam.js`,
`backend/steamExperience.contract.test.js`, `src/services/steamService.js`,
`src/features/steam/SteamExperienceContext.jsx`, new
`tests/e2e/steam-health.spec.js` and this handoff. The existing experience contract
also contains the prior closed-bell checkpoint; preserve those changes alongside
all status-model and previous implementation work. Nothing was staged, committed,
pushed or deployed. No Railway change, production access or real provider call.

- Added validated `detail=summary` to authenticated `/api/steam/sync-health`.
  Full remains the default for existing clients/direct service calls. Summary
  returns the same serialized account (including revision/freshness fields) and
  active-job progress in the same read-only repeatable-read transaction, but skips
  latest phase runs, last-scheduled aggregation and daily-run history entirely.
  Guest/user guards and no-store responses remain. No cache or schema change.
- The shared frontend poller requests summary outside `/settings` and full while
  on Settings. Only Settings consumes those histories. All Settings sections use
  full mode for a simple stable route boundary; this does not optimize individual
  Settings tabs. General idle/active cadence remains 60 seconds/5 seconds.
- Preserved existing request coalescing, visibility handling, abort/unmount/user
  fencing and account-revision cache invalidation. Detail changes do not recreate
  the user-scoped poller or reset its comparison baseline. If a request is active
  during navigation, completion immediately schedules the new detail level;
  otherwise the route change reloads promptly. No second polling loop was added.

Verification on this SHA plus uncommitted checkpoint:

- `node --test --test-concurrency=1 backend/services/steamExperienceService.test.js backend/steamExperience.contract.test.js`:
  13 reported tests passed, 0 failed/skipped. New unit cases cover summary query
  omission, retained freshness/progress, default full compatibility, disconnected
  accounts and rollback/client release. The extended disposable Postgres/API
  contract verifies exact full/summary account/job parity, owner isolation,
  no-store, invalid-detail validation, auth/guest rejection and disconnect.
  Prior inbox/health contracts remain green.
- `npx playwright test tests/e2e/steam-health.spec.js --project=chromium`:
  desktop passed initially; mobile failed because the new test skipped the
  existing Filters and view menu containing its Steam controls. Corrected only
  that test navigation, then ran
  `npx playwright test tests/e2e/steam-health.spec.js --project=chromium --grep="saved health mobile"`:
  1 passed. Both distinct browser cases now pass; desktop was not repeated.
- Browser coverage uses mocked API routes and a controlled clock to check summary
  outside Settings, overlapping-focus coalescing, navigation while a summary is
  delayed, full diagnostic rendering, five-second active-job progress and return
  to summary mode. It also checks no mutations, no page errors and mobile overflow.
  Vite used the already-established approved local access outside the sandbox.
- A linked-account unit fixture issues 5 summary statements versus 8 full
  statements (including guard/BEGIN/COMMIT), skipping all three history queries.
  This is source/mock statement-count evidence, not a production benchmark.
  Backend contracts used only synthetic disposable localhost data, with cleanup;
  ordinary saved data and providers were not touched. Existing contract setup
  exercised the migration runner; no migration/schema change was introduced.
- Focused tracked/untracked whitespace checks passed. Full suites/builds and CI
  were not run. No unchanged passing checkpoint checks were repeated.

Tradeoffs/uncertainty: Settings still loads full diagnostics on every health tick,
and entry can wait for an in-flight summary before its full request starts. The
summary keeps the full account object and job progress; it does not minimize every
field or eliminate its read transaction. Existing read failures still use the
original error/retry handling. Production history volumes, latency, bytes and
Railway savings remain unmeasured.

Next action recorded at selective health (superseded by list profiling above):
review these local cost-efficiency diffs separately from status-model
work. Before changing the list revision algorithm, profile its current query plans
with representative synthetic disposable-localhost libraries and map all mutation
dependencies. Do not substitute MAX(updated_at) or a partial hash. Open-panel
notification coalescing/revisions remain a separate lower-scope candidate, with
receipt/decision/content changes in its contract. Publishing, production/config
changes and real-provider requests remain outside the authorized scope.

## Completed checkpoint: lightweight closed notification bell

Goal/phase: sixth local cost-efficiency checkpoint, complete for the closed bell
only. Branch `Dev`, HEAD `07641d9d257608b916ec8f33678cf1ab668b7c21`, uncommitted.
Scope: `backend/services/activityInboxService.js`, new adjacent `.test.js`,
`backend/routes/activity.js`, `backend/steamExperience.contract.test.js`,
`src/services/activityService.js`, `src/features/notifications/Notifications.jsx`,
`tests/e2e/notifications.spec.js` and this handoff. All status-model and prior
checkpoint work remains unstaged and preserved. No commit, push, deployment,
Railway setting change, production access or real-provider call occurred.

- Added authenticated `GET /api/activity/inbox/counts`, returning only attention
  and grouped pending-decision counts with `Cache-Control: no-store`. It uses
  the saved-user/guest guard and the same current-user/current-connection SQL
  helper as full inbox reads, without snapshots, group aggregation, receipt/title/
  artwork joins or event payload serialization. There is no count cache.
- The closed bell uses this path on initial load and the existing visible-page
  minute/focus/visibility wakes. Overlapping closed reads share one in-flight
  request; post-action refreshes require a new count and reject older results.
  Failures retain the last badge and allow the next wake to retry.
- Opening always activates/loads full fresh sections; open-panel refresh,
  pagination, read/hide/clear and action semantics remain. An unchanged count is
  never a content revision, so receipt/decision/content changes cannot suppress
  a full read on opening. Existing keyed user/account scope and sequence fences
  remain, including rejecting a delayed count after a full opening read.
- Health payloads and open-panel request coalescing are outside this checkpoint.
  No styling/layout/status-model implementation change was made. Browser fixture
  selectors/result assertions were aligned with the already-present capitalized
  status labels; stored status payload expectations remain unchanged.

Verification on this SHA plus uncommitted checkpoint:

- `node --test --test-concurrency=1 backend/services/activityInboxService.test.js backend/steamExperience.contract.test.js`:
  count unit and 7 contract cases passed initially; a later case failed because
  the new replacement-account fixture reused its provider ID. Made the new ID
  unique and reran the shared-fixture contract with
  `node --test backend/steamExperience.contract.test.js`: 9 reported tests passed,
  0 failed/skipped. Together, all 10 distinct backend tests have passing evidence.
- Backend coverage checks the guard plus one scoped count query, no full-group
  loading, exact grouped badge parity beyond page limits, reading versus dismissing,
  foreign owners, disconnect/replacement, no-store, unauthenticated and guest
  rejection. Other inbox/health/pagination/failure contracts remain green.
- `npx playwright test tests/e2e/notifications.spec.js --project=chromium`:
  final 3/3 passed (desktop, mobile viewport and legacy Wishlist). Initial launch
  was blocked by sandbox access needed by Vite; the approved local rerun started
  normally. Initial browser failures then exposed stale lowercase status selectors/
  result assertions from before status-model work, plus a cold-start heading wait;
  aligned all affected assertions and increased only the initial heading wait.
  Reran only these three failing browser cases after each relevant correction.
- Browser cases explicitly assert no full inbox reads while closed, coalesced
  focus bursts, full sections on opening, stale delayed-count rejection and
  post-action badge updates, alongside existing direct-action recovery, read/hide,
  keyboard dismissal and responsive overflow checks. All API routes are mocked.
  Backend tests use synthetic disposable localhost data; no provider calls or
  ordinary saved-data mutations occurred, and test resources were cleaned up.
- Focused tracked/untracked whitespace checks passed. Full suites/builds and CI
  were not run. No schema/migration change was required.

Tradeoffs/uncertainty: the grouped count still scans relevant decision evidence;
this removes full content reads while closed, not all database work. First opening
waits for full content instead of preloading it while closed. Badge cadence stays
at its existing visible-page minute/focus policy. Dedicated browser simulations
of count-network failure/account replacement were not added; backend replacement
guards and the opening stale-response race are covered. Production payload/CPU/
latency and Railway savings remain unmeasured.

Next action recorded at the closed-bell checkpoint (superseded by selective health
above): review this focused diff independently of status-model/prior work.
For the next checkpoint, inspect selective saved-health diagnostics: keep account
revision/freshness and active-job progress while avoiding full run/daily histories
outside Settings where possible. The current SteamExperienceContext already
coalesces its reads, so do not add redundant request machinery. Open-panel content
revision/coalescing and list-query profiling remain separate candidates. All
publishing, production/configuration work and real providers remain out of scope.

## Completed checkpoint: Steam sync idle backoff

Goal/phase: fifth local cost-efficiency checkpoint, complete. Branch `Dev`, HEAD
`07641d9d257608b916ec8f33678cf1ab668b7c21`, uncommitted. Scope:
`backend/services/steamLibrarySyncService.js`, new
`backend/services/steamSyncScheduler.test.js`, new
`backend/steamSyncScheduler.contract.test.js` and this handoff. The service already
contains a status-model change to staleLinkedStatus: that hunk is preserved and
must be reviewed/staged separately. All prior checkpoint/status-model work remains
in place, unstaged. No commit, push, deployment, Railway change, production access
or real-provider call occurred.

- Steam sync uses the same adaptive helper: 15-second normal cadence, idle/error
  waits of 15, 30, then at most 60 seconds, one unreferenced scheduler timer.
  The default test-mode scheduler guard remains; tests opt in with explicit fake
  timers. Stop removes the wake listener and timer without aborting active work.
- Durable local enqueue, queued-job reuse and successful force upgrade wake an
  active scheduler after their statements commit. Without a scheduler (CLI/tests),
  enqueue retains its direct microtask drain. No new background service or
  persistent database connection was added.
- Kept one shared drain promise. Requests received during an in-flight final
  empty claim now force another claim check before the drain exits. The promise
  is published before querying and cleared synchronously inside the drain,
  avoiding requests joining an already-finished worker. The drain returns its
  processed count so the scheduler can distinguish work from an empty check.
- Claim SQL, processing, account/guest guards, provider budgets, heartbeat/lease
  fencing, cooldowns and scheduled daily behavior remain unchanged. Capped polling
  still discovers remote-process enqueues and crashed-worker expired locks.

Verification on this SHA plus uncommitted checkpoint:

- `node --test --test-concurrency=1 --test-name-pattern="Steam (scheduler|shared drain)|PostgreSQL sync checkpoints|Steam sync enqueue" backend/services/steamSyncScheduler.test.js backend/steamSyncScheduler.contract.test.js backend/steamSyncFencing.contract.test.js backend/services/steamService.test.js`:
  10 reported tests passed, 0 failed/skipped (including the contract parent).
  No failing run or corrected rerun was needed.
- Covers the shared promise/final-empty-claim race, post-commit enqueue while idle
  and while draining, no overlapping claim in that race, remote enqueue, live vs
  expired locks, errors/retry, processed-work cadence reset, shutdown and durable
  CLI-style enqueue/user-scoped reads. Existing real-Postgres fencing coverage
  confirms rollback and stale-account/lease rejection.
- Tests used mocks and newly created disposable localhost databases with synthetic
  Steam fixtures, then dropped those databases. The scheduler contract rejects any
  unexpected fetch. Existing contract setup exercised the migration runner; no
  schema/migration changes were made and ordinary saved data was not modified.
- A mocked idle hour made 62 claim calls versus 241 at the old fixed 15-second
  cadence, including startup. This is controlled call-count evidence; production
  query latency/CPU/RAM and billing effects were not measured.
- Focused tracked/untracked whitespace checks passed. Full suites/build/browser
  checks and CI were not run; unchanged shared-helper tests were not repeated.

Tradeoffs/uncertainty: remote enqueues and expired locks may wait up to the
60-second idle cap plus active work. Local enqueues wake on the next timer turn;
CLI callers still drain through a microtask. A join/wake near final claim can add
one defensive empty check. Drains still process until empty and finish active
work during shutdown, as before. The cadence is measured after the drain finishes.
Actual production workload and Railway savings remain unmeasured.

Next action recorded at the Steam sync checkpoint (superseded by the closed-bell
checkpoint above): review the completed cache/feed/three-worker local diffs separately
from status-model work. For a new phase, investigate lightweight closed-panel
notification/health reads with a complete revision/invalidation contract and
account-replacement fencing before implementation. List-query revision design
still needs profiling. No publishing, deployment/configuration changes, production
access or real-provider requests are authorized by this handoff.

## Completed checkpoint: Wishlist metadata idle backoff

Goal/phase: fourth local cost-efficiency checkpoint, complete. Branch `Dev`, HEAD
`07641d9d257608b916ec8f33678cf1ab668b7c21`, uncommitted. Scope:
`backend/services/wishlistMetadataService.js`, its tests,
`backend/services/steamWishlistService.js`, `backend/steamWishlist.contract.test.js`
and this handoff. Preserved all status-model and previous checkpoint work;
nothing was staged, committed, pushed or deployed. No Railway change,
production access or real-provider request occurred.

- Reused the adaptive worker helper: normal configured cadence after work,
  exponential idle/error waits from the default 5 seconds to a 60-second cap,
  one unreferenced timer and no overlapping scheduler drains.
- Kept the fresh-first slot and retry-priority fallback unchanged, including
  both claim attempts when empty. Batch/provider budgets, due-time policy,
  owner scoping, lease/heartbeat/failure fencing and manual refresh drains remain.
- Steam Wishlist persistence wakes the worker only after a successful non-empty
  sync transaction commits. Failed/lease-lost transactions do not signal.
  enqueueWishlistMetadataWork can accept a transaction client and never emits
  an early wake itself; transaction owners must explicitly wake after commit.
- Capped polling discovers work from other processes and expired leases.
  Stop removes the local wake listener, clears its timer and allows in-flight
  work/heartbeat cleanup to finish without rearming. No notification connection
  or additional polling process was introduced.

Verification on this SHA plus uncommitted checkpoint:

- `node --test --test-concurrency=1 backend/services/wishlistMetadataService.test.js backend/steamWishlist.contract.test.js`:
  initially 19 passed and 1 existing fixture failed. Its first operation used
  September 13, 2026, making its scheduled follow-up overdue by the current date;
  the next operation reclaimed that item instead of the expected fresh item.
  Anchored that fixture's first operation to the test start time, without changing
  runtime retry logic or the fixed-date policy tests.
- `node --test --test-name-pattern="Wishlist work is owner-scoped" backend/services/wishlistMetadataService.test.js`:
  corrected case passed, 0 failed/skipped. All 20 distinct cases now have passing
  evidence; unchanged passing checks were not repeated.
- Four new real-Postgres scheduler cases cover empty-query counts, fresh/retry
  ordering, transaction rollback/post-commit wake, coalescing, other-connection
  enqueue, live/expired leases, owner isolation and stop during provider work.
  Extended the Steam Wishlist contract to check that committed queued work wakes
  the idle scheduler. Existing cases cover heartbeat renewal, late-worker replay,
  provider backoff/failures, manual refresh, baseline/removal and user isolation.
- Tests used only disposable localhost schemas/databases, synthetic data and
  injected/mock providers. Resources were cleaned up; ordinary saved data was not
  changed. The existing Steam contract also exercised the migration runner in its
  disposable database. There are no schema/migration edits in this checkpoint.
- A simulated idle hour executed 126 actual empty claim queries (63 ticks times
  fresh/retry attempts), versus 1442 at the previous fixed five-second cadence.
  This is controlled query-count evidence, not measured CPU/RAM/billing savings.
- Focused tracked whitespace checks passed. Full suites/build/browser checks and
  CI were not run. The unchanged shared adaptive-worker tests were not rerun.

Tradeoffs/uncertainty: remote enqueues, due retries and expired leases may wait
up to the 60-second idle cap plus an active batch; local committed Steam work
wakes promptly. Cadence is measured after a batch finishes. Manual refresh still
drains directly. Actual production latency, workload mix and Railway savings
remain unmeasured.

Next action recorded at the Wishlist checkpoint (superseded by the Steam sync
checkpoint above): review this focused checkpoint separately from status-model work.
Then adapt Steam sync polling around its existing shared drain promise, preserving
prompt enqueue, no lost wake near final claim, account/lease fencing, bounded
cross-process recovery and shutdown. Notification/health and list-query work
remain separate phases; publishing/production/configuration/provider actions
remain outside the authorized scope.

## Completed checkpoint: metadata-repair idle backoff

Goal/phase: third local cost-efficiency checkpoint, complete for metadata repair
only. Branch `Dev`, HEAD `07641d9d257608b916ec8f33678cf1ab668b7c21`, uncommitted.
Changed `backend/services/metadataRepairService.js` and its tests, added
`backend/utils/adaptiveWorker.js`, its tests and `backend/testWorkerClock.js`,
and added post-commit wake hooks in `backend/services/steamService.js`.
That last file already contains status-model edits: preserve those hunks and
review/stage selectively. Previous cache/feed checkpoints and all pre-existing
status-model work remain unstaged and preserved. No commit, push, deployment,
Railway configuration change, production access or real-provider call occurred.

- The metadata-repair worker uses one unreferenced timeout, backs off after empty
  checks/errors (default 5, 10, 20, 40, then at most 60 seconds), and resets to its
  existing configured interval after a processed batch. Provider/item budgets,
  claim SQL, due times, user scoping and lease semantics remain unchanged.
- Successful local enqueue wakes the scheduler on the next timer turn, after
  commit. Steam bulk import and single-game acquisition explicitly wake after
  their own successful commits; the transaction-only enqueue helper never emits
  an early wake. Rolled-back/failed commits do not signal. Future callers of that
  helper must follow the same post-commit contract.
- Wake hints coalesce, including one received during an in-flight final claim.
  A single scheduler never overlaps its own drains. Shutdown removes its wake
  listener, clears its timer, and lets active work finish without rearming.
- Capped polling continues to discover other processes' enqueues and expired
  leases without adding a permanent database connection or notification service.
  The other two worker schedulers are deliberately outside this checkpoint.

Verification on this SHA plus uncommitted checkpoint:

- `node --test --test-concurrency=1 backend/utils/adaptiveWorker.test.js backend/services/metadataRepairService.test.js backend/services/steamService.test.js`:
  initially 50 passed and 3 new assertions failed because they read the wrapper
  returned by getLatestMetadataRepair as the job itself. Corrected only those
  assertions to use `.job`; no runtime correction was needed.
- `node --test --test-name-pattern="repair scheduler|transactional enqueue|capped repair" backend/services/metadataRepairService.test.js`:
  corrected 3 cases passed, 0 failed, 0 skipped. All 53 distinct cases now have
  passing evidence; unchanged passing cases were not rerun.
- New cases cover empty database claim counts, local post-commit wake/rollback,
  transaction-owned enqueue, other-connection enqueue, unexpired/expired lease
  recovery and owner reads. Shared scheduler cases cover error backoff/retry,
  work cadence, wake coalescing, wake during a drain, and shutdown/timeout cleanup.
  Existing repair and Steam cases cover owner/budget/priority/import behavior.
- Actual empty-queue claims in isolated disposable localhost schemas with a
  simulated timer made 63 attempts in one idle hour, versus 721 at fixed five-second
  startup/polling. Timer logic has the same 63-count unit regression. This is a
  controlled query-count comparison, not production CPU/memory/billing evidence.
- Focused tracked/untracked whitespace checks passed. Full suites/build/browser
  checks and CI were not run. No schema change or migration-runner gate was needed.

Tradeoffs/uncertainty: remote-process enqueues, due retries and expired leases can
wait up to the 60-second idle cap plus an active batch; local committed enqueues
wake promptly. Polling is scheduled after a batch finishes, so long batches add
their duration to the normal interval. An in-flight batch still finishes during
shutdown, as before. Real workload mix, provider latency and deployment-wide
resource savings are unmeasured; do not claim measured Railway savings.

Next action recorded at the metadata-repair checkpoint (superseded by the
Wishlist checkpoint above): review this focused checkpoint separately from the status-model
diff. Continue with Wishlist metadata idle backoff, preserving fresh/retry claim
ordering, heartbeat/failure paths and post-commit Steam Wishlist enqueue wake-up;
then consider Steam sync's existing shared drain promise and cross-process
recovery. Notification/health and list-query candidates remain separate phases.
All publishing, production/configuration actions and real-provider calls remain
outside the authorized scope.

## Completed checkpoint: bulk price-feed persistence

Goal/phase: second local cost-efficiency checkpoint, complete. Branch `Dev`,
HEAD `07641d9d257608b916ec8f33678cf1ab668b7c21`. Uncommitted scope for this
checkpoint: `backend/services/steamPriceFeedService.js`, new
`backend/steamPriceFeed.contract.test.js` and this handoff. The completed cache
checkpoint and all pre-existing status-model work remain in place, unstaged.
No commit/push/deployment, Railway change, production access or real-provider
request occurred. Only a newly created disposable localhost database was written
for tests and dropped afterward; ordinary saved development data was not changed.

- Replaced per-app upserts with batches of at most 1000 normalized, deduplicated
  feed apps. Prior-price lookups are bounded to the same batch size. Write
  statements have at most 4000 parameters; all records remain eligible for storage,
  regardless of any individual account's Wishlist.
- Preserved new/changed/null candidate rules, older-record conflict handling,
  candidate/seen timestamps, overlap, retention and fresh-feed reuse across
  accounts. No schema, migration, provider pagination or scheduling changes.
- Persistence now holds a cursor-row lock until commit, keeping lease ownership
  stable while batches are written. A failed final cursor compare-and-set throws
  so all feed writes and retention deletion roll back together. Previously that
  path returned null and could commit feed rows without advancing the cursor.

Verification on the SHA plus this uncommitted checkpoint:

- `node --test --test-concurrency=1 backend/steamPriceFeed.contract.test.js backend/services/steamPriceFeedProvider.test.js`:
  14 reported tests passed, 0 failed, 0 skipped (10 persistence cases, 3 provider
  cases and the persistence parent). Real Postgres statements ran against only a
  disposable localhost database with synthetic records; every fetch was mocked.
- Covers empty/1/1000/1001/2001-record batches and bounded query payloads;
  equivalence with the previous row-by-row SQL for changed/unchanged/null and
  stale records, retention and shared-feed reuse; failed later-batch rollback;
  lease replacement during fetch; cursor-lock contention; final fencing failure
  rollback. Existing provider cases cover pagination/deduplication and failures.
- The 2001-record fixture used 3 write statements and 3 bounded prior-row lookups,
  versus the old 2001 writes and one unbounded lookup. This is synthetic query-count
  evidence, not a latency, CPU, memory or billing benchmark.
- Focused tracked/untracked whitespace checks passed after correcting the check
  invocation: disabling Git's line-ending conversion initially misclassified the
  existing CRLF line endings as trailing whitespace; the next wrapper also treated
  the expected no-index new-file difference exit (1) as failure. No source
  correction was needed; the corrected checks showed no whitespace diagnostics.
  Full suites/build/browser
  checks and CI were not run; no schema change required a migration-runner gate.

Tradeoffs/uncertainty: prior-row lookup count increases to one per batch, while
write round trips fall sharply. The entire fetched feed is still accumulated by
the provider, and all batches stay in one transaction for atomicity. The cursor
lock lasts through persistence/retention (never provider fetching), so competing
claims can wait on that transaction. Production volumes, lock duration and net
resource/billing effects are unmeasured; no measured Railway savings are claimed.

Next action recorded at the bulk checkpoint (superseded by the metadata-repair
checkpoint above): review these focused local diffs separately from status-model work.
For another implementation checkpoint, investigate adaptive idle-worker backoff
with prompt local wake-up, bounded cross-process recovery and lease/error tests;
do not just increase fixed intervals. Obtain separately authorized resource
measurements where available to prioritize it against lighter notification reads.
Publishing, production/configuration work and real-provider calls remain outside
the authorized scope.

## Completed checkpoint: bounded micro-cache retention

Goal/phase: first local cost-efficiency implementation checkpoint, complete.
Branch `Dev`, HEAD `07641d9d257608b916ec8f33678cf1ab668b7c21`, with uncommitted
changes in `backend/utils/microCache.js`, new `backend/utils/microCache.test.js`
and this handoff. No commit, push, deployment, Railway configuration change,
production data access or real-provider call occurred.

- Preserved the pre-existing status-model work, including dirty routes/services,
  schema, frontend, NEXT_TASKS.md, untracked migration 052, shared/ and tests.
  This handoff was already untracked; do not stage unrelated files together.
- Added global LRU limits: `MICROCACHE_MAX_USERS` defaults to 256 buckets and
  `MICROCACHE_MAX_TOTAL_KEYS` to 1024 entries. Existing per-user
  `MICROCACHE_MAX_KEYS` defaults to 32 and TTL to five minutes. Invalid limits
  fall back to finite defaults. Limits are per process, not shared across replicas.
- Every get/set can reclaim expired entries for all users and remove empty
  buckets. A cached earliest-expiry deadline avoids scanning before expiry is
  due; a due scan is bounded by the global entry limit. No interval or timeout
  is installed. During complete inactivity, expired values remain bounded in
  memory until another cache get/set, explicit invalidation or process exit.
- Preserved String(userId) scoping, per-user/all invalidation and fixed TTL
  semantics (including the existing exact-deadline boundary). Reads affect LRU
  order without extending freshness; overwrites start a new TTL. Added an isolated
  factory with injectable clock and count-only retention inspection for tests;
  existing route/service imports keep the shared singleton API.

Verification on the SHA plus uncommitted checkpoint above:

- `node --test backend/utils/microCache.test.js`: 13 passed, 0 failed, 0 skipped.
  Covers inactive-user expiry via unrelated misses/writes, empty-bucket cleanup,
  TTL deadlines/overwrite, per-user/global LRU limits, sustained distinct users,
  invalid configuration, user isolation, invalidation/reset and timer-free process
  exit. Tests use synthetic payloads and an injected clock; no database/providers.
- `git diff --check`: passed for tracked changes; whitespace checks also cover
  the new test and this untracked handoff via `git diff --no-index --check`.
- Full suites, builds, browser checks and CI were not run for this focused backend
  checkpoint. No production reproduction, memory/CPU benchmark or billing
  measurement was performed; no measured Railway savings are claimed.

Tradeoffs/uncertainty: these are count limits, not byte limits; one large payload
can still consume substantial memory. Extra eviction can increase Insights cache
misses/database reads under load. Expiry reclamation costs a bounded scan when
due, and LRU indexing adds per-entry overhead. Production working-set size,
appropriate limits and net resource/billing effects remain unknown.

Next action recorded at the cache checkpoint (superseded by the bulk checkpoint
above): review this focused local diff separately from the status-model
work. For a subsequent checkpoint, obtain separately authorized read-only resource
evidence where available and select bulk price-feed writes or adaptive workers
based on it. Do not expand this checkpoint or perform release/configuration work
without the corresponding authorization and gates.

## Original audit handoff (historical)

Goal: reduce avoidable Railway resource use while preserving data freshness,
security, editable demo flows, account isolation, recovery and Activity accuracy.
Read AGENTS.md and this handoff, inspect current Git, then choose one coherent
implementation checkpoint. Do not implement every candidate in one change.

- Audited checkout: `Dev`, HEAD `07641d9d257608b916ec8f33678cf1ab668b7c21`.
- Recorded `origin/main`: `870eb31` (not freshly fetched or verified as live).
- Substantial pre-existing uncommitted status-model work spans backend routes,
  services, schema, frontend and tests; untracked migration 052, shared/ and
  status-model tests/planning also exist. Preserve all of it. In particular,
  steamLibrarySyncService.js, steamService.js and gameAccess.js are mixed-file risks.
- Key cache, worker, price-feed, notification, HLTB and sync-command files matched
  recorded origin/main during the audit. gameAccess.js has local status/date
  changes; its expensive hash approach also exists in recorded origin/main.
- No commit, push, application change, migration, Railway setting change or
  production/provider interaction is authorized by this document. A future chat
  should follow the user's selected implementation scope and repository gates.

## Confidence and boundaries

Confirmed below means the behavior was traced in code, not that it caused the
outage or accounts for a measured share of the bill. This is a scoped audit,
not proof that all possible inefficiencies have been found.

Inspected: startup/HLTB loading, in-process caches, job schedulers and claims,
Steam library/Wishlist/prices/achievement work, database query shapes and relevant
queue indexes, list pagination/revalidation, notification and health polling,
demo provisioning, history/retention and database connection configuration.

Missing evidence: live service CPU/RAM/runtime graphs, request/SQL profiles,
per-service spend, table/index sizes, actual job durations/volumes, current
environment variables, replicas and other deployed environments. No production
EXPLAIN, load test or production database inspection was performed.

Railway CLI 5.23.3 was installed but `railway status --json` returned Unauthorized;
the saved authentication was expired. Railway also disclosed token invalidation
during its incident. Reauthenticate through the normal flow before live reads;
never paste credentials into chat. No working Railway connector was established.

Billing screenshots showed Free plan, recurring $0 invoices and $0.99 remaining.
They also contained contradictory Trial text, a broad Aug-Nov usage interval,
and an empty project breakdown. They do NOT establish monthly service costs,
exhausted credits as the original outage cause, or an amount owed. The user later
reported service recovery, possibly after a credit reset; that cause is unverified.

## Billing model: what an optimization can save

Official service prices rechecked 2026-10-23:

| Resource | Rate | Relevant optimization |
| --- | --- | --- |
| RAM | $10/GB-month | Reduce actual retained memory or running time |
| CPU | $20/vCPU-month | Reduce actual processing/query work |
| Public egress | $0.05/GB | Smaller responses; internal service networking |
| Volume storage | $0.15/used GB-month | Avoid unnecessary stored data/index growth |

Free includes $1/month. Service builds are currently free. Limits are ceilings;
lowering a maximum does not inherently lower actual consumption. Railway does not
bill each SQL query or Steam request separately. An always-running 0.1 GB memory
footprint costs approximately $1/month before other resources. This is arithmetic,
not a measurement of this app. Do not promise that an always-on API plus Postgres
will fit within $1 after these optimizations.

Sources (recheck before relying on future prices/settings):

- [Plans and resource prices](https://docs.railway.com/pricing/plans)
- [Sizing from actual metrics](https://docs.railway.com/guides/right-size-cpu-memory)
- [Billing and public database egress](https://docs.railway.com/pricing/understanding-your-bill)
- [Serverless reference](https://docs.railway.com/deployments/serverless)
- [Idle-cost guide](https://docs.railway.com/guides/cut-idle-costs-serverless)

The last two official pages disagreed on the inactivity threshold (5 versus
10 minutes). Verify live behavior if considering sleep. Both describe outbound
activity preventing sleep and a cold-start delay/possible initial 502. Current
5-15 second DB polling prevents either idle threshold. Sleeping is a separate
product/reliability decision, not a quality-neutral toggle.

## Confirmed opportunities

### 1. Expired per-user cache retention

Evidence: backend/utils/microCache.js:13-57; Insights uses it in
backend/routes/insights.js. Expiry is handled only on that user's access/set.
The per-user key bound does not bound total users, and inactive users' expired
payloads can remain until restart. Guest DB cleanup in backend/index.js does not
clear those buckets. The cache does not serve expired hits; this is retention,
not a confirmed stale-response bug. Production magnitude is unknown.

Proposed fix: bounded global retention plus expiry reclamation, including empty
buckets. Avoid an aggressive sweeping timer that adds new background overhead.
Preserve cacheClear semantics and every user boundary.

Acceptance: simulated-time expiry for inactive users, total-user/key limits,
invalidation, no cross-user reads, no needless interval/process retention.

### 2. Idle worker database polling

Evidence: metadataRepairService.js:528 (default 5 seconds),
wishlistMetadataService.js:888 (5 seconds), steamLibrarySyncService.js:1417
(15 seconds); all start in backend/index.js. At default settings with continuous
uptime and quick empty checks, this is about 40,320 scheduler ticks/day, not
40,320 provider requests. Claims add transaction round trips. Wishlist's empty
fresh-only attempt is followed by a retry-priority attempt (:290, :680-705).
Runnable indexes exist; do not blindly add duplicate indexes.

Proposed fix: adaptive idle backoff, immediate local enqueue wake-up and bounded
cross-process/crash recovery. A fixed longer interval alone changes job latency.
Cron and API can operate on shared work, so local notifications alone are not
sufficient. LISTEN/NOTIFY holds a connection and has its own sleep implications.

Acceptance: empty-queue query counts; prompt enqueue while backed off; no concurrent
drains; errors/retries; expired-lease reclaim; another process enqueueing work;
shutdown cleanup. Do not weaken leases, account fencing or failure-path tests.
CPU/network reduction is plausible; baseline RAM remains billable.

### 3. Individual Steam price-feed writes

Evidence: steamPriceFeedProvider.js:9 uses up to 50,000 apps/page;
steamPriceFeedService.js:103 awaits one upsert per returned app. This is a global
Steam app-change feed. It already shares a cursor across accounts, has a 20-hour
refresh interval, an overlap window and 14-day retention. A full/bootstrap scan
can be much larger than the user's Wishlist. Actual production counts are unknown.

Proposed fix: bounded bulk upserts with unchanged conflict/candidate rules and
transactional cursor advancement. A hypothetical 50,000 rows in batches of 1,000
means about 50 write statements instead of 50,000; it is not a dollar estimate.
Do not drop feed records or reduce coverage merely because they are not in one
user's Wishlist. Preserve lease fencing, rollback, older-record handling,
price_candidate_at, last_seen_at, overlap, retention and multi-account reuse.

Acceptance: old/new result equivalence for first scan, unchanged/changed/null
price-change numbers and stale records; chunk boundaries/empty input; failed
batch rollback without cursor advance; lease loss; bounded query/payload counts.
Existing coverage includes backend/steamPrices.contract.test.js and
backend/services/steamPriceFeedProvider.test.js. Use disposable localhost DBs.

### 4. Full notification/health reads on periodic refresh

Evidence: src/features/notifications/Notifications.jsx:172-232 requests attention
and updates, up to 50 groups each, every minute while visible even with the panel
closed. activityInboxService.js:120-166 counts and aggregates groups; updates also
recalculates attention counts. Focus refresh can overlap existing requests.
SteamExperienceContext.jsx:50-80 polls health every 60 seconds, or 5 seconds during
a job; steamExperienceService.js includes recent runs and ten daily-run summaries.
These are saved-data reads, not new Steam syncs.

Proposed fix: a lightweight count/revision path for the closed panel, full content
on opening/change, coalesced in-flight reads and selective diagnostic detail.
Keep existing badge freshness, read/hidden/action semantics, error recovery and
account replacement fencing. Revision inputs must include receipt/decision state,
not just MAX(event ID). Do not replace polling with an always-on paid service.

Acceptance: closed panel avoids full groups; focus/timer deduplication; no missed
updates or stale counts; open-panel behavior and pagination; account switch and
failures; active-job progress. Use mocks/disposable contracts and focused UI cases.

### 5. Expensive list revision calculation

Evidence: backend/utils/gameAccess.js:217-245 hashes joined rows converted to text
for every page, including wide catalog fields. Initial facets perform another
collection hash. Correction from 2026-10-24 live profiling: useInfiniteGames.js
reuses loaded later rows on unchanged revisions; initial/changed snapshots can
hydrate the collection. The first-page/facet hashes still process collection
rows. See [the measured local profile](railway-list-query-profile.md).

Proposed investigation: reliable collection revisions/snapshot reuse and narrower
queries. This is a higher-risk design change: all game, catalog, Steam, ordering,
focus and personal-genre mutations that affect results must invalidate correctly.
Do not replace this with MAX(updated_at) or a partial hash without proving those
dependencies. Do not remove full hydration without checking search/filter UX.

Acceptance: disposable SQL/query-plan evidence at representative synthetic library
sizes; pagination across edits; sort/filter/facet parity; unchanged polls; coherent
snapshots under concurrent writes. An index alone cannot remove full-row hashing.

## Candidates needing stronger evidence before implementation

- **Repeated HTML sanitation:** metadataIngestionService.js:166 sanitizes on
  ingestion, while steamWishlistService.js:123 sanitizes again on read. Consider
  bounded sanitized-output reuse or a verified sanitation-version contract.
  Historical/imported data must remain safe; never simply remove sanitation or
  replace the sanitizer with an inadequately tested cheaper implementation.
- **HLTB startup:** backend/utils/hltb.js:107 parses the full reference JSON into
  the lookup at API startup. An equivalent compact build artifact could reduce
  parse/startup overhead; the final lookup would still consume memory. Confirm
  normalization, duplicate-title precedence, units, main/plus/completionist values,
  paths and fallback parity. Steady-state savings have NOT been demonstrated.
- **Achievement schemas:** steamService.js:1266 fetches player progress and game
  schema on eligible refreshes. A bounded shared schema cache might reduce repeated
  provider work across accounts. Player progress remains account-specific; schema
  updates, failures and new achievements must still refresh correctly.
- **Demo creation:** backend/routes/demo.js:40 clones games/genres individually;
  :150 hashes guest credentials. Batch cloning could help under traffic. Preserve
  independent editable guests, idempotent session reuse, owner fences and keep/demo
  conversion. Do not weaken passwords, restrict guests or shorten retention as an
  incidental saving. Traffic and template size have not been measured.
- **Activity coverage:** steamActivityService.js:1056 reads historical coverage
  even for short ranges. Compact summaries may help as history grows, but must
  preserve covered zero-play days, gaps, uncertain intervals and chosen allocations.
  No historical observations should be deleted to save money without a separate
  retention design. Actual table/index sizes and query plans are missing.

## Work already bounded or intentionally preserved

- Keep daily observation frequency and the factual timestamp boundary. Missing
  Steam daily history cannot be reconstructed by a later catch-up.
- The script closes its DB pool in finally. Library snapshots already use diffs;
  completed library jobs clear their large payload_json.
- Price work has item/request/time budgets and backoff; the global feed is shared.
  Catalog provider snapshots deduplicate by payload hash.
- Browser polling generally pauses in hidden tabs; response compression already
  exists. Frontend caches live in the browser and do not occupy Railway RAM.
- Private networking is a live configuration check, not a confirmed code bug.
  Both API and cron must use the internal database hostname in the same environment.
  DATABASE_URL's name alone proves nothing. Verify without exposing credentials.
- Do not arbitrarily reduce Postgres memory/connections, add Redis, lower service
  resource ceilings, or enable API/database sleep without actual metrics and a
  reliability assessment. Check extra environments/replicas and agent usage too.

## Measurements and checks already completed

These were isolated local profiles, not production benchmarks or proposed changes:

| Profile | Observed result | Limit |
| --- | --- | --- |
| HLTB loader, node --expose-gc | 15.59 MiB input; 55,969 entries; 262 ms; heap 4.20 to 11.96 MiB after GC; RSS 30.80 to 89.84 MiB | Local dataset/process; RSS includes runtime allocation; no steady-state savings estimate |
| Sanitizer import, separate process | 1,452 ms import; heap 3.78 to 20.39 MiB after GC; RSS 29.39 to 93.95 MiB | Dependency cost; not evidence it can safely be removed; not additive with the HLTB profile |
| 100 synthetic 1,064-byte descriptions | 227 ms elapsed; 547 ms aggregate CPU | Local synthetic input, not measured production response cost |

No provider or DB calls occurred in those profiles. No application test suite was
run for the cost audit. On 2026-10-23 the separate scheduling diagnosis ran:

`node --test --test-name-pattern="rejected closeout|paired Railway" scripts/sync-steam-daily.test.js`

Result: 2 passed, 0 failed, with injected mocks. It verifies the old scheduled-hour
gate and paired UTC starts, not any cost optimization or live Railway configuration.
Do not rerun unchanged passing checks without a relevant change.

## Separate scheduling discussion: not an applied configuration

The user prefers one daily 05:00 Israel run and usable manual Run now. The proposed
Railway start command is existing `npm run steam:sync:daily` (no hour gate), with
one UTC cron: summer `0 2 * * *`, winter `0 3 * * *`. This replaces paired starts
and gated `steam:sync:daily-scheduled`. The user has NOT confirmed applying it.
Switch to winter on 2026-10-25 under current Asia/Jerusalem rules. A helper can
derive the correct season, but cannot move Railway's UTC trigger by changing an
application variable alone. Existing concurrency locks/cooldowns still apply;
the ungated command does not provide the scheduled closeout-day deduplication.
Do not silently restore the old arrangement from historical AUTOMATION.md text.

## Suggested implementation order and remaining evidence

1. Capture available live per-service memory/CPU/egress and job durations with
   authenticated read-only access; verify internal DB networking. Do not block a
   clear cache fix merely because live billing is unavailable, but keep cost claims
   conditional. Compare equivalent workloads/durations before and after each phase.
2. First small checkpoint: bounded cache expiry/retention with focused fake-clock
   isolation/invalidation coverage.
3. Separate checkpoints: bulk price-feed writes; adaptive workers with reliable
   wake-up/recovery. Start with whichever live measurements support more strongly.
4. Lightweight notification/health reads with a proven invalidation contract.
5. Profile list-query changes and secondary candidates before expanding scope.

Record query counts, response bytes, latency, idle CPU/RAM and job durations where
applicable. On a free allowance, credits/paused uptime distort naive comparisons.
Tests must use mocks or disposable localhost data; use docs/VERIFICATION.md and CI
as the full release gate. No production schema/configuration change, real sync,
secret rotation or release should occur as an incidental cost optimization.

Original documentation checkpoint: proofread links/claims and run git diff --check for the
new handoff and NEXT_TASKS.md link. App tests/builds are not needed for this edit.
