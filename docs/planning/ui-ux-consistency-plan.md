# UI/UX Consistency And Editing Plan

Last updated: 2026-07-13

This is the focused implementation plan for the UI/UX findings reviewed after
the July 2026 frontend polish batch. It covers remaining work only. Use
[`../SYSTEM_CONTEXT.md`](../SYSTEM_CONTEXT.md) for current architecture,
[`../NEXT_TASKS.md`](../NEXT_TASKS.md) for the active queue, and
[`../ROADMAP.md`](../ROADMAP.md) for other product and engineering priorities.

The current worktree contains an uncommitted mixed frontend batch. Before
starting, inspect `git status`, the relevant diffs, and the current code. Do not
repeat completed fixes or overwrite unrelated changes.

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

### Phase 1: Small defects and shared media resilience

- Fix the corrupted separator in the Steam Library total/shown description.
- Replace internal copy such as `Private in V1`, `owner-only`, and implementation
  commentary with user-facing privacy and account language.
- Standardize Clear, Reset, Restore defaults, Remove, and view-mode wording.
- Standardize Steam terminology around `Steam Import Review`, `Review queue`,
  and `Open review queue`.
- Use `Posters` consistently where the UI names a poster collection view.
- Add full-name recovery for truncated game and list titles.
- Render manual list contents once their own request finishes; do not block the
  initial manual-list view on the full backlog needed for Add Games.
- Create a shared `GameCover` or `MediaImage` primitive with missing/broken URL
  fallback, lazy loading, asynchronous decoding, consistent aspect ratios, and
  initials/icon fallback.
- Adopt the shared media primitive across Lists, Reviews, Timeline, profiles,
  game modals/forms, Discover/search, and Steam surfaces.

### Phase 2: Shared interaction system

- Move active/selected/hover/pressed/focus recipes into shared primitives.
- Remove page-specific `SegmentedControl` active styling where it is not
  semantically required.
- Standardize filter buttons, tabs, select options, toggle cards, and navigation
  items.
- Use existing `rounded-control`, `rounded-card`, `rounded-panel`, and
  `rounded-dialog` tokens instead of incidental radius differences.
- Add shared form actions, search-field clearing, filter-button, tooltip, and
  tab patterns only where current repetition demonstrates a need.

### Phase 3: Manual-list editing redesign

Separate the current mixed editing model into clear workflows.

Normal list view:

- Add games.
- Edit details.
- Manage games/order.
- More menu with Delete.

Edit details:

- Edit name and description.
- Explicit Save changes and Cancel.
- Dirty-state indication and unsaved-change protection.

Manage games/order:

- Add, remove, and drag-reorder games.
- Persist those mutations immediately.
- Explain `Changes save automatically`.
- Use Done rather than a misleading Save/Cancel pair.

Also:

- Move the Lists parent link into a breadcrumb/navigation position.
- Preserve the cover-collage hero while bringing its action layout in line with
  shared page-header conventions.
- Make manual and smart metadata editing feel like the same system.
- Protect smart quick-filter autosaves from overlapping/stale responses and
  show saving status.
- Avoid a success toast for every item when adding several games.
- Add Poster- and Row-shaped list-detail skeletons.

### Phase 4: Unified game view/edit modal

- Use the polished game-view modal as the stable shell for both viewing and
  editing.
- Transition into edit mode in place instead of opening a visually unrelated
  editor.
- Preserve cover/hero, metadata, status, genres, Steam information, dates,
  score, hours, and notes placement between modes.
- Turn only appropriate display fields into inputs in edit mode.
- Add Save changes, Cancel, validation, dirty indication, and unsaved-change
  protection.
- Keep Delete visually separated.
- Verify missing covers, long names, Steam metadata, desktop, and mobile.

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

- Use loading/skeleton only while waiting.
- Use EmptyState only after a successful empty result.
- Use PageError for failed page requests with Retry.
- Use toast feedback for action-local failures when the current page remains
  usable.
- Replace Timeline's error-as-empty-state treatment.
- Add shape-matching skeletons for list detail, Reviews, Timeline, Steam
  Library, and important route-loading states.
- Minimize layout shifts between loading and loaded content.

### Phase 7: Accessibility and responsive polish

- Move important mobile touch targets toward 44px.
- Do not rely on browser `title` for important icon-only actions; use visible
  labels or an accessible tooltip pattern.
- Give custom/raw buttons the same focus-visible treatment as shared controls.
- Make Settings navigation an accessible tab system with tablist, tabs,
  selected state, keyboard navigation, and associated tab panels.
- Keep Settings sections URL-addressable and add a mobile horizontal-scroll
  affordance.
- Make sort direction expose both the current state and the action clicking will
  perform.
- Stack or expand modal footer actions on very narrow screens.
- Verify dense filter toolbars, long names, genres, descriptions, and Steam app
  names on mobile.

### Phase 8: Steam workflow polish

- Clarify that Steam Library is for browsing/syncing/inspection and Steam Import
  Review is for making import/match decisions.
- Give each screen one obvious primary action.
- Use progressive disclosure for matching, duplicate cleanup, bulk operations,
  and advanced tools.
- Explain what needs attention and the recommended next action.
- Use the same filter, category, selected, and action treatments as the rest of
  the app.
- Recheck dense Steam metrics, tables, filters, and action bars on mobile.

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
