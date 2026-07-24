# Remaining Roadmap

Last updated: 2026-07-18

This file contains only work that is still open. Completed milestones belong in
[`DONE.md`](DONE.md), while current architecture and product behavior belong in
[`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

The comprehensive project audit is preserved as a historical pre-remediation
snapshot. Its broad remediation is summarized in [`DONE.md`](DONE.md). Reopen a
specific finding only when current code or a regression demonstrates that work
remains.

## Engineering Follow-Up

- Expand real-Postgres route-level authorization coverage later for demonstrated
  Steam review/import or metadata-repair gaps. Core games and private Lists are
  covered; existing Steam and metadata service contracts make this a follow-up,
  not a blocker for UI work.
- Add pagination or virtualization where large backlog or library views still
  render unbounded result sets.
- Continue mobile layout and drag-and-drop polish.
- Add migration-failure notification around the existing fail-closed
  migration-status and schema-contract workflow.
- Document a complete production backup and restore procedure. Existing release
  guidance requires a restorable backup but is not a standalone restore
  runbook.
- Add database-aware readiness plus safe diagnostic views for cache,
  environment, migration, and demo-template health. `/healthz` is currently
  process liveness only.

## Shared UI System And Visual Test Foundation — medium/large

The concrete screen-level findings, persistence rules, list-editor redesign,
unified game-modal direction, mobile navigation proposal, execution phases, and
acceptance boundaries are maintained in
[`planning/ui-ux-consistency-plan.md`](planning/ui-ux-consistency-plan.md).
Use that focused plan when this track is selected; keep this section as the
broader shared-system direction.

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

### Play Next V2: Mood And Session Matching — medium

V1 is implemented. Its historical boundary is preserved in
[`planning/play-next-resume-v1.md`](planning/play-next-resume-v1.md). The
recommended V2 controls, genre mapping, trait model, deterministic scoring,
privacy rules, and implementation sequence are maintained in
[`planning/play-next-session-matching-v2.md`](planning/play-next-session-matching-v2.md).

- Add compact Time, Experience, and My Genre controls.
- Derive conservative defaults only from personal genres; never silently use
  RAWG genres.
- Add optional private per-game `session_traits` overrides without requiring
  existing games to be configured.
- Rank using explicit, reliable, weak, and unknown evidence distinctly.
- Keep every reason factual, deterministic, and based only on private library
  data.
- Keep Finish Game, AI, provider calls, event history, and public sharing out of
  this track.

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

### Completion Flow And Reviews — medium

- Prompt for score, thoughts, and finish date when marking a game finished.
- Add a focused My Review presentation.
- Separate public review copy from private notes.
- Optionally choose the next game after recording completion.
- Later add spoiler and visibility controls.

### Timeline V2 / Journal — medium to large

- Add generated events only when the underlying timestamp is trustworthy.
- Design a durable `activity_events` or `game_events` model for status, score,
  favorite, review, import, sync-review, and journal changes.
- Add optional play sessions with date, duration, progress, and notes.
- Add multiple playthroughs only after game-level events and completion
  semantics are stable.
- Keep activity private until visibility rules are designed.

### Library Control Center — medium/large

- Normalize personal genre values consistently.
- Add first-class personal tags such as mood, difficulty, co-op, short, comfort,
  replayable, and focus-required.
- Add saved views for reusable filter, sort, grouping, density, and visible-field
  configurations; decide explicitly how they differ from smart Lists.
- Add a Needs Attention view for stale Playing games, missing dates/hours,
  duplicate candidates, unmatched metadata, provider failures, and
  unclassified imports.
- Add global private search across games, Lists, reviews/notes, and personal
  tags as those data types become durable.
- Add platform and ownership-source fields when non-Steam tracking is chosen.
- Add archive/hide, bulk edit, and group-by controls.
- Add user-managed genre/tag presets.

### Data Export And Import — medium/large

- Add safe JSON export.
- Add previewed CSV/JSON import with validation, conflict, duplicate, and
  rollback behavior.
- Add provider-neutral import-run summaries, history, and undo before expanding
  automatic integrations.
- Consider a Playnite JSON/CSV bridge after the ownership/source model is
  provider-neutral.
- Improve safeguards around production-derived local data.
- Consider console/manual library imports later.

### Catalog And Metadata Follow-Up — medium/large

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
- Series/franchise tracking with release order, play order, ownership, and
  completion progress.
- Personal release calendar, optional price/availability watch, and digest
  notifications after wishlist/ownership relationships exist.
- Friends/following, library comparison, social activity, and moderation.
- Recommendation engine using backlog data, time, mood, and eventually social
  signals.
- Collaborative Lists and a share-link Game Night Room after collaboration
  roles, privacy, abuse, and moderation boundaries are designed.
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
- Add a private command palette only when common actions have stable,
  keyboard-accessible commands.
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
