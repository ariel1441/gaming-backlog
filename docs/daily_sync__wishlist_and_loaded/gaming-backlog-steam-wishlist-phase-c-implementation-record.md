# Phase C: Steam Wishlist prices

## Additional Phase C offer hardening, 2026-09-08

Follow-up to local commit `86a8539`, authorized before moving to C.5. The previously
reported 19 errors below are historical; the live adapter probe now resolves 15:
14 verified ILS prices and one successful unreleased/no-price state. This probe
made no account sync or local observation writes. Saved coverage remains the last
DB snapshot until the user runs Refresh prices; 426/430 observed is the expected
result if those responses remain unchanged, not a measured saved-data count.

Changes:

- Ten reviewed label exceptions require exact AppID, package ID and normalized
  offer label. Package response name, target AppID/name and monetary checks still
  apply. No broad fuzzy matching or automatic acceptance of new package IDs.
- A base-game package may include additional AppIDs only when Steam's successful
  IL appdetails response identifies the exact base game and lists every extra as
  its DLC. Other games, unverified extras and duplicate IDs remain rejected.
- Standalone type-4 DLC may use its own exact single-AppID package, reporting zero
  included base games. DLC plus base-game packages remain rejected. Coming-soon DLC
  without an offer is a successful unreleased observation with null money, not zero.
- Additional relationship requests use the existing timeout/size bounds, pacing,
  request budget, retries and lease callback. Failure preserves saved baselines.
  Normalizer version remains 1: monetary and comparison semantics are unchanged;
  newly accepted offers establish their first baseline without events.
- Unsupported-type UI copy now describes unsupported content without claiming all
  DLC is excluded. No layout, schema, scheduler or notification behavior changed.

Read-only public adapter verification returned valid ILS prices for all ten label
cases, AOE2 DE, Sea of Stars, Cuphead DLC and Outer Wilds DLC. Witcher Songs of the
Past returned unreleased. MGS1, Path of Exile 2, Resident Evil 5 and South of Midnight
remain offer-uncertain as planned; their regional multi-game/supporter/edition
contracts are not silently expanded. Repeated retries still do not solve these
four; clearer aggregate classification remains a C.5 concern.

Verification: `NODE_ENV=test node --test backend/services/steamPriceProvider.test.js
backend/steamPrices.contract.test.js src/utils/steamPrice.test.js` passed 32 tests,
zero failures/skips. Covers prior working price cases, all ten reviewed aliases,
changed package/edition rejection, unrelated extras, DLC, ILS consistency and the
extra request's budget callback, plus durable history and account fencing.
`git diff --check` passed. Existing desktop/mobile layout checks were not repeated
for a text-only UI adjustment. Full CI and production rollout remain pending.

## Local closeout and remaining errors, 2026-09-07

Phase C is a locally implemented and focused-tested checkpoint, not a production
release or a claim of complete Steam offer coverage. The user's recovery run took
5 minutes 19 seconds, made 213 provider requests, saved 213 additional observations,
and ended with 411/430 monitored items observed, zero unchecked and 19 failures.
No rate limit occurred in this run. Eight local intentions remain identity-unresolved.
The 198 earlier observations were retained. No further sync or data repair was
performed during this closeout inspection.

Read-only localhost inspection and public IL StoreBrowse/package probes identified:

| Count | Failure | Evidence / remaining work |
| --- | --- | --- |
| 10 | Offer label mismatch | Apocalypse Party (2351560), ASTLIBRA (1718570), Refactor (1664670): localized labels; Bo (1614440), LISA (335670), Nordic Ashes (2068280), Swordhaven (2108180), Vampire Crawlers (3265700): shortened labels; The Relic (2827820): extra “The”; MGS2 (2131640): NA&EU suffix. These need identity-backed offer validation; matching names alone is too restrictive, but blindly accepting any package is unsafe. |
| 4 | Offer contents/edition uncertain | MGS1 (2131630) advertises two games in its regional package; Path of Exile 2 (2694490) offers supporter packs; Resident Evil 5 (21690) offers Gold Edition; South of Midnight (1934570) offers Weaver's Edition. Defining acceptable replacement editions/contents requires explicit scope and evidence. |
| 2 | Package mismatch | AOE2 DE (813780), package 248721, contains the base game plus three DLC AppIDs; Sea of Stars (1244090), package 431745, contains base plus DLC 3457510. Current exact-one-AppID guard rejects both, despite StoreBrowse reporting one game. This is an adapter limitation, not a transient provider outage. |
| 3 | Unsupported listing type | Cuphead DLC (1117850), Outer Wilds DLC (1622100), Witcher Songs of the Past (5006530) are Steam type 4. The last also reports coming soon. C deliberately prices standalone games only. |

These counts total 19: 14 offer-uncertain, two package-mismatch, three unsupported.
The public checks did not verify package contents for all ten label mismatches;
they are candidates for safe adapter improvement, not confirmed acceptable offers.
No permissive matching change was made to force coverage to 100%.

Known operational limitation: deterministic unsupported/verification failures are
currently stored as retries and keep the aggregate run partial. C.5 should distinguish
temporary retry, unsupported content and offer verification needed, and show useful
coverage without implying that waiting fixes every failure. Backend offer expansion
should remain a separately bounded follow-up with provider fixtures and tests.

Next conversation: [C.5 handoff](gaming-backlog-steam-phase-c5-handoff.md).
Full CI, independent review, production migration/rollout and daily scheduling are
pending. Earlier passing tests were not repeated for this documentation closeout;
only `git diff --check` was run. Existing uncommitted Phase C work was preserved and
included in the authorized local commit; no unrelated changes were identified.

## Development retry adjustment, 2026-09-07

At the user's request, explicit `NODE_ENV=development` now starts price failure
backoff at one minute (doubling on repeated item failures, capped at 32 minutes).
Production/test retain the six-hour starting delay. Explicit provider Retry-After
still takes precedence when longer; request pacing and request budgets remain.
Unexpected job failures use the same environment-aware delay.

Cleared the existing localhost account cooldown once and made its 26 failed
monitors due for testing. All 198 observations and comparison pointers were
preserved; successful items keep their daily due dates. No live sync was triggered.
The old run did not record Retry-After, so its original provider wait is unknown.
This local reset does not establish a production cooldown policy.

Focused price contracts passed: 15 tests, zero failures/skips, including development
cooldown, explicit provider wait, repeated refresh suppression and recovery.
Environment check confirmed development/localhost. No schema or UI changes.

## First real-run follow-up, 2026-09-07

The first real local price run saved 198 observations, rejected 25 uncertain offers,
then received a rate limit after 213 requests in about a minute. It retained 206
unattempted items. The original toast and last-complete timestamp obscured that
partial success. Eight additional local intentions have no resolved Steam identity.

Follow-up changes add 1.5-second request pacing shared by price jobs in a worker,
including retries; explicit refreshed/failed/deferred toast counts; collection
coverage and latest saved observation time; and cooldown/recovery instructions.
Repeated refresh during cooldown now preserves the deferred count and makes no
provider calls. Run summaries retain error counts and up to 12 diagnostic examples.
The existing six-hour account cooldown is respected, not cleared by the patch.

Read-only public checks corroborated five rejected packages: Tyranny Standard
Edition, The Division, Battle Chef Brigade, Blade & Sorcery and Bad North. Exact
AppIDs and package contents matched; labels differed through trademarks, standard
suffixes, renamed editions or ampersands. The adapter now handles these cases,
accent differences and Full Version/Standard labels while preserving package
contents, ILS and monetary cross-checks. If Steam's best offer is a bundle, exactly
one separately listed matching standard package may be considered. Ambiguous
alternatives, partial editions, localized unmatched labels and DLC remain rejected.
This does not claim all 25 rejected items now have valid prices.

Focused follow-up tests passed (28 initially, then narrower affected checks for
additional offer handling), as did desktop/mobile Playwright checks of updated
feedback. No production changes or metadata repairs were made. The saved local
price history was not replaced or force-refreshed through the active cooldown.

## Original implementation checkpoint

Local implementation completed 2026-09-07. Changes are uncommitted on
`fix/steam-candidate-account-isolation`, based on `389477a`. Earlier A/B commits
remain ancestors. CI, release and production scheduling remain separate.

## Implemented scope

- Independent `wishlist_prices` jobs reuse the existing durable Steam queue,
  run records, account identity, claim tokens, cancellation and opt-in checks.
  One active Steam job per user remains the concurrency rule.
- Daily orchestration attempts Library, membership and prices independently.
  Pricing never advances Library or membership baselines.
- Active current Steam memberships and retained local intentions with an exact
  saved Steam identity qualify. Removed memberships without local intent do not.
  Current-connection ownership, including ignored owned sources, stops monitoring.
  Backlog status and retained candidate telemetry do not prove ownership.
- Disconnect pauses monitors and retains history. Reconnection and resumed
  monitoring establish new comparison baselines. Pricing neither retires local
  intentions nor creates or changes ordinary Backlog games.
- Migration 033 adds monitors, observations, permanent factual-event identity,
  domain health and an eligibility view. Fresh schema includes the same migration.
  Migrations 030–032 are unchanged.
- Successful observations append to history, including unchanged prices.
  Observation, comparison pointer, events and checkpoint commit atomically.
  Failures retain the successful baseline. Valid unavailability closes comparison
  while retaining historical money. Changed offers, currencies, normalization
  versions and monitoring epochs start a baseline without change-event floods.

## Provider contract and limits

Public read-only probes confirmed Israel/US currency separation, discounted and
undiscounted package fields, free games, package identity and item-level failure.
Portal 2 returned package 7877 with ILS amounts; a cheaper unrelated offer showed
why minimum-price selection is unsafe. Bodycam and Sons Of The Forest confirmed
discounted field shapes. Probe values are dated evidence, not current quotations.

StoreBrowse requests explicitly use IL. Paid offers are corroborated through
`packagedetails?cc=il`: package identity, one-game contents, name, currency and
amounts must agree. Money is integer agorot. Bundles, upgrades, ambiguous offers
and inconsistent responses fail conservatively. Missing money is not zero;
generic failure is not regional unavailability. Discount display flags are
respected; free-to-play differs from temporarily discounted-to-zero offers.
Existing US-context Wishlist metadata is not used for pricing. Restricted and
unreleased states have fixtures but were not independently verified live.

Bounds: 20 AppIDs per batch, 500 due monitors and 650 requests including retries
per job, a 10-minute request-start deadline, 10-second request timeout, 2 MiB
response cap and three attempts per request. Retry-After is respected; long waits
become durable account cooldowns. Item failures back off from six hours to seven
days; successes become due after 24 hours. Budget-deferred work stays due.
Manual recovery respects freshness/backoff. No scheduler was configured.

## Small shared event contract

Existing decision behavior remains. New price facts use `event_kind = fact`,
source `steam_prices`, permanent `occurrence_key`, a versioned payload and a
transition `groupKey`. Facts are non-open, so they do not become Library review
tasks. Dismissal cannot permit replay. Notification delivery/read policy is later.

Payloads retain account/monitoring epoch, previous/current observation IDs, offer,
country/currency, before/after amounts and actual observation interval. Event
types are price drop/increase and sale started/ended. Related types share a group
key. Observations never claim exact sale-start or purchase timestamps.

## API and presentation

- `POST /api/wishlist/prices/sync` returns the existing asynchronous job contract.
  Owner-scoped Steam polling and cancellation endpoints are reused.
- Wishlist reads are database-only, with `steamPrice` and `priceRevision`.
  Pagination rejects mixed membership/price revisions.
- Cards, compact cards, rows, desktop table and details show Israel prices,
  verified discounts, observation time and stale/error states. Historical money
  stays explicitly last-known. Backlog projections carry private metadata while
  preserving deduplication and read-only permissions; public serializers are unchanged.

## Verification

- Environment check confirmed localhost. Local migration command applied only 033.
- Focused Node checks covered provider, price PostgreSQL contracts, daily runner,
  presentation/pagination and affected A/B account/Wishlist/fencing behavior.
  Initially 74 passed, with three failures counting the parent contract. The two
  underlying test issues were a timezone-dependent literal and the disconnect
  mock missing the new monitor update. Fixed; targeted rerun passed 14 tests with
  no failures/skips. Existing passing checks were not rerun unchanged.
- PostgreSQL checks cover baseline suppression, unchanged history, replay after
  dismissal, transactional rollback, partial failures/retries, ownership/local
  intent, cancellation, opt-out, replacement, reclaimed leases, committed chunks,
  501-item budgets, owner guards and idempotent migration reapplication.
- Desktop and mobile Playwright checks passed with mocked API data. Screenshots
  were inspected. Mobile uses the existing Filters and view disclosure. All view
  modes, freshness, recovery and Backlog projections were exercised.
- Final provider retry handling was rechecked separately. `git diff --check`
  passed. Full lint/build/test CI and production verification remain release gates.
  No real saved-library sync, commit, push, merge or deployment was performed.

## Later scope

C.5 remains a separately scoped daily-experience planning label. Inbox/grouped
notifications, richer sync controls, quiet refresh/provider catch-up, status or
acquisition automation and general activity observations remain outside C.
Loaded is master Phase D, Fanatical E, remaining notifications/deal polish F.
No master phases were renumbered. Price sorting and history charts are deferred.
