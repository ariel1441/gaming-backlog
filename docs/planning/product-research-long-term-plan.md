# Long-Term Product Feature Briefs

Last updated: 2026-07-18

This document contains only product work that remains open. Use
[`../ROADMAP.md`](../ROADMAP.md) for prioritization, [`../DONE.md`](../DONE.md)
for completed milestones, and [`../SYSTEM_CONTEXT.md`](../SYSTEM_CONTEXT.md) for
current product behavior.

## Product Direction

The product can grow along four connected tracks:

1. Library management: priority, organization, ownership, imports, and bulk
   maintenance.
2. Personal history: reviews, timeline events, journal entries, sessions, and
   goals.
3. Showcase: privacy-aware profiles, lists, reviews, and recaps.
4. Discovery/community: catalog pages, recommendations, friends, and activity.

Privacy controls and durable data models must precede public/social expansion.
The broad
[`2026 competitive landscape`](../reviews/gaming-backlog-competitive-landscape-2026.md)
supports a more specific differentiator: connect trustworthy imports and
library repair to a low-friction choose, start, resume, and remember loop.

## Play Next And Resume

Goal: answer "what should I play next?" and make returning to an active game
easy without fighting status ordering.

The recommended V1 is now specified in
[`play-next-resume-v1.md`](play-next-resume-v1.md):

- A separate ordered queue, not priority/pin fields or an existing order.
- A dedicated private `/next-up` page.
- Continue Playing derived from current active-game semantics.
- Queue-aware and backlog-aware Surprise Me with an explicit pool.
- Add/remove/reorder actions from the focused page and game action menus.
- One private `resume_note`, presented as "Next time."
- Atomic Start playing behavior that preserves existing dates.
- Three deterministic, explained choices using trustworthy existing data.

Later:

- Time, mood, energy, solo/co-op, input, installed, and platform context.
- Persist "not today" expiry and "never suggest this" decisions.
- Add chapter/location, progress, difficulty, pause reason, and suggested
  next-session length only when users demonstrate a need for them.

Risks: three ordering systems already exist—backlog positions, manual-list
positions, and smart-list ranking. Next Up must have one explicit owner. Resume
data should not force the larger event/playthrough schema into V1.

## Insights V2

Goal: turn charts into decisions.

- Year/all-time controls.
- Score distribution, personal-genre hours, completion pace, and aging views.
- Actionable missing-data surfaces.
- Click-throughs into the exact backlog subset.
- Platform/source analytics only after those fields exist.
- ETA based on personal pace only after enough history exists.

Avoid a visual-only redesign before metrics and data ownership are settled.

## Reviews And Completion

Goal: make finishing a game feel like recording a personal entry.

Suggested V1:

- Prompt for finish date, score, and short review at completion.
- Keep private notes separate from publishable review text.
- Present a clear My Review section.
- Add spoiler and visibility controls before public display.

Later: profile review browsing, reactions, and comments after privacy and social
moderation exist.

## Timeline, Activity, And Journal

Goal: preserve history rather than only current state.

- Add an append-oriented activity/event model for meaningful changes.
- Record events prospectively; do not invent historical transitions.
- Add optional journal or play-session entries with date, duration, progress,
  and note.
- Add multiple playthroughs later for replays, difficulty/build, route or
  ending, completion type, separate hours, and abandoned/resumed state.
- Reuse the same private event data for Timeline and Insights.
- Decide event visibility before using it on public profiles or social feeds.

This is medium for a small journal and large for a durable cross-product event
system.

## Public Profile Privacy And Showcase

Goal: let users control what their profile communicates.

- Profile visibility: private, friends-only, or public.
- Separate visibility for full library, scores, reviews/notes, dates, abandoned
  games, wishlist, favorites, lists, and activity.
- Steam ownership/playtime/last-played/achievements remain private unless
  explicitly enabled.
- Add favorite reorder/quick actions, completed highlights, pinned modules or
  lists, and filtered share URLs.
- Later consider banners, accents, layout density, share cards, and yearly
  recaps.

## Lists V2

- Add convenient add-to-list actions from cards and game details.
- Add visibility controls and shareable list pages.
- Allow a profile to pin a list or list module.
- Add likes/comments/discovery only after the social layer and moderation are
  designed.

## Personal Organization

- Normalize personal genres.
- Add personal tags/moods separate from provider tags.
- Add platform and ownership source when the broader library use case is chosen.
- Add archive/hide, bulk edit, group-by, and large-library table tools.
- Consider user-managed presets.
- Treat custom per-user statuses as a large project because Insights, Steam,
  reorder, and smart lists need stable semantic groups.

## Saved Views

Goal: let users return to useful library perspectives without adding a permanent
page for every combination.

Suggested V1:

- Save filters, search, sorting, and grouping.
- Optionally preserve density and visible fields when those controls exist.
- Provide quick access to views such as stale active games, unscored finished
  games, short unplayed games, or unmatched Steam ownership.
- Decide whether a saved view is a smart List mode or a separate navigation
  concept before adding another overlapping abstraction.

## Data Health Center

Goal: provide one understandable Needs Attention surface instead of scattering
repair work across unrelated screens.

Suggested V1:

- Stale Playing games, missing finish dates/hours/covers, duplicate candidates,
  unmatched catalog records, provider failures, and unclassified imports.
- Explain every issue and offer direct fix, dismiss, and safe bulk-fix actions.
- Reuse existing metadata repair, missing-hours, and Steam review capabilities.
- Never silently replace user-authored fields.

Later: conflicting ownership, broken list relationships, and other checks only
when current data contracts can detect them reliably.

## Unified Library

Goal: represent every relationship between a user and a catalog game: backlog,
wishlist, owned, hidden, ignored, and imported.

This is a large data-model project. Define the user/catalog relationship and
migration plan before creating `/library`. Avoid duplicating the purposes of
Backlog, Discover, and Steam Library.

## Goals And Challenges

- Yearly completion or playtime targets.
- Clear a chosen set of short games.
- Finish a selected list.
- Progress summaries and yearly recap.
- Later derive badges/streaks without encouraging unhealthy engagement.

## Data Export, Import, And Account Safety

- Add JSON export and a documented stable format.
- Add previewed CSV/JSON import with validation and conflict resolution.
- Define duplicate handling and recovery before writes.
- Add password/username change, email recovery, account deletion, and full data
  portability as separate security-sensitive projects.
- Keep production-derived files ignored, minimally identifying, and handled by
  explicit safe workflows.

## Import History And Provider Bridges

Goal: make integrations observable, reversible, and provider-neutral.

- Record each import/sync summary: scanned, added, changed, conflicted, ignored,
  failed, and finished.
- Add an undo boundary only after every affected write can be identified and
  reversed safely.
- Generalize the existing Steam review mental model before adding more
  storefront-specific branches.
- Consider Playnite JSON/CSV first as a bridge to Steam, Epic, GOG, emulators,
  installed state, and custom metadata.
- Keep provider source records separate from catalog identity and user-authored
  game fields.

## Catalog Game Pages And Discovery

- Add stable local game pages only when cached catalog identity is reliable.
- Improve Discover filters and collections without spending provider quota on
  passive page loads.
- Consider release calendar, platform/store browsing, and richer collections.
- Add community reviews/lists to game pages only after public content exists.

## Series, Calendar, And Passive Value

- Add franchise/series views with release order, recommended play order,
  ownership, completed/missing entries, remasters, editions, and DLC.
- Build a personal release calendar from wishlist, followed series, developers,
  and owned-game DLC only after those relationships are modeled.
- Add optional price or availability watches without confusing "want to play"
  with "waiting to buy."
- Add optional weekly/monthly digests and annual recaps from trustworthy event,
  ownership, and session data.
- Generate private and shareable recap variants with an explicit visibility
  preview.

## Social, Friends, And Recommendations

Prerequisites: visibility controls, meaningful public content, durable activity,
abuse/moderation decisions, and safe account discovery.

Possible later scope:

- Following or mutual friends.
- Mutual games and library/rating comparison.
- Taste overlap and friend activity.
- Recommendations from favorites, ratings, tags, time, mood, and trusted social
  signals.
- Optional AI explanations only after privacy, cost, and reliability boundaries
  are explicit.
- Collaborative Lists with owner, editor, voter, and viewer roles.
- A share-link Game Night Room that compares platform, player count, session
  length, mood, installed state, and shared ownership.

## Power-User Navigation

- Add global private search across games, Lists, reviews, notes, tags, and later
  franchises.
- Add a command palette for stable actions such as search, add, start, finish,
  log, open queue, create List, and synchronize.
- Add previewed bulk actions for status, tags, Lists, archive, metadata repair,
  export, and deletion.
- Keep every command and bulk flow keyboard-accessible and reversible where
  risk warrants it.

## Selection Guide

- Smallest direct product value: favorite/review polish or genre normalization.
- Strongest medium feature: Play Next & Resume.
- Strongest analytics feature: Insights V2.
- Strongest privacy prerequisite: public-profile visibility controls.
- Strongest foundational project: durable activity/events.
- Strongest large-library package: saved views plus Data Health Center.
- Largest product refactor: Unified Library or custom statuses.
- Longest-horizon work: social/community and recommendation systems.
