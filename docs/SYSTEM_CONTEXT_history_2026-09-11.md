# Historical snapshot ? not startup context

Preserved before the September 11 documentation cleanup. Claims and priorities
may be superseded; consult the current SYSTEM_CONTEXT.md and live code/Git first.
Read only a specific section when historical detail is needed.

# System Context

Last updated: 2026-09-11

Release-review fixes are implemented locally above `21dfd7e`:
[Fix phase record](daily_sync__wishlist_and_loaded/release-review-fixes.md).
This supersedes the pending independent-review wording below. Focused regressions
passed; exact-candidate CI and release verification remain pending. Migration 035
was tested only in disposable localhost databases, not the normal development DB.

This is the main handoff file for future chats. Keep it current when the system
changes so a new AI/chat can quickly understand the app without rereading the
whole repository. For plans, feature ideas, and improvement candidates, use
[`ROADMAP.md`](ROADMAP.md).

Steam C.5 local implementation, 2026-09-08:
[Daily experience implementation record](daily_sync__wishlist_and_loaded/gaming-backlog-steam-phase-c5-implementation-record.md)
describes Backlog-style Wishlist layout/details, price and discount controls,
quiet saved-data revalidation, background sync health and the private `/activity`
inbox. Migration 034 is applied to localhost. Work is uncommitted above `21dfd7e`;
focused Node and desktop/mobile checks passed. Independent review, full CI,
release and actual daily production scheduling remain separate pending work.
The approved [notification iteration](daily_sync__wishlist_and_loaded/notification-panel-design.md)
adds a Backlog/Wishlist toolbar bell, shared status dropdowns, direct acquisition and Playing
decisions, grouped purchase context, snapshot-based hiding of Other updates, and
explicit optional local Wishlist retirement after add/link. Full Steam diagnostics
now live in Settings > Integrations; Wishlist keeps a small saved-status strip.
Schedules and automation defaults are unchanged. The Phase C and planning notes
below are historical checkpoints.

Steam Phase C local implementation, 2026-09-07:
[Wishlist prices implementation record](daily_sync__wishlist_and_loaded/gaming-backlog-steam-wishlist-phase-c-implementation-record.md)
describes independent Israel pricing jobs, append-only observations, replay-safe
facts and private Wishlist price/freshness displays. Migration 033 is applied to
localhost. Phase C is the local closeout checkpoint on the account-isolation branch
after `389477a`; focused backend and desktop/mobile checks passed after test fixes.
Last saved local coverage was 411/430 with 19 failures. The September 8 hardening
live probe resolved 15 (14 ILS prices, one unreleased state); four unusual offers
remain restricted. The probe did not persist observations. See the record for
the subsequent commit and 32 passing focused tests. The next separate conversation is
[C.5 daily UI/UX and inbox planning](daily_sync__wishlist_and_loaded/gaming-backlog-steam-phase-c5-handoff.md).
Full CI/release and production scheduling remain pending. Loaded, inbox,
automation and broader activity history remain outside C.

Steam planning handoff, 2026-09-05:
[Daily experience vision and decisions](daily_sync__wishlist_and_loaded/gaming-backlog-steam-daily-experience-vision.md)
records confirmed goals, proposed automation/notifications/daily activity history,
open decisions and local A/B release state. These proposals are not implemented
features. Implementation checkpoint `cc8d105` is committed locally; the next chat
should independently review A/B closeout. Push, deployment and daily production
scheduler configuration remain pending and require a separately selected release task.

Local A/B closeout follow-up (2026-09-06): achievement work is now persisted with
source telemetry, retried on unchanged Library runs when due, and fenced against
late manual responses. Failures preserve successful counts; backoff starts at six
hours and caps at seven days, with up to 250 due sources selected per run in addition
to current activity. Migration 032 is required. Disconnect/replacement retires the
old account and active Steam memberships, resets factual source caches, and preserves
ordinary games, local Wishlist intentions and removal history. Daily selection captures
account IDs; enqueue and lease guards recheck scheduled opt-in. Release/CI and actual
production daily execution remain separate pending gates. See the Phase B record for
verification status; the closeout changes are saved in local Git history, with
push and release still pending.

## Project Summary

This is a full-stack gaming backlog tracker. Users can track games, organize
them by status, enrich them with RAWG/HLTB metadata, view insights, try a guest
demo, and optionally publish a read-only public profile.

Tech stack:

- Frontend: React 18, Vite, React Router, Tailwind CSS, Recharts, dnd-kit.
- Backend: Express, PostgreSQL via `pg`, JWT auth, Celebrate/Joi validation.
- Deployment model: Vercel frontend, Railway backend/Postgres.
- Main app routes: `/`, `/next-up`, `/me`, `/settings`, `/lists`, `/discover`,
  `/wishlist`, `/timeline`, `/insights`, `/u/:username`.

## Commands

```bash
npm run dev
npm run dev:front
npm run dev:back
npm test
npm run check
npm run env:check
npm run db:migrate:local
npm run db:migrate:status
npm run db:reset:local
npm run catalog:seed -- --limit=24
```

Before editing:

```bash
git status --short --branch
```

Local development should use localhost Postgres. The backend blocks remote
`DATABASE_URL` in development unless `ALLOW_REMOTE_DB_IN_DEV=true` is
deliberately set.

## Repository Map

- `src/` - React app, pages, components, hooks, contexts, services, utilities.
- `backend/` - Express app, routes, middleware, validators, schema, seed data.
- `backend/routes/` - API routes.
- `backend/migrations/` - production-safe schema migrations.
- `backend/schema.sql` - local reset schema; update it with schema changes.
- `scripts/` - DB, migration, environment, and data-copy helper scripts.
- `docs/` - supporting docs, templates, planning notes, and screenshots.
- `.github/` - CI workflow and pull request template.

## Current Product Capabilities

- Register and log in with username/password.
- Store private per-user game collections.
- Track game status, manual order, personal genre, score, thoughts, start date,
  finish date, and estimated hours.
- Keep a private ordered Next Up queue, start queued games atomically, and save
  one private "Next time" resume note per game.
- Finish a game through a focused flow that atomically saves its finish date,
  optional score and private thoughts, removes it from Next Up, and offers a
  direct path to choose what to play next.
- Add games with optional started and finished dates, or let the backend
  continue auto-setting dates for eligible statuses when date fields are omitted.
- Search RAWG from the add/edit game forms and save or replace a selected RAWG
  identity when the user chooses a match.
- Browse the Discover catalog at `/discover`, search RAWG on demand, inspect
  catalog metadata, and add catalog games into the personal backlog.
- Link a Steam account, manually sync owned Steam games into a private import
  review queue, attach Steam ownership/playtime to existing backlog games,
  import reviewed catalog matches into the backlog, and review newly detected
  Steam activity after sync.
- Sync a private Steam wishlist with priority/date-added data and durable
  removal history without creating backlog rows for wishlist-only apps.
- Enrich games from Postgres catalog metadata, RAWG metadata, and local HLTB
  data while preserving user-entered fields.
- Cache catalog search results, curated Discover shelves, external ids, and
  full metadata in Postgres with stale/failure fallback behavior.
- Search, filter, sort, and drag-reorder games.
- View a signed-in owner profile dashboard at `/me` with favorites, currently
  playing games, recently finished games, profile basics, basic stats, and app
  shortcuts.
- View private Lists at `/lists`: private ranked lists with manual membership
  and order, plus private smart lists saved from user-chosen backlog rules.
- Manage settings at `/settings`: account context, account-backed backlog
  preferences, profile basics, public-profile visibility, favorite
  public-profile games, CSV export, durable metadata repair/review, and Steam
  integration shortcuts.
- View a private read-only Timeline page grouped by month from existing
  started and finished game dates.
- Detect obvious duplicate titles before adding a game. The backend repeats the
  duplicate check per user before insert.
- Use guest/demo sessions cloned from a template user.
- Convert a guest/demo session into a real account.
- Toggle a public read-only profile.
- View analytics for hours, ETA, statuses, genres, and missing hour data.

## Backend Architecture

Entry point:

- `backend/index.js` registers middleware, initializes RAWG/HLTB caches, mounts
  routes, registers error handling, starts Express, and runs guest cleanup.
- `/healthz` is process liveness only. Database-aware readiness and safe
  cache/environment/migration/demo-template diagnostics remain engineering
  follow-up.

Routes:

- `backend/routes/auth.js` - register, login, `/me`, public-profile toggle,
  account preference updates, and profile basics updates.
- `backend/routes/demo.js` - guest session start, keep, discard, heartbeat.
- `backend/routes/games.js` - authenticated game CRUD, focused finish action,
  enrichment, and reorder.
- `backend/routes/lists.js` - authenticated private list CRUD, smart-list
  metadata, manual membership add/remove, and list-specific reorder.
- `backend/routes/nextUp.js` - authenticated private Next Up membership,
  canonical reorder, removal, and atomic Start playing.
- `backend/routes/catalog.js` - authenticated catalog browse/search/detail,
  manual metadata refresh, collection load-more, and add-to-backlog.
- `backend/routes/steam.js` - authenticated Steam OpenID link, account state,
  manual owned-library sync, import candidate review, duplicate attachment, and
  reviewed import.
- `backend/routes/wishlist.js` - authenticated private wishlist reads, sync,
  empty confirmation, and explicit move-to-backlog actions.
- `backend/routes/insights.js` - analytics aggregation and micro-cache.
- `backend/routes/public.js` - public profile metadata and read-only games.
- `backend/routes/meta.js` - status group definitions with ETag caching.
- `backend/routes/metadata.js` - owner-scoped metadata repair jobs, progress,
  candidate decisions, and exact alternative selection.

Middleware and utilities:

- `backend/db.js` - Postgres pool, DATE-as-string parsing, SSL detection, safe
  development DB guard.
- `backend/middleware/security.js` - Helmet, CORS, JSON parsing, compression.
- `backend/middleware/requestId.js` - assigns `req.requestId` and
  `X-Request-Id`.
- `backend/middleware/errorHandler.js` - central error response shape:
  `{ error: { code, message, requestId } }`.
- `backend/middleware/auth.js` - JWT verification.
- `backend/validators/games.js` - Celebrate/Joi validation for game writes.
- `backend/validators/demo.js` - Celebrate/Joi validation for keeping a guest
  demo as a real account.
- `backend/validators/public.js` - Celebrate/Joi validation for public profile
  username params.
- `backend/utils/httpError.js` - helper for intentional HTTP errors that should
  flow through the central error handler.
- `backend/utils/status.js` - canonical semantic status groups.
- `backend/utils/gameTitle.js` - title normalization for duplicate detection.
- `backend/utils/reorder.js` - pure reorder/rank helpers used by the game route
  and tests.
- `backend/utils/gameAccess.js` - scoped query builders for user-owned game
  reads, deletes, and status updates.
- `backend/utils/microCache.js` - insights cache.
- `backend/utils/fetchRAWG.js` - RAWG lookup.
- `backend/utils/hltb.js` - local HLTB lookup.
- `backend/utils/sanitizeHtml.js` - safe RAWG description HTML.
- `backend/utils/normalize.js` and `backend/utils/time.js` - value cleanup.
- `backend/services/catalogService.js` - Postgres catalog/cache layer,
  RAWG search/detail coalescing, curated shelf seeding, stale/failure handling,
  and catalog serialization helpers shared by private/public/insights flows.
- `backend/services/steamService.js` - Steam OpenID/Web API helpers, owned-game
  response normalization, account/source persistence, import matching, candidate
  decisions, and reviewed import.
- `backend/services/metadataRepairService.js` - resumable bounded backlog
  metadata repair, exact identity promotion, candidate generation, and
  owner-scoped review decisions.

Database:

- `users`: username, password hash, public flag, guest flag, guest expiry,
  profile basics (`display_name`, `bio`, `avatar_icon`, `avatar_color`), and
  created timestamp.
- `user_preferences`: per-user default backlog view, default backlog sort/order,
  and preferred landing page after explicit sign-in or demo start.
- `statuses`: global status label and rank.
- `catalog_games`: app-level game identity and shared external metadata.
- `external_game_ids`: provider ids attached to catalog games; RAWG is used now,
  Steam can attach later.
- `catalog_search_cache`: cached RAWG search result id lists.
- `catalog_collections` and `catalog_collection_games`: curated Discover
  shelves such as trending, highly rated, new releases, upcoming, and popular
  genres.
- `games`: user-owned game rows with status, position, custom fields, HLTB
  hours, score, notes, cover, RAWG identity fields, optional `catalog_game_id`,
  started date, finished date, and private `resume_note`.
- `user_next_up_games`: private owner-scoped Next Up membership with an
  independent ordered position and database-enforced game ownership.
- `user_lists`: private owner-scoped list metadata, including `manual` versus
  `smart` list type and saved smart-list query/ranking metadata.
- `user_list_games`: private manual-list membership and manual list positions.
- `user_external_accounts`: linked external user accounts; Steam V1 stores
  SteamID64, persona/profile fields, sync status, timestamps, and failure state.
- `user_game_sources`: user-specific ownership/source rows; Steam V1 stores
  owned app IDs, actual playtime, last played, first observed play activity,
  and private achievement summary data without overwriting personal game
  fields.
- `steam_import_candidates`: persisted Steam import review queue with proposed
  catalog matches, duplicate links, ignored/imported decisions, suggested or
  selected import status, and sync data.

Schema workflow:

1. Add a migration under `backend/migrations/`.
2. Update `backend/schema.sql`.
3. Test with `npm run db:migrate:local` or `npm run db:reset:local`.
4. Run `npm run check`.

Production migration workflow:

- GitHub Actions runs production migrations after `npm run check` passes on
  pushes to `main`, when the `PROD_DATABASE_URL` repository secret is present.
- The job is attached to the `production` GitHub Environment for optional
  reviewer/environment protection rules.
- The migration runner uses `schema_migrations`, per-file transactions, hosted
  Postgres SSL detection, and a Postgres advisory lock to avoid concurrent
  migration runs.

## Frontend Architecture

Entry points:

- `src/index.jsx` mounts the React app.
- `src/App.jsx` owns app-level providers and route declarations.
- `src/pages/Backlog/BacklogPage.jsx` owns private backlog layout wiring,
  filter/search/sort state, demo banner sizing, and auth-error handling.
- `src/pages/Backlog/BacklogPanels.jsx` renders private backlog search, sort,
  filter, and add-game panels.
- `src/pages/Backlog/BacklogModals.jsx` renders the private backlog modal stack.
- `src/pages/Backlog/useBacklogActions.js` owns private backlog add, edit,
  delete, reorder, and surprise-game actions plus their action-local state.

Routes:

- `/` - private backlog app.
- `/next-up` - private Play Next decision page with explained picks, Continue
  Playing, Next time notes, and an independently ordered queue.
- `/me` - signed-in owner profile dashboard.
- `/settings` - signed-in settings for profile basics, account context,
  preferences, public profile, data export, and integrations.
- `/lists` - private Lists index with user-created ranked and smart lists.
- `/lists/:id` - private list detail. Manual lists support add/remove/reorder;
  smart lists resolve matching games from the saved rule and backlog data.
- `/discover` - catalog browse/search/add flow.
- `/steam/import` - Steam account link/sync, reviewed import flow, and Steam
  Sync Review for newly detected activity.
- `/steam/library` - private synced Steam library and match/link repair tools.
- `/wishlist` - private active/removed Steam wishlist using the shared Backlog toolbar,
  cards/compact/rows/table, filters and ascending/descending provider order.
  Reuses catalog/HLTB metadata. The Backlog preference merges active relationships
  into the display pipeline as read-only projections. Phase C adds private Steam
  Israel prices, freshness and historical fallback without provider calls on reads.
- `/timeline` - private read-only chronological started/finished date feed.
- `/reviews` - private completed-game review history with notes and scores.
- `/insights` - analytics dashboard.
- `/u/:username` - public read-only profile.

Contexts:

- `src/contexts/AuthContext.jsx` - token/user state, login, register, logout,
  demo start/keep/discard, guest heartbeat, public toggle. It owns session
  state and delegates auth/demo/profile requests to `authService`.
- `src/contexts/StatusGroupsContext.jsx` - fetches `/api/meta/status-groups`,
  exposes grouping helpers to insights, and exposes loading/error/refresh for
  recovery.

Hooks:

- `src/hooks/useGames.js` - shared private-route games provider plus list, add,
  edit, delete, reorder, optimistic state, and silent rehydration. Private pages
  reuse one collection instead of refetching it on every navigation.
- `src/hooks/useFilters.js` - search/filter/sort/hour-range state and derived
  game lists.
- `src/hooks/useApplyFiltersFromQuery.js` - maps query params from insights to
  backlog filters.
- `src/hooks/useQueryBackedState.js` - URL/localStorage-backed insight controls.
- `src/hooks/useStatuses.js`, `useUI.js`, `useMedia.js`,
  `useDebouncedValue.js` - supporting UI/data hooks.
- `src/utils/gameList.js` - shared game-list filtering, sorting, fuzzy-search
  composition, CSV parsing, and hours-range filtering.
- `src/utils/automaticLists.js` - smart-list template, membership, rule
  description, and ranking helpers.
- `src/utils/permissions.js` - shared frontend permission helpers for writable
  versus read-only views, game ownership, reorder access, and public-profile
  toggles.

Services:

- `src/services/apiClient.js` - shared fetch wrapper, token helpers, latest
  request guard, transient GET network retry, `ApiError`. In local Vite dev it
  defaults API requests to `http://localhost:5000` when no API base env var is
  set.
- `src/services/gameService.js` - game API wrapper.
- `src/services/listService.js` - private list API wrapper.
- `src/services/catalogService.js` - Discover/catalog API wrapper.
- `src/services/discoverCache.js` - bounded per-user in-memory Discover response
  cache with short TTL, quiet revalidation support, and mutation-aware updates.
- `src/services/steamService.js` - Steam account, sync, candidate review, and
  import API wrapper.
- `src/services/publicService.js` - public profile API wrapper.
- `src/services/insightsService.js` - insights API wrapper.
- `src/services/statusService.js` - status API wrapper.
- `src/services/authService.js` - auth, demo-session, `/me`, and public-toggle
  API wrapper used by `AuthContext`.

Important components/pages:

- `src/pages/Backlog/BacklogPage.jsx` - private backlog route and state/action
  coordinator.
- `src/pages/OwnerProfilePage.jsx` - private owner profile dashboard derived
  from the authenticated user and `useGames`.
- `src/pages/Lists/` - private Lists index, smart-list rule editor, and list
  detail pages.
- `src/components/ProfileAvatar.jsx` - shared generated avatar renderer backed
  by built-in icon and color keys, without user image uploads.
- `src/pages/DiscoverPage.jsx` - Discover catalog route, curated shelves,
  search, filters, detail modal, metadata refresh, and add-to-backlog flow.
- `src/pages/TimelinePage.jsx` - private started/finished event feed grouped
  by month with filters and detail-modal opening.
- `src/pages/SteamImportPage.jsx` - Steam link/sync surface and import review
  queue with match correction.
- `src/pages/Backlog/BacklogPanels.jsx` - private backlog panel rendering.
- `src/pages/Backlog/BacklogModals.jsx` - private backlog modal rendering.
- `src/pages/Backlog/useBacklogActions.js` - private backlog mutation/action
  coordinator using the game service hook plus shared toast/confirm UI.
- `src/pages/Backlog/FinishGameFlow.jsx` - responsive private Finish Game flow
  for finish date, optional score and thoughts, completion feedback, and the
  Play Next handoff.
- `src/components/ui/` - shared UI primitives. Current exports include
  `Button`, `IconButton`, `Modal`, `Field`, `TextInput`, `Textarea`, `Select`,
  `Badge`, `EmptyState`, `Skeleton`, `ToastProvider` / `useToast`, and
  `ConfirmProvider` / `useConfirm`. New shared UI should prefer these before
  adding one-off Tailwind button/input/modal/feedback styles.
- `src/components/Sidebar.jsx` - main navigation/action rail.
- `src/components/GameGrid.jsx` - sortable or read-only grid.
- `src/components/GameCard.jsx` - game summary card.
- `src/components/GameModal.jsx` - detailed game metadata and the unified
  in-place owner editing experience, including the metadata tab.
- `src/components/AddGameForm.jsx` - add-game mutation form.
- `src/components/FilterPanel.jsx` - shared filter UI.
- `src/pages/PublicProfile.jsx` - public read-only profile.
- `src/pages/Insights/InsightsPage.jsx` - analytics dashboard.

Styling:

- Tailwind tokens live in `tailwind.config.js`.
- Global utilities and chart CSS variables live in `src/index.css`.
- Current visual theme is dark surfaces with orange primary and blue secondary
  accents.
- Shared UI primitives use existing Tailwind tokens such as `surface.*`,
  `content.*`, `action.*`, `primary`, and `state.*`.

## Important Behaviors

- All authenticated game data must be scoped by `req.user.id`.
- Frontend edit/delete/reorder affordances should use `src/utils/permissions.js`;
  backend authorization remains the real security boundary.
- Private game routes enrich with catalog metadata first when `catalog_game_id`
  exists, then fall back to legacy RAWG/HLTB behavior for older rows.
- `GET /api/games` is database/cache-only and never waits for RAWG network
  hydration. Optional provider metadata must not delay core backlog reads.
- Guest users intentionally avoid live RAWG catalog/search/detail fetches to
  protect API quota.
- RAWG calls should happen only for meaningful search/detail/refresh/load-more
  or catalog seeding actions, never simply because the Discover page opened.
- Discover full-detail hydration and manual refresh use the durable metadata
  ingestion service, including provider snapshots, normalization versions,
  pinned-cover protection, failure fallback, and next-refresh scheduling.
- Discover browse/search responses use a bounded 90-second per-user in-memory
  frontend cache. Cached results render immediately and revalidate through the
  API; add-to-backlog, detail refresh, shelf load-more, and session changes
  update or clear affected entries. PostgreSQL remains authoritative.
- Global catalog detail refresh uses resumable `catalog_refresh` metadata jobs
  with provider budgets and freshness/backoff scheduling. Its scheduler is
  opt-in through `METADATA_REFRESH_ENABLED`; normal deployments and all page
  rendering remain database-only when it is disabled.
- Normal metadata rendering is PostgreSQL-only across private backlog state,
  Lists, public profiles, and Insights. The process-local RAWG JSON cache is no
  longer a display fallback. Runtime startup and routes do not read or write the
  file; it remains only as an ignored input to the guarded offline importer.
- Discover shelves are cached in Postgres. Automatic shelf refresh is opt-in via
  `CATALOG_AUTO_SEED=true`; `CATALOG_SEED_LIMIT` controls the per-shelf seed
  size. The scheduler checks daily and only refreshes missing/expired shelves.
- Manual ordering is based on status rank groups. Reordering across different
  ranks is rejected. Plain drag reorder updates positions only; the reorder API
  changes a game's status only when the client explicitly sends a same-rank
  target status.
- Manual list ordering is separate from backlog ordering. `/api/lists/:id/games/reorder`
  updates only `user_list_games.position` and never changes `games.position` or
  status. Smart lists do not support manual membership or manual ordering.
- The focused finish endpoint updates only finish-specific fields, removes the
  game from the owner's Next Up queue in the same transaction, and does not
  invent a missing start date.
- Status grouping should come from `backend/utils/status.js` and
  `/api/meta/status-groups`, not hardcoded in random UI code.
- Insights can write missing HLTB hour values back to the DB when it resolves
  them.
- Dates are SQL `DATE` fields and are parsed as `YYYY-MM-DD` strings to avoid
  timezone drift.
- Public profile and insights should read catalog metadata when a game is linked
  to `catalog_game_id`, with legacy fallbacks for unlinked rows.
- Steam data is private in V1. Public profile serializers should not expose
  Steam ownership or playtime until explicit privacy controls exist.
- Steam library and wishlist sync use the durable `steam_sync_jobs` queue for both manual
  requests and the opt-in daily runner. Failed/private/invalid owned-library
  responses do not advance the successful snapshot baseline or break normal
  backlog reads. Actionable Steam changes are persisted as private activity
  events so review survives browser reloads. Per-claim lease tokens fence stale
  workers from checkpointing or finalizing a recovered or cancelled job.
- Steam actual playtime is stored separately from `games.how_long_to_beat`.
  Private backlog UI can show both. For finished and played-a-lot style
  statuses, Steam actual time can be the primary displayed hours; for planned or
  lightly played games, the estimate remains primary and Steam actual time is
  secondary when present. Insights currently prefers Steam actual time only for
  done-style status groups.
- Steam never silently changes backlog status or dates from sync activity. It
  may suggest marking a linked game as `playing`; filling a missing `started_at`
  from Steam is a separate, explicitly labelled approximate-date action.

## Steam Integration Current Shape

Steam V1 is an ownership/source layer with reviewed import. It intentionally
does not replace `catalog_games` or RAWG catalog identity.

Core decisions:

- Steam account linking uses Steam OpenID to identify the user's SteamID64.
  Private library import uses the backend-only `STEAM_WEB_API_KEY`; the key is
  never exposed to the frontend.
- Steam-owned apps are synced into `user_game_sources` and
  `steam_import_candidates` through a durable, checkpointed queue. Manual and
  scheduled runs enqueue the same job; the daily runner selects only linked,
  non-guest accounts that explicitly enable `auto_sync_enabled`. Owned-library
  snapshots are diffed before matching and achievement work, and only relevant
  new/changed linked games receive follow-up processing.
- `external_game_ids(source='steam')` attaches Steam app ids to catalog games
  where known. The internal catalog id remains the app's durable identity.
- Import is reviewed. Nothing should blindly flood the user's backlog. The user
  can improve matches, change a candidate match, choose a status before import,
  ignore candidates, import new games, or attach Steam ownership/playtime to an
  existing backlog game.
- Duplicate safety is critical. Import and attach flows perform final duplicate
  checks by Steam app id, catalog id, normalized title, and fuzzy title before
  creating a new `games` row.
- Existing backlog games can be linked to a synced Steam app from the edit-game
  modal. The edit modal shows Steam app name/id, store link, playtime, sync
  timestamp, achievement summary, and allows changing/unlinking the Steam app.
- Backlog source filters exist for linked/unlinked Steam games, Steam playtime,
  Steam-without-playtime, recently-played-on-Steam, and achievement summary
  cases. Backlog sorting can also use Steam last played.
- Linked backlog cards and game details can show subtle private Steam activity
  signals, such as `Started on Steam?`, when recent first-observed play suggests
  a non-playing/non-done status may be stale.
- `/steam/library` is a calmer synced-library overview for all Steam apps. It
  reuses the persisted import-candidate data to browse/search/filter/sort apps
  by open review, linked/in-backlog, needs match, likely non-game, hidden
  states, playtime, last played, and achievement summary states. Rows can open
  a detail/repair drawer for store, achievement sync, restore/hide, catalog
  match repair, linking to an existing backlog game, and add/link actions. It
  also shows first-observed Steam play activity and can reopen the last sync
  review.
- Steam Sync Review appears when actionable changes exist:
  newly played games, linked games whose status may be stale, and newly
  discovered Steam games. Review items are stored in `user_activity_events`,
  deduped while open, and can be reopened from `/steam/import` or
  `/steam/library` after reload or an unattended run.
- Steam achievements summary V1 is private. It stores only
  unlocked count, total count, completion percent, status, last sync timestamp,
  and failure state on `user_game_sources`; per-achievement detail is deferred.
  Library sync refreshes achievements only for relevant changed linked games;
  the explicit manual batch/per-game actions remain available. Summary-based
  completion/status suggestions can appear privately in Steam Library detail
  views.
- Hidden Steam apps stay hidden across future syncs until explicitly restored
  from Steam Import or Steam Library.
- Per-game hours source preference supports `auto`, `estimate`, and
  `steam_actual`, plus a lock flag. `auto` keeps the V1 policy: Steam actual
  time is primary for finished-style statuses, while planned/lightly-played
  games keep estimates primary.
- Public profiles do not expose Steam ownership, playtime, last played, or
  achievements in V1. Add explicit privacy controls before changing that.

Known rough edges from real-library testing:

- Large Steam libraries still need continued review UX testing. The import
  queue now keeps filters visible, hides advanced tools by default, uses larger
  capsule art, inline status editing, and one primary row action, but future
  work should still improve row detail disclosure, action naming, match repair,
  and the mental model for hidden/ignored/reviewed apps.
- Steam app matching improved from the first pass, but app names with symbols,
  subtitles, editions, remasters, DLC, demos, tools, soundtracks, and regional
  names still need more heuristics and more user correction tools.
- Duplicate cleanup exists, but import flows should continue to be tested
  heavily. A bad import can create confusing duplicate visual rows, especially
  when multiple Steam source rows point at the same catalog/title.
- Hours source behavior now has a small preference model for auto, estimate,
  Steam actual, and locked display/insights choice. A deeper split between
  manual, HLTB, RAWG, and other estimates is still future work.
- Wishlist import, configurable sync frequencies, full achievement detail,
  global achievement rarity, richer achievement-based status suggestions, better
  started/finished date intelligence, and public Steam privacy settings are
  deliberately not in V1. Last-played, first-observed play, achievement summary,
  and conservative private activity suggestions now exist.

## Known Current Risks

- UI/UX consistency Phases 1A, 1B, 2, 3, 4, 5, 6, 7, and 8 are complete.
- Phase 0 and Phase 1 are complete enough to move on from foundation/styling
  work. Keep updating this file when architecture changes.
- API error responses now flow through the central shape
  `{ error: { code, message, requestId } }` in the main auth, demo, public, and
  games route paths touched during Phase 0.
- First-party tests now use Node's built-in test runner via `npm test`.
- `src/pages/Backlog/BacklogPage.jsx` is still the main private backlog route
  coordinator, but mutation handlers now live in `useBacklogActions.js`.
- Shared UI primitives exist, but not every screen has migrated to them yet.
- Private and public pages now share display-list logic through
  `src/utils/gameList.js`.
- Auth, demo, and public-toggle calls now go through `authService`, while
  `AuthContext.jsx` owns only session state and optimistic user updates.
- Browser `alert` and `confirm` have been removed from reviewed frontend code.
  Use `useToast` for user feedback and `useConfirm` for destructive
  confirmation.
- Legacy RAWG cache behavior still exists for unlinked rows and add/edit form
  compatibility. New Discover/catalog metadata lives in Postgres.
- Same-rank reorder no longer infers a status change from the card being
  hovered. This protects `finished` and `played alot but didnt finish`, which
  can share an ordering rank, from accidental status overwrites.
- The API client retries transient GET network failures before surfacing a
  friendly status-0 `ApiError`, which helps production first loads recover while
  the backend wakes up. The private backlog fatal-load state includes an
  explicit retry action.
- Add-game duplicate detection uses shared title normalization in
  `src/utils/gameList.js` and blocks exact normalized title matches before the
  create request is sent. The backend repeats the duplicate check per user
  before insert and before edit/name changes.
- The add-game form includes optional `started_at` and `finished_at` fields. The
  frontend omits blank date keys so backend auto-date behavior remains intact.
- Add/edit game payload validation and API error message extraction are tested
  in `src/pages/Backlog/backlogForm.js`.
- Backend user-isolation query specs for list/select/delete/status-update are
  covered by tests in `backend/utils/gameAccess.test.js`.
- `backend/routes/games.integration.test.js` exercises the games router through
  Express with a mocked `pool.query`, covering duplicate create/edit handling,
  delete user scoping, and date-order validation before DB writes.
- The Playwright smoke suite in `tests/e2e/smoke.spec.js` uses mocked API
  routes and currently covers demo start, public profile read-only rendering,
  Insights-to-backlog filter navigation, add/edit/delete, same-rank reorder
  payload behavior, and public profile favorite settings.
- Catalog/metadata V1 exists, including migrations `004` and `005`, Discover,
  Postgres catalog cache, manual refresh, curated shelves, and provider-neutral
  external ids.
- Steam Integration V1/V1.2 plus the local activity-review polish exists behind
  migrations `006`, `007`, `008`, `009`, `010`, `018`, and `028`: linked
  account, durable manual/opt-in daily sync, persisted reviewed imports, duplicate attachment,
  searchable grouped/paginated import review, state-aware pile counts,
  whole-group actions, per-candidate status selection, manual Steam app linking
  from the private edit-game form, source badges, and Steam actual playtime for
  private backlog/insights. The
  private backlog UI resolves displayed/filterable hours through
  `src/utils/hours.js`, using Steam actual time as primary for finished and
  played-a-lot style statuses, while keeping estimates primary for planned or
  lightly played games and showing Steam time secondarily when useful. Steam
  last played and first-observed Steam play are exposed privately in backlog
  cards/details, sorting/filtering, edit Steam card context, Steam Sync Review,
  and the dedicated `/steam/library` page. Steam
  Achievements Summary V1 stores private per-user summary fields on
  `user_game_sources`, exposes per-game and batch sync endpoints, participates
  for relevant changed linked backlog games during library sync, and appears subtly in
  backlog cards plus more fully in the game modal, edit Steam card, Steam
  Library table, and Library detail drawer. Full achievement detail, public
  Steam privacy controls, global rarity, and wishlist import remain future
  work.
- Local development now uses `scripts/dev.js` behind `npm run dev` to preflight
  stale Node listeners on ports `5000`/`5173`, run backend and frontend
  together, and stop both sides when either process exits.

## Working Notes

- Always check current git status before editing. Older handoff notes may refer
  to worktree state from a previous session.
- Keep this file factual and compact. Put future ideas, priorities, and planning
  in `docs/ROADMAP.md`.
