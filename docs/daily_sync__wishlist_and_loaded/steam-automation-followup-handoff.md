# Steam automation follow-up handoff

**Status:** planning handoff, not an implementation record.  
**Updated:** 2026-09-13 (Asia/Jerusalem).  
**Authority:** current code and Git state win over older planning documents.

## Purpose

This handoff captures the agreed product direction before starting a new
implementation phase. The immediate goal is to make Steam Wishlist price
monitoring intelligent enough for a large Wishlist without losing meaningful
Israel sale changes. A second, separate goal is reliable metadata hydration for
new Steam Wishlist items.

Do **not** combine these with unrelated UI, notifications, Library, or schema
work. Do not create a Railway Steam cron service until the price follow-up has
been implemented, released, and verified.

## Release and environment checkpoint

- Production was promoted through [PR #6](https://github.com/ariel1441/gaming-backlog/pull/6)
  on 2026-09-12. Production `main` is `9656f228d6e5efeea3214dda6d75ab9be5140e28`;
  the tested Dev tip before GitHub's rebase merge was `8960aab`.
- Main CI passed, including browser tests. Production migrations 025–036
  passed. Vercel and Railway deployments completed. Railway `/healthz` returned
  `200`; unauthenticated `/api/games` returned `401`.
- The current local branch is `Dev` at `8960aab`; it is not automatically
  advanced to the merge commit. Recheck remote branch state before future work.
- The user manually refreshed Steam Wishlist membership in production. Current
  Steam Wishlist entries appeared successfully.
- The user manually refreshed prices several times. The first pass saved 179 of
  438 monitored price observations; subsequent manual runs finished the
  initial price baseline. Fourteen local/manual Wishlist intentions lack a
  usable Steam identity and are intentionally outside price coverage.
- The user enabled the in-app **Daily Steam sync** account toggle. This only
  makes a linked, non-guest account eligible. No scheduled run has been
  observed because the external Railway cron service does not exist yet.
- Railway production variables shown to the previous agent included
  `DATABASE_URL`, `NODE_ENV`, `PGSSL`, `JWT_SECRET`, `RAWG_API_KEY`,
  `STEAM_WEB_API_KEY`, Steam OpenID/return variables, and frontend/origin
  variables. Do not expose values in code, logs, docs, or chat.
- `METADATA_REFRESH_ENABLED` was absent from that Railway Variables screenshot.
  Its code default is `false`; automatic metadata refresh is therefore off.
  This is a server environment variable, **not** a user profile setting.

## Product decisions already made

1. The intended external Steam schedule is 06:00 Asia/Jerusalem. Railway cron
   uses UTC: while Israel is on daylight time this is `0 3 * * *`; during
   standard time it is `0 4 * * *`. Never configure both schedules with the
   current code.
2. A future Railway service must be separate from the HTTP API service and run
   `npm run steam:sync:daily` from branch `main`, sharing the production
   database/provider variables by Railway references. It needs no domain or
   Vercel configuration.
3. Do not create that service yet. The price implementation currently does not
   meet the desired product behavior below.
4. Steam facts must remain private and must never silently add a game to the
   Backlog, change personal status/dates, retire a local Wishlist intention, or
   overwrite a manually maintained estimate/HLTB-style hours value.
5. Notification controls remain inside Backlog and Wishlist only; do not
   reintroduce them in global navigation, Settings, Activity, sidebar, or
   global header.

## Current behavior to preserve

### Library, Backlog suggestions, and activity

`backend/services/steamLibrarySyncService.js` obtains Steam's full owned-games
snapshot (Steam does not provide a dependable user-library delta endpoint) and
diffs it against saved `user_game_sources` data.

- New ownership creates a review/suggestion; it is not silently added to the
  Backlog.
- Changed Steam playtime or last-played values update private Steam source
  facts. They do not overwrite estimates.
- A linked Backlog game with fresh Steam activity and a stale status can receive
  a Playing-status suggestion.
- A newly played, unlinked game can receive a started-playing suggestion.
- Unchanged entries avoid per-game matching/review work.

Each successful Library run writes a `steam_activity_observations` snapshot.
The first observation is a zero-delta baseline. Later observations record the
difference since the prior observation. Activity is therefore sampled, not an
exact play-session/achievement timestamp ledger; missing historic days must not
be invented. A gap over 36 hours is flagged rather than distributed across days.

### Achievements

Changed eligible linked games are queued for achievement summaries. During a
normal daily Library sync, the previous achievement attempt is usually already
more than six hours old, so the summary is attempted in that same Library job
before the activity observation is saved. The six-hour guard prevents excessive
retries after a recent manual/automatic attempt. If the guard defers a game, a
once-daily external trigger may not retry it until the next day. This is okay
for daily sampled Activity; it is not a precise unlock-time feature.

### Wishlist membership

`backend/services/steamWishlistService.js` reconciles the current Steam
membership list, preserves local/manual intentions, and protects against an
unexpected empty provider response. A daily full membership reconciliation is
intended and should remain. It is much cheaper than individual price lookups.

## Price-monitoring problem

### Current implementation

The daily command runs Library, Wishlist membership, and `wishlist_prices` in
that order for each eligible account. The price worker currently sets every
successful offer's `next_attempt_at` to about 24 hours later. It has safety
limits of 500 selected items, 650 provider requests, and ten minutes per run.

For a 438-game monitored Wishlist, a daily job can therefore recheck a large
number of unchanged games, reach its request/time budget, complete as
`partial`, and defer remaining offers. That behavior is safe but does not meet
the user's target.

The existing baseline is valuable and must be retained. A follow-up must not
discard observations, price history, notification/event deduplication,
unavailable-offer handling, account fences, ownership exclusions, or retry
backoff.

### Desired behavior

The user wants a daily check that notices meaningful Wishlist price changes
(normally sale start or sale end) without individually querying every unchanged
game.

Desired outcome:

1. Detect a small changed set each day.
2. Confirm only relevant Wishlist entries with the Israel-specific price source.
3. Persist a new observation/event only if the Israel offer actually changed.
4. Preserve a bounded fallback and periodic reconciliation so a missed provider
   signal cannot leave prices stale indefinitely.
5. Require no repeated manual Refresh prices clicks from the user.

### Official bulk-delta candidate to validate first

Steam's documented `IStoreService/GetAppList` supports `if_modified_since` and
returns `last_modified` plus `price_change_number`. Valve documents that a
changed `price_change_number` means a price *may* have changed, and that not all
store-information changes are visible in the store. It is a promising global
candidate filter, not proof that the Israel price changed.

Source: [Steam IStoreService documentation](https://partner.steamgames.com/doc/webapi/IStoreService).

Phase 1 must validate all of these before treating it as production-ready:

- the existing server-side `STEAM_WEB_API_KEY` can access the endpoint without
  requiring a publisher-only credential;
- paging, timestamp/cursor semantics, and the daily change volume are usable;
- a persistent cursor can be advanced only after a complete successful scan;
- a small overlap/replay strategy prevents gaps at clock/page boundaries;
- intersecting changed AppIDs with active monitored Wishlist AppIDs works;
- an Israel offer confirmation still correctly detects sale starts, sale ends,
  price changes, unavailable offers, and false-positive global changes;
- normal API failures/rate limits leave the last good cursor and observations
  intact.

Do not call a live provider from tests by default. Use fixtures/mocks for tests.
Any explicit live-provider probe must be server-side, not expose the key, and
must be specifically authorized by the user.

### Fallback if the bulk source is not viable

Use adaptive polling, still without user intervention:

- new/never-observed entries: immediate bounded bootstrap;
- confirmed sale: daily (and use a reliable provider sale-end time if available);
- normal non-sale: staggered multi-day refresh;
- provider failure/rate limit: existing backoff and Retry-After handling;
- periodic low-priority safety audit for entries absent from the bulk change
  feed.

The previous discussion proposed a three-day stagger for normal prices because
roughly 145 of 438 games per pass is below the observed initial pass size. This
is a **fallback recommendation, not a final requirement**: it trades up to
three-day discovery latency for a reduced request load. If same-day discovery
for every new sale is mandatory and no trustworthy bulk delta feed exists, a
daily query of every offer is unavoidable.

## Wishlist metadata problem

Wishlist records are real saved user data (`user_wishlist_items` plus
`steam_wishlist_items` membership), but they are not automatically full RAWG
catalog entries.

The current import tries to link a Wishlist item to an existing safe Steam or
catalog identity. If no mapping exists, it saves Steam-derived name/icon/tags
and may have no `catalog_game_id`. Such an item can show missing rating, genres,
description, estimate, cover, or other catalog metadata.

The live refresh code (`metadataRefreshService.js`) includes active local or
Steam Wishlist items **only when they already link to a RAWG-backed
`catalog_games` record**. It cannot repair an unknown/unmapped Wishlist entry.
Older prose in `docs/AUTOMATION.md` says Wishlist-only catalog entries are
excluded; that prose is stale—live code wins.

### Existing metadata automation

`METADATA_REFRESH_ENABLED=true` starts an in-process backend scheduler. It runs
once at startup and then hourly by default, but only processes two due catalog
games per invocation. It is currently off. A successfully refreshed catalog
record is due weekly in current `metadataSchedule.js`.

This is not a user setting. Do not enable it before redesigning the policy: it
would still be slow for a large initial Wishlist repair and does not solve
identity-less Wishlist records.

### Desired metadata behavior

1. When a Steam Wishlist item is imported or manually added, safely resolve its
   catalog identity.
2. If identity is safe, hydrate/cache RAWG metadata promptly.
3. If identity is ambiguous, keep the item usable with Steam fallback fields and
   request/review identity; never fuzzy-link the wrong title solely to fill UI.
4. Newly released incomplete metadata should retry on a measured schedule, not
   hourly forever.
5. Complete recent records should refresh infrequently; mature records should
   refresh even less often.

Suggested policy to refine during the later metadata phase:

| Record state | Proposed behavior |
| --- | --- |
| New/incomplete item with safe RAWG identity | Queue prompt hydration |
| New release still incomplete | Retry after a few days, then weekly |
| Complete recent release | Refresh monthly |
| Complete mature title | Refresh every few months |
| Ambiguous/missing identity | Preserve Steam data; explicit safe resolution/review |

Metadata work should be a separate due-work queue from the Steam daily command.
It may run a bounded daily queue drain, but that does **not** mean every catalog
record is fetched daily.

## Implementation sequence

### Phase 1 — Steam price delta feasibility and implementation (next task)

Scope this phase to prices only:

1. Inspect existing price provider/request accounting, monitor tables,
   migrations, and contract tests.
2. Build/test an adapter boundary for the official global Steam change feed,
   with fixtures for pagination, duplicates, overlap, cursor advance, and
   provider failure.
3. Decide from safe evidence whether the feed is usable with the application's
   key and whether a schema migration is necessary for a persisted feed cursor.
4. Implement global-delta intersection plus Israel-specific confirmation if
   viable. Otherwise implement the bounded adaptive fallback.
5. Preserve the existing first-baseline, price-event dedupe, account fencing,
   rate-limit, provider budget, and price-history contracts.
6. Add focused tests for sale start/end, unchanged global false positives,
   Israel-only confirmation, cursor failure/replay, fallback due selection, and
   no duplicate event on replay.
7. Update user-facing diagnostics so “unchecked,” “awaiting scheduled check,”
   “retrying,” and true error states remain distinguishable.

Do not alter Library/activity behavior in Phase 1. Do not enable a cron or
metadata automation as a side effect.

### Phase 2 — Wishlist identity and metadata hydration

Start only after Phase 1 is coherent and verified. Handle safe identity
resolution, initial hydration, due/retry scheduling, and user-visible missing
metadata states. Review schema/migration needs separately and preserve private
user data boundaries.

### Phase 3 — release and operational configuration

After both code phases have their own Dev CI evidence and authorized production
release:

1. Create a distinct Railway service, for example `steam-daily-sync`, from the
   same repository and `main` branch.
2. Command: `npm run steam:sync:daily`.
3. Railway cron: `0 3 * * *` while Israel is UTC+3; switch to `0 4 * * *`
   during standard time. Never configure both.
4. Reference/copy the backend's production database and provider variables;
   never paste secrets in chat. The cron service needs no public port/domain.
5. Verify its first scheduled run via logs and the authenticated Steam sync
   status. Confirm Library, Wishlist membership, and prices each report a
   scheduled attempt.

## Non-goals and safety constraints

- Do not backfill or fabricate historical daily activity.
- Do not run production schema changes outside the protected GitHub Actions
  migration workflow.
- Do not use direct production DB queries, dumps, or reset operations.
- Do not expose API keys or make browser/client-side calls with secrets.
- Do not broaden this work into a Node runtime upgrade, UI redesign, notifications
  placement, or unrelated metadata cleanup.
- A Railway health response is process liveness, not database-readiness proof.
- One daily command does not enforce exactly one run per calendar day. Avoid
  duplicate cron definitions and respect account/job leases.

## Copy-paste prompt for the next chat

```text
Read docs/daily_sync__wishlist_and_loaded/steam-automation-followup-handoff.md
fully first. We are starting Phase 1 only: Steam Wishlist price delta feasibility
and implementation on Dev.

Do not create/configure the Railway cron service, do not add
METADATA_REFRESH_ENABLED, do not touch Wishlist metadata hydration, and do not
change Library/activity behavior in this task. Preserve the existing production
price baseline and safety contracts.

Begin with a read-only code review and a short implementation plan. Validate
whether Steam IStoreService/GetAppList's if_modified_since / price_change_number
feed can be used safely with the existing server-side Steam key, using fixtures
and isolated tests by default. Do not make live provider calls or production
data writes without asking me first.

If the bulk feed is viable, implement a durable cursor, safe overlap/replay,
Wishlist intersection, and Israel-specific confirmation. If it is not viable,
implement the documented adaptive fallback instead. Add focused tests and update
the relevant user-facing diagnostics. Do not commit, push, deploy, or modify
Railway/Vercel unless I explicitly ask.
```
