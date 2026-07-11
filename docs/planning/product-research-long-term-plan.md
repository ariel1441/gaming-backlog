# Long-Term Product Feature Briefs

Last updated: 2026-07-11

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

## Next Up / Priority

Goal: answer “what should I play next?” without fighting status ordering.

Suggested V1:

- A separate ordered queue or deliberately modeled priority/pin fields.
- A focused page/tab with short-game and high-priority filters.
- Queue-aware Surprise Me.
- Clear add/remove/reorder actions from backlog cards and game details.

Risks: three ordering systems already exist—backlog positions, manual-list
positions, and smart-list ranking. Next Up must have one explicit owner.

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

## Catalog Game Pages And Discovery

- Add stable local game pages only when cached catalog identity is reliable.
- Improve Discover filters and collections without spending provider quota on
  passive page loads.
- Consider release calendar, platform/store browsing, and richer collections.
- Add community reviews/lists to game pages only after public content exists.

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

## Selection Guide

- Smallest direct product value: favorite/review polish or genre normalization.
- Strongest medium feature: Next Up.
- Strongest analytics feature: Insights V2.
- Strongest privacy prerequisite: public-profile visibility controls.
- Strongest foundational project: durable activity/events.
- Largest product refactor: Unified Library or custom statuses.
- Longest-horizon work: social/community and recommendation systems.
