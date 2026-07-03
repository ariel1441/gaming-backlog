# Steam Integration Handoff

Last updated: 2026-07-03

This is a focused handoff for continuing Steam integration work. For the full
system map, read [`../SYSTEM_CONTEXT.md`](../SYSTEM_CONTEXT.md). For broader
priorities, read [`../ROADMAP.md`](../ROADMAP.md).

## What Was Added

Steam V1/V1.2 is implemented as a private ownership/source layer with reviewed
import, Steam Library power tools, private achievement summaries, a library
detail/repair drawer, durable hidden-state restore, and a small hours-source
preference model.

Backend:

- `backend/routes/steam.js` exposes Steam account link/callback, account state,
  disconnect, manual sync, import candidates, candidate decisions, import/attach
  actions, match search, duplicate detection, duplicate merge, per-game Steam
  link helpers, and achievement sync endpoints.
- `backend/services/steamService.js` owns Steam OpenID/Web API behavior,
  owned-game normalization, source persistence, candidate generation, matching,
  duplicate checks, import decisions, merge helpers, Steam achievement payload
  normalization, and achievement sync/cooldown behavior.
- Migrations `006_add_steam_integration.sql`,
  `007_improve_steam_import_review.sql`, and
  `008_add_steam_achievement_summaries.sql` add the Steam
  account/source/candidate schema plus per-user achievement summary fields.
- Migration `009_add_hours_source_preferences.sql` adds per-game
  `hours_preferred_source` and `hours_locked` fields so users can keep auto
  behavior, prefer estimates, or prefer Steam actual time.
- `user_external_accounts` stores the linked Steam account, sync status,
  timestamps, persona/profile fields, and failure state.
- `user_game_sources` stores user-specific Steam ownership, actual playtime,
  last played, and private achievement summary state.
- `steam_import_candidates` stores the review queue, match decisions, ignored
  state, imported state, duplicate attachment state, and selected import status.
- `external_game_ids(source='steam')` attaches Steam app ids to catalog games
  where known.

Frontend:

- `/steam/import` is the Steam link, manual sync, and import review page.
  Duplicate cleanup and bulk tools live inside a default-closed Advanced tools
  area so the opening view stays focused on review.
- `/steam/library` is the calmer synced-library overview for all persisted
  Steam apps, with search, filters, sorting, compact achievement summaries, and
  stable Store/Review actions for all synced apps, open review, in-backlog,
  needs-match, duplicate/link candidates, likely non-games, and hidden apps.
  Rows can open a detail/repair drawer for store, sync, restore/hide, catalog
  match repair, linking to an existing backlog game, and add/link actions
  without always jumping back to `/steam/import`.
- The import queue supports search, review-state filtering, groups, pagination,
  inline candidate status selection, match correction, one primary row action,
  selected-row actions, and group-level actions.
- Backlog cards/details can show private Steam ownership, actual playtime,
  Steam last played, and subtle achievement summary state.
- Discover can show private "owned on Steam" state.
- The edit-game modal has a Steam link card for attaching/changing a synced
  Steam app on an existing backlog game, and can unlink/move an incorrect Steam
  app link. The card also shows achievement summary state and a per-game sync
  action when a Steam app is linked.
- Backlog filters include Steam source filters: linked, not linked, has Steam
  playtime, Steam without playtime, recently played on Steam, and achievement
  summary states. Backlog sort includes Steam last played.
- `src/utils/hours.js` centralizes display/filter hours resolution.
- `src/utils/steamAchievements.js` centralizes achievement summary display
  labels, progress, state checks, and conservative completion/status
  suggestions from summary data.
- `src/utils/steamSync.js` formats Steam sync result copy so library changes and
  achievement refresh results are understandable.

Local/dev:

- `DEVELOPMENT.md` documents Steam env vars.
- `scripts/dev.js` now backs `npm run dev`: it cleans stale Node listeners on
  ports `5000`/`5173`, starts backend/frontend together, and stops both when
  either side exits.
- `scripts/free-dev-ports.js` remains available for manual port cleanup/dry-run
  checks.
- `backend/index.js` has stronger shutdown handling for nodemon restarts.

Steam achievements:

- Summary V1 is implemented only for linked Steam backlog games.
- Stored fields on `user_game_sources`: `achievements_unlocked`,
  `achievements_total`, `achievements_percent`, `achievements_status`,
  `achievements_last_synced_at`, `achievements_last_error_code`, and
  `achievements_last_error_message`.
- Supported statuses are `unknown`, `synced`, `none`, `private`,
  `unavailable`, and `failed`.
- Backend endpoints:
  - `POST /api/steam/games/:gameId/achievements/sync`
  - `POST /api/steam/achievements/sync`
- Normal `POST /api/steam/sync` remains manual owned-library sync, but now also
  attempts cooldown-eligible achievement summary refresh for linked Steam
  backlog games and reports achievement results separately.
- V1 intentionally does not store per-achievement rows, global rarity, or
  public achievement visibility.

## Product Decisions

- Review-first import: do not auto-import the full Steam library into the
  backlog.
- Steam is a source/ownership layer: the app's internal game identity remains
  `catalog_games`.
- Steam app ids live in `external_game_ids` and user ownership/playtime lives in
  `user_game_sources`.
- Steam playtime is actual played time. It does not overwrite
  `games.how_long_to_beat`. The edit form can now choose `auto`, `estimate`,
  or `steam_actual` as the preferred display/insights source and lock that
  preference.
- Hidden Steam apps stay hidden across future Steam syncs until the user
  explicitly restores them from `/steam/import` or `/steam/library`.
- Public profiles do not expose Steam data in V1.
- Sync is manual-only in V1. Normal library sync may include cooldowned
  achievement summary refreshes, but there are no background jobs or scheduled
  Steam syncs.
- Steam achievements summary V1 is private and summary-only. Full detail,
  rarity, status suggestions, and public controls are later product decisions.
- Duplicate prevention is part of the core product behavior, not just cleanup.
  Import/attach flows should attach existing games whenever possible.

## Current User Flow

Brand-new user:

1. Link Steam from `/steam/import`.
2. Sync library.
3. Review grouped candidates.
4. Improve matches for unmatched games.
5. Optionally change suggested status per candidate or group.
6. Import ready candidates into backlog.
7. Use duplicate cleanup if testing exposed accidental duplicates.
8. Use `/steam/library` or normal Steam sync to refresh achievement summaries,
   inspect detail/repair drawers, restore hidden apps, or repair matches for
   linked backlog games.

Existing backlog user:

1. Link Steam from `/steam/import`.
2. Sync library.
3. Review "already in backlog" / duplicate candidates.
4. Attach Steam apps to existing games instead of importing new rows.
5. Use the edit-game Steam card to manually link a specific backlog game if the
   automatic match missed it.
6. Use Steam source filters and Steam last-played sort in the backlog to find
   unlinked, recently played, stale, or no-playtime games.
7. Use `/steam/library` to browse the full synced Steam library outside the
   denser import/review workflow.
8. Use achievement filters in `/steam/library` to find completed, close to
   complete, not-synced, or unavailable achievement data.

## Known Problems And Rough Edges

- `/steam/import` is much calmer than the first version but still deserves more
  real-library testing. `/steam/library` now has the richer detail/repair
  drawer; future import work should reuse that mental model rather than
  overloading opening rows again.
- The difference between hide/ignore, approve match, attach/link, and import is
  improved but can still be clearer in copy and placement.
- Ignored/restored state now means hidden until explicitly restored. Reviewed
  versus approved/imported wording can still use more real-library QA.
- Matching is much better than the first pass, but still misses common title
  variants such as trademark symbols, subtitles, editions, remasters, complete
  editions, apostrophes, and alternate names.
- Steam libraries include non-games. DLC, demos, tools, soundtracks, playtests,
  and dedicated servers should be filtered or grouped more aggressively.
- Status suggestions are simple heuristics. They should become more transparent
  and adjustable.
- Duplicate handling was improved after real testing exposed bad duplicates.
  Focused regression tests now cover key service paths, but route/API-level and
  real DB transaction coverage can still be expanded.
- The hours model is still transitional, but users can now choose and lock
  auto/estimate/Steam-actual preference per game. `games.how_long_to_beat`
  remains the estimate field while Steam actual time is separate.
- Full achievement detail, global rarity, wishlist, background sync, and public
  Steam privacy settings are not implemented. Last-played and achievement
  summary private UI/filter/sort exists, and conservative summary-based
  completion/status suggestions now appear in the Steam Library detail drawer.

## Immediate Recommended Next Work

1. Final Steam V1.2 QA pass:
   - `/steam/library` filters, search, store links, review jumps, and load more
   - Steam Library detail drawer restore/hide, change match, link existing,
     add/link, and achievement sync actions
   - `/steam/import` review states, groups, hide/restore, match correction,
     import, attach/link, group actions, and duplicate cleanup
   - edit-game hours source preference and lock behavior
   - edit-game Steam unlink/change/move-link flows
   - backlog Steam filters, recent Steam filter, achievement filter/display,
     and Steam last-played sort
   - `npm run dev` runner behavior while backend/frontend files change
2. Review sync behavior and API hardening:
   - confirm normal Steam sync copy accurately separates checked apps, created
     rows, updated rows, unchanged rows, and achievement results
   - expand route/API tests around achievement failure states, cooldowns, and
     user scoping
   - decide whether achievement sync should stay folded into manual library
     sync, be prompted after sync, or become a separate later scheduled flow
3. Improve matching memory:
   - add more title normalization and edition-stripping heuristics
   - use release year and catalog aliases when available
   - persist corrected/rejected match decisions
4. Decide the next hours model:
   - manual estimate
   - HLTB estimate
   - RAWG estimate
   - Steam actual
   - preferred/locked value
   - source labels in cards/details/insights
5. Add public/privacy settings before exposing Steam data publicly:
   - Steam ownership
   - Steam playtime
   - Steam last played
   - achievements
6. Plan the next Steam feature set before coding:
   - full achievement detail
   - global rarity
   - achievement/status suggestions
   - Steam Library detail drawers
   - wishlist investigation
   - background sync

## Bigger Future Steam Ideas

- Achievements and completion signals:
  - summary V1 exists: unlocked count, total count, completion percent,
    private/unavailable/failed state, and last achievement sync timestamp
  - manual sync per linked game, linked backlog batch, and normal Steam sync
    refresh path exists
  - full per-achievement detail if the UI has a clear place for it
  - global rarity/percentages if they help users choose what to play or finish
  - "finished" achievement heuristics where reliable
  - achievement-based status suggestions
- Last played:
  - private display/filter/sort baseline exists
  - suggest "should come back" or "won't come back"
- Wishlist:
  - investigate reliable Steam wishlist access
  - keep wishlist separate from backlog import
- Owned library page:
  - baseline `/steam/library` exists
  - power tools exist for filters, sorting, and compact achievement state
  - repair ignored/unmatched/unlinked apps directly from the library page later
  - add optional row/detail drawer for richer Steam app information
- Background sync:
  - cooldowns
  - failure states
  - safe private-profile behavior
- Public profile controls:
  - optional Steam ownership/playtime/achievement visibility
  - default private
- Multi-source ownership:
  - Steam first, then only add Epic/GOG/console/manual if the product needs it.

## Verification Already Run In This Session

Recently passing checks during the Steam work:

```bash
npm run lint
npm run test -- backend/utils/gameAccess.test.js backend/services/steamService.test.js src/utils/gameList.test.js
npm run test -- src/utils/steamSync.test.js backend/services/steamService.test.js backend/validators/steam.test.js
npm run build
```

The build had only the known Browserslist stale-data and large-chunk warnings.

Small follow-up completed in the latest chat:

- Added duplicate-safety tests for import attach, manual link move, unlink, and
  duplicate merge behavior.
- Added `/steam/library` and wired the sidebar to it.
- Added private Steam last-played display, recent filter, and sort support.
- Added `scripts/dev.js` for a cleaner one-command local dev runner.
- Fixed the Steam Library view dropdown to use the shared `SelectMenu` value
  callback.
- Added Steam Achievements Summary V1 schema, service helpers, routes, private
  serializers, frontend display, filters, and tests.
- Folded cooldowned achievement refresh into normal manual Steam library sync
  for linked backlog games.
- Simplified `/steam/import` opening UX and moved bulk/cleanup actions into a
  default-closed Advanced tools area.
- Added Steam Library power tools: richer sort options, compact achievement
  display/sync, stable Store action, and cleaner filter row.

## Prompt For The Next Chat

Copy this into the next chat:

```text
We are working in:
C:\Users\ariel\projects\ultimate_backlog\gaming_backlog_website

Please first read:
- AGENTS.md
- docs/SYSTEM_CONTEXT.md
- docs/ROADMAP.md
- docs/planning/metadata-catalog-refactor.md
- docs/planning/steam-integration-handoff.md
- DEVELOPMENT.md

Context:
We implemented Steam Integration V1/V1.1 on top of the existing catalog:
- Steam account link via OpenID
- manual owned-library sync using backend STEAM_WEB_API_KEY
- user_external_accounts
- user_game_sources
- steam_import_candidates
- external_game_ids(source='steam')
- /steam/import reviewed import flow with a calmer opening view
- grouped/paginated review queue
- visible search/review filters, default-closed Advanced tools, inline status
  editing, larger Steam capsule art, and one primary row action
- match correction and status-before-import
- attach to existing backlog games
- per-game Steam link card in edit modal
- Steam ownership/playtime badges and filters
- duplicate prevention and duplicate cleanup/merge
- Steam actual hours display policy via src/utils/hours.js
- /steam/library synced-app overview with search, filters, sorting, compact
  achievement display, Store/Review actions, and batch sync actions
- Steam last-played display/filter/sort
- Steam Achievements Summary V1: private summary-only unlocked/total/percent,
  status, sync timestamp, and failure state on user_game_sources
- achievement sync for one linked game, all linked Steam backlog games, and
  cooldowned achievement refresh during normal manual Steam library sync
- local dev runner/port cleanup and backend graceful shutdown hardening

Do not code yet. I want to plan the next Steam integration product/design layer
before implementation.

Please help me brainstorm and decide what should come next for Steam. Cover
ideas from small to big, including:
- richer achievement modal/details, full per-achievement data, global rarity,
  completion insights, and achievement-based status suggestions
- better Steam Library power tools, row/detail drawers, bulk repair, and match
  repair without always jumping to /steam/import
- smarter import/review rules for non-games, DLC, demos, editions, alternate
  names, hidden apps, and ignored/reviewed state
- sync behavior: manual-only, prompted after library sync, scheduled/background,
  cooldowns, and clearer changed-vs-checked messaging
- source/hour rules: Steam actual time vs HLTB/RAWG/manual estimates,
  preferred/locked hours, and insights behavior
- public/privacy controls for Steam ownership, playtime, last played, and
  achievements
- wishlist or other Steam data if realistically available

For each option, explain:
1. what the user would see
2. what data/backend changes it would require
3. UX risks and clutter risks
4. API/privacy/rate-limit risks
5. whether it belongs in small polish, V1.2, or later

End by recommending a phased plan and asking me to choose the important product
decisions before any coding starts.
```
