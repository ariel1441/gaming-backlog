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
- Migration `010_add_steam_activity_observed.sql` adds first-observed Steam play
  fields used by Steam Sync Review and started/status suggestions.
- `user_external_accounts` stores the linked Steam account, sync status,
  timestamps, persona/profile fields, and failure state.
- `user_game_sources` stores user-specific Steam ownership, actual playtime,
  last played, first observed play activity, and private achievement summary
  state.
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
  achievement refresh results are understandable. It also stores/reloads the
  last actionable Steam Sync Review from browser local storage.

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

Steam sync activity review:

- Manual Steam sync can return `syncReview` with `startedPlaying`,
  `statusSuggestions`, and `newSteamGames`.
- The first Steam sync does not treat old historical playtime as newly started.
  Later syncs can detect existing/new apps moving from no Steam playtime to
  Steam playtime.
- Steam Import opens a persistent review modal after sync when there are
  actionable items.
- Steam Import has a `Newly played` pile and can reopen the last actionable
  review with `?review=last`.
- Steam Library also has a `Review last sync` action when local review data is
  waiting.
- Linked backlog cards and details show subtle private Steam activity signals
  only when recent first-observed play suggests a non-playing/non-done status
  may be stale.
- The status-suggestion endpoint can mark linked Steam backlog games as
  `playing` and optionally fill `started_at` only when it is currently empty.
- Steam sync never silently changes backlog status or dates.

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
- First-observed Steam play can suggest a started date but is not a true Steam
  first-played date. Steam does not reliably provide true first-played or
  finished dates.
- Steam achievements summary V1 is private and summary-only. Full detail,
  rarity, status suggestions, and public controls are later product decisions.
- Duplicate prevention is part of the core product behavior, not just cleanup.
  Import/attach flows should attach existing games whenever possible.

## Done-For-Now Decision

As of 2026-07-03, Steam work is a good stopping point unless the next feature is
explicitly Steam-related. The user wants to move to a different topic after
documenting this state.

Before deploying the local Steam activity-review polish:

- Resolve the Railway production deploy issue documented below.
- Decide whether to commit/deploy the local Steam changes as one batch or split
  schema/backend/frontend polish into smaller commits.
- Run one real-library QA pass on local or deployed dev:
  - manual sync and long-running sync feedback
  - Steam Sync Review modal and `Review last sync`
  - `Newly played` pile and import actions
  - status-suggestion action for linked games
  - backlog card `Started on Steam?` signal
  - game modal Steam activity note
  - Steam Library drawer `Open in import` and first-observed play display

Likely future Steam improvements, later:

- Scheduled/background sync with a user opt-in setting, cooldowns, last
  success/failure state, and review/notification UX for changes found while the
  user was away.
- Steam privacy/public controls before exposing ownership, playtime, last
  played, achievements, or activity publicly.
- Achievement summary modal as a medium-small feature before full achievement
  storage: unlocked/total/percent, sync state, private/unavailable explanation,
  and sync action.
- Full per-achievement data and global rarity if it has a clear user-facing
  reason.
- Richer completion/status suggestions from achievements, playtime, and recent
  activity.
- Better started/finished date suggestions. Started can use local
  first-observed Steam play; finished should remain manual/prompted because
  Steam does not provide a reliable finished date.
- Wishlist or other Steam data only after confirming reliable API access.

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

## Production Deployment Handoff - 2026-07-03

Steam Integration code, frontend build, and production database migrations were
prepared and pushed. The Railway backend initially stayed on the older backend
deployment, then was manually redeployed after the free-tier deploy window
opened.

Current git/deploy state:

- `main` and `Dev` both point to `6ab7ec6 Trigger production redeploy`.
- The Steam implementation commit is `5becd35 Add Steam integration`.
- GitHub Actions passed on both `main` and `Dev`.
- Production migrations `006` through `009` were applied successfully.
- Vercel deployed the new frontend, so `/steam/import` is visible on the real
  site.
- Railway was serving the older backend deployment from
  `2026-06-30 08:20 +03:00`, so `/api/steam/*` routes returned generic `404 Not
  found` until the manual redeploy below.

Root cause discovered:

- Railway free-tier deploys to `europe-west4-drams3a` are blocked during peak
  hours: `8 AM - 8 PM Europe/Amsterdam`.
- In Israel time, that means deploys are blocked until `21:00`.
- The CLI error was:

```text
Free-tier deploys to europe-west4-drams3a are not available during peak hours (8 AM - 8 PM Europe/Amsterdam). Please try again later or upgrade your plan.
```

At or after `21:00` Israel time, run from the repo root:

```bash
railway deployment redeploy --service gaming-backlog --environment production --from-source --yes
```

If that command is not available or still fails, use this fallback:

```bash
railway up --service gaming-backlog --environment production --detach --message "Deploy Steam integration"
```

Before or during the Railway deploy, confirm the backend production variables
exist in Railway. Do not paste secret values into chat/logs:

```text
STEAM_WEB_API_KEY=<real Steam Web API key>
STEAM_OPENID_REALM=https://gaming-backlog-production.up.railway.app
STEAM_OPENID_RETURN_URL=https://gaming-backlog-production.up.railway.app/api/steam/auth/callback
FRONTEND_BASE_URL=https://gaming-backlog-ten.vercel.app
STEAM_DEV_SYNC_SAMPLE=false
```

Do not use localhost Steam OpenID URLs in Railway production.

After Railway deploys, verify:

- `https://gaming-backlog-production.up.railway.app/healthz` returns `200`.
- `https://gaming-backlog-production.up.railway.app/api/meta/status-groups`
  still returns `200`.
- `https://gaming-backlog-production.up.railway.app/api/steam/account` no longer
  returns generic `404`; unauthenticated it should return an auth error such as
  `401 No token provided`.
- On `https://gaming-backlog-ten.vercel.app/steam/import`, the initial Steam
  account/import-candidate requests no longer fail with generic `404`.
- Link Steam uses
  `https://gaming-backlog-production.up.railway.app/api/steam/auth/start` and
  reaches Steam OpenID instead of returning `404`.
- After linking, manually sync the Steam library and check reviewed import,
  `/steam/library`, private playtime/last-played display, and achievement
  summary sync on one linked game.

Resolution note:

- Resolved on 2026-07-03 at about 21:48 Israel time.
- Railway deployment `dc64ad8a-a200-4bb1-a3e9-2d534cc39f93` succeeded.
- Commit deployed: `6ab7ec6 Trigger production redeploy`.
- Smoke checks passed:
  - `/healthz` returned `200`.
  - `/api/meta/status-groups` returned `200`.
  - unauthenticated `/api/steam/account` returned `401`, confirming the Steam
    backend route exists and is protected by auth.
- Remaining production verification: user should test the real Steam link/sync
  flow from the Vercel frontend with their logged-in account.

## Local Steam Sync Review Work - 2026-07-03

Local-only work after the production deploy handoff added a Steam activity
review layer. This is the next Steam polish batch to test, commit, and deploy
after the base Steam production backend is confirmed live.

- Added migration `010_add_steam_activity_observed.sql`.
- Added nullable `user_game_sources.first_play_observed_at` and
  `first_play_observed_playtime_minutes`.
- Steam sync now detects games that move from no Steam playtime to Steam
  playtime after a previous sync.
- The first Steam sync does not mark all historical played games as newly
  started.
- `/api/steam/sync` returns `syncReview` with:
  - `startedPlaying`
  - `statusSuggestions`
  - `newSteamGames`
- Added a small Steam-specific apply endpoint:
  `POST /api/steam/games/:gameId/status-suggestion`.
- The apply endpoint only changes linked Steam backlog games to `playing`; it
  optionally fills `started_at` only if the game has no started date.
- Steam Import opens a persistent Steam Sync Review modal after sync when there
  are actionable items.
- Steam Import now has a `Newly played` pile and badge for first observed Steam
  play activity.
- Steam Library metrics include `Newly played`.
- Steam Import and Steam Library now show a long-running sync start toast before
  waiting for the backend response.
- The last actionable Steam Sync Review is saved locally in browser storage and
  can be reopened from Steam Import or Steam Library.
- Steam Import can initialize from `?q=`, `?group=`, `?status=`, and
  `?review=last`.
- Linked backlog cards show a subtle `Started on Steam?` chip when recent Steam
  activity suggests a non-playing/non-done status may be stale.
- Game details show a Steam activity note when recent first-observed Steam play
  may need review.
- Steam Library detail drawers show first-observed play and always offer an
  `Open in import` action for repair/review.

Checks already run locally:

```bash
npm run test -- backend/services/steamService.test.js src/utils/steamImport.test.js
npm run lint
npm run db:migrate:local
npm run build
```

## Prompt For The Next Chat

Copy this into the next chat when starting a new topic:

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

Before doing anything, run:
- git status --short --branch

Important current context:
- This is a full-stack JavaScript gaming backlog app.
- Frontend: React 18, Vite, Tailwind, React Router.
- Backend: Express, PostgreSQL via pg, JWT auth, Celebrate/Joi validation.
- Production is Vercel frontend + Railway backend/Postgres.
- main is production, Dev is integration.
- Steam integration work is currently local-only after a production Railway deploy issue.
- Do not push or deploy more Steam changes until the Railway production handoff in docs/planning/steam-integration-handoff.md is resolved or explicitly revisited.
- There are uncommitted local Steam changes, including migration 010 and Steam Sync Review polish. Treat them as user/session work; do not revert them.

Steam state summary:
- Steam account linking, manual library sync, reviewed import, duplicate prevention/cleanup, Steam Library, Steam actual hours, last played, private achievement summaries, and edit-game Steam linking exist.
- Local unpushed work added first-observed Steam play tracking, Steam Sync Review, a Newly played pile, last-review reopen, subtle backlog activity signals, and Steam Library drawer polish.
- Steam is considered a good stopping point for now unless I explicitly choose another Steam feature.
- Future Steam ideas are documented: scheduled/background sync, public/privacy controls, achievement detail modal/full achievements/global rarity, better started/finished date suggestions, richer completion/status suggestions, and wishlist investigation.

Goal for this new chat:
Help me decide and plan the next feature or improvement for the project overall, not necessarily Steam.
Start by summarizing what you understand from the docs in a few bullets, then suggest 5-8 good next feature directions with tradeoffs.
For each direction, explain:
1. user value
2. likely UI/UX shape
3. backend/data impact
4. risks or complexity
5. whether it is small polish, medium feature, or big project

Do not code until I choose a direction.
```
