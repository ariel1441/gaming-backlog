# Roadmap And Improvement Plan

Last updated: 2026-05-09

This is the planning document for improvements, feature ideas, cleanup, and
future work. It is intentionally editable. Add your own ideas, reorder items,
and turn this into the project plan over time.

For system facts and architecture context, use [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

## How To Use This File

- Keep broad ideas here until they become actual tickets or branches.
- Move chosen items into the summary plan near the top.
- When an item is completed, either remove it or mark it as done with a short
  note.
- If system behavior changes, update `SYSTEM_CONTEXT.md` too.

## Summary Plan

Current direction:

- [x] Phase 0: organize the codebase and standardize patterns before adding
  features.
- [x] Phase 1: fix known bugs and improve the core backlog experience.
- [ ] Phase 2: rebuild metadata, caching, and game discovery/add flows.
- [ ] Phase 3: add account, Steam, and larger library-management features.
- [ ] Phase 4: improve insights, public/social features, and recommendations.
- [ ] Phase 5: add deeper polish, tests, ops, and long-term product features.

## Updated Working Roadmap

This is the current combined plan after Phase 0. It includes the original
improvement ideas plus the latest requested priorities. Future agents should
prefer this section when choosing what to implement next.

### Phase 1: Core UX, Styling, And Bug Fixes

Goal: make the existing app feel better and fix high-friction behavior before
adding large new systems.

Recommended first bundle:

- [x] Fix the reorder/status bug where moving between `finished` and
  `played alot but didnt finish` can overwrite the dragged game's status with
  the target card status. These statuses share a rank, but reorder should not
  accidentally change status unless the user explicitly moves into another
  status lane/section. Done 2026-05-08: plain drag reorder now omits status and
  the backend treats status as optional/explicit on the reorder endpoint.
- Improve styling across the whole project:
  - [x] shared UI primitives for buttons, icon buttons, modal, field/input,
    select menu, badges, status badges, empty state, skeleton, toast, confirm,
    and panel surfaces
  - [x] private backlog top toolbar with inline search, sort, filters, view
    switch, account menu, and primary actions
  - [x] public profile now reuses the same `BacklogToolbar`, filter dropdowns,
    sort controls, completed shortcut, view switch, and game grid behavior as
    the private backlog, with read-only differences only
  - [x] card baseline pass: image-first cards, four compact stat pills, My
    Genre chips, no duplicate release date over the image, no RAWG genre noise
    in cards, neutral stat colors, and cleaner hover/image boundary
  - [x] game details modal cleanup: stores/features removed and core details
    simplified
  - [x] add/edit forms restyled into split contextual layouts with shared form
    controls
  - [x] dropdown/filter styling pass: custom select menu replaces native
    dropdowns and filter dropdowns use styled selectable rows
  - [x] loading/empty/error state baseline improved for backlog and public
    profile
  - [x] mobile polish for toolbar wrapping, dropdown positioning, forms, cards,
    and modals. Done 2026-05-09: header wrapping, mobile dropdown bounds,
    form layout, card fallback/timeline, and modal form ergonomics were
    improved during the final styling pass.
  - [x] final visual QA pass across hover/focus states, spacing scale, and
    responsive edge cases. Done 2026-05-09: complete enough for the current
    product surface; deeper browser/device QA remains a Phase 5 quality task.
  - [ ] insights panels after the insights data/content model is revised
- Redesign game cards:
  - [x] cleaner hierarchy for the default card
  - [x] remove unnecessary/noisy data from default cards
  - [x] clearer status, HLTB/hours, RAWG rating, Metacritic, date, and My Genre
    display in card grid
  - [x] better missing-cover fallback
  - [x] decide and implement baseline compact/grid/list display modes. Done
    2026-05-09: toolbar view controls now switch between grid, compact grid,
    and list layouts for private and public backlogs.
  - [x] make card density responsive enough for the current library size. Done
    2026-05-09: grid column widths, compact cards, and list mode give better
    scanning options; very large-library virtualization remains a Phase 5
    performance topic.
- Improve add/edit game forms:
  - [x] better validation messages. Done 2026-05-09: add/edit forms show field
    errors and duplicate-title messages from shared payload validation.
  - [x] submit/loading/disabled states. Done 2026-05-09: add/edit submits
    disable fields and show adding/saving labels while requests are pending.
  - [x] server-error display. Done 2026-05-09: add/edit modals render API
    errors in an inline alert area.
  - [x] date fields in the add flow, not only edit. Done 2026-05-08: add-game
    accepts optional started/finished dates while preserving backend auto-date
    behavior when fields are blank.
  - [x] focused payload validation tests. Done 2026-05-08: add/edit payload
    construction and API error message extraction are covered by
    `backlogForm.test.js`.
  - [x] clearer distinction between user-entered fields and metadata fields.
    Done 2026-05-09: RAWG matching is shown separately from personal progress,
    genre, score, and notes, with a collapsed change-metadata action in edit.
- [x] Add duplicate detection when adding a game. Done 2026-05-08: the add flow
  blocks exact normalized title matches using shared `gameList` helpers, and the
  backend repeats the per-user duplicate check before insert and edit/name
  changes.
- Improve drag-and-drop affordances, especially on mobile. Baseline is good
  enough for now after the card/grid responsive pass and same-rank reorder bug
  fix; deeper touch-device QA remains a Phase 5 quality task unless a specific
  issue appears in use.
- Improve demo flow:
  - clearer "save this demo" CTA
  - clearer expiration/temporary-session messaging
  - reduce accidental discard confusion
  - Deferred; the current flow is usable enough to move on from Phase 1.
- [x] Investigate production "Failed to fetch" on first open:
  - determine whether it is Railway free-tier cold start, CORS, backend sleep,
    request timing, or frontend retry behavior
  - add friendly loading/retry UI if cold starts are expected
  - make stats/status options recover without needing a manual refresh
  - Done 2026-05-08: added transient GET retry and friendly status-0 network
    errors in `apiClient`, plus a private backlog retry action for fatal loads.
- Add smoke tests for core flows once the UI stabilizes:
  - manual checklist added at
    [`testing/manual-smoke-checklist.md`](testing/manual-smoke-checklist.md)
    as an interim safety net
  - open app after cold load
  - start demo
  - add game
  - edit game
  - delete game
  - reorder same-rank statuses
  - public profile
  - insights

Phase 1 status:

- Complete enough to close and move on. Remaining UI work is now either tied to
  future data-model work, such as Insights, or belongs in Phase 5 quality and
  browser smoke testing.

Known follow-up from the styling pass:

- [x] Investigate unauthenticated `/api/games` requests after login or initial
  app load. Done 2026-05-09: `useGames` now waits for auth initialization and
  skips the private games request when there is no authenticated session, which
  avoids expected guest-load 401 noise.

### Phase 2: Metadata, Caching, And Game Discovery

Goal: replace the current "type a title and hope metadata matches" flow with a
real game-discovery and metadata system.

Core metadata/cache work:

- Before the large metadata/catalog refactor, read
  [`planning/metadata-catalog-refactor.md`](planning/metadata-catalog-refactor.md)
  for the current design notes, tradeoffs, and open decisions.
- Redesign RAWG/HLTB/Metacritic caching rules:
  - support refresh/expiry so stale cache entries do not stay forever
  - track failed lookups separately from real empty data
  - allow manual refresh for a game's metadata
  - avoid locking a game to old data when newer metadata appears
  - handle newly released games whose metadata is incomplete at first
  - make private/public hydration consistent where practical
  - preserve API quota with coalescing/rate limits
- Consider storing metadata source details:
  - RAWG id/slug
  - selected external game identity
  - HLTB source/title match
  - Metacritic source/platform if available
  - last fetched timestamp
  - failed fetch timestamp/reason
- Show hour/source labels:
  - manual/user estimate
  - HLTB
  - RAWG playtime
  - unknown/missing
- Let users override and lock preferred hour estimates.

Game discovery/add flow:

- [x] Add a searchable game picker before adding:
  - user searches title
  - app shows possible matching games
  - user manually chooses the correct game
  - chosen RAWG/external id is saved with the backlog item
  - Done 2026-05-09: add-game searches RAWG, saves `rawg_id`/`rawg_slug`,
    and uses selected identity during create/enrichment.
- Fix wrong-game matching when multiple games share the same/similar name.
- Allow browsing/searching a larger catalog of games and adding from there,
  similar to game collection websites.
- Add wishlist support as part of the discovery flow.
- Add metadata loading states while search/enrichment is happening.
- Add "metadata missing" actions:
  - retry lookup
  - choose different match
  - manually edit metadata-related fields where appropriate

Possible implementation direction:

- Add backend routes for game search and metadata refresh.
- Add a `backend/services/metadata` or similar layer only when it reduces
  duplicated RAWG/HLTB logic.
- Add a serializer for public/private game payloads so both routes use the same
  metadata shape.
- Add schema fields only through migrations and update `backend/schema.sql`.

### Phase 3: Account, Auth, Steam, And Library Management

Goal: add expected account/library features and make large libraries easier to
manage.

Account/auth:

- Add "forgot password" flow:
  - request reset
  - reset token storage/expiry
  - email delivery decision/provider
  - reset form
  - rate limiting and safe messaging
- Review other basic account gaps:
  - change password
  - change username
  - delete account
  - email field if password reset requires it
  - account settings page
  - optional stronger auth/session storage later
- Account settings should eventually become a broader settings area rather than
  a one-off password screen:
  - profile/account basics: username, password, email if needed for recovery
  - a signed-in "my profile" view that reuses the public profile overview
    sections for the owner, even before or without public sharing
  - public profile controls and privacy defaults
  - default view, sort, and filter preferences
  - manage saved My Genre options and future custom statuses
  - data export/delete account controls

Steam integration:

- Steam library import.
- Link Steam account/profile id.
- Import owned games into backlog/wishlist.
- Detect existing games and avoid duplicates.
- Optional Steam data:
  - playtime
  - achievements
  - last played
  - app id/platform/source
  - owned/not-started/completed hints if possible
- Allow re-sync and conflict review.
- Consider other imports later, but keep these behind the Steam/import work:
  - CSV/JSON import/export
  - Epic/GOG/PlayStation/Xbox/Nintendo/manual sources if feasible

Library management:

- Priority field.
- "Next up" queue.
- Pinned games.
- Platforms owned or intended platform. Lower priority for this project because
  the primary personal use case is Steam-only; revisit if non-Steam tracking or
  public-profile detail becomes important.
- Ownership source:
  - Steam
  - Epic
  - Game Pass
  - PlayStation
  - Switch
  - physical
  - borrowed
  - wishlist
- Tags beyond genre:
  - mood
  - difficulty
  - co-op
  - replayable
  - short
  - comfort game
  - requires focus
- Archive/hide games.
- Bulk edit:
  - status
  - genre
  - platform
  - tags
  - visibility
  - archive state
- Dense list/table view for large libraries.
- Card size options or compact mode.
- Group-by controls:
  - status
  - platform
  - priority
  - ownership source
- Later customization/settings ideas:
  - user-managed status labels and ordering
  - user-managed My Genre presets for add/edit forms
  - optional tag/mood presets for more flexible personal organization
  - safeguards for existing games before deleting/renaming a custom status

### Phase 4: Dates, Insights, Public Profiles, Social, And Recommendations

Goal: make the app more useful after the library data is richer.

Started/finished date integration:

- [x] Add date fields to add-game flow.
- [x] Add date sorting:
  - started date
  - finished date
- [x] Use dates in cards and modals more clearly.
- [x] Add first date-based insights:
  - started vs finished games per year
  - started/finished this year
  - currently active games
  - average start-to-finish duration
  - oldest active unfinished game
- Add date filters and click-throughs:
  - started before/after
  - finished before/after
  - finished this year/month
  - currently playing since
  - click a year in Insights to filter the backlog by started/finished year
  - active games older than 6 months
- Add date sorting later if schema supports it:
  - recently added/updated if schema supports it later
- Optional later date analytics:
  - monthly finished-game stats if yearly becomes too coarse
  - currently playing duration and active backlog aging buckets

Insights improvements:

- Defer the next full Insights redesign until the underlying metrics/data model
  are revised, so the layout follows the real information instead of polishing
  temporary charts.
- Score distribution.
- Hours by personal genre.
- Hours by platform/source after those fields exist.
- Missing-hours resolution dashboard.
- Click-through filters from insight widgets back to backlog.
- ETA improvements using real pace/history when enough data exists.
- Score distribution and "favorite/highest rated" summaries. This pairs well
  with public-profile polish and completion review work.

Public profile:

- Stronger public profile header. A share link already exists, so focus on
  making the profile feel useful and presentable:
  - stats
  - clearer share/copy action placement
  - currently playing
  - favorites/top rated
- Public profile sections:
  - currently playing
  - recently finished
  - top rated/favorites
  - completed
  - wishlist/next up if public
- Privacy controls:
  - thoughts
  - scores
  - started/finished dates
  - abandoned games
  - specific fields or sections
- Public profile filtered URLs for sharing subsets.

Completion review:

- Make finished games feel more like a personal log entry:
  - prompt for score, thoughts, and finished date when moving to finished
  - show a cleaner "My review" block in the game modal
  - optionally surface public reviews on the public profile when privacy allows
  - keep this lightweight; comments/social reviews are a later feature

Social/friends, later:

- Friend system or following.
- View friends' public/shared backlogs.
- Compare libraries.
- Recommendations based on friends/shared tags.
- Activity feed only if it stays lightweight and useful.

Recommendations, later:

- Basic recommendation engine:
  - based on tags/genres/status/ratings
  - "what should I play next?"
  - short-game recommendations
  - backlog priority suggestions
- Optional small AI-assisted recommendation feature:
  - explain why a game fits
  - suggest next games based on mood/time/platform
  - use only after privacy and cost boundaries are clear

### Phase 5: Quality, Performance, Ops, And Long-Term Polish

Goal: keep the app reliable as features grow.

- Browser smoke tests with Playwright or similar.
- Backend API tests:
  - auth/register/login/failure
  - forgot-password flow
  - game CRUD user isolation
  - reorder rank/status behavior
  - partial progress 2026-05-08: route-adjacent ownership query specs,
    validators, duplicate-title helpers, and reorder helpers now have Node tests.
  - partial progress 2026-05-08: games route integration tests now exercise the
    Express router with a mocked pool for duplicate create/edit, scoped delete,
    and date-order validation.
  - public profile visibility
  - metadata search/refresh/cache behavior
  - Steam import conflict handling
- Performance improvements:
  - code-splitting for the large Vite bundle
  - large-library virtualization or pagination
  - metadata request cancellation/coalescing
  - public profile hydration limits
- Ops/admin tools:
  - health/debug endpoint
  - cache status/admin refresh
  - demo template health
  - environment summary
  - DB connectivity check
- Security:
  - rate-limit metadata-heavy endpoints
  - rate-limit password reset
  - consider httpOnly secure cookies later
  - review CORS/CSP/security headers
- Data/schema:
  - deliberate indexes for new fields
  - backward-compatible migrations
  - keep `backend/schema.sql` in sync
  - backup/restore docs

### Current Top Priority Order

If another agent starts now, recommended order:

1. Finish the date-filter/click-through slice now that date sorting and first
   date insights exist.
2. Improve public profile presentation with stats, currently playing, recently
   finished, and top-rated sections while keeping the existing share link.
3. Add a lightweight browser smoke-test pass for the core flows.
4. Add lightweight completion-review polish around finished games.
5. Do small demo-flow copy/CTA refinements as they come up in use.
6. Plan the settings area: account basics, public/privacy controls, future
   custom statuses, and My Genre presets.
7. Redesign metadata caching/refresh around RAWG/HLTB/Metacritic.
8. Add Steam import/sync, including import/export decisions.

## Phase 0: Codebase Foundation

Goal: make the app easier, safer, and faster to change before adding new
features. This phase should mostly preserve current behavior while improving
structure, consistency, reuse, and testability.

### 0.1 Shared Frontend UI Primitives

Create reusable UI building blocks so future styling and behavior changes happen
in one place.

Target components:

- `Button`
- `IconButton`
- `Card`
- `Modal` / `Dialog`
- `ConfirmDialog`
- `Toast` / notification system
- `Field`
- `TextInput`
- `Textarea`
- `Select`
- `Checkbox`
- `Toggle`
- `Tabs` or segmented control
- `Toolbar`
- `FilterPanel` primitives
- `Table` / dense list primitives
- `EmptyState`
- `Skeleton`
- `Badge` / status pill

Rules for this pass:

- Start with the components already repeated across the app.
- Keep styles tied to existing Tailwind tokens.
- Avoid changing product behavior while extracting primitives.
- Make components flexible enough for private backlog, public profile, insights,
  and future admin/dev tools.
- Prefer icons from `lucide-react` for icon-only actions like close, clear,
  delete, edit, back, and refresh.

### 0.2 Shared Frontend Domain Logic

Extract repeated game-list logic so private and public pages do not drift.

Target shared logic:

- game sorting
- status/rank default ordering
- fuzzy search
- non-search filters
- hours range filtering
- genre parsing
- game display normalization
- empty-state decision logic
- URL query to filter state mapping
- shared form validation helpers

Likely places to create:

- `src/utils/gameSort.js`
- `src/utils/gameFilters.js`
- `src/utils/gameDisplay.js`
- `src/hooks/useGameListController.js`
- `src/pages/Backlog/` for private backlog page-level composition

Main cleanup target:

- Split `src/App.jsx` into smaller route/page pieces after extracting shared
  logic.

### 0.3 Backend Endpoint Convention

Create one consistent way to write backend endpoints.

Every endpoint should have a predictable shape:

1. route declaration
2. auth/guard middleware when needed
3. validation middleware
4. request parsing and normalization
5. data access/query/service call
6. response serialization
7. centralized error forwarding

Backend consistency targets:

- Normalize all API errors to `{ error: { code, message, requestId } }`.
- Add request ID middleware.
- Add a small `httpError` helper for intentional HTTP errors.
- Avoid direct ad hoc error responses where central error handling can be used.
- Add validators for auth, demo, public params, and public query/body inputs.
- Keep user-owned data scoped by `req.user.id`.
- Standardize route response serializers.
- Move repeated RAWG/HLTB/game serialization logic out of route files.
- Consider a `backend/services/` layer only where it reduces real duplication.

Potential backend structure:

- `backend/utils/httpError.js`
- `backend/middleware/requestId.js`
- `backend/services/gamesService.js`
- `backend/services/rawgService.js`
- `backend/services/hltbService.js`
- `backend/serializers/gameSerializer.js`

### 0.4 API Client And Auth Consistency

Make frontend API access consistent.

Targets:

- Route all auth calls through `src/services/authService.js` and
  `src/services/apiClient.js`.
- Keep token get/set/remove logic in one place.
- Normalize frontend `ApiError` handling.
- Make auth failure behavior intentional instead of scattered across callers.
- Make loading, success, and failure states consistent for forms and mutations.

### 0.5 Encoding / Mojibake Cleanup

Mojibake means text that was encoded/decoded incorrectly and now appears as
broken characters, for example strange glyphs in comments or UI labels where an
arrow, apostrophe, dash, emoji, or close icon was intended.

Targets:

- Replace broken visible UI text with plain text or lucide icons.
- Clean damaged comments so source files are readable.
- Avoid adding non-ASCII unless it is intentional and the file already supports
  it cleanly.
- Add a small check later to detect replacement characters or common mojibake
  patterns.

### 0.6 Project Structure And Naming

Make file locations match responsibility.

Targets:

- Move private backlog page logic into `src/pages/Backlog/`.
- Keep reusable UI components under `src/components/`.
- Keep app/domain logic in hooks and utils rather than page components.
- Keep backend route handlers thin when logic becomes shared.
- Prefer consistent naming for snake_case API fields and camelCase UI helpers.
- Document new conventions in `SYSTEM_CONTEXT.md` once settled.

### 0.7 Baseline Tests For Refactoring Safety

Add tests that protect the cleanup work before deeper feature changes.

First tests:

- `normStatus` and `statusGroupOf`.
- score, hour, and date normalization.
- game default ordering.
- shared filter logic.
- API error shape.
- authenticated game CRUD user isolation.
- reorder rank restrictions.

Tooling:

- Keep `npm run check` passing.
- Add `npm run test:watch` if useful.
- Remove `--passWithNoTests` only after real tests exist.

### 0.8 State Management Conventions

Decide where each kind of state should live so future features do not scatter
state across pages, hooks, contexts, localStorage, and URL params randomly.

Conventions to define:

- Page-local state for temporary UI state.
- Custom hooks for reusable page/domain behavior.
- Context only for truly app-wide state.
- URL query params for shareable/filterable view state.
- localStorage for user preferences, not core data truth.
- Backend/database as the source of truth for persisted product data.

Targets:

- Document when to create a hook versus a context.
- Keep private backlog, public profile, and insights state patterns aligned.
- Make loading/error/success state shape consistent across hooks.

### 0.9 Data Shape Conventions

Define how data moves between backend, services, hooks, and components.

Decisions to make:

- Whether API payloads stay `snake_case` all the way through the frontend, or
  get normalized to `camelCase` at the service boundary.
- How enriched fields like RAWG rating, HLTB hours, stores, features, and dates
  should be represented.
- How null, empty string, missing number, and missing date values should be
  handled.

Targets:

- Avoid mixed field naming inside components.
- Centralize game payload normalization.
- Keep public and private game payloads compatible where possible.

### 0.10 Permissions And Access Rules

Centralize permission decisions so edit/delete/public/demo behavior is not
checked differently in different components.

Targets:

- Add shared helpers for rules like `canEditGame`, `canDeleteGame`,
  `canReorderGames`, `canTogglePublicProfile`, and `isReadOnlyView`.
- Keep backend authorization as the real security boundary.
- Use frontend permission helpers only for UI affordances.
- Make guest, signed-in, public read-only, and future admin behavior explicit.

### 0.11 Loading, Error, And Empty State Pattern

Create one consistent pattern for async UI states.

Targets:

- Standard loading indicators and skeletons.
- Standard empty states for no data and no filter results.
- Standard error panels/toasts for failed requests.
- Standard mutation states for submit/loading/success/failure.
- Avoid raw `alert`, `confirm`, and scattered one-off error blocks.

### 0.12 Form System And Validation Pattern

Go beyond basic inputs and define how forms behave.

Targets:

- Reusable field wrappers with labels, help text, errors, disabled state, and
  required markers.
- Consistent client-side validation for simple rules.
- Consistent server-error display.
- Standard submit button loading/disabled behavior.
- Dirty-state handling where useful.
- Shared date/number parsing helpers.

### 0.13 Accessibility Baseline

Set the baseline before adding more UI.

Targets:

- Focus trapping and focus return for modals/dialogs.
- Keyboard support for modals, toolbar actions, and form controls.
- `aria-label` or visible labels for icon-only buttons.
- Reasonable heading order and landmark usage.
- Contrast checks for buttons, badges, charts, and disabled states.
- Reduced-motion friendliness for transitions where practical.

### 0.14 Logging, Observability, And Config

Make runtime behavior easier to debug without leaking secrets.

Backend targets:

- Request ID middleware.
- Safe structured logs for request failures.
- Consistent production versus development error output.
- Startup validation for required environment variables.
- Clear behavior when RAWG/demo/database config is missing.

Frontend targets:

- Consistent unexpected-error logging.
- No noisy `console.error` patterns for expected user-facing failures.
- Friendly messages for auth failures, network failures, and validation errors.

### 0.15 Migration And Data Rules

Keep schema/data changes predictable before adding more product fields.

Targets:

- Document when to add migrations versus seed changes.
- Keep migrations schema-only unless a feature explicitly requires data changes.
- Keep `backend/schema.sql` in sync with migrations.
- Define how demo template data should be handled.
- Prefer backward-compatible migrations.
- Add indexes deliberately as part of schema work.

### 0.16 Performance Guardrails

Define guardrails for places likely to become expensive.

Targets:

- RAWG fetch coalescing and cache behavior.
- Public profile hydration limits.
- Insights cache invalidation.
- Request cancellation for frontend list loads.
- Memoized derived game lists.
- Future large-list support such as pagination, virtualization, or compact table
  views.

### Phase 0 Completion Criteria

Phase 0 is done when:

- Shared UI primitives exist and key existing screens use them.
- Private and public game lists share sorting/filtering/search logic.
- Backend endpoints follow one visible convention.
- Error responses are consistent.
- Request IDs exist.
- State, data-shape, permissions, forms, and async UI conventions are documented
  and used in the touched code.
- Mojibake is cleaned from visible UI and important source comments.
- `src/App.jsx` is no longer the main home for all private backlog behavior.
- A small real test baseline exists.

Status: complete enough to move into Phase 1 feature/workflow improvements.
Future cleanup can continue opportunistically, but the foundation goals above
are now represented in code, docs, and tests.

Progress notes:

- Request ID middleware and a reusable `httpError` helper have been added.
- Auth middleware and the main auth route now use central error handling for
  common failures.
- Shared game-list utilities now power private and public display sorting and
  filtering.
- The first Node test baseline covers status grouping, normalization, and game
  list utilities.
- Shared UI primitives now exist under `src/components/ui/`.
- Add/edit/auth/demo/public-settings modals now use the shared `Modal`,
  `Button`, `Field`, and input primitives.
- Toast and confirm providers now exist, and browser `alert` / `confirm` calls
  have been removed from reviewed frontend code.
- `src/App.jsx` has been reduced to the provider/router shell.
- The private backlog route now lives in `src/pages/Backlog/BacklogPage.jsx`.
- Backlog panel rendering now lives in `src/pages/Backlog/BacklogPanels.jsx`.
- Backlog modal rendering now lives in `src/pages/Backlog/BacklogModals.jsx`.
- Backlog add, edit, delete, reorder, and surprise-game actions now live in
  `src/pages/Backlog/useBacklogActions.js`.
- `AuthContext` now routes auth, demo, `/me`, and public-toggle requests
  through `src/services/authService.js` and shared token helpers in
  `src/services/apiClient.js`.
- Demo and public backend routes now use Celebrate/Joi validators plus central
  `httpError` helpers instead of ad hoc `{ error: ... }` responses.
- Backend validator/error-handler mojibake in touched files has been replaced
  with plain ASCII text.
- Game route id/reorder/not-found/bad-request paths now use shared validators
  and central `httpError` helpers instead of direct `{ error: ... }` responses.
- Frontend permission helpers now live in `src/utils/permissions.js`, with tests
  covering edit, delete, reorder, public toggle, ownership, and read-only rules.
- Public profile controls now use shared `Button`, `IconButton`, `TextInput`,
  `Select`, and read-only game-grid behavior.
- Central backend error response shape has regression tests.

Deferred non-blocking cleanup:

- Add more shared primitives only when a feature needs them, such as table,
  tabs, toolbar, checkbox, and toggle components.
- Consider deeper backend service/serializer extraction for RAWG/HLTB/game
  payloads after more API tests exist.
- Add browser-level smoke tests for demo, add/edit/delete, reorder, public
  profile, and insights.

## Improve Existing Features

### API And Backend

- Normalize all API errors to `{ error: { code, message, requestId } }`.
- Add request ID middleware so logs and error responses can be correlated.
- Move RAWG serialization/cache helpers out of `backend/routes/games.js` and
  reuse them from public/private routes.
- Add validators for auth, demo, public params, and public query inputs.
- Make public RAWG hydration use the same throttling/coalescing/cache behavior
  as private hydration.
- Review insights cache invalidation so future analytics fields do not become
  stale.
- Add production startup validation for required env vars and allowed origins.
- Reduce noisy production-ish `console.log` calls.

### Auth And Demo

- Consolidate auth calls through `src/services/authService.js` and
  `apiClient.js`.
- Improve demo expiration visibility.
- Avoid accidental demo discard on simple refresh or temporary navigation.
- Make "save this demo" clearer and more prominent.
- Consider more secure token storage if the app becomes broadly public.

### Games And Metadata

- Show hour source labels: manual, HLTB, RAWG.
- Let users override and lock preferred hour estimates.
- Add duplicate detection when adding similar game titles.
- Add a RAWG/IGDB search picker instead of free-text-only add.
- Add better loading states while metadata hydrates.
- Improve game edit validation and server error display.
- Add date fields to the add flow, not only edit flow.

### Public Profiles

- Add a stronger public profile header with stats and share action.
- Make public toolbar match the private app controls more closely.
- Add public profile filtered URLs for sharing a subset.
- Add privacy controls for thoughts, scores, dates, abandoned games, or specific
  fields.

### Insights

- Add completion timeline charts.
- Add yearly/monthly finished-game stats.
- Add charts for score distribution and hours by custom genre.
- Make missing-hours resolution clearer and actionable.
- Add click-through filters for more insight widgets.

## New Feature Ideas

- Backlog priority field.
- "Next up" queue.
- Pinned games.
- Platforms owned or intended platform to play on.
- Ownership source: Steam, Epic, Game Pass, PlayStation, Switch, physical,
  borrowed, wishlist.
- Manual price/deal tracking.
- Tags beyond genre: mood, difficulty, co-op, replayable, short game, comfort
  game, requires focus.
- Play sessions and actual time tracking.
- Completion review: final notes, final score, date, screenshots/link.
- CSV/JSON import and export.
- Steam import.
- Bulk edit for status, genre, platform, tags, visibility, or archive state.
- Archive/hide games.
- Custom per-user statuses and per-user status order.
- Public profile sections: favorites, currently playing, completed, top rated.
- Admin/dev tools page for cache status, environment summary, demo template
  health, and DB connectivity.

## UI/UX Improvements

- Replace panel toggles with a more app-like command toolbar or responsive top
  bar on mobile.
- Add a dense list/table view for large libraries.
- Add card size options or compact mode.
- Add group-by controls, especially group by status/platform/priority.
- Add skeleton loaders for game cards, public profile, and insights.
- Add better empty states for no games, no filters, no public profile, and no
  insights.
- Improve modal accessibility and keyboard handling.
- Improve drag-and-drop affordances, especially on mobile.
- Use lucide icons consistently for close, clear, back, and destructive actions.
- Improve mobile layout for search, sort, filters, and public profile toolbar.
- Improve cover fallback visuals without external placeholder URLs.
- Add shared UI primitives: `Modal`, `Button`, `IconButton`, `Field`, `Select`,
  `Toast`, `ConfirmDialog`, `Toolbar`, `EmptyState`, `Skeleton`.
- Revisit visual theme so the app has more variation than dark navy plus orange
  accents.

## Organization And Structure

- Split `src/App.jsx` into route/page components:
  - `BacklogPage`
  - `BacklogToolbar`
  - `BacklogPanels`
  - `BacklogModals`
- Create shared domain utilities for:
  - game ordering
  - game filtering
  - game display normalization
  - metadata serialization
- Move private-backlog-specific code into `src/pages/Backlog/`.
- Keep reusable UI in `src/components/`.
- Consider a backend `services/` layer for RAWG, HLTB, game serialization, and
  insights calculations after tests exist.
- Use one source of truth for API base URLs and token operations.

## Testing And Quality

Add first tests for:

- `normStatus` and `statusGroupOf`.
- score, hour, and date normalization.
- game default sort order.
- `useFilters` behavior.
- auth route success and failure behavior.
- game CRUD user isolation.
- reorder restrictions.
- public profile visibility access.
- API error shape regression.

Tooling candidates:

- Add `npm run test:watch`.
- Add a lightweight Playwright smoke test for demo, add game, reorder, public
  profile, and insights.
- Add a check for mojibake/replacement characters.
- Remove `--passWithNoTests` once real tests exist.

## Database And API Ideas

Potential indexes:

- `games(user_id, status, position)`
- `games(user_id, id)`
- `users(username)`
- `users(is_guest, guest_expires_at)`

Potential schema additions:

- `games.platform`
- `games.priority`
- `games.ownership_source`
- `games.archived_at` or `games.is_archived`
- `games.updated_at`
- separated `estimated_hours`, `rawg_playtime`, and `manual_hours_override`
- tags child table
- play sessions child table
- per-user statuses table
- public profile settings table

## Security And Ops

- Add request IDs.
- Consider httpOnly secure cookies for auth if the project grows.
- Add stronger production security headers and CSP after asset needs are known.
- Rate-limit RAWG-triggering endpoints.
- Add admin-only health/cache/debug endpoint.
- Document production backup/restore.
