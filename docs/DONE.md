# Completed Milestones

Last updated: 2026-07-18

This is a compact archive of completed product and engineering milestones. It
exists so current planning files can contain only remaining work. For exact
current behavior and architecture, use [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md)
and the code.

## Product Baseline

- Private per-user backlog CRUD with statuses, manual ordering, genre, score,
  notes, dates, covers, and estimated hours.
- Shared search, filtering, sorting, hours ranges, date filters, multiple view
  modes, and duplicate-title detection.
- Guest/demo sessions and conversion into permanent accounts.
- Public read-only profiles with stats, favorites, currently playing, recently
  finished, and a full-library view.
- Signed-in owner profile at `/me`.
- Settings V1 with profile basics, generated avatars, public-profile controls,
  favorite selection, account-backed view/sort/landing preferences, CSV export,
  and integration shortcuts.
- Private manual ranked lists and smart rule-based lists.
- Timeline V1 generated from start and finish dates.
- Insights V1 for hours, ETA, statuses, genres, date summaries, and missing-hour
  data.
- Play Next & Resume V1 with a private ordered Next Up queue, deterministic
  explained picks, personal-genre mood filtering, active/returning separation,
  atomic Start playing, and private Next time notes.

## Catalog And Metadata

- RAWG search picker in add/edit flows.
- Provider-neutral catalog identity with external IDs.
- Cached RAWG search/detail metadata and stale/failure fallback.
- Discover V1 with curated cached shelves, search, detail, refresh, load more,
  and add-to-backlog.
- Discover full-detail hydration and manual refresh consolidated through the
  snapshot-aware metadata ingestion service, with scheduled freshness and
  stored-data fallback.
- Bounded per-user Discover response caching with immediate cached rendering,
  quiet API revalidation, and mutation-aware backlog/detail/shelf updates.
- Catalog metadata reuse across private, public, and Insights flows.
- Manual catalog refresh cooldown and optional catalog shelf seeding.
- Initial hours-source preference and lock behavior.

## Steam V1/V1.2

- Steam OpenID account linking and private manual library sync.
- Persisted import-review candidates with match correction, ignore/import
  decisions, and status selection.
- Duplicate attachment and repair tools.
- Dedicated Steam Library with search, sort, filters, detail/repair tools, and
  durable hidden state.
- Private ownership, actual playtime, last played, and achievement summaries.
- Steam Sync Review for newly observed activity.
- Separation of Steam actual playtime from estimated completion hours.

## Engineering Foundation

- React route/page extraction with Backlog code under `src/pages/Backlog/`.
- Shared UI primitives, toast, confirmation, service, permission, and game-list
  utility patterns.
- Central API client and auth service usage.
- Central backend error shape and request IDs.
- Celebrate/Joi validation baseline and scoped user-owned game queries.
- Catalog and Steam service layers.
- PostgreSQL migration runner with transactions, migration records, advisory
  locking, and a production GitHub Actions job.
- Hardened CI/CD gates with pinned Node/npm behavior, pull-request checks,
  fail-closed production migration requirements, deploy ordering, and
  documented exact-SHA production verification.
- Local database safety guard, environment summary, development port handling,
  and documented local/production workflows.
- Unit and mocked route/browser test baselines.

## July 2026 Audit Remediation

- Corrected authentication expiry ownership so permission `403` responses do
  not erase valid sessions; authenticated `401` responses notify
  `AuthContext` to clear memory and storage together.
- Bound Steam OpenID linking to a one-use browser nonce and stopped ordinary
  user match decisions from rewriting global Steam/catalog identities.
- Removed the invalid Steam write to `games.updated_at` and moved large Steam
  library syncs into durable, bounded jobs.
- Added atomic game writes, duplicate/position protection, database constraints,
  cross-owner relationship guards, and transactional Steam review/import paths.
- Added provider deadlines and typed outage handling, concurrency-safe catalog
  identity work, Insights cache/write protections, and stricter API validation.
- Hardened CSV exports, environment diagnostics, request IDs, PostgreSQL TLS,
  and password byte-length validation.
- Fixed derived-view reorder behavior, demo persistence, Insights request races,
  silent-refresh deletion reconciliation, private-profile states, modal focus,
  keyboard controls, and unknown/read-only route fallbacks.
- Added disposable real-Postgres schema, migration, ownership-constraint, and
  1,000-app Steam sync contracts. Repaired the real Playwright suite and added
  it to CI alongside route code splitting and a bundle budget.
- Added a real-Express/real-Postgres, two-user authorization contract for core
  game listing, update, deletion, reorder, and favorite ownership boundaries.
- Added the equivalent two-user contract for private Lists, covering list CRUD,
  manual membership, reorder, and cross-owner game/list boundaries.

The source audit remains in `docs/reviews/` as a historical snapshot. Commit
`34fb7c1` contains the broad remediation; later commits refined the affected
flows.

## Durable Metadata Repair And Rendering

- Added migrations `020` through `023` to reconcile historical game schema and
  establish durable metadata snapshots, repair jobs, and owner-scoped review
  candidates.
- Added canonical exact-RAWG ingestion, guarded historical cache import,
  resumable repair/audit tooling, reviewed ambiguous-match decisions, batch
  review, alternative search, and responsive Settings UX.
- Made normal backlog, Lists, public-profile, and Insights metadata rendering
  PostgreSQL-only and retired the process-local RAWG JSON runtime cache.
- Added controlled catalog refresh scheduling, release/audit runbooks, schema
  contracts, focused service coverage, and browser coverage for metadata review.

## UI/UX Consistency Phase 1A

- Separated personal genre, RAWG metadata genre, and Steam integration chip
  semantics while preserving all theme tokens.
- Unified selected personal genres in Add/Edit with cards, game details,
  Reviews, and manual-list rows.
- Reused canonical status badges in Add/Edit previews.
- Standardized page-level filter clearing, dropdown selection clearing, and
  neutral search-clear controls across the main repeated surfaces.
- Standardized personal/RAWG genre labels, private-list copy, and Steam Import
  Review terminology, including the Steam Library shown-count separator.
- Clarified sort-direction accessibility labels in Backlog and Reviews.

## UI/UX Consistency Phase 1B

- Added shared resilient `GameCover` artwork with missing/broken URL handling,
  lazy loading, asynchronous decoding, source-change recovery, and consistent
  initials/icon fallbacks.
- Adopted shared artwork across Backlog, Lists, Reviews, Timeline, profiles,
  Add/Edit/details, Discover/search, Steam, and metadata review surfaces.
- Added full-title recovery to affected truncated game/list labels.
- Allowed manual ranked lists to render from their own response without
  waiting for the full backlog; smart-list resolution and Add Games still wait
  for the data they require.

## UI/UX Consistency Phase 2

- Added semantic view-switch and connected-range variants to the shared
  segmented control and removed page-specific state styling.
- Added a distinct active-filter treatment across Backlog, Reviews, Timeline,
  and Steam selection controls.
- Standardized semantic control radius plus hover, pressed, focus-visible,
  open, disabled, and loading-capable states in shared buttons and selectors.
- Aligned repeated Backlog dropdown choices, list-type choices, Steam review
  categories, and Settings avatar selections with the shared interaction
  language.

## UI/UX Consistency Phase 3

- Separated manual-list metadata editing from autosaving game membership and
  ranking management.
- Unified manual and smart list detail editing with dirty-state and
  Save/Discard/Keep editing protection.
- Added smart quick-filter autosave status and stale-response protection,
  batched multi-add feedback, breadcrumbs, and Poster/Row detail skeletons.

## UI/UX Consistency Phase 4

- Unified owner game viewing and editing inside the existing detail modal,
  replacing the separate edit modal with one stable visual shell.
- Made title, status, hours, score, personal genres, notes, and activity dates
  editable in their existing display locations.
- Added a dedicated Metadata tab for RAWG matching plus Steam link and
  achievement actions.
- Added dirty-state feedback and Save/Discard/Keep editing protection when
  cancelling or closing with unsaved changes.

## UI/UX Consistency Phase 5

- Reduced mobile navigation to five primary destinations with a complete active
  treatment.
- Added an accessible More sheet containing every remaining destination and
  account action available from the desktop navigation.
- Added the signed-in profile avatar to the mobile header and completed
  responsive safe-area and dense-control polish.

## UI/UX Consistency Phase 6

- Standardized pending, failed, and successfully empty page states across the
  priority catalog, activity, review, profile, settings, and Steam routes.
- Added retryable page errors and shape-matching skeletons for Reviews,
  Timeline, Discover, Steam Library, list details, and lazy route transitions.
- Protected Discover and Steam Library loading states from stale overlapping
  responses.

## UI/UX Consistency Phase 7

- Increased important shared button and icon-button targets, and added
  hover/focus tooltips to important icon-only actions without relying on
  browser title attributes.
- Converted Settings navigation into URL-addressable tabs with selected and
  panel relationships, roving focus, arrow/Home/End keyboard navigation, and a
  clearer narrow-screen horizontal-scroll affordance.
- Made Backlog and Reviews sort direction visible as text while retaining an
  accessible description of the current state and next action.
- Added consistent focus-visible treatment to remaining high-priority custom
  controls, improved long Steam-name wrapping, and expanded Steam row actions.
- Made shared modal footers stack into full-width actions on very narrow
  screens without changing the mobile destination structure.

## UI/UX Consistency Phase 8

- Clarified Steam Library as the sync, browse, and inspection surface, with
  Steam Import Review owning import, match, and duplicate-link decisions.
- Kept Sync library as the Library primary action and added a recommended next
  decision to Steam Import Review based on the current queue.
- Moved batch achievement maintenance, whole-category actions, duplicate
  cleanup, and per-app connection repair behind progressive disclosure.
- Removed direct add/approve decisions from Steam Library details while keeping
  match and link repair available as supporting tools.
- Improved Steam category explanations, long-name wrapping, contextual row
  actions, and narrow-screen access to the dense Library table.

## Documentation And Workflow

- Durable repository rules in `AGENTS.md`.
- Current architecture handoff in `SYSTEM_CONTEXT.md`.
- Human AI-workflow guidance, templates, local skill drafts, and hook drafts.
- Manual smoke checklist and release/database safety guidance.

Completed milestones are summarized rather than recorded as a full changelog.
Use Git history when exact implementation dates or diffs are needed.
