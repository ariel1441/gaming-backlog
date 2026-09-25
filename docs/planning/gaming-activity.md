# Gaming Activity

Status: Phases 1 through 5 prepared and verified locally; external release actions remain pending authorization.
Updated: 2026-09-24.

This document defines the target behavior agreed for Steam-derived activity,
notifications and activity Insights. It is not a description of the current UI.
The current Activity page groups deltas by observation date, stores achievement
counts rather than named unlock events, and records an observation at library-job
finalization. Those behaviors must not be mistaken for the target contract below.

## Product model

Gaming Activity is a private history built from successive Steam observations. It
answers questions such as:

- Which games did I play during an activity day, and for how long?
- Which achievements did I unlock?
- Was this my first observed play of a game?
- Did I return to a game after a meaningful break?
- Which games were newly observed in my Steam library?
- What do those events add up to over a week, month or year?

Steam exposes cumulative playtime, not authoritative session start/end records.
The product must therefore say "played for 2h between checks," not claim a precise
session from 23:00 to 01:00. Exact provider event timestamps, such as achievement
unlock times and Steam Last Played, are different from inferred playtime intervals.

The existing lifecycle Timeline remains for intentional Backlog events such as
Started and Finished. Detailed observed play belongs in the private Gaming Activity
page; it must not flood the lifecycle Timeline.

## Canonical activity day

- The V1 timezone is `Asia/Jerusalem`.
- An activity day runs from 05:00 local time through 04:59:59 the next morning.
- Its label is the calendar date on which that activity day starts. For example,
  Friday 05:00 through Saturday 04:59 is **Friday**.
- This is a product grouping rule, not a claim that Steam knows the user's sleep or
  session boundaries.
- Raw provider timestamps remain stored privately. Derive the activity-day label
  when ingesting or reading them; do not destroy the original timestamp.

This rule keeps late-night activity together. A Friday 23:00-Saturday 02:00 play
period is shown as 3h on Friday. An achievement unlocked Saturday at 01:30 is also
shown under Friday. The exact unlock timestamp may preserve ordering internally,
but the hour is not shown in the normal interface.

The cutoff is account-level product configuration. It is not user-configurable in
V1. A future setting may expose timezone or cutoff changes, but stored raw times and
the historical grouping policy must make any regrouping deliberate and testable.

## Observation and closeout contract

The existing daily Steam command remains the collection path. For each account, the
relevant order is:

1. Railway starts the command at approximately the configured time.
2. The Library stage runs first and fetches Steam's cumulative ownership/playtime
   snapshot.
3. The application records `snapshotObservedAt` when that provider response is
   received.
4. The snapshot is compared with the preceding successful snapshot for the same
   linked Steam account and AppID.
5. The resulting deltas and provider events are persisted idempotently.
6. Achievement follow-up and library finalization may continue.
7. Wishlist and price stages run afterward and cannot move the Library boundary.

`snapshotObservedAt`, not cron's nominal time, the end of achievement processing,
or the end of the full daily command, is the factual observation boundary. The
current code already captures this value in the Library job payload, but
`recordSteamActivityObservations` currently writes `NOW()` at finalization. The
implementation must pass and persist the captured snapshot time instead.

Railway may begin a few minutes late and the Steam request also takes time. That
small variance is accepted. A normal successful closeout around 05:00 attributes
the delta since the preceding closeout to the activity day that just ended. Extra
successful observations inside the same activity day may be combined into that
day. A missing expected daily Library observation creates an uncertain multi-day
interval; it must not be hidden by a hard-coded duration heuristic.

The production Railway cron is currently `02:00 UTC`. That corresponds to 05:00 in
Israel during daylight-saving time and 04:00 during standard time. Before treating
05:00 local as a permanent operational boundary, deployment configuration must
handle that seasonal change. The account's daily-sync opt-in does not schedule the
command by itself.

## Baselines, deltas and reliability

- The first successful observation after activity collection begins is a
  zero-delta baseline. Historic daily activity cannot be reconstructed from a
  lifetime total.
- Apps already present in that baseline are not emitted as newly added library
  games. Existing achievement unlocks establish deduplication state and do not
  arrive as a burst of new notifications or current-period activity. Historical
  achievement-only browsing may be considered later because its provider
  timestamps are independent of reconstructed playtime.
- Store observations for every owned or ignored Steam app, including games that
  are not in Backlog.
- Only two successful, account-fenced provider snapshots may produce a playtime
  delta. A failed Library fetch does not close a day or advance the baseline.
- A retry or replay of the same sync run must not create duplicate observations,
  achievements, library events or notifications.
- Replacing or reconnecting a Steam account must not compare totals across account
  identities or across the new account's link boundary.
- No achievement is required to prove a playtime delta. Many sessions unlock no
  achievement, and achievement availability may be private or unsupported.
- A cumulative counter decrease is treated as a rare provider anomaly: never emit
  negative activity. V1 should use a small defensive rebaseline/diagnostic path,
  not a complex recovery system that changes normal delta behavior.

### Precision classes

Persist enough provenance to distinguish at least:

- **Exact provider event:** an event with its own timestamp, such as a named
  achievement unlock.
- **Daily observed interval:** a delta bounded by the expected consecutive daily
  snapshots and safe to assign to one activity day.
- **Uncertain interval:** a delta spanning one or more missing expected Library
  observations and therefore not safely divisible by day.
- **Baseline:** a cumulative starting value that produces no historic activity.

Precision is part of the data contract, not wording inferred later by the UI.

## Event rules

### Played X for Y time

The difference between consecutive trustworthy cumulative playtime values is the
observed playtime. A normal daily interval is assigned as a whole to the activity
day closed by the newer snapshot. It is not split at calendar midnight and is not
presented as exact session duration or start/end time.

### Achievements

- When Steam returns named achievements and unlock timestamps, store each unlock
  idempotently and retain its raw timestamp.
- Group an unlock into an activity day using the 05:00 local cutoff. Thus Saturday
  01:30 belongs to Friday; Saturday 05:00 or later belongs to Saturday.
- Preserve unlock order, but do not show clock times by default.
- A named exact unlock can still be assigned to its activity day even when a
  playtime interval is uncertain due to a missed snapshot.
- Counts and named events must not double-count one another. Private, unavailable
  or failed achievement data produces no invented unlocks.

### First played and Started

- "Played for the first time" is emitted only when the ledger can establish a
  transition from zero playtime to positive playtime after a trustworthy baseline,
  including an app absent at the preceding snapshot that is newly observed with
  positive playtime.
- A game already positive at the initial baseline has unknown historic first play;
  do not claim it was first played on the baseline date.
- The event uses the derived activity day, not the calendar date after midnight.
- Accepting a delayed **Started on Steam** notification may change status to Playing
  and, only with the user's explicit date action, set `Started` to the saved event's
  activity day. Clicking the notification a day later must not use the click date.
- Preserve an existing `Started` date. Steam must not silently overwrite personal
  status or dates.
- Hide **Steam activity first observed** from normal game details. Keep the raw
  value as private provenance/debugging evidence.
- **Steam Last Played** remains Steam's real provider timestamp/date. It may say
  Saturday while the related late-night playtime and Started date are grouped under
  Friday. Do not add repetitive explanatory copy beside the field.

### Returned after X days

Derive a return from the previous positive observed-play activity day for that game,
not from achievement presence. Show the highlight only when both sides are precise
enough to support the elapsed-day claim. If a missed interval makes the return date
ambiguous, omit the duration rather than inventing it.

### Added to Steam library

- The daily Library API does not provide a trustworthy purchase timestamp. Call
  this **Added to Steam library**, not **Purchased**.
- A newly observed app in a normal daily interval belongs to the activity day just
  closed by that snapshot, using the same rule as playtime.
- If first observation follows a missed interval, retain and display the interval
  instead of assigning an exact day.
- A new-library and first-play event for one game/day should appear together rather
  than as repetitive cards or notification groups.
- This source fact does not automatically add the game to Backlog.

## Missed, failed and unusual checks

A failed Library check records operational failure but creates no activity boundary.
The next successful comparison may therefore cover multiple activity days.

For an uncertain interval:

- Keep its full playtime in all-time/overall and per-game observed totals.
- Show one interval, such as **Sep 18-20**, with wording such as "3h 05m observed
  during this interval."
- Never average or spread the total across the included days.
- Exclude its playtime from day bars, weekday distributions, daily averages,
  streaks and exact active-day counts.
- If it lies fully inside a selected week/month/year, include it in the recap total
  with an uncertainty label.
- If it crosses the selected reporting boundary, show it separately as unallocated
  overlapping activity rather than silently assigning it or counting it twice.
- Continue to place independently timestamped achievement unlocks on their exact
  derived activity days.

An achievement after midnight does not create an "overnight" play card. All normal
activity is simply grouped into the applicable activity day. The UI should not mix
cards titled "calendar day" with cards titled "overnight."

## Notifications

Notifications are a review surface over saved events, not the activity ledger
itself. Reading a notification does not resolve its decision.

- Informational updates may summarize "Played X for 2h" and "Unlocked 3
  achievements," grouped by game/activity day where that reduces noise.
- Decision notifications remain for a game played outside Backlog, a first-play
  status suggestion, a newly observed library game, and existing duplicate-aware
  add/link flows.
- Notification dates and actions use saved event evidence. They must not be
  recalculated from the current date when opened or accepted.
- One game discovered and first played in the same observation should be one group
  with both facts.
- Import, linking, Ignore and status changes stay explicit and idempotent. Steam
  activity never silently changes Backlog membership, status or dates.

## Gaming Activity page

The private **Gaming activity** page has two views: **Activity** and **Insights**.
It includes all Steam activity, not only Backlog games. Steam-specific facts remain
private until explicit privacy controls exist.

### Activity view

The default view is a reverse-chronological activity-day feed.

Top controls and summary:

- Range: 7 days, 30 days and All.
- Summary: observed playtime, games played, achievements unlocked and coverage.
- Coverage distinguishes successful daily closeouts from missing/uncertain periods.
- No Calendar/Overnight grouping selector is needed; the 05:00 activity-day rule is
  canonical.

Normal card:

- Heading such as **Friday, Sep 22**, without "calendar day" or an overnight range.
- Day total and game count.
- One row per game with cover, title and observed playtime.
- Compact highlights where applicable: First played, Returned after 46 days, Added
  to Steam library, and achievement count/names.
- Achievement names may be collapsed when numerous. Preserve their order; omit
  times by default.
- Do not fill the card with provenance explanations. Details may expose diagnostic
  precision later if needed.

Uncertain interval card:

- Uses the interval range instead of a single day.
- Explains once that the total spans missed checks and was not divided into invented
  daily values.
- Shows the known per-game totals and any exact events without pretending to know
  which included day received the playtime.

The current, not-yet-closed activity day is not live-tracked. The page reports data
through the latest successful Library snapshot and may show that freshness quietly.

### Insights view

Insights reads the same ledger; it must not independently reinterpret dates.
Initial ranges are This week, This month, year, and later All time where useful.

V1 summaries:

- Observed playtime and games played.
- Achievements unlocked.
- Precise active activity days.
- Most-played games.
- First observed plays and reliable returns.
- Daily activity-day bars.
- Weekly recap highlights.

Metric eligibility:

| Metric | Normal daily interval | Uncertain multi-day interval | Exact achievement event |
| --- | --- | --- | --- |
| Overall/per-game observed total | Include | Include | N/A |
| Period recap total | Include | Include if contained; otherwise show unallocated | Include |
| Daily/weekday chart | Include | Exclude | Include on derived activity day |
| Daily average/active-day count | Include | Exclude | Does not prove playtime |
| Streak | Include | Exclude; it neither proves nor breaks exact continuity | Does not prove a played day by itself |
| Most played | Include | Include, with coverage context where material | N/A |

Do not label an incomplete current week/month as a final comparison without making
that incompleteness clear. Do not show trend, streak or weekday claims until enough
consecutive reliable observations exist. Totals and simple recaps can appear sooner
with coverage disclosed.

## Acceptance examples

### Late-night play

- Friday 23:00-Saturday 02:00 produces a 3h delta at Saturday's morning closeout.
- Activity view: 3h under Friday.
- Achievement at Saturday 01:30: under Friday, ordered correctly, no time by default.
- Started from the saved first-play suggestion: Friday.
- Steam Last Played: Saturday, unchanged provider value.
- No separate Saturday play card is created solely because the provider date passed
  midnight.

### Delayed notification action

- First play is observed for the activity day Sep 22.
- The user accepts the Playing suggestion on Sep 23.
- Status becomes Playing; if the user chose to set the date and none exists,
  `Started` becomes Sep 22, not Sep 23.

### Session with no achievement

- Playtime rises by 90 minutes and achievement count does not change.
- Activity shows 1h 30m. No other signal is required.

### Achievement without attributable daily playtime

- A Library check was missed, but Steam later returns an unlock timestamp of 01:30
  Saturday.
- The playtime remains in a multi-day uncertain interval.
- The achievement is shown under Friday because its own timestamp is exact.

### Missed daily snapshot

- Successful snapshots occur Sep 18 and Sep 21, with 3h 05m gained.
- Show one Sep 18-21 uncertain interval and keep 3h 05m in overall/per-game totals.
- Do not manufacture one hour per day, active days, weekday hours or a streak.

### First baseline

- A game has 40 lifetime hours when activity collection begins.
- Save 40h as baseline and show no historic daily activity or first-play event.
- A later snapshot at 42h creates only a 2h delta.

### New library item

- A game first appears in the normal Sep 22 activity interval.
- Show Added to Steam library under Sep 22; do not call it a purchase.
- If it also moves from zero to positive playtime, show First played in the same
  game row/group.

## Implementation phases

Implement and verify these as five separate checkpoints. A later phase may rely on
completed earlier phases, but should not silently expand their scope.

### Phase 1: Activity data foundation

- Audit the retained observation/job schema and determine which existing history
  can be preserved or corrected from saved evidence. Do not reset the ledger or
  invent a production backfill.
- Persist `snapshotObservedAt` as the observation boundary rather than Library-job
  finalization time.
- Centralize the 05:00 `Asia/Jerusalem` activity-day calculation.
- Represent baseline, normal daily and uncertain multi-day precision explicitly.
- Keep failed, extra and replayed runs account-fenced and idempotent.
- Make notification-applied Started dates use the saved derived activity day while
  preserving an existing date and requiring the user's explicit action.

Checkpoint: the ledger and Started-date behavior satisfy their focused acceptance
cases. Do not build the new Activity UI or Insights in this phase.

#### Phase 1 implementation checkpoint

Local dirty-worktree checkpoint on `Dev` (no commit or deployment):

- Migration `049_add_activity_foundation.sql` adds the canonical Jerusalem 05:00
  database day helper, explicit `baseline`/`daily`/`uncertain` precision,
  observation-time provenance, saved activity days, counter-rebaseline diagnostics
  and a durable first-play activity day.
- Existing cumulative totals and rows are retained; saved deltas are unchanged
  except that a zero delta is corrected for an app provably absent from the
  preceding complete account observation. A row's boundary is
  corrected to its job's saved `snapshotObservedAt` only when that evidence has the
  generated ISO shape. Rows without it keep their finalization timestamp and become
  uncertain. Interval links are rebuilt only within the same saved account and
  provider identity. The migration neither resets the ledger nor manufactures a
  production backfill.
- Initial collection remains a zero-delta baseline. An app first observed after an
  account baseline uses the preceding complete, account-fenced observation as its
  zero evidence; an account replacement has no preceding boundary in its partition.
- New observations persist `snapshotObservedAt`; replay remains protected by the
  existing `(sync_run_id, steam_app_id)` uniqueness constraint. Failed runs never
  invoke closeout, missed activity days become uncertain, extra same-day boundaries
  remain daily, and account replacement starts a separate baseline.
- Started suggestion acceptance reads the saved derived `activityDay`, ignores a
  later client/click date, changes the date only when explicitly requested, and
  retains an existing `games.started_at` value.
- Named achievement events, Phase 2 event rules/grouping, the replacement Activity
  UI and activity Insights remain deliberately unimplemented.
- Verification at this checkpoint: 59 distinct focused Node tests pass across the
  activity-day, observation, migration, status/import and Steam play-evidence
  suites. The disposable localhost contract ran the real migration runner twice
  and verified preservation, upgrade behavior and replay idempotency. `npm run
  lint` passes with two pre-existing unused-field warnings in
  `backend/routes/games.js`. `git diff --check` passes apart from line-ending
  notices. No ordinary development or production database was migrated.

### Phase 2: Detailed activity events

- Add schema/storage for idempotent named achievement unlocks and raw provider
  timestamps, with baseline deduplication that does not announce old achievements.
- Implement first-play, reliable returned-after and added-to-library event rules.
- Combine related facts for the same game/activity day without duplicate events or
  notification groups.
- Preserve private/unavailable/failed achievement behavior and the rule that an
  achievement is never required to prove playtime.

Checkpoint: event data and notification grouping are complete through the service
and API contracts, without the final Activity feed.

#### Phase 2 implementation checkpoint

Local dirty-worktree checkpoint on `Dev`, continuing the uncommitted Phase 1
changes (no commit, publishing, deployment or ordinary/production database write):

- Migration `050_add_detailed_activity_events.sql` adds an account-fenced named
  achievement-unlock ledger, raw provider unlock timestamps, canonical activity
  days and a per-source detailed-event baseline. The owner guard covers the user,
  Steam account, source and optional Backlog game relationships.
- The first successful detailed achievement response records unlocked identities
  as baseline evidence without producing current activity or notifications. Named
  identities without a usable provider time are retained for deduplication but are
  not presented as exact events. Later exact unlocks are idempotent by Steam
  account, AppID and achievement API name.
- Achievement follow-up now covers owned and ignored Steam sources even when they
  are not linked to Backlog. Private, unavailable and failed responses retain the
  prior good counts/events and produce no invented unlocks.
- Library closeout creates replay-safe factual events for observed playtime,
  first play, added-to-library and reliable returns. Return duration is emitted
  only when the current and preceding positive-play observations are precise daily
  intervals and are at least two activity days apart; an uncertain positive
  interval suppresses the elapsed-day claim.
- Decision and factual notifications share a per-account, per-game,
  per-activity-day (or uncertain-interval) group key. One newly observed game can
  therefore carry added-to-library and first-play facts without duplicate decision
  groups. Existing explicit import/link/status actions remain unchanged.
- The existing notification surface summarizes observed duration, named unlocks
  and compact first-play/return/library facts. The Phase 3 Activity feed and the
  Phase 4 Insights aggregation remain deliberately unimplemented.
- Verification at this checkpoint: 47 focused schema/service/serialization tests
  and one disposable-Postgres detailed-activity contract pass. The contract runs
  the real migration runner twice and covers baseline suppression, a 01:30
  Jerusalem unlock, replay, grouped facts, uncertain-return suppression, a later
  reliable return, ignored/unlinked sources, private achievement behavior and
  cross-user database rejection. No ordinary development or production database
  was migrated. Focused ESLint and `git diff --check` also pass (the latter emits
  only the repository's line-ending notices). Corrected contract iterations caught
  a synthetic active-job fixture issue and a missing typed `unlockAt` field in the
  achievement metadata refresh CTE before the final pass.

### Phase 3: Activity feed

- Update the private Activity API to expose activity days, exact events, uncertain
  intervals, range summaries and coverage from the shared ledger.
- Build the Activity view with 7 days, 30 days and All ranges; daily game rows;
  compact first-play/return/library highlights; achievements; and uncertain cards.
- Hide Steam activity first observed from normal game details while retaining its
  internal provenance.
- Verify private, guest/demo, loading, empty, error and responsive states.

Checkpoint: the agreed Activity experience is usable end to end. Do not add the
aggregated Insights view in this phase.

#### Phase 3 implementation checkpoint

Local dirty-worktree checkpoint on `Dev`, continuing the uncommitted Phases 1 and
2 changes (no commit, publishing, deployment or ordinary/production database
write):

- The authenticated `GET /api/activity/play-history` contract now accepts `7d`,
  `30d` and `all` ranges. It is rejected for demo accounts and every observation,
  achievement, factual-event and coverage query is scoped to the token owner.
- The response keeps normal activity days and uncertain multi-day intervals as
  distinct feed items. Range summaries include attributable observed playtime,
  distinct games played and exact named achievements. An uncertain interval that
  crosses a selected boundary is displayed but reported separately as overlapping
  playtime instead of being silently assigned to the period.
- Coverage reports distinct reliable closeout days, missed/uncertain intervals and
  the latest successful snapshot. Named achievements use their exact provider
  activity day and are not double-counted from observation counter deltas.
- The responsive Activity view includes range controls, summary and coverage
  cards, daily game rows with cover fallbacks, first-play/return/library highlights,
  ordered achievement names with compact expansion, and dedicated loading, empty,
  error and private/demo states. Uncertain cards explain once that missed-check
  playtime was not divided into invented daily values.
- **Steam activity first observed** is no longer shown in ordinary game details;
  the underlying private provenance remains stored and available to internal
  workflows.
- Verification at this checkpoint: five focused Node service/route tests pass;
  the disposable-Postgres detailed-activity contract passes and exercises the real
  migrations, feed SQL, exact events, uncertain intervals and cross-user isolation;
  and three focused browser scenarios pass across an initial full-file run plus a
  corrected single-scenario rerun, covering loading, 7-day/30-day/All interaction,
  empty/error/demo states, highlights, collapsed achievements, uncertain wording,
  long titles and 375px overflow. The initial database run caught and corrected a
  provider-AppID alias mismatch; the initial browser run caught and corrected an
  ambiguous loading selector. Focused ESLint has no errors (existing `GameModal`
  unused-import warnings remain). `git diff --check` is recorded in the final
  checkpoint. Activity Insights and Phase 4 remain deliberately unimplemented.

### Phase 4: Activity Insights

- Build weekly, monthly, yearly and suitable all-time summaries from the same
  ledger and activity-day helper.
- Add totals, games played, achievements, most played, reliable first plays/returns,
  daily charts and recap highlights.
- Apply the metric-eligibility table consistently: uncertain playtime remains in
  eligible totals but not weekday charts, daily averages, active-day counts or
  streaks.
- Surface coverage and incomplete-period context without excessive explanation.

Checkpoint: Activity and Insights agree on totals, dates, uncertainty and range
boundaries for the documented scenarios.

#### Phase 4 implementation checkpoint

Local dirty-worktree checkpoint on `Dev`, continuing the uncommitted Phases 1–3
changes (no commit, publishing, deployment, Railway configuration or
ordinary/production database write):

- The private `GET /api/activity/insights` contract supports `week`, `month`,
  `year` and `all`. Its period boundaries are derived on the backend from the
  canonical Jerusalem activity day, and it reads the same owner-scoped
  observation, achievement, factual-event and coverage ledger queries as the
  Activity feed.
- Period totals and most-played games include reliable playtime plus uncertain
  intervals wholly contained by the selected range. Uncertain intervals crossing
  a boundary are returned as separate unallocated overlap. Their time is excluded
  from daily bars, precise active days and precise daily averages. Exact named
  achievements stay counted on their saved provider-derived activity days.
- First observed plays and returns are included only from saved precise-daily
  factual events; unreliable return durations are not reconstructed. The API
  exposes coverage sufficiency separately and does not manufacture trend, streak
  or weekday claims.
- The responsive Gaming activity page now has Activity and Insights views.
  Insights includes week/month/year/all controls, observed totals, precise active
  days, uncertainty context, most-played games, daily activity-day bars, weekly or
  period recap highlights, explicit unallocated overlap and in-progress current
  period labeling. Loading, empty, retryable error, private/demo, long-title,
  missing-cover and 375px/desktop states are covered.
- Verification at this checkpoint: 12 distinct focused Node tests pass across the
  canonical activity-day, service aggregation and authenticated route suites; the
  disposable-Postgres detailed-activity contract passes with the real migration
  runner and covers owner isolation plus the shared Activity/Insights ledger; and
  all five focused Chromium scenarios pass. The first browser run passed three
  scenarios and caught two failures: an auth-loading race could briefly request
  private activity for a demo identity, and a synthetic retryable 500 did not
  exercise the intended terminal error state. Gating reads until auth resolution
  and using a deterministic non-retryable error fixture corrected both. Focused
  ESLint reports no errors and 26 JSX-use warnings in `ActivityPage.jsx` under the
  repository's current lint configuration. `git diff --check` is recorded in the
  final handoff. Full lint, the full Node suite, a production build and the wider
  Playwright suite were not run; CI remains the full gate. No ordinary development
  or production database was migrated.
- Phase 5 release preparation remains deliberately unstarted. External cron/DST
  scheduling, exact-candidate CI, publishing, migrations outside the disposable
  contract and production verification still require separate authorization.

### Phase 5: Release preparation

- Review all acceptance and verification scenarios across the completed phases.
- Select and configure a DST-safe way to keep the production closeout near 05:00
  `Asia/Jerusalem`; Railway configuration is a separate authorized operation.
- Run the required exact-candidate CI/release process and verify production only
  when explicitly authorized.
- Confirm the first production run preserves accumulated trustworthy history and
  establishes baselines only for newly introduced detailed data.

Checkpoint: the exact approved candidate and external schedule are independently
verified; code completion alone is not production verification.

#### Phase 5 local release-preparation checkpoint

Local dirty-worktree checkpoint on `Dev` at base SHA
`5f336d02ce87d66acb67726f776e9b1a08558874` (`Dev` one commit ahead of
`origin/Dev`), continuing all uncommitted Phases 1–4 files plus the Phase 5
release corrections below. No commit was created, so there is not yet a candidate
commit SHA for remote CI. The tested dirty scope is the complete Git status at this
checkpoint: the Activity/Steam backend, migrations 049/050 and schema, Activity UI
and services, automation/release documentation, affected Node/browser contracts,
`package.json`, `scripts/sync-steam-daily.js`, and the pre-existing untracked
`work/activity-center-concept.html`. No existing tracked change or untracked
`work/` file was discarded.

Review findings and corrections:

- The Phase 1–4 acceptance matrix was reviewed against live code and tests:
  snapshot rather than finalization boundaries; canonical Jerusalem 05:00 days;
  DST transitions; baseline/replay/counter-decrease behavior; account replacement
  and owner isolation; delayed Started actions; exact named achievements and
  private/unavailable results; uncertain intervals; Activity/Insights totals and
  range-boundary agreement; current-period labeling; demo/private states; and
  375px/desktop behavior all have executable coverage.
- A fixed `02:00 UTC` Railway cron was release-blocking because it becomes 04:00
  local during Israel standard time. The selected code/configuration contract is
  Railway cron `0 2,3 * * *` plus start command
  `npm run steam:sync:daily-scheduled`. The paired UTC invocations use an
  `Asia/Jerusalem` local-hour gate, so exactly the invocation in the 05:00–05:59
  local hour proceeds; transition-day and summer/winter pairs are unit tested.
  The existing `npm run steam:sync:daily` remains ungated for deliberate manual
  operation. Railway configuration has not been changed.
- Full Node verification found that every decision event inherited a daily row's
  activity day, allowing historic play without a trustworthy zero-to-positive
  transition to set `Started`. Decision evidence now carries a date only for a
  proven first play; historic play remains undated.
- Initial lifetime-library baselines were queuing detailed achievement requests for
  almost an entire large library. Baseline rows no longer trigger that historical
  fan-out. New or changed post-baseline owned/ignored apps remain eligible, and
  each app's first successful detailed response still establishes its own named
  achievement baseline.
- A reviewed-decision contract fixture now creates a real resolved decision rather
  than an informational fact. A resumable 1,000-app fixture now includes the
  provider identity and required saved snapshot boundary. The older C.5 browser
  fixture now serves the Activity baseline response and asserts the current private
  baseline copy. An unrelated Backlog pagination assertion now permits the visible
  sentinel to load more than exactly two pages while still requiring the offset-50
  request and server-filter behavior; no Backlog product code changed.

Verification commands and results for this exact dirty scope:

- `npm run check:full` — initial gate: lint completed with 0 errors and the two
  pre-existing `backend/routes/games.js` unused-field warnings; the Node run
  reported 550 tests, 545 passed, 4 failure records and 1 cancellation. Build and
  Playwright were not reached. The failures exposed the stale inbox fixture,
  historic Started-date bug and 1,000-app achievement fan-out timeout described
  above.
- `node --test --test-concurrency=1 backend/steamExperience.contract.test.js backend/steamPlayEvidence.contract.test.js backend/steamSync.contract.test.js backend/utils/gamingActivityDay.test.js`
  — corrected inbox, Started-date and DST paths passed; 25 tests passed and the
  later synthetic resume fixture failed because it lacked required snapshot/account
  evidence.
- `node --test --test-concurrency=1 backend/steamSync.contract.test.js` — 1/1
  passed after correcting that fixture; the 1,000-app job completed in about 20s
  instead of timing out.
- `npm run build` — passed; Vite built 66 JavaScript chunks and the 512000-byte
  per-chunk budget passed. The existing stale Browserslist-data notice remains.
- `npm run test:e2e` — the first launch was blocked before tests by sandbox denial
  while Vite loaded `vite.config.js`. The approved local-only rerun executed 84
  cases: 80 passed, 3 failed and the saved-local-Postgres Wishlist case was skipped.
  The three failures were two stale Activity-adjacent C.5 expectations and one
  deterministic exact-count pagination assertion.
- `npx playwright test tests/e2e/steam-experience.spec.js tests/e2e/wishlist.regression.spec.js --project=chromium --grep "C\\.5 (desktop|mobile)|Backlog renders one server page"`
  — both corrected C.5 desktop/mobile cases passed; the unchanged pagination case
  reproduced its 120-versus-100 timing failure.
- `npx playwright test tests/e2e/wishlist.regression.spec.js --project=chromium --grep "Backlog renders one server page"`
  — 1/1 passed after the assertion correction. Across the full run and narrow
  corrected reruns, all 83 enabled browser cases passed; the one opt-in saved-data
  case remained skipped. Per verification policy, unchanged passing stages were not
  rerun merely to produce a second monolithic invocation.
- Final `git diff --check` is recorded after this checkpoint update; its only output
  is the repository's existing LF-to-CRLF working-copy notices.

Migration and external status:

- Migrations 049 and 050 ran through the real migration runner, including repeat
  execution, preservation/upgrade checks and fresh-schema contracts, only in
  disposable localhost databases created and dropped by the Node suite. No ordinary
  development or production database was migrated.
- The selected DST-safe schedule is code- and test-ready but not configured or
  externally verified. The currently documented production cron remains
  `02:00 UTC`. After authorization, set `0 2,3 * * *` and
  `npm run steam:sync:daily-scheduled`, then independently verify one executing 05:00-local
  run and one off-hour skipped run. A delay past 05:59 safely skips, and the next
  success must remain an uncertain interval rather than inventing a closeout.
- The first authorized production migration/run must confirm retained observation
  rows survive migration 049, existing detailed unlocks are baselined per source
  without notifications, and only later evidence creates detailed activity. This
  has disposable-local evidence only, not production verification.
- Still requiring explicit authorization: creating a local release commit; fetching
  and synchronizing with current `origin/main` for a release PR; pushing `Dev` or
  another branch; opening/reopening or merging a PR; running exact-candidate GitHub
  CI; changing Railway cron/start configuration; applying or inspecting production
  migrations; deploying Railway or Vercel; promoting `main`; and production API,
  frontend, schedule or first-closeout smoke verification. Any `main` promotion or
  required Railway deployment must also respect the repository's after-21:10 Israel
  free-plan window. No external release or production verification is claimed.

#### Independent Phases 1-5 remediation checkpoint (2026-09-25)

This dirty-worktree checkpoint remains based on
`5f336d02ce87d66acb67726f776e9b1a08558874`; no commit, push, deployment,
Railway change or non-disposable database migration was performed. The independent
review findings were reproduced against live code rather than accepted from the
earlier checkpoint narrative.

Implemented corrections:

- Migration 050 freezes an explicit detailed-achievement transition boundary for
  every existing Steam source. Sources created later compare each raw unlock
  timestamp with their earliest trustworthy app Activity boundary, falling back to
  the linked account boundary for a newly observed app. Unlocks at
  or before the boundary remain silent; post-boundary unlocks are exact events on
  that first response. Failed, private and unavailable responses still do not
  initialize the source. Account replacement, replay and ownership fencing remain
  part of the durable key/write guard.
- Same-game, same-activity-day notification summaries sum every saved
  `steam_played` observation in their group. The Activity ledger uses the same sum;
  replayed sync work remains protected by observation/event occurrence keys. Copy
  now calls these cumulative observations rather than exact Steam sessions.
- Activity and Insights coverage now derive expected closeouts through the current
  observation boundary. A trailing missing closeout is partial coverage even when
  no later observation exists to expose it. It is reported separately from reliable
  playtime and from range-crossing unallocated uncertainty for rolling 7/30-day,
  week, month, year and all-time reads.
- `snapshotObservedAt` is captured in the owned-games response callback immediately
  after validation, before the parallel player-summary request and processing can
  cross 05:00. The timestamp is saved once in the resumable job payload and reused
  by retries and finalization.
- The former `days=7..180` Activity request remains temporarily accepted. It
  receives the new payload plus a legacy `days` projection and a deprecation hint;
  named `range=7d|30d|all` and `/activity/insights` remain the current contracts.
- The guarded closeout command now performs its Jerusalem-hour check before an
  automation run, eligible-user query, database sync write or provider request.
  Accepted runs claim a durable per-closeout-day key, so a completed process retry
  cannot finalize the same day again.
- Migrations 049/050 were strengthened and rechecked as one disposable upgrade:
  old aggregate achievement counts do not create named events, evidence-free rows
  remain uncertain, account state is preserved, reruns are idempotent, and a
  simulated old-backend write after migration 049 forces the next comparison to
  stay uncertain without a first-play/library notification flood. Migration 050's
  new unique idempotency index is small. Migration 050 also performs a bounded
  one-time update of existing Steam sources to freeze their detail baseline, while
  migration 049 updates/classifies the retained observation ledger; both can hold
  row/table locks. Schedule the production
  application with Steam sync stopped and monitor its duration rather than treating
  the disposable runtime as a production estimate.

Production ordering remains pending and must be followed exactly when separately
authorized:

1. Prevent scheduled and user-triggered Steam Library sync during the migration /
   old-backend gap, and drain any active Library job.
2. Apply migrations 049 and 050.
3. Deploy the backward-compatible backend.
4. Deploy the frontend.
5. Configure Railway to `npm run steam:sync:daily-scheduled` and `0 2,3 * * *`.
6. Verify one rejected invocation with zero sync/API calls and one real 05:00-local
   invocation.
7. Inspect first-closeout diagnostics, especially Activity baselines/changes,
   named-unlock baselines/new unlocks and review-item counts, for a notification
   flood before declaring the transition complete.

The safest local demonstration is the existing test-only scenario set, not seeded
production/demo data. It is runnable with the focused Node contracts and
`tests/e2e/activity.spec.js`: the aggregation/helper tests cover normal and
midnight days, 05:00 edges, summer/winter and both DST transitions, new-game first
play, exact achievements, a missed closeout, counter decrease and current/trailing
incompleteness; disposable Postgres contracts cover achievement baseline/retry,
private data, replay, account replacement and the migration gap; Playwright covers
loading, empty, error, private/demo, desktop and 375px mobile states. An interactive
scenario-lab UI would duplicate these fixtures and is deliberately left as a
narrow follow-up if manual product demos become necessary.

Verification for this remediation checkpoint, at base revision
`5f336d02ce87d66acb67726f776e9b1a08558874` plus the complete dirty scope:

- Direct reproduction showed a grouped 30m + 45m notification reporting only 30m,
  stale last-snapshot coverage reporting complete, timestamp assignment after both
  provider promises, and unconditional first-fetch achievement baselining.
- The first focused Node run executed 60 tests: 58 passed and two new coverage
  assertions failed. One assertion compared a calendar week with a rolling 7-day
  window; the other fixture omitted the earlier boundary carried by its uncertain
  interval. After correcting the range-aware assertion and shared boundary
  derivation, the affected service suite passed 9/9.
- The final focused schema/route/service/helper/command/frontend-utility command
  passed 69/69 tests. A later focused checkpoint covering the completed migration,
  detailed-achievement, aggregation and command changes passed 20/20.
- The disposable migration command ran the real migration runner twice. The final
  schema plus migrations 049/050 command passed 8/8 tests; the two runner passes
  took 449ms in that small local fixture. This is correctness evidence, not a
  production lock/runtime estimate.
- Daily workflow regression contracts passed 29/29 across the 1,000-app sync,
  import/review/status/date/genre/metadata paths, Wishlist/prices, notifications,
  replacement and replay. After adding durable closeout idempotency, the affected
  Activity + daily-closeout + experience command passed 27/27.
- Focused ESLint completed with zero errors and the existing 26 JSX-use warnings in
  `ActivityPage.jsx`. No new lint warning class was introduced.
- The first Playwright attempt was blocked before test execution by the filesystem
  sandbox while Vite loaded its config. The approved local rerun passed all five
  Activity/Insights scenarios; after adding trailing-closeout copy/assertions, the
  corrected final rerun again passed 5/5 at mobile and desktop viewports.
- Final `git diff --check` passed; output contained only the repository's existing
  LF-to-CRLF working-copy notices. The untracked `work/` artifact remains present
  and unchanged.

Not run: the full Node suite, production build, complete Playwright suite,
exact-candidate remote CI, production migration timing, Railway invocations or any
production smoke check. Focused browser execution compiled the changed frontend,
but it is not a production build gate. Railway configuration, production
migrations, deployment and production verification remain explicitly pending.

Release-readiness verdict: the dirty implementation is locally ready for an
authorized candidate/CI phase, but it is **not production-release-ready** until the
ordered migration/deployment procedure, exact-candidate CI and external Railway /
first-closeout checks pass.

### Continuing across chats

The phase names and scopes above are the handoff contract. After a phase is complete,
the handoff must record its branch/SHA or dirty-file checkpoint, migrations, checks,
remaining risks and the next phase. A follow-up request should say, for example,
"Continue with Phase 2 of `docs/planning/gaming-activity.md` from the completed
Phase 1 checkpoint." The next agent must inspect the actual checkpoint and this
document rather than assuming that merely mentioning a phase proves its dependency
was completed.

## Verification scenarios

Focused implementation coverage must include:

- Snapshot time versus library-finalization time.
- Friday 23:00-Saturday 02:00 grouping and a 01:30 achievement.
- Achievement ordering without depending on an achievement every session.
- Delayed notification acceptance and preservation of an existing Started date.
- Initial baseline with pre-existing lifetime playtime.
- Failed/missed Library sync followed by recovery.
- Extra and replayed runs without duplicate deltas/events.
- Newly observed library game, including first play in the same interval.
- Steam account replacement/reconnection fencing.
- Achievement private/unavailable/failure behavior.
- Counter decrease produces no negative activity.
- Israel daylight-saving transition and the external cron configuration.

## Later improvements

- Calendar heatmaps, richer weekly/monthly/yearly recaps and comparison trends.
- Session notes, manual sessions, corrections, multiple playthroughs and per-game
  activity exclusions.
- Goals, challenges and progress recaps.
- User-configurable timezone/cutoff and retention/export controls.
- Optional detailed provenance UI when useful, without adding noise to normal cards.
