# UI/UX Consistency And Editing Plan

Last updated: 2026-07-25

Status: completed historical plan. Phases 1A, 1B, 2, 3, 4, 5, 6, 7, and 8 are
complete. Remaining shared-table and visual-regression work is maintained in
[`../ROADMAP.md`](../ROADMAP.md) and should be driven by an active feature
rather than by reopening this broad track.

This is the preserved implementation plan for the UI/UX findings reviewed after
the July 2026 frontend polish batch. Use
[`../SYSTEM_CONTEXT.md`](../SYSTEM_CONTEXT.md) for current architecture,
[`../NEXT_TASKS.md`](../NEXT_TASKS.md) for the active queue, and
[`../ROADMAP.md`](../ROADMAP.md) for other product and engineering priorities.

The frontend batch described below is committed. Before starting a phase,
inspect `git status`, the relevant current code, and recent history. Revalidate
each listed item because later focused work may have completed part of it. Do
not repeat completed fixes or overwrite unrelated changes.

## Recently Completed Context

The current batch already includes these changes; verify them, but do not
reimplement them from scratch:

- Reused the private games provider across routes instead of loading the full
  backlog again on every private page.
- Kept `GET /api/games` database/cache-only instead of waiting for RAWG.
- Added lazy route modules, navigation preloading, and immediate route-loading
  feedback.
- Enlarged Backlog and manual-list row covers through a shared size recipe.
- Fixed the manual ranked-list missing-`useState` runtime error.
- Converted the list Poster/Row view choice from a dropdown to a segmented
  control and improved view naming.
- Made review genre chips theme-aware.
- Added saved-list collage image failure fallback and corrected its skeleton
  proportions.
- Added a shared rotating dropdown chevron and applied it to filter menus.
- Reordered Backlog Dates and Completed controls.
- Improved the desktop sidebar width/text animation and stabilized the account
  avatar position.
- Removed the redundant normal Reviews-to-Backlog action.
- Added a semantic danger-ghost treatment for Clear actions.
- Reduced overly bright light-theme card surfaces.
- Added bordered Cancel actions to list editing.

## Product-Wide Interaction Rules

Establish these rules before redesigning the larger editing experiences.

### Interaction states

Define shared visual recipes for default, hover, pressed, focus-visible,
selected, active, disabled, loading, danger, and dragging states. Standardize
three related but distinct selected treatments:

1. Active navigation destination.
2. Selected tab or segmented-control option.
3. Active filter or dropdown option.

Selected filters should tint the full control through background, border, text,
and icon. Pages should not override shared active-state styling without a
semantic reason. Preserve theme tokens and all four themes.

### Action hierarchy

- Use one primary action per action group.
- Use secondary actions for normal supporting work.
- Use ghost actions only for genuinely low-emphasis controls.
- Use danger-ghost for Clear and reversible removal actions.
- Use solid danger for the final destructive confirmation.
- Separate breadcrumbs/navigation from page actions.
- Keep Delete separate from Save/Edit, usually in a More menu or danger area.
- Place Cancel before Save and make action groups responsive on narrow screens.

### Persistence rules

- Autosave filters, sorting, view modes, theme selection, and similar low-risk
  preferences.
- Require explicit Save/Cancel for names, descriptions, notes, reviews, profile
  fields, and game edits.
- Save collection membership and ordering immediately only when the UI clearly
  says that those changes save automatically.
- Show subtle Saving, Saved, and retry/failure feedback for autosaving controls.
- Disable explicit Save until the draft is dirty and valid.
- Prevent stale or out-of-order responses from overwriting newer autosaved
  state.

### Unsaved changes

Build a shared unsaved-changes mechanism for internal navigation, sidebar
navigation, breadcrumbs, modal close, Escape, outside click, refresh, and tab
close. When saving is possible, offer:

- Save and leave.
- Discard changes.
- Keep editing.

Apply the mechanism to Lists, game editing, Settings profile/preferences, and
other explicit-save forms. Do not use browser `alert` or native `confirm`.

## Execution Plan

### Phase 1A: Semantic consistency and obvious mismatches

Completed in the focused Phase 1A implementation:

- Personal genre chips use primary theme identity colors across cards, forms,
  game details, Reviews, and manual-list rows.
- RAWG genre chips use neutral metadata styling, while Steam keeps its
  integration treatment.
- Add/Edit status previews use the shared canonical `StatusBadge`.
- Page-level filter resets use `Clear filters`, danger-ghost styling, and an X;
  single dropdown resets use `Clear selection`.
- Standard search fields use one neutral, accessible clear-button pattern.
- Personal/RAWG genre labels, private-list language, and Steam Import Review
  terminology are consistent across the touched surfaces.
- The Steam Library shown-count separator and contained sort-direction labels
  are corrected.

### Phase 1B: Shared media and title resilience

Completed in the focused Phase 1B implementation:

- `Posters` remains the consistent name for poster collection views.
- Truncated game and list titles expose their complete value on the affected
  cards, rows, search results, and detail surfaces.
- Manual ranked lists render when their own request completes; only smart-list
  resolution and Add Games wait for the full backlog.
- Shared `GameCover` handles missing and broken URLs, source changes, lazy
  loading, asynchronous decoding, reserved dimensions, and initials/icon
  fallbacks.
- The shared artwork primitive is used across Backlog, Lists, Reviews,
  Timeline, profiles, game modals/forms, Discover/search, Steam, and metadata
  review surfaces.

### Phase 2: Shared interaction system

Completed in the focused Phase 2 implementation:

- Shared primitives own standard hover, pressed, focus-visible, open, disabled,
  and loading-capable visual states.
- `SegmentedControl` provides semantic `view` and `connected` recipes; Backlog,
  Lists, Timeline, and Insights no longer redefine their active states.
- Active filters use a distinct `filterActive` button treatment with consistent
  full-control tinting and pressed semantics.
- Shared buttons, selects, multi-selects, switches, and repeated raw selection
  controls use the semantic `rounded-control` geometry.
- Backlog dropdown selections, Steam Import Review categories, Lists type
  choices, and Settings avatar choices use consistent selection and focus
  behavior.
- Active navigation remains separate from view selection and filter selection.

### Phase 3: Manual-list editing redesign

Completed:

- Separated normal manual-list actions into Add games, Edit details, Manage
  games/order, and a More menu containing Delete.
- Unified manual and smart metadata editing in one explicit Save changes /
  Cancel modal with dirty-state feedback and Save/Discard/Keep editing
  protection.
- Added a distinct manual management mode where add, remove, and drag-reorder
  mutations save immediately, expose Saving/Saved/error feedback, and finish
  with Done.
- Moved the Lists parent link into a breadcrumb while preserving the
  cover-collage hero.
- Added latest-response-wins protection and Saving/Saved feedback to smart-list
  quick-filter autosaves.
- Batched multi-add success feedback into one summary when the Add games modal
  closes.
- Added persisted Poster/Row selection and matching list-detail skeletons.

### Phase 4: Unified game view/edit modal

Completed:

- Reused the polished game-view modal as the stable shell for viewing and
  owner editing, removing the separate edit modal.
- Added an in-place transition that preserves the cover hero, title, status,
  metrics, genres, dates, Steam information, achievements, and notes layout.
- Converted visible owner fields into contextual controls while keeping
  provider-owned description, RAWG score, and Metacritic read-only.
- Added a dedicated Metadata tab for RAWG identity replacement and Steam
  linking, unlinking, and achievement sync.
- Added explicit Save changes and Cancel actions, field validation, dirty-state
  feedback, and Save/Discard/Keep editing protection for close, Escape, outside
  click, refresh, and tab close.
- Kept one Edit game action in view mode and a stacked narrow-screen edit
  footer.

### Phase 5: Mobile navigation

The fixed mobile bottom bar currently has six primary destinations and omits
desktop-only Steam destinations. Replace it with approximately five primary
destinations, for example:

- Backlog.
- Discover.
- Lists.
- Timeline.
- More.

Use a More sheet/drawer for Reviews, Insights, Steam Library, Steam Import
Review, Profile, Settings, and account actions. Ensure every desktop
destination remains discoverable on mobile. Use the real profile avatar in the
mobile header and give the active mobile destination a full selected treatment.

### Phase 6: Loading, error, and empty-state consistency

Completed:

- Reserved skeleton/loading states for pending authentication, account, route,
  and data requests, preventing false empty states while requests are active.
- Standardized retryable `PageError` treatment for Timeline, Discover, Steam
  Library, owner/public profiles, Settings backlog data, Reviews, Lists,
  Backlog, and Insights page failures.
- Kept action-local and pagination failures as toast feedback when existing
  page content remains usable.
- Added shape-matching skeletons for list detail Poster/Row modes, Reviews
  cards, Timeline Showcase/Poster modes, Steam Library metrics/table, Discover,
  and lazy route transitions.
- Added latest-request protection to Discover and Steam Library page loads so
  stale responses cannot replace newer filters or end a newer loading state.
- Preserved `EmptyState` for authenticated/sign-in gates, successful empty
  results, and no-filter-match outcomes.

### Phase 7: Accessibility and responsive polish

Completed:

- Increased important shared button/icon targets and replaced important
  icon-only browser-title reliance with hover/focus tooltips or visible labels.
- Added consistent focus-visible styling to the remaining priority custom
  controls.
- Converted Settings navigation into URL-addressable tabs with selected/panel
  semantics, roving focus, arrow/Home/End navigation, and a narrow-screen
  horizontal-scroll cue.
- Made Backlog and Reviews sort direction display its current state while its
  accessible label explains the next action.
- Stacked shared modal footer actions at very narrow widths.
- Improved dense Steam actions and long app-name behavior without changing the
  mobile navigation destination structure.

### Phase 8: Steam workflow polish

Completed:

- Clarified Steam Library as the sync, browse, and inspection screen, while
  Steam Import Review owns import, match, and duplicate-link decisions.
- Kept Library sync as the primary Library action and added a queue-aware
  recommended next action to Import Review.
- Moved batch achievement maintenance, whole-category actions, duplicate
  cleanup, and per-app connection repair behind progressive disclosure.
- Removed direct backlog-add decisions from Library details while preserving
  supporting match/link repair paths.
- Aligned categories, selected states, contextual row actions, long Steam
  names, and narrow-screen table access with the shared interaction system.

## Verification And Test Coverage

Add focused interaction coverage for:

- Sidebar position during expand/collapse.
- Mobile navigation and the More menu.
- Shared hover, pressed, selected, focus, disabled, and danger states.
- Broken/missing image fallback.
- Manual-list add/remove/reorder and metadata editing.
- Unsaved Save/Discard/Keep editing flows.
- Smart-list latest-request-wins behavior.
- Game modal view-to-edit transition.
- Loading/error/empty-state selection.

Perform responsive browser checks for desktop and mobile, expanded and collapsed
sidebar, all four themes, Lists Poster/Row views, game view/edit, Reviews,
Timeline, and Steam workflows. Run `npm run check` for shared UI, forms,
routing, or state changes. Add screenshot coverage only after the shared states
are stable enough to avoid encoding temporary decisions.

## Scope Boundaries

- Do not attempt all phases in one implementation.
- Start with one bounded phase and preserve current behavior unless the phase
  explicitly changes it.
- Do not redesign backend list or game persistence merely to improve UI wording.
- Preserve authenticated owner, guest/demo, and public read-only behavior.
- Keep existing semantic theme tokens and all four themes.
- Do not mechanically replace every specialized control; abstract only proven
  repetition.
- Move completed items to `DONE.md` and remove them from this plan when the
  corresponding phase is genuinely finished.
