# Remaining Roadmap

Last updated: 2026-08-08

This file contains only open work. Completed milestones belong in
[`DONE.md`](DONE.md), current behavior belongs in
[`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md), and the immediate queue belongs in
[`NEXT_TASKS.md`](NEXT_TASKS.md).

The July 2026 audit is a historical pre-remediation snapshot. Reopen an old
finding only when current code or a demonstrated regression shows that work
remains.

## Current Direction

The selected product sequence is:

1. Close out current production verification.
2. Personal Genre And Status Model V1.
3. Main-backlog table view plus the remaining shared-table foundation.
4. Library Needs Attention data cleanup.
5. Insights V2.
6. Modular public-profile organization and privacy.
7. Opt-in daily Steam sync that processes only changed games.

Play Next & Resume V1 and Finish Game V1 are complete. Play Next V2 remains a
planned later candidate rather than part of the selected sequence.

## Short-Term Closeout

- Independently confirm that the latest approved `main` SHA is healthy in
  GitHub Actions, Railway, Vercel, and representative production routes.
- Continue small mobile drag-and-drop, empty-state, cover-fallback, demo-copy,
  and production-log improvements only when a demonstrated issue warrants them.
- Keep private thoughts private. Public review copy, spoiler controls, and
  visibility belong to public-profile modernization rather than Finish Game V1.

## Selected Medium-Term Work

### Personal Genre And Status Model V1 — medium/large

This is the next planning task because Library Control Center, Insights V2,
public profiles, table views, and later recommendation work all depend on it.
The focused implementation plan is
[`planning/personal-genre-status-v1.md`](planning/personal-genre-status-v1.md).

Personal Genre:

- Replace comma-separated `my_genre` storage with a backward-compatible
  user-owned genre model.
- Preserve existing values while normalizing matching, whitespace, and casing.
- Support multiple genres per game, autocomplete from the user's library, and
  reusable user-managed presets.
- Support safe rename, merge, and deletion of unused personal genres.
- Keep personal genres visibly and behaviorally separate from RAWG/provider
  genres.
- Preserve filtering, sorting, Lists, Insights links, CSV behavior, Play Next,
  owner/demo flows, and public read-only serialization during migration.

Statuses:

- Keep the current presentation-only **Dropped** label for the legacy
  `played and wont come back` value when the larger grouped-status refactor is
  implemented.
- Separate stable internal identity from user-facing wording.
- Preserve canonical semantic groups such as planned, playing, returning, done,
  and other/inactive behavior.
- Review the current twelve statuses for clearer language and meaningful
  overlap before deciding whether to rename, deprecate, or combine any values.
- Store explicit display label, description, rank, and semantic group rather
  than using the visible sentence as every layer of identity.
- Preserve rank-group ordering, same-rank drag behavior, Insights, Lists,
  automatic lists, Steam suggestions, Finish Game, and historical rows.
- Treat schema migration, API compatibility, and public display changes as one
  reviewed plan rather than a text-only rename.

### Backlog Table And Shared Table Foundation — medium

Add a fourth main-backlog view alongside Cards, Compact, and Rows:

- Build a desktop-first responsive table for cover/title, status, personal
  genres, hours, score, dates, optional private Steam context, and actions.
- Support column sorting, sticky headers/actions, resilient truncation, loading,
  empty, and error states.
- Preserve owner, guest/demo, and read-only boundaries.
- Support manual drag ordering only where the existing sort/rank rules allow it.
- Save Table as an account-backed default backlog view.
- Use a reduced table or the existing Rows presentation where narrow screens
  cannot support the full table clearly.
- Add pagination or virtualization when large-library evidence warrants it.

Use this feature to derive the remaining shared table primitives for containers,
headers, rows, cells, density, selection/hover, sticky actions, skeletons, and
empty states. Do not begin another product-wide visual rewrite.

Remaining visual foundation after the completed UI/UX consistency phases:

- Add a development-only shared-component showcase covering important states
  and all four themes.
- Add representative screenshot coverage for the table foundation and major
  shared components across themes.
- Standardize table row heights, action-column widths, density, and
  truncation/tooltip behavior where the feature proves a shared recipe.
- Extract shared form actions or footer patterns only where current repetition
  justifies them.

### Library Needs Attention — medium

Add a focused data-quality view after the table foundation and before Insights
V2. It should make the data behind filters and analytics easier to trust without
starting the full Library Control Center expansion.

- Find stale Playing games and games missing personal genres, dates, hours, or
  useful metadata.
- Surface likely duplicates, unresolved metadata matches, provider failures,
  and unclassified Steam imports.
- Link every issue to the existing focused edit, metadata-review, or Steam
  repair flow instead of duplicating those tools.
- Support safe issue dismissal only where the underlying condition can be
  deterministically remembered.
- Preserve owner/demo isolation and keep all cleanup information private.

### Insights V2 — medium/large

Implement after genre and status identities are stable:

- Add year versus all-time controls.
- Add score distribution and hours/completions by personal genre.
- Add monthly completion and active-game aging views.
- Make missing-hours and other missing-data resolution more actionable.
- Expand chart-to-backlog click-throughs.
- Add platform/source analytics after those fields are durable.
- Improve ETA only when pace and history data are reliable enough.
- Consider arbitrary ranges and comparisons after the initial controls prove
  useful.

### Modular Public Profile Organization And Privacy — medium/large

Audit every newer private feature and explicitly classify it as private,
optionally shareable, or appropriate for public display.

- Model profile, full-library, field, and module visibility.
- Separate future public review copy from existing private thoughts.
- Add explicit privacy for scores, dates, statuses, reviews, abandoned games,
  favorites, and Steam data.
- Keep Steam ownership, playtime, last played, achievements, Next Up,
  resume notes, and sync activity private unless the owner explicitly enables a
  reviewed public setting.
- Bring public status labels and personal genres onto the new stable models.
- Add favorite drag reorder, quick favorite actions, and slot replacement.
- Add completed highlights, pinned public Lists/modules, filtered share URLs,
  and stronger public empty states.
- Consider accent, banner, and layout customization only after privacy behavior
  is complete.
- Add public-safe series progress later when series tracking exists.

### Opt-In Incremental Daily Steam Sync — medium/large

Build on the existing durable, bounded Steam sync jobs. The daily run must
process only new or changed games and must not silently change personal status
or dates.

User controls:

- Automatic sync on/off.
- Preferred local morning time and timezone.
- Last attempt, last success, next scheduled run, and current failure state.
- Manual Sync now remains available.

Smart sync behavior:

- Fetch Steam's lightweight owned-library snapshot, then compare app ID,
  playtime, last played, and stored source state.
- Skip unchanged database writes and matching/review work.
- Process only new or changed apps through source, candidate, and review logic.
- Update linked backlog playtime only when the source changed.
- Refresh achievements primarily for games whose playtime or last-played value
  changed.
- Use a bounded rotating stale-refresh budget so achievement summaries do not
  remain outdated indefinitely.
- Create a Steam Sync Review only for actionable changes.
- Retry transient provider failures with backoff without breaking backlog reads.
- Use durable `next_sync_at` scheduling, leasing, overlap protection,
  observability, and failure recovery rather than relying only on one process
  timer.

Before release, verify private/empty/large libraries, duplicate safety, API
budgets, production callback configuration, public serializer privacy, and
multi-instance scheduling behavior.

## Later Medium And Large Candidates

### Library Control Center Expansion — medium/large

Continue beyond the selected Needs Attention slice only after the table and
data-quality workflows prove the shared patterns:

- Saved views for filters, sorting, grouping, density, and visible table
  columns.
- Bulk edit plus archive/hide behavior.
- First-class personal tags such as co-op, comfort, difficulty, short,
  replayable, story-focused, and focus-required.
- Global private search across games, Lists, reviews/thoughts, genres, and tags
  once each data type is durable.
- Provider-neutral platform and ownership-source fields when non-Steam tracking
  is deliberately selected.

Saved views change how a user inspects the library. Smart Lists remain named
collections whose membership is resolved from rules. Preserve that distinction.

### Play Next V2: Mood And Session Matching — medium

The focused plan remains in
[`planning/play-next-session-matching-v2.md`](planning/play-next-session-matching-v2.md).

- Add compact Time, Experience, and My Genre controls.
- Derive conservative defaults only from personal genres.
- Add optional private per-game session-trait overrides.
- Keep recommendations factual, deterministic, and private.
- Keep AI, provider calls, event history, and public sharing out of this track.

### Timeline V2 / Journal — medium/large

- Introduce durable activity or game events only when timestamp semantics are
  trustworthy.
- Add private journal entries and optional play sessions.
- Add multiple playthroughs only after game-level events and completion
  semantics are stable.
- Keep activity private until visibility rules are designed.

### Data Export And Import — medium/large

- Add safe JSON export.
- Add previewed CSV/JSON import with validation, conflict, duplicate, rollback,
  and undo behavior.
- Add provider-neutral import-run summaries and history before expanding
  automatic integrations.
- Consider a Playnite bridge after the ownership/source model is
  provider-neutral.

### Catalog, Metadata, And Steam Follow-Up — medium to very large

- Improve safe Steam match repair and correction memory through real-library QA.
- Add manual metadata overrides only for demonstrated needs.
- Refine hours-source labels, precedence, locking, and cache behavior.
- Decide how editions, remasters, DLC, bundles, and platform variants behave.
- Consider achievement detail/rarity only when it improves the core product.
- Consider other metadata providers only after RAWG/Steam reliability work.

## Long-Term Priorities

### Account Security V3

- Password and username changes.
- Verified email recovery.
- Session/device management and revocation.
- Account deletion with explicit confirmation and a safe recovery boundary.
- Complete data portability.
- Appropriate rate limits and security notifications.

### Series And Franchise Tracking

- User-created or catalog-backed series.
- Release order and personal play order.
- Ownership/status counts and completion progress.
- A next-unfinished-series-entry action.
- Manual correction for remasters, editions, spin-offs, and provider mistakes.
- Optional public-safe series highlights after profile privacy is complete.

### TypeScript Migration

Treat this as a dedicated, incremental engineering program rather than
incidental cleanup:

1. Establish strict configuration and shared domain/API types.
2. Convert pure utilities and service boundaries.
3. Convert shared UI primitives, hooks, and contexts.
4. Convert frontend pages feature by feature.
5. Convert backend services, validators, and routes.
6. Add typed API contracts or generated schema types.
7. Increase strictness progressively while keeping every phase releasable.

## Other Long-Term Candidates

- Unified Library for backlog, wishlist, ownership, ignored, archived, and
  hidden catalog relationships.
- Durable activity events, play sessions, and multiple playthroughs.
- Goals, challenges, progress recaps, and badges.
- Local catalog game pages and a personal release calendar.
- Public or collaborative Lists, Game Night rooms, and moderation boundaries.
- Friends/following, library comparison, and social activity.
- Non-Steam provider plus console, physical, and manual collection support.
- Recommendation work using private backlog, time, mood, and later explicitly
  approved social signals.

## Engineering Follow-Up

- Expand real-Postgres authorization coverage for demonstrated Steam
  review/import or metadata-repair gaps.
- Add database-aware readiness and safe diagnostics for cache, environment,
  migrations, and demo-template health; `/healthz` remains process liveness.
- Add migration-failure notification around the fail-closed migration workflow.
- Document a complete production backup and restore procedure.
- Improve pagination, virtualization, mobile layout, and drag-and-drop when
  real-library behavior demonstrates the need.
- Reduce noisy production logs.
- Add a mojibake/replacement-character check and a practical test watch command.

## Selection Rule

1. Choose one bounded item from the ordered direction.
2. Write acceptance criteria and identify schema, compatibility, privacy, and
   operational risks.
3. Implement, review, verify, and release as separate phases for medium or
   larger work.
4. Move completed work to [`DONE.md`](DONE.md); do not leave completed checklist
   items here.
