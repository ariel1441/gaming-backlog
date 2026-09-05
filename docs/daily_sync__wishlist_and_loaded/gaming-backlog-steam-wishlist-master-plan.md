# Gaming Backlog — Steam Automation, Wishlist & Deal Tracking Master Plan

## Purpose

Product direction update, 2026-09-05: read the companion
[Daily experience vision and handoff](gaming-backlog-steam-daily-experience-vision.md)
for the agreed daily-use goal, proposed automation/inbox/activity-history behavior,
explicitly undecided defaults, and current A/B implementation/release state.
The next implementation task and any change in phase order are not yet selected.

Integrate Steam activity automation, Steam wishlist management, and external-store deal tracking into the existing Gaming Backlog application.

This is not a separate product. It should feel like a natural extension of Gaming Backlog while keeping the three sync domains operationally independent:

1. Steam Library / Activity
2. Steam Wishlist
3. External Wishlist Deals

The existing Gaming Backlog codebase remains the source of truth for implementation details. This plan defines intended product behavior and architecture; the live repository should be reviewed before each implementation phase.

---

# Core product principles

## 1. Keep factual Steam data automatic; keep personal tracking decisions user-controlled

Safe to update automatically:
- Steam ownership
- Steam playtime
- Steam last played
- Steam achievement counts/details
- Steam wishlist membership
- Steam wishlist priority/date added
- observed prices
- store availability/stock/region metadata

By default, require a suggestion or explicit user action:
- add a newly owned game to the backlog
- add a newly played game to the backlog
- change a backlog status to Playing
- set/adjust started date
- remove a game from the backlog
- mark a game Finished

Steam activity is evidence, not permission to rewrite personal organization choices.

The newer daily-experience discussion proposes optional user-configured acquisition
and Playing rules with explanations, exceptions and safe undo. Those policies and
defaults are undecided and unimplemented; do not interpret this plan as permission
to enable automatic Backlog additions, status changes or date changes now.

## 2. The three sync domains must fail independently

A Loaded parser failure must not prevent:
- Steam library activity updates
- Steam wishlist membership sync
- Steam price tracking

Likewise, a temporary Steam price failure must not corrupt wishlist membership.

Each domain should have its own run/result state even if a single daily entry point invokes all of them.

## 3. Fetch broad cheap snapshots; process only local differences

Do not rely on a hypothetical "modified since last sync" API.

For Steam library activity:
- fetch the current owned-game snapshot once
- diff against persisted Steam source data
- perform expensive work only for changed/new games

For Steam wishlist:
- fetch current wishlist membership
- diff against persisted membership

For pricing:
- fetch current prices for monitored items
- compare against the previous successful observation

## 4. Only validated domain data advances its baseline

Track:
- last attempt
- last successful sync
- run status
- errors
- counts

Only successful/valid data may advance the comparison baseline.

A partial overall run may contain a valid membership snapshot plus failed display
metadata or achievement follow-up. Preserve the failed component's good data and
record partial health; valid membership can still advance independently. Failed,
ambiguous or invalid membership itself must never establish removals or a new baseline.

## 5. Do not model uncertainty as "not found"

Especially for Loaded/Fanatical:

`null` or a missing search result must not silently mean "store does not sell this".

Use explicit states such as:
- matched
- not_found
- ambiguous
- wrong_edition
- wrong_platform
- wrong_drm
- region_uncertain
- sold_out
- price_unavailable
- request_failed
- parser_failed

---

# Product area A — Steam Library / Activity Automation

This should be implemented first.

Detailed implementation spec:
`steam-library-daily-sync-implementation-plan.md`

## Goal

Turn the existing manual Steam library sync/review flow into an incremental, durable, optionally scheduled system.

## Expected behavior

### Newly observed owned game, never played, not in backlog
Create a review suggestion:
- "New Steam game detected"
- suggest adding to backlog
- default suggested status: Plan to Play

### Newly observed owned game with playtime, not in backlog
Create a review suggestion:
- suggest adding to backlog as Playing

### Existing game in backlog with status Playing or Finished
If Steam playtime/achievements changed:
- update factual Steam data silently
- no status suggestion

### Existing game in backlog with a backlog/planned status
If new Steam activity is observed:
- update factual Steam data
- create suggestion to change status to Playing

### Ignored Steam game
- update factual Steam ownership/activity as needed
- do not repeatedly nag the user

### First-ever sync
Establish a baseline and import/review state without creating hundreds of fake "new today" notifications.

## Incremental strategy

Daily activity sync should roughly be:

1. Fetch owned games once.
2. Compare AppID/playtime/last-played against local data.
3. Identify:
   - newly observed owned games
   - newly active games
   - unchanged games
4. Perform catalog matching/import work only for newly observed/unresolved games.
5. Refresh achievements only for relevant changed linked games.
6. Persist review/activity events that require user attention.
7. Save a successful run record.

Do not schedule the current expensive all-game manual sync unchanged.

## Shared infrastructure introduced here

### `integration_sync_runs`
Reusable run/health records for all future sync domains.

Possible logical fields:
- id
- user/account
- provider
- domain
- trigger (`manual`, `scheduled`)
- started_at
- finished_at
- status (`running`, `success`, `partial`, `failed`)
- items_seen
- items_changed
- error_count
- summary/error metadata
- created_at

### `user_activity_events`
Durable user-facing events/review items.

Initial event types:
- steam_new_game
- steam_started_playing
- steam_status_suggestion

Later reused by wishlist/deal features.

## Scheduling

After manual behavior is proven:
- standalone short-lived daily command
- Railway Cron invokes it
- manual and scheduled execution call the same service
- prevent concurrent runs for the same user/domain

Avoid a second `setInterval()` inside the long-running API service.

---

# Product area B — Steam Wishlist

Implement after Product Area A is stable.

## 1. Wishlist becomes a separate relationship, not primarily a backlog status

Current `wishlist` backlog status should eventually be migrated away from being the sole representation of wishlist intent.

Wishlist and backlog lifecycle are separate dimensions.

Examples:
- Plan to Play + Wishlisted
- Backlog + Wishlisted
- Wishlist only, not in backlog
- Owned + still historically wishlisted
- Removed from wishlist

## 2. Dedicated Wishlist page

Create a separate Steam Wishlist / Wishlist area so hundreds of wishlist games do not overcrowd the main Backlog.

Default behavior:
- wishlist-only games are excluded from the normal Backlog page

Optional user setting:
- `Show wishlist games in Backlog`

The Wishlist page should eventually show:
- cover
- title
- Steam wishlist priority
- added date
- Steam current price
- Steam regular price
- Steam discount
- Loaded price/status
- Fanatical price/status
- best valid store
- saving
- last meaningful change

## 3. Wishlist import/sync

Use the connected Steam account / SteamID already present in Gaming Backlog.

Sync:
- AppID
- priority/order
- date added
- active membership

Persist removed items rather than deleting them:
- active = false
- removed_at / last_seen metadata where useful

## 4. Wishlist change detection

Daily comparison should detect:
- wishlist_added
- wishlist_removed
- priority_changed

Cross-check against owned-library data.

If:
- yesterday wishlisted
- today no longer wishlisted
- today newly owned

classify as something like:
- `wishlist_likely_purchased`

Do not claim purchase if ownership evidence does not support it.

## 5. Existing `wishlist` status migration

Before migration:
- inspect live usage of the current wishlist status
- determine whether any features, filters, insights, public pages, imports, etc. depend on it

Migration direction:
- translate existing wishlist-status records into the new wishlist relationship
- do not automatically create hundreds of ordinary backlog rows from Steam wishlist import
- preserve existing user intent/data
- only retire/change the old status once all usages are accounted for

## 6. Steam wishlist pricing

Keep membership sync and pricing sync as separate internal services.

Membership sync answers:
- added?
- removed?
- priority changed?

Steam price sync answers:
- current price
- regular price
- discount
- sale started/ended
- price changed

This separation lets one succeed if the other temporarily fails.

## 7. Steam price history

Persist observations; do not overwrite the only historical value.

Initially enough to support:
- current price
- previous observed price
- price drop/increase
- sale started
- sale ended

Later:
- lowest observed
- charts
- richer history

---

# Product area C — External Store Deal Framework

Implement only after Steam wishlist functionality is trustworthy.

## Architecture

Use a store-adapter contract so Loaded and Fanatical are isolated.

Conceptually:
- discovery/search
- known-product refresh
- normalized product result
- explicit availability/match state
- region
- DRM
- platform
- edition
- stock
- price
- regular price
- currency
- product URL
- raw/debug metadata as needed

Do not build one giant scraper.

## Persistent mapping

Once a Steam wishlist item is reliably matched to an external store product:

Steam AppID/catalog game
→ store listing/product ID/URL

Future daily checks should query the known product directly rather than rediscovering it every day.

Rediscover only when:
- new wishlist item
- known product disappears/404s
- mapping is invalidated
- previously unresolved/not-found item becomes due for rediscovery
- user manually requests a rescan

## Discovery backoff

Genuine not-found/unresolved items should not be searched daily forever.

Use a simple `nextDiscoveryAt` style policy.

Example direction:
- new item: search now
- first miss: retry after a few days
- repeated miss: retry weekly
- mature repeated miss: retry every ~2 weeks

Exact intervals can be tuned after observing behavior.

---

# Product area D — Loaded Integration

Loaded is the first external-store implementation because it is more valuable to the user.

## Priority

Loaded should be used as the architecture proof for external stores.

Do not implement Fanatical first simply because it may be easier.

## Reliability requirements

Loaded results must distinguish:
- successful search with no acceptable candidate
- request failure
- parser failure
- ambiguous candidate
- wrong platform
- wrong DRM
- wrong edition
- incompatible/unknown region
- sold out
- price unavailable

A failed Loaded request must never be displayed as:
"Loaded does not sell this game."

## Matching rules

An offer automatically competes with Steam only if:
- correct game
- PC
- correct/base edition unless explicitly shown as an upgrade
- Steam DRM by default
- Israel-compatible/global region
- in stock
- price available
- match confidence/validation high enough

Potential or uncertain deals may still be shown separately.

## First scan vs daily scan

First scan:
- discover candidates
- validate
- persist mapping

Daily:
- refresh known products
- record changed price/stock/region
- discover only new/due unresolved games

## Tests

Use stored fixtures for parser logic.

Test difficult examples:
- multiple editions
- console variants
- Steam vs EA/Ubisoft/etc.
- EU/EMEA/global variants
- sold out
- missing price
- malformed/changed page

Keep live smoke tests small.

---

# Product area E — Fanatical Integration

Add after Loaded is working reliably.

Use the exact same adapter and persistence architecture.

Before implementing a scraper:
- evaluate stable API/structured-data options
- evaluate whether a legitimate external price API can remove fragile scraping
- verify terms/permissions for a private app

Do not force Fanatical scraping if a cleaner supported data source exists.

---

# Product area F — Deal Events, UX & Notifications

## Event vs notification

Store meaningful changes as events even when they do not deserve a push notification.

Possible deal events:
- steam_price_drop
- steam_price_increase
- steam_sale_started
- steam_sale_ended
- loaded_new_listing
- loaded_price_drop
- loaded_sold_out
- loaded_back_in_stock
- fanatical_new_listing
- fanatical_price_drop
- best_store_changed

## Avoid notification spam

Large Steam sales can change dozens/hundreds of prices.

Persist all relevant events, but aggregate notifications.

Example:
- "37 wishlist games went on sale"
- "11 are 50%+ off"
- "4 reached a new observed best price"

Reserve single-item external notifications for important changes/rules.

## Wishlist page filters/sorts

Useful filters:
- price dropped
- cheaper outside Steam
- big savings
- Steam sale
- new external listing
- needs verification
- sold out
- upcoming

Useful sorting:
- biggest saving %
- biggest saving ₪
- wishlist priority
- recently added
- latest change
- price
- alphabetical

---

# Unified daily orchestration

One daily entry point can orchestrate separate domains:

1. Steam ownership/activity
2. Steam wishlist membership
3. Steam wishlist prices
4. known Loaded offers
5. due Loaded discovery
6. Fanatical later

Each domain:
- gets its own run result
- can fail independently
- advances its own successful baseline only on valid completion

The scheduler should not assume every subtask must run every day.

---

# Recommended implementation sequence

## Phase A — Steam Daily Activity Foundation
Use:
`steam-library-daily-sync-implementation-plan.md`

Approved live-repository adaptation: Phase A reuses the existing durable
`steam_sync_jobs` queue, checkpoint/resume worker, asynchronous manual API, and
client polling contract. Manual and Railway-scheduled triggers enqueue the same
job type. Generic sync-run history is linked audit data, not a replacement
execution queue. The detailed Phase A plan is authoritative for this adapted
implementation.

Deliver:
- incremental owned-library diff
- run records
- persistent review/activity events
- changed-game-only achievement refresh
- safe failure semantics
- manual endpoint/service
- Railway cron after manual validation

## Phase B — Steam Wishlist Relationship + UI
Deliver:
- wishlist persistence model
- migration strategy for current wishlist status
- Steam wishlist sync
- dedicated Wishlist page
- optional "show wishlist in Backlog" setting
- added/removed/purchased-like events

## Phase C — Steam Wishlist Prices
Deliver:
- Steam Israel price sync
- price observations
- sale/price change events
- price display on Wishlist page

## Phase D — External Store Framework + Loaded
Deliver:
- store adapter contract
- listing/mapping persistence
- explicit match/error states
- Loaded discovery
- Loaded known-product refresh
- matching review support
- price/stock/region change events

## Phase E — Fanatical
Deliver:
- Fanatical adapter/data source
- same persistence/error model
- integration into comparison UI

## Phase F — Notifications / Deal Polish

Sequencing proposal, not an approved reorder: the
[daily-experience vision](gaming-backlog-steam-daily-experience-vision.md)
suggests bringing a lightweight in-app activity inbox and automation-policy design
forward before or alongside Phase C. External notification channels remain later.

Deliver:
- digest/notification rules
- event inbox integration
- best-store/savings display
- optional Discord/email/etc. later

---

# What not to build yet

Do not add:
- Redis unless real concurrency/load requires it
- Kafka
- microservices
- Kubernetes
- a separate public deal-tracker application
- AI product matching in the critical path
- many additional stores
- complex multi-user notification rules before core matching is trustworthy
- WebSockets just for daily sync progress

Keep the architecture modular enough to extract deal tracking into a service later if the project grows dramatically, but do not split it today.

---

# Codex workflow

For every major phase:

1. Put this master plan in the repository.
2. Put the current phase's detailed implementation plan in the repository.
3. Ask Codex to perform a review-only pass against the live codebase.
4. Codex should identify only concrete codebase-driven corrections.
5. Update the phase plan if necessary.
6. Ask Codex to implement that phase only.
7. Run repo-native tests/lint/typecheck/build.
8. Review the resulting diff and migration.
9. Verify behavior manually before enabling unattended scheduling.
10. Move to the next detailed phase.

Codex should not redesign the entire system on preference alone. The purpose of its review is to catch live-code mismatches, hidden dependencies, migration risks, and implementation flaws.

---

# Definition of success for the combined feature

The combined feature is successful when:

- daily Steam activity updates factual data efficiently
- newly owned/newly played games produce useful backlog suggestions
- unchanged libraries require almost no per-game work
- wishlist is a dedicated relationship/page rather than overcrowding Backlog
- Steam wishlist additions/removals/prices are detected reliably
- Loaded prices are shown only when the product match is trustworthy
- external-store failures are never misrepresented as "not sold"
- known external mappings make recurring scans cheap
- significant changes become durable events
- automated jobs can fail safely without corrupting previous successful state
- the feature feels like part of Gaming Backlog rather than a bolted-on second product
