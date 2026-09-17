# Production Daily Steam Sync Audit and Next Implementation Handoff

**Date:** 2026-09-15
**Purpose:** Preserve the complete investigation context for the next chat.
**Scope:** Production read-only audit after the first Railway daily Steam run, with
follow-up recommendations for Wishlist enrichment, price refresh scheduling,
observability, and notifications.

## 1. Executive summary

The daily service is fundamentally working. It ran the three intended phases in
sequence, saved the Steam library snapshot, reconciled Wishlist membership, and
processed a bounded portion of Israel price work. The production database audit
found no evidence of duplicate price notifications, accidental data loss, or
manual RAWG selection corrupting Steam price identity.

The main problem is completeness and timing, not basic correctness:

1. A newly imported Wishlist item is immediately usable with Steam fallback data,
   but its RAWG metadata and first price observation are asynchronous. Older due
   price monitors were processed first, so the first daily run finished before the
   newly added items were reached.
2. Steam's change-feed request failed during the price phase. The safe fallback
   sweep worked, but the ten-minute/request budget intentionally deferred many
   items. This made the run partial and left some new items waiting.
3. The library phase was marked partial because achievement follow-up had
   incomplete items, even though the ownership/activity snapshot itself succeeded.
   The status is technically accurate but too coarse for users.
4. RAWG filter counts mix queued, running, unmatched, review, and incomplete
   states in ways that can look like hundreds of broken matches. The system is
   deliberately conservative about automatic matching; queued work is not the same
   as a confirmed no-match.
5. Notifications observed in production were consistent with the implemented
   grouping and deduplication rules. The missing generic “new library game” event
   in this run was expected for the specific games observed, but the product policy
   for a newly owned game that was also played still needs to be made explicit.

The recommended next implementation starts with bounded first-attempt priority
for new Wishlist items, then improves price fallback fairness and diagnostics.

## 2. Repository and release state at this handoff

The audit did not perform a commit, push, merge, deployment, migration, or live
provider call.

At the time this document was written:

- Branch: `Dev`
- Local HEAD: `ef125654db92793645cea97ca8796889f74545c8`
- Git status: `Dev...origin/Dev [behind 2]`
- The working tree had no pre-existing modified files when this handoff was
  created. This document is the new uncommitted file.
- The recent local history includes the Steam worker completion, test
  serialization, the Dev/main history merge, and the Steam price identity split.
- The production Railway service had already deployed the main-branch release
  through the GitHub pull request, and the separate daily service was configured
  and observed running. Deployment success was observed in Railway, but this
  handoff is not a replacement for exact SHA/CI/deployment verification in a
  later release task.

Important schema note: migration
`backend/migrations/041_separate_wishlist_price_identity.sql` exists as the
forward-only migration for the price identity split. The local audit did not run
the migration runner, and it did not independently verify the production
migration-history table. Do not apply, rewrite, or create another migration
without a separate database-safety/release review.

## 3. How the production audit was performed

The user explicitly authorized a read-only production database check.

- Production environment values were loaded only inside a temporary Node process.
- Secrets, connection strings, Steam IDs, user IDs, and raw production payloads
  were not printed into the handoff.
- The database session executed `BEGIN READ ONLY` and ended with `ROLLBACK`.
- No insert, update, delete, provider request, queue trigger, or application
  action was performed by the audit.
- One exploratory query used a nonexistent column, failed, and was rolled back;
  the corrected aggregate queries then succeeded. This had no production effect.
- The audit did not call Steam or RAWG and did not wait for or trigger another
  worker run.

The evidence below is therefore a snapshot of production state around the first
daily run, not a claim about every future run.

## 4. What the daily run actually did

The daily script processes each eligible account sequentially with these phases:

1. `library`
2. `wishlist`
3. `wishlist_prices`

This is implemented in
[`scripts/sync-steam-daily.js`](../../scripts/sync-steam-daily.js:24).

### 4.1 Library phase

Observed run:

- Status: `partial`
- Items seen: 750
- Changed activity records: 3
- Ownership/library snapshot: succeeded
- Activity observations saved: 750
- Achievement follow-up: incomplete for a subset of sources
- Review items created: 2
- No RAWG matching was attempted in this phase

The important distinction is that the library was not lost or skipped. The
snapshot and playtime/activity observations were persisted. The partial status
came from the more expensive achievement follow-up, where ten sources still had
incomplete/retry work. The current user-facing summary does not make this
distinction clearly enough.

### 4.2 Wishlist membership phase

Observed run:

- Status: `succeeded`
- Items seen: 448
- Membership changes: 10 added, 0 removed
- Metadata projection reported names/covers/tags for all 448 Steam Wishlist
  entries using the available Steam/catalog fallback data
- The membership baseline advanced successfully

Membership synchronization and metadata enrichment are separate. Adding a
Wishlist item enqueues RAWG work; it does not synchronously complete a RAWG match.
This behavior is documented in [`docs/AUTOMATION.md`](../../AUTOMATION.md:153).

### 4.3 Israel price phase

Observed run:

- Status: `partial`
- Total eligible targets: 448
- Processed in the run: 180
- Succeeded: 176
- Failed: 4
- Deferred: 268
- Price records changed: 28
- Provider requests: 187
- Stop reason: request/time budget
- Price mode: fallback
- Feed mode: fallback
- Feed failure code: Steam HTTP error
- Pending retry errors: 4

The service has deliberate limits of 500 items, 650 provider requests, and ten
minutes per run. These are defined in
[`backend/services/steamPriceSyncService.js`](../../backend/services/steamPriceSyncService.js:9).

The feed failed, so the service used the bounded fallback sweep rather than
trusting an incomplete delta. That is the safe behavior. It also means a run can
legitimately leave many due items for a later run. The four failures were
`steam_price_offer_uncertain`: Steam did not provide exactly one verified standard
offer for those apps. This is a safety refusal, not evidence that the database
stored a wrong price.

The price feed fallback is implemented in
[`backend/services/steamPriceFeedService.js`](../../backend/services/steamPriceFeedService.js:78),
and target selection is currently ordered primarily by `next_attempt_at` in
[`backend/services/steamPriceSyncService.js`](../../backend/services/steamPriceSyncService.js:49).

## 5. New Wishlist items: the most important confirmed gap

The ten Wishlist entries added by the membership run were correctly created with:

- a retained Steam app identity;
- an active Steam price target/monitor;
- queued RAWG metadata work;
- no price observation yet;
- no price error.

They did **not** have RAWG metadata or a current price immediately afterward.
That is expected under the asynchronous design, but the scheduler behavior made
the delay longer than users reasonably expect: older due monitors were selected
first and the price budget ended before the new entries were attempted.

This explains the new Wishlist card showing “Price not checked / Waiting for a
price refresh.” It does not mean the Steam app ID was lost or the item was
created incorrectly.

The metadata side showed the same pattern: new entries were `queued`, not
confirmed unmatched. The background metadata worker had one running item and
many queued items, while the page-level **Refresh all queued** action processes
additional batches of ten.

### Recommended correction

When a new Wishlist item is inserted or first observed:

1. Keep membership, Steam identity, and local intention separate.
2. Enqueue RAWG metadata immediately, preserving the existing worker lease/retry
   rules.
3. Give the item a bounded first-attempt priority for price and metadata, or
   reserve a small first-attempt quota in the next price run.
4. Do not bypass provider pacing, offer verification, retry delays, or run budgets.
5. Expose “queued,” “attempted,” “waiting for retry,” “unmatched,” and “price not
   checked” distinctly in the UI.
6. Add a regression proving that new items are not starved behind an old due
   backlog, while still proving the run remains bounded.

An acceptable first version does not need to guarantee a completed RAWG match or
price for every new item in one run. It should guarantee a fair, observable first
attempt within a bounded follow-up window.

## 6. RAWG matching findings

The app intentionally does not fuzzy-link uncertain RAWG results. Safe automatic
linking requires an exact Steam/catalog identity or one unambiguous normalized
title match. Ambiguous and genuinely unmatched items remain unresolved, with
Steam fallback fields kept usable.

The production UI count for the “No RAWG match” filter was not a clean count of
confirmed no-match items. The audited projection was approximately:

- linked: 181
- missing/unresolved: 263
- review: 3
- incomplete: 1

The underlying work queue had a slightly different breakdown because work status,
identity status, and catalog projection are separate views. The meaningful
conclusion is that queued/running items and confirmed unmatched/review items were
being presented too similarly. A count such as 263 should not be interpreted as
263 titles that the user must manually match one by one.

### What the user should do today

For the initial backlog of existing games, **Refresh all queued** is the intended
bulk recovery action. It repeatedly invokes bounded batches of ten while the page
is open. The background worker also processes a small number of due items per
tick. This should be allowed to drain queued work before manually matching
anything.

Do not expect this action to resolve genuinely ambiguous titles. Those should
remain in review for an explicit user choice. Do not add fuzzy matching merely to
make the count smaller.

### Recommended RAWG improvements

- Split the filter/UI into `queued`, `running`, `linked`, `review`, `unmatched`,
  `incomplete`, and `failed/retry scheduled`.
- Show a reason and next-attempt time for unresolved items.
- Make bulk feedback report counts by outcome, not only a generic “refreshed.”
- Preserve the manual chooser as a separate user-control feature.
- Keep duplicate-match prevention and save-time race protection.
- Add tests proving a queued new item is not mislabeled as confirmed unmatched.

The relevant frontend projection is
[`src/utils/filterOptions.js`](../../src/utils/filterOptions.js:16), the Wishlist
bulk action is in
[`src/pages/WishlistPage.jsx`](../../src/pages/WishlistPage.jsx:213), and the
worker contract is in
[`backend/services/wishlistMetadataService.js`](../../backend/services/wishlistMetadataService.js:299).

## 7. Steam price identity and manual RAWG selection

This area is working as intended after the Phase 2 implementation.

Steam price identity is now derived from retained Steam Wishlist membership and
the Steam app identity. A manual RAWG/catalog selection changes only the catalog
link. It must not add, replace, or make a local/inactive Steam price identity
ambiguous.

The focused regression covers an inactive/local Wishlist item and verifies that a
manual RAWG selection preserves:

- Steam Wishlist membership and app identity;
- price monitor and price history;
- Library source/playtime;
- activity records;
- game status and dates;
- play history.

Do not merge this identity back into ordinary catalog identity. The likely future
regression risk is an interaction between Steam Wishlist removal/history, a manual
RAWG link, and price monitor activation. Any follow-up must preserve the separate
identities and current-account fencing.

## 8. Steam library notifications

The run produced two relevant library decisions:

- one **Started on Steam** event for a game that already existed in the local
  catalog/backlog and had newly observed play activity;
- one **Move to Playing?** status suggestion for an existing Plan to Play game
  with playtime.

There was no generic **New game on Steam** event in this run. The apparent new
play event was for a game already imported earlier, so it was not a newly detected
ownership event. The current implementation branches as follows in
[`backend/services/steamLibrarySyncService.js`](../../backend/services/steamLibrarySyncService.js:654):

- unlinked + newly owned + playtime: `steam_started_playing`;
- unlinked + newly owned + no playtime: `steam_new_game`;
- existing linked game + playtime + stale personal status:
  `steam_status_suggestion`;
- existing linked game + new play evidence: `steam_started_playing` when the
  evidence qualifies.

This is not currently confirmed as a bug. It is a product decision still worth
making explicit: should a newly owned game with playtime produce both a new
ownership decision and a started-playing decision, or one grouped acquisition
decision? The notification design currently groups acquisition/start decisions
for one Steam app conservatively.

### Why Steam Review can show a game that has no notification

Steam Review and the notification inbox are not the same queue:

- Steam Review reads durable `steam_import_candidates` rows. A pending candidate
  remains there until the user imports, ignores, or otherwise resolves it.
- Notifications read open `user_activity_events` rows. A candidate can exist
  without an open activity event.

The most common explanation is the first successful library baseline. During a
baseline, the service is intentionally allowed to create import candidates
without creating hundreds of “new game” decisions for the user's entire Steam
library. Those candidates then remain visible in Steam Review, but they do not
retroactively become notifications.

There are other possible explanations:

- the candidate was created by an earlier run and is still pending;
- the candidate was only carried through the durable follow-up queue;
- the app is already linked to a Backlog game, so an add-to-Backlog notification
  is not appropriate;
- the event was already dismissed/resolved or deduplicated;
- or the game was genuinely new after a completed baseline and the event was
  incorrectly missed.

For the production run audited on 2026-09-15, the library summary reported
`baseline=false`. Therefore “it was the first run” is a valid explanation only if
the specific screenshot candidates were created before that audited run or came
from an earlier baseline. It cannot explain a candidate that was first observed
as newly owned during that run.

The exact diagnosis requires a read-only comparison for each affected app between
the candidate's `created_at`, the owned Steam source's observation/sync run, and
the current account's `user_activity_events` rows. This comparison was not run
for the screenshot items, so the specific cause is not yet proven.

Regardless of the historical cause, the desired product contract is clear: a
candidate that is genuinely newly observed after a successful baseline should
have one actionable `steam_new_game` notification. First-baseline candidates and
older unresolved candidates may remain Steam Review-only, but the UI should make
that distinction visible instead of making users wonder whether an alert was
lost.

The current account/activity fencing and acquisition grouping should be retained.
The grouping key is implemented in
[`backend/services/activityInboxService.js`](../../backend/services/activityInboxService.js:80),
and user-facing labels are in
[`src/features/notifications/notificationGroups.js`](../../src/features/notifications/notificationGroups.js:5).

## 9. Notifications and price transitions

The observed notification panel was consistent with the database:

- 1 started-playing library event;
- 1 status suggestion;
- 10 Wishlist-added events;
- 17 price-drop events;
- 17 sale-started events;
- 11 price-increase events;
- 11 sale-ended events.

The UI grouping displayed these across Wishlist price/sale and other-update
sections. The counts were not evidence of duplicate processing. A read-only
occurrence-key check found no duplicate price occurrence keys, and the event
groups were resolved/open in the expected ways.

The “sale ended” and “price increased” notifications are useful but noisy. A
future product pass can decide whether they should remain separate, be grouped
more aggressively, or be preference-controlled. That is separate from the
correctness of the current event creation and deduplication.

## 10. What happens while the daily job is running

The service runs in the background; leaving the page does not cancel it. The app
can still be viewed and ordinary backlog/Wishlist actions generally remain
available. The integration UI disables or changes controls related to the active
sync phase, and cancellation is exposed for the running update.

The job is not a global application lock. The important concurrency boundaries are
the account/job leases and the individual metadata/price work leases. A later
implementation should continue to prevent duplicate same-account work without
making the entire application read-only. This behavior was inferred from the
service/UI flow and should receive a focused browser/API regression if it is
changed.

## 11. Logging and observability gap

The Railway deploy logs showed only the npm warning, script name, and “Starting
Container” before the long-running job. The final summary line was useful:

```text
Steam daily sync: eligible=1 library={"succeeded":0,"partial":1,"failed":0,"skipped":0} wishlist={"succeeded":1,"partial":0,"failed":0,"skipped":0} prices={"succeeded":0,"partial":1,"failed":0,"skipped":0}
```

But the service did not emit enough phase progress to answer quickly:

- which account/user was being processed, in redacted form;
- when each phase started and finished;
- current item/cursor and provider request counts;
- feed mode and feed error;
- deferred count and next scheduled retry;
- achievement partial details;
- price offer-uncertain count;
- metadata queue drain state;
- total elapsed time per phase.

Add structured, non-secret logs at phase boundaries and bounded progress points.
Avoid titles, Steam IDs, tokens, database URLs, or complete provider payloads.
The final line should remain compact and machine-searchable. Consider a run ID and
account ID hash/redaction so one run can be traced without exposing identity.

## 12. Recommended implementation order for the next chat

### Step 1 — New Wishlist first-attempt fairness

Inspect the Wishlist membership insertion and price monitor scheduling path. Add a
small explicit priority/age signal for newly observed items. Ensure:

- new items get a price monitor and metadata work row exactly once;
- first attempts cannot be starved by a large old due backlog;
- retry/backoff items are not accidentally promoted ahead of safety rules;
- the run remains bounded by requests and time;
- a deferred item remains due for a later run;
- the response/UI distinguishes “not attempted yet” from “no verified offer.”

Likely files: `backend/services/steamWishlistService.js`,
`backend/services/steamPriceSyncService.js`, relevant migrations/schema only if
there is no safe existing column, and focused price/Wishlist contract tests.

### Step 2 — RAWG queue presentation and new-item follow-up

Do not change safe matching policy. Improve visibility and fairness:

- keep queued/running separate from unmatched/review;
- ensure newly added items receive a bounded worker attempt;
- expose retry scheduling and outcome categories;
- test that manual selection cannot be overwritten by a late worker;
- test that a queued item is not classified as a confirmed no-match.

Likely files: `backend/services/wishlistMetadataService.js`,
`src/utils/filterOptions.js`, `src/pages/WishlistPage.jsx`, Wishlist presentation
components, and existing metadata tests.

### Step 3 — Price feed fallback fairness

Keep the fallback because it protects against feed failure. Improve it so repeated
feed failures do not create an opaque rotating sweep:

- record feed failure mode clearly;
- prioritize unobserved/new targets within a bounded reserved slice;
- preserve due/retry ordering for the remaining slice;
- retain periodic reconciliation for all eligible targets;
- surface deferred and retry counts in Settings/Wishlist diagnostics;
- add regression coverage for 448 targets, a failed feed, a 180-item effective
  budget, and a new target near the end of the queue.

### Step 4 — Phase-specific status and logs

Split “partial” into a user-readable phase summary, for example:

- library snapshot: complete;
- play/activity observations: complete;
- achievements: partial, retry scheduled;
- Wishlist membership: complete;
- prices: partial, 268 deferred and 4 offer-verification failures.

Add structured logs at the same boundaries. Do not log raw provider responses or
secrets.

### Step 5 — Notification policy decision

Decide whether a newly owned-and-played title should show one grouped acquisition
decision or separate “new ownership” and “started playing” decisions. Then add a
contract/browser regression for that exact policy. Preserve current account
fencing and dedupe keys.

Also verify the candidate/event bridge:

- a new post-baseline candidate creates an open notification;
- a baseline candidate remains reviewable without a fabricated alert;
- an unresolved older candidate is labeled as review backlog rather than a
  missing notification;
- notification add/dismiss actions update the durable candidate and event
  consistently.

### Step 6 — Final review and release preparation

After implementation:

1. inspect the combined dirty diff, especially the price identity split and
   Wishlist membership/removal interactions;
2. run focused backend/frontend tests for each changed boundary;
3. run the relevant lint/build checks once at the final checkpoint;
4. verify migration requirements against a disposable localhost database if a
   schema change was introduced;
5. only then prepare a separate release handoff for commit, Dev push, PR/main,
   Railway, and Vercel verification.

## 13. Tests and prior verification evidence

The dirty implementation had already received focused verification in the earlier
phase handoffs:

- Steam play-date, sync, Steam service, library, activity, Wishlist, and play
  evidence tests: 59 passed in the Phase 1 checkpoint.
- Wishlist metadata worker focused tests: 13 distinct tests covered leases,
  manual selection fencing, retries, fresh catalog reuse, and long provider
  requests.
- Price identity regression: manual RAWG selection preserved an inactive/local
  Steam price identity.
- Library candidate follow-up contract: covered a 251-item carry-over,
  interruption/retry, pending identity retry, and current-account fencing.
- Wishlist RAWG state/batch presentation tests: 20 game-list tests and 4 Wishlist
  presentation tests passed in the relevant checkpoint.
- Duplicate-match route/presentation tests: 21 passed.
- Focused ESLint checks passed; existing JSX unused-import warnings remained.
- Relevant builds passed, including bundle budget checks; Browserslist emitted an
  existing stale-data notice.
- `git diff --check` passed at the checkpoints.

Not performed as part of those checkpoints or this audit:

- full suite/build against the exact eventual release candidate;
- migration runner against production;
- live Steam or RAWG calls from local tests;
- fresh production browser smoke coverage for the new daily service;
- a second production daily run after the observed partial run.

Do not describe focused tests as full release verification. Use mocked providers
and disposable local databases for new tests.

## 14. Open questions for the next implementation chat

1. Should new Wishlist items receive a reserved first-price-attempt slot in the
   next daily run, or should there be a separate short follow-up worker?
2. Should the UI show a single “RAWG pending” count or separate queued/running and
   confirmed unresolved counts? The recommendation is separate counts.
3. Should the scheduled job retry the price feed in the same run, or record the
   failure and rely on the next scheduled run? Retrying must respect the current
   request/time budget.
4. Should newly owned and already-played games produce one acquisition decision or
   two notifications?
5. What is the acceptable freshness SLA for a new Wishlist price and RAWG data?
   This determines whether bounded first-attempt priority is sufficient.
6. For Steam import candidates, should the UI explicitly label “baseline/older
   review candidate” versus “new notification decision” so the two queues are not
   confused?

## 15. Guardrails for the next chat

- Read `AGENTS.md`, `docs/SYSTEM_CONTEXT.md`, this handoff, and the directly
  relevant skill before editing.
- Run `git status --short --branch` first and preserve all existing changes.
- Do not use `.env.production.local` in ordinary tests.
- Do not call Steam or RAWG live from local implementation/tests.
- Do not run migrations, commit, push, merge, deploy, or trigger production work
  unless the user explicitly authorizes that release step.
- Do not solve RAWG count confusion with unsafe fuzzy matching.
- Do not make manual RAWG selection the source of Steam price identity.
- Do not turn a partial provider run into a successful run by hiding deferred or
  uncertain items.

## 16. Suggested opening prompt for the next chat

> Read `AGENTS.md`, `docs/SYSTEM_CONTEXT.md`,
> `docs/daily_sync__wishlist_and_loaded/production-daily-sync-audit-and-next-implementation-handoff.md`,
> and the relevant Steam/review skill. Preserve the current worktree. Implement
> Step 1 only: first perform a read-only candidate/event comparison for the
> missing Steam notifications. Then implement the smallest fix needed so a
> genuinely new post-baseline candidate gets an actionable notification, while
> baseline/older candidates remain safely reviewable. Add focused regression
> tests, run only the narrow checks needed, and stop for review before any commit
> or push. After that, continue with bounded Wishlist price/RAWG first attempts
> without changing safe identity matching or provider limits.
