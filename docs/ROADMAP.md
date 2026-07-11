# Remaining Roadmap

Last updated: 2026-07-11

This file contains only work that is still open. Completed milestones belong in
[`DONE.md`](DONE.md), while current architecture and product behavior belong in
[`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

Before choosing feature work, review the unresolved findings in
[`reviews/comprehensive-project-audit.md`](reviews/comprehensive-project-audit.md).
That audit currently takes priority over most product expansion.

## Priority 0: Security, Integrity, And Runtime Correctness

Work in small remediation groups; do not attempt this entire section as one
change.

- Fix authentication state so unrelated `403` responses do not clear a valid
  session.
- Bind Steam OpenID linking to the browser/session that initiated it.
- Prevent user Steam match decisions from changing global Steam/catalog
  mappings.
- Remove the Steam status-suggestion write to nonexistent `games.updated_at`.
- Make duplicate detection and position allocation atomic.
- Add database enforcement for title uniqueness, valid dates/date order,
  numeric bounds, positions, and cross-owner relationships.
- Preserve manual-list membership during duplicate merges.
- Make related Steam review/import writes transactional.
- Prevent Insights enrichment from overwriting concurrent manual edits.
- Make catalog identity upserts concurrency-safe.
- Neutralize spreadsheet formulas in CSV exports.
- Fully redact environment diagnostics and sanitize request IDs before logging.
- Verify hosted PostgreSQL certificates and define a password byte-length
  policy.

## Priority 1: API And Provider Reliability

- Validate existing statuses and real calendar dates before SQL writes.
- Allow users to clear estimated hours.
- Invalidate Insights caches after hour-source preference changes.
- Reject unknown or ignored API fields consistently.
- Add deadlines to RAWG and Steam calls.
- Distinguish provider failure from a legitimate empty RAWG result.
- Fix catalog collection pagination gaps.
- Bound public RAWG hydration and cache growth.
- Bound or move large Steam sync work so large libraries do not cause long,
  partially completed requests.

## Priority 2: Frontend Correctness And Accessibility

- Disable reorder in derived views or correctly translate filtered/sorted moves
  into canonical list positions.
- Stop deleting demos on refresh, unload, or temporary navigation.
- Make Insights URL state and network results latest-request-wins.
- Reconcile deleted games during silent refresh.
- Render the intended signed-in private-profile state.
- Complete modal focus trapping, focus return, and stacked-dialog behavior.
- Make cards, custom selects, and listboxes keyboard-operable.
- Add intentional read-only and unknown-route fallbacks.
- Continue mobile layout and drag-and-drop polish.

## Priority 3: Tests, Performance, And Operations

- Add real-Postgres authorization, schema, transaction, and migration tests.
- Repair the Playwright suite, stop mocking Playwright itself, and add the real
  browser suite to the full CI gate when stable.
- Make migration automation safe to bootstrap on existing databases.
- Reconcile `backend/schema.sql`, tracked migrations, and the schema-only
  migration policy.
- Make setup and check commands reproducible.
- Code-split the large frontend bundle.
- Add pagination or virtualization for large libraries.
- Remove manual-list preview N+1 queries.
- Centralize remaining status semantics and remove dead legacy UI/admin naming.
- Add a migration-status workflow, staging migration checks, backup checkpoints,
  failure notifications, rollback notes, and schema-parity CI checks.
- Document production backup and restore.
- Add safe operational views for cache, environment, demo-template, and database
  health.

## Shared UI System And Visual Test Foundation — medium/large

Consolidate the improved frontend styling into a maintainable shared system
without redesigning the product, changing behavior, or replacing specialized
components mechanically.

- Add a development-only UI showcase covering shared components, important
  interaction states, responsive behavior, and all four themes.
- Build a reusable table foundation for containers, headers, rows, cells,
  sticky/action columns, density, selection/hover, loading, and empty states.
- Add shared form actions for consistent save/cancel placement, modal footers,
  widths, spacing, and responsive wrapping.
- Reorganize shared UI so implementation, variants, tests, and styling recipes
  are easy to locate together.
- Document semantic visual roles for primary, secondary, integration, metadata,
  status, selected, focus, danger, and media-overlay treatments.
- Standardize repeated dimensions such as control/input heights, icon sizes,
  table row heights, action-column widths, and compact/normal density.
- Centralize meaningful repeated interaction recipes: hover, pressed, selected,
  focus-visible, disabled, loading, destructive, and dragging.
- Reduce repeated Tailwind strings and one-off overrides where a proven shared
  recipe exists, while keeping genuinely different page components specialized.
- Add shared interactive-card and grouped dropdown-option patterns where real
  repetition supports them.
- Standardize modal footers and table truncation/tooltip behavior.
- Improve RTL and sticky-column behavior where relevant.
- Use shadows, glows, borders, and accent hover colors deliberately and
  consistently.
- Add representative screenshot tests for the showcase and major shared
  components in every theme.

Constraints and verification:

- Preserve the current design, semantic tokens, runtime theme architecture,
  existing behavior, and all four themes.
- Avoid a giant rewrite or mechanical replacement of every table/card.
- Derive controlled abstractions from observed repetition.
- Verify with lint, tests, production build, responsive browser checks, and
  cross-theme visual comparisons.

## Product Candidates

These are candidates, not commitments. Choose and plan one before implementation.

### Next Up / Priority Queue — medium

- Add a priority/pinned model or a separate ranked queue.
- Provide a `/next-up` page or Backlog tab.
- Support short-game and high-priority views.
- Optionally make Surprise Me queue-aware.
- Keep queue ordering independent from status and manual-list ordering.

### Insights V2 — medium/large

- Add year/all-time controls.
- Add score distribution and hours by personal genre.
- Add platform/source analytics after those fields exist.
- Make missing-hours resolution more actionable.
- Expand chart-to-backlog click-throughs.
- Add monthly completion and active-game aging views when useful.
- Improve ETA only when enough pace/history data exists.

### Public Profile Privacy And Showcase — medium/large

- Model profile, full-library, field, and module visibility.
- Add explicit privacy for scores, reviews/notes, dates, abandoned games,
  wishlist, favorites, and Steam data. Steam remains private by default.
- Add favorite drag reorder, quick favorite actions, and slot replacement.
- Add completed highlights, pinned lists/modules, filtered share URLs, and
  better profile empty states.
- Consider accent/banner/layout customization only after privacy controls.

### Completion Reviews — medium

- Prompt for score, thoughts, and finish date when marking a game finished.
- Add a focused My Review presentation.
- Separate public review copy from private notes.
- Later add spoiler and visibility controls.

### Timeline V2 / Journal — medium to large

- Add generated events only when the underlying timestamp is trustworthy.
- Design a durable `activity_events` or `game_events` model for status, score,
  favorite, review, import, sync-review, and journal changes.
- Add optional play sessions with date, duration, progress, and notes.
- Keep activity private until visibility rules are designed.

### Personal Organization — medium/large

- Normalize personal genre values consistently.
- Add first-class personal tags such as mood, difficulty, co-op, short, comfort,
  replayable, and focus-required.
- Add platform and ownership-source fields when non-Steam tracking is chosen.
- Add archive/hide, bulk edit, and group-by controls.
- Add user-managed genre/tag presets.

### Data Export And Import — medium/large

- Add safe JSON export.
- Add previewed CSV/JSON import with validation, conflict, duplicate, and
  rollback behavior.
- Improve safeguards around production-derived local data.
- Consider console/manual library imports later.

### Catalog And Metadata Follow-Up — medium/large

- Let users repair/change an existing catalog match.
- Add manual metadata overrides only for demonstrated user needs.
- Refine hours-source labels, precedence, locking, and cache behavior.
- Decide how editions, remasters, DLC, bundles, and platform variants behave.
- Revisit wishlist/ownership as catalog relationships only after choosing a
  durable relationship model.
- Consider other metadata providers only after RAWG/Steam reliability work.

### Steam Follow-Up — medium to very large

Steam V1 is a stopping point. Expand it only when explicitly selected.

- Perform real-library QA and improve match repair/memory.
- Add Steam privacy controls before exposing any Steam data publicly.
- Consider achievement detail and rarity.
- Consider scheduled/background sync only with bounded job processing and
  operational visibility.
- Consider better date/status suggestions without silently changing user data.

## Larger Product Tracks

These require separate product planning before implementation.

- Unified Library for backlog, wishlist, ownership, ignored, and hidden
  catalog relationships.
- Durable activity/event and play-session architecture.
- Public lists, pinned profile modules, likes, and comments.
- Custom per-user statuses while preserving canonical semantic groups.
- Account security V3: password/username change, email recovery, account
  deletion, and full data portability.
- Goals, challenges, progress recaps, and badges.
- Local catalog game pages.
- Friends/following, library comparison, social activity, and moderation.
- Recommendation engine using backlog data, time, mood, and eventually social
  signals.
- Non-Steam provider and console/physical collection support.
- TypeScript migration; treat as a dedicated repository-wide refactor, not
  incidental cleanup.

## Small Opportunistic Improvements

- Use the shared chart-empty state consistently.
- Improve demo expiration/save copy.
- Improve feature-specific empty states and cover fallbacks.
- Standardize icons and mobile drag affordances.
- Add arbitrary date ranges and finished-this-month filtering if demanded.
- Add recently added/updated sorting after timestamps support it.
- Add a true dense/virtualized table for large libraries.
- Add a mojibake/replacement-character check and a test watch command.
- Reduce noisy production logs.
- Add shared table/tabs/toolbar primitives only when an active feature needs
  them.
- Revisit the visual theme after functional/accessibility work is stable.

## Selection Rule

1. Resolve or deliberately defer the relevant audit findings.
2. Choose one bounded roadmap item.
3. Write acceptance criteria and identify schema/privacy risks.
4. Implement, review, verify, and release as separate phases for large work.
5. Move completed work to [`DONE.md`](DONE.md); do not leave completed checklist
   items in this file.
