# System Context

Last updated: 2026-05-09

This is the main handoff file for future chats. Keep it current when the system
changes so a new AI/chat can quickly understand the app without rereading the
whole repository. For plans, feature ideas, and improvement candidates, use
[`ROADMAP.md`](ROADMAP.md).

## Project Summary

This is a full-stack gaming backlog tracker. Users can track games, organize
them by status, enrich them with RAWG/HLTB metadata, view insights, try a guest
demo, and optionally publish a read-only public profile.

Tech stack:

- Frontend: React 18, Vite, React Router, Tailwind CSS, Recharts, dnd-kit.
- Backend: Express, PostgreSQL via `pg`, JWT auth, Celebrate/Joi validation.
- Deployment model: Vercel frontend, Railway backend/Postgres.
- Main app routes: `/`, `/insights`, `/u/:username`.

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
- Add games with optional started and finished dates, or let the backend
  continue auto-setting dates for eligible statuses when date fields are omitted.
- Search RAWG from the add/edit game forms and save or replace a selected RAWG
  identity when the user chooses a match.
- Enrich games from RAWG metadata and local HLTB data.
- Search, filter, sort, and drag-reorder games.
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

Routes:

- `backend/routes/auth.js` - register, login, `/me`, public-profile toggle.
- `backend/routes/demo.js` - guest session start, keep, discard, heartbeat.
- `backend/routes/games.js` - authenticated game CRUD, enrichment, reorder.
- `backend/routes/insights.js` - analytics aggregation and micro-cache.
- `backend/routes/public.js` - public profile metadata and read-only games.
- `backend/routes/meta.js` - status group definitions with ETag caching.

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

Database:

- `users`: username, password hash, public flag, guest flag, guest expiry,
  created timestamp.
- `statuses`: global status label and rank.
- `games`: user-owned game rows with status, position, custom fields, HLTB
  hours, score, notes, cover, RAWG identity fields, started date, and finished
  date.

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

- `src/hooks/useGames.js` - list, add, edit, delete, reorder, optimistic state,
  silent rehydration.
- `src/hooks/useFilters.js` - search/filter/sort/hour-range state and derived
  game lists.
- `src/hooks/useApplyFiltersFromQuery.js` - maps query params from insights to
  backlog filters.
- `src/hooks/useQueryBackedState.js` - URL/localStorage-backed insight controls.
- `src/hooks/useStatuses.js`, `useUI.js`, `useMedia.js`,
  `useDebouncedValue.js` - supporting UI/data hooks.
- `src/utils/gameList.js` - shared game-list filtering, sorting, fuzzy-search
  composition, CSV parsing, and hours-range filtering.
- `src/utils/permissions.js` - shared frontend permission helpers for writable
  versus read-only views, game ownership, reorder access, and public-profile
  toggles.

Services:

- `src/services/apiClient.js` - shared fetch wrapper, token helpers, latest
  request guard, transient GET network retry, `ApiError`. In local Vite dev it
  defaults API requests to `http://localhost:5000` when no API base env var is
  set.
- `src/services/gameService.js` - game API wrapper.
- `src/services/publicService.js` - public profile API wrapper.
- `src/services/insightsService.js` - insights API wrapper.
- `src/services/statusService.js` - status API wrapper.
- `src/services/authService.js` - auth, demo-session, `/me`, and public-toggle
  API wrapper used by `AuthContext`.

Important components/pages:

- `src/pages/Backlog/BacklogPage.jsx` - private backlog route and state/action
  coordinator.
- `src/pages/Backlog/BacklogPanels.jsx` - private backlog panel rendering.
- `src/pages/Backlog/BacklogModals.jsx` - private backlog modal rendering.
- `src/pages/Backlog/useBacklogActions.js` - private backlog mutation/action
  coordinator using the game service hook plus shared toast/confirm UI.
- `src/components/ui/` - shared UI primitives. Current exports include
  `Button`, `IconButton`, `Modal`, `Field`, `TextInput`, `Textarea`, `Select`,
  `Badge`, `EmptyState`, `Skeleton`, `ToastProvider` / `useToast`, and
  `ConfirmProvider` / `useConfirm`. New shared UI should prefer these before
  adding one-off Tailwind button/input/modal/feedback styles.
- `src/components/Sidebar.jsx` - main navigation/action rail.
- `src/components/GameGrid.jsx` - sortable or read-only grid.
- `src/components/GameCard.jsx` - game summary card.
- `src/components/GameModal.jsx` - detailed game metadata and notes.
- `src/components/AddGameForm.jsx` and `EditGameForm.jsx` - mutation forms.
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
- Private game routes enrich with RAWG/HLTB data.
- Guest users intentionally avoid RAWG fetches on private game routes to protect
  API quota.
- Manual ordering is based on status rank groups. Reordering across different
  ranks is rejected. Plain drag reorder updates positions only; the reorder API
  changes a game's status only when the client explicitly sends a same-rank
  target status.
- Status grouping should come from `backend/utils/status.js` and
  `/api/meta/status-groups`, not hardcoded in random UI code.
- Insights can write missing HLTB hour values back to the DB when it resolves
  them.
- Dates are SQL `DATE` fields and are parsed as `YYYY-MM-DD` strings to avoid
  timezone drift.
- Public profile hydration has separate RAWG logic from the private game route.

## Known Current Risks

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
- RAWG cache behavior differs between private and public routes.
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
- RAWG identity matching now exists, but the larger metadata/catalog refactor is
  intentionally deferred. Read `docs/planning/metadata-catalog-refactor.md`
  before implementing metadata refresh, game catalog browsing, Steam import
  matching, or automatic metadata jobs.

## Working Notes

- At the time this file was created, the worktree already had many modified
  files. Treat existing uncommitted changes as user work unless confirmed.
- Keep this file factual and compact. Put future ideas, priorities, and planning
  in `docs/ROADMAP.md`.
