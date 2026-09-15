# Automatic jobs and refresh behavior

Code traced 2026-09-11 at `716cb5b`. This describes implementation, not verified
production operation. No scheduler, account preference or data was changed.

## Four different clocks

1. A trigger creates work: a button, external command, or backend timer.
2. A worker processes queued work, often in batches.
3. A due time makes an item eligible; it does not launch work at that exact time.
4. Browser polling reads saved results so an open page catches up.

Backend timers operate while the backend process runs. Restarting it restarts its
clocks; they are not wall-clock appointments. Closing a browser does not stop
backend jobs. Stopping the backend stops its in-process timers.

## Observed local configuration

`npm run env:check` loaded development configuration with localhost Postgres.
`METADATA_REFRESH_ENABLED` and `CATALOG_AUTO_SEED` are unset: both default off.
Metadata budget/interval overrides are unset. Demo is enabled, with guest lifetime
configured as 36 hours. No secrets are recorded here.

This describes the environment loaded by that command, not an already-running
process, saved Steam account opt-in, Windows scheduled tasks, Railway settings, or
successful job history. No external daily trigger was verified. The repository
GitHub workflow search found no scheduled Steam trigger.

## Steam daily command

[sync-steam-daily.js](../scripts/sync-steam-daily.js) implements
`npm run steam:sync:daily`. An external scheduler must invoke it at the desired
time. The Settings toggle makes connected, non-guest accounts eligible; it does
not install that scheduler. The command implements no preferred morning/timezone.

For each eligible account it runs these stages sequentially:

1. **Library:** fetch ownership/playtime, compare against saved sources, process
   new/changed games and matching/review work, then eligible achievement follow-ups.
2. **Wishlist:** reconcile membership and metadata, preserving removal history
   and separate local intentions. Empty-response protection guards mass removal.
3. **Prices:** scan Steam's public Store change feed, intersect changed AppIDs
   with exact eligible Wishlist identities, confirm matching Israel offers, and
   persist observations/events. New/unobserved, retrying, and periodic audit
   work remains bounded. Errors, unavailable offers and ambiguous identities
   are distinct outcomes.

A failed stage is recorded and later stages/accounts can continue. The command
can process jobs itself and needs no browser. Separately, the running backend
checks queued Steam jobs at startup and every 15 seconds. That timer drains work;
it does not create a fresh daily sync every 15 seconds.

Library has a 15-minute cooldown. The command does not enforce one run per calendar
day. Wishlist does not share that library cooldown; prices have separate due times.

Achievements store summary counts, percentages and availability/status, primarily
for eligible linked Backlog games. Changed activity marks follow-up work; later
library runs also select due pending work. Attempts normally have a six-hour minimum
spacing; failures back off up to seven days. Becoming due does not launch a new
library run. This is not a six-hour refresh of every game's achievements.

Scheduled successful price observations normally become eligible again after a
three-day safety audit; a global Store change signal can select them sooner.
New/never-observed entries and retry failures remain due immediately or follow
the existing backoff. The feed cursor advances only after complete pagination,
and a short replay overlap plus a retained change ledger prevents page/clock
boundary gaps. A feed failure keeps the last cursor and uses the bounded audit
fallback. Price runs are bounded by 500 items, 650 provider requests and a
ten-minute request budget. Deferred work awaits another run. Failure backoff
starts at six hours in production, or one minute in explicit development mode.
Provider Retry-After can extend it. These limits do not guarantee full Wishlist
price coverage every day.

Steam updates private source facts and review/notification evidence. It does not
silently change personal status/dates or blindly import the whole library. Current
source totals and review records are not a complete daily play ledger. Gaming
Activity requires new observations and individual achievement history; old totals
cannot recover missing calendar days.

Sources: [library/jobs](../backend/services/steamLibrarySyncService.js),
[achievements](../backend/services/steamService.js),
[Wishlist](../backend/services/steamWishlistService.js),
[prices](../backend/services/steamPriceSyncService.js).

## Metadata repair: user-started work

Settings > Game metadata starts repair for incomplete Backlog metadata. Exact
identities can be linked; uncertain matches need review. This resolves matching
and completeness rather than performing daily Steam updates.

The backend worker checks at startup and every five seconds, processing up to
three items per batch. Default provider budget is 40 per job. An idle worker does
not continually fetch the library from RAWG. Controls:
`METADATA_REPAIR_INTERVAL_MS`, `METADATA_REPAIR_PROVIDER_BUDGET`.

Source: [metadataRepairService.js](../backend/services/metadataRepairService.js).

## Metadata refresh: automatic RAWG maintenance

Defaults off. `METADATA_REFRESH_ENABLED=true` starts a pass at backend startup,
then hourly by default. Each tick creates/reuses a job and processes **two games**.
Default job limits are 25 items and 25 counted provider requests. That is not 25
games each hour: a continuously running single process normally handles at most
two games per hourly tick.

Eligibility: non-retired catalog entry, RAWG identity, referenced by at least one
Backlog game or active/local Wishlist membership, and incomplete metadata or
missing/due refresh time. Shared catalog entries are refreshed once for the
catalog rather than separately for each user's copy. Wishlist item identity
matching is handled by the separate durable Wishlist queue below.

Refresh forces RAWG ingestion for fields such as artwork, description, release
date, provider ratings, provider genres, stores and tags. Personal genres, scores,
statuses and dates remain separate. This does not update Steam hours or the HLTB
dataset.

After success, the next eligibility time follows the release date:

| Game | Next eligible refresh |
| --- | --- |
| Unreleased | 7 days |
| Released within 180 days | 21 days |
| Older release | 120 days |
| Unknown/invalid release date | 30 days |

These are eligibility intervals, not guaranteed completion times. Backlog size,
uptime and errors affect actual freshness. Failure retry timing starts at six
hours and grows to seven days.

Code caveat to investigate: incomplete metadata qualifies independently of its
saved due time. An incomplete failed entry can therefore be selected before its
retry time. This is a code-path observation, not a reproduced production failure.

Controls: `METADATA_REFRESH_ENABLED`, `METADATA_REFRESH_INTERVAL_MS`,
`METADATA_REFRESH_MAX_ITEMS`, `METADATA_REFRESH_PROVIDER_BUDGET`. Batch size two is
a code default, not an exposed environment setting in this scheduler.

Sources: [refresh](../backend/services/metadataRefreshService.js),
[timing](../backend/services/metadataSchedule.js),
[ingestion](../backend/services/metadataIngestionService.js).

## Other automatic behavior

Estimate-source clarification: catalog-linked Backlog games use saved estimated
hours (manual/local HLTB) first, then `catalog_rawg_playtime_hours` as a display
fallback. RAWG metadata refresh can update that fallback. It cannot supersede an
existing saved estimate. The current Wishlist serializer uses saved/local HLTB
without the same RAWG fallback. The UI's generic Estimate label and `displayHLTB`
field do not establish that a value actually came from HLTB. See
[catalog decoration](../backend/services/catalogService.js) and
[hours display](../src/utils/hours.js). There is no new estimate model implied here.

## Wishlist metadata: automatic and explicit bounded work

Steam Wishlist membership reconciliation only enqueues item-scoped metadata work;
it does not call RAWG or change price observations. The backend Wishlist metadata
worker checks every five seconds and processes up to two due items per tick, so
queued work continues after the browser closes. Use the Wishlist diagnostics'
**Refresh metadata** action to request an immediate bounded pass, or the explicit
**Refresh all queued** action to process additional batches of ten while the page
is open. Existing Steam name, cover, release and tag fallbacks remain usable while
work is pending.

Only an exact Steam/catalog identity or one normalized-title RAWG match is linked
automatically. No match remains unresolved, while multiple exact matches remain
in identity review with the Steam fallback preserved. Successful incomplete work
retries after three days and then weekly; complete recent catalog records are due
monthly and mature records every four months. Provider failures retain the same
item in the durable queue with a bounded retry time. This queue is separate from
`METADATA_REFRESH_ENABLED`, which remains off by default and is not required for
Wishlist hydration. Worker controls are `WISHLIST_METADATA_INTERVAL_MS` and
`WISHLIST_METADATA_BATCH_SIZE`.

Refresh runs are also recorded in the general `metadata_jobs` history, with
item-level outcomes in `wishlist_metadata_attempts`. The authenticated
`GET /api/wishlist/metadata/runs` endpoint returns recent owner-scoped summaries;
provider payloads and secrets are not stored in this history.

Source: [wishlistMetadataService.js](../backend/services/wishlistMetadataService.js).

| Mechanism | Timing and effect |
| --- | --- |
| Discover collections | Opt-in `CATALOG_AUTO_SEED=true`. Check 60 seconds after startup, then every 24 hours. Refresh missing/expired collections; expiry is seven days. Default seed limit 24. Separate from detailed Backlog metadata. |
| Search cache | Catalog search cache lasts three days. Expiry is a freshness rule, not an independently scheduled search. |
| HLTB estimates | Local dataset lookup. No periodic dataset refresh found in inspected schedulers; RAWG maintenance does not refresh it. |
| Steam UI health | Visible authenticated app polls saved health every 60 seconds, or five seconds during an active job; focus/visibility can wake it. Changes trigger saved-view updates, not direct Steam fetches. |
| Wishlist UI | Visible mounted view revalidates saved Wishlist roughly every 60 seconds and on focus/visibility, subject to freshness checks. |
| Metadata Settings UI | Polls active repair progress every two seconds. Reading progress does not start a repair. |
| Activity/notifications UI | Minute-based wake checks update the saved-data experience, not external providers. |
| Guest cleanup | Backend deletes expired guests hourly when demo is enabled. Local lifetime is 36 hours; deletion happens on a later cleanup tick. |

Sources: [backend startup](../backend/index.js),
[Discover/search](../backend/services/catalogService.js),
[HLTB](../backend/utils/hltb.js),
[Steam UI](../src/features/steam/SteamExperienceContext.jsx),
[Wishlist UI](../src/pages/Wishlist/useWishlist.js).

## Decisions to discuss before changes

- Actual external Steam time/timezone and downtime recovery; verify hosting setup.
- Whether Library, Wishlist and prices should share one cadence.
- Whether due retries should wait for tomorrow or have a bounded recovery trigger.
- Whether two catalog entries per hour is sufficient and Wishlist-only entries
  should qualify. Assess incomplete-entry retry eligibility before enabling.
- Whether upcoming releases need more frequent refresh near launch.
- Which last-success, freshness, coverage and failure details should be visible.
- Whether to retain play observations before implementing activity Insights.

These are discussion items, not implemented decisions. Main promotion stays on hold.
