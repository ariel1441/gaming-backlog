# Product Research And Long-Term Feature Plan

Last updated: 2026-07-04

This note captures the long-term product planning discussion after the
Backloggd-inspired profile review and the wider scan of adjacent backlog,
library, media-tracking, and productivity products. It is meant for future
agents and humans who need to pick up one feature from the list and understand
the product intent before writing code.

Treat this as planning context, not as current product truth. Before
implementing any item, inspect the current code, database schema, `ROADMAP.md`,
`SYSTEM_CONTEXT.md`, and the active git diff.

## Research Sources

The ideas below came from direct user screenshots/analysis plus a web scan of
these products and docs:

- Backloggd: game collection, profile tabs, journal, reviews, lists, stats,
  friend activity, and IGDB-backed global game browsing.
  - https://backloggd.com/
  - https://backloggd.com/games/lib/popular/
- Letterboxd: diary, watched history, reviews, tags, watchlist, curated lists,
  public/private list behavior, and account export patterns.
  - https://letterboxd.com/about/faq/
- Goodreads: shelves, friends' shelves, reviews, recommendations, reading
  challenge, and the broad "discover through people you trust" model.
  - https://www.goodreads.com/about/us
- The StoryGraph: personal statistics, reading challenges, mood/pace/length
  metadata, recommendations, yearly wrap-up, and profile privacy options.
  - https://app.thestorygraph.com/
- Trakt: discover, track, share, history/progress, opinions, ratings, lists,
  and activity around watched media.
  - https://trakt.tv/
- Serializd: TV tracking, reviews, ratings, diary, friends, discussions,
  recommendations, lists, trending, and best-of pages.
  - https://www.serializd.com/
- Grouvee: game shelves, ratings/reviews, Steam import, custom shelves, social
  activity, and simple game-backlog framing.
  - https://www.grouvee.com/
- Completionator: power-user game collection tracking, platforms, condition,
  collection value, backlog progress, custom tags/lists, completion times,
  challenges, goals, imports, and community stacks.
  - https://www.completionator.com/
- Steam: ownership, wishlist, reviews, achievements, game hubs, community,
  groups, activity, and recent play signals.
  - https://store.steampowered.com/about/
- Notion, Todoist, Linear, and Habitify: saved views/templates, priorities,
  labels, goals, routines, dashboards, roadmaps, and progress visualization.
  - https://www.notion.com/templates
  - https://www.todoist.com/features
  - https://linear.app/
  - https://habitify.me/
- RAWG and IGDB docs: API/provider constraints for catalog/discovery planning.
  - https://rawg.io/apidocs
  - https://api-docs.igdb.com/

## Product Thesis

The current app is strongest as a private backlog manager. It already has
private game tracking, statuses, ordering, filters, metadata, Discover, Steam
sync/import, public read-only profiles, insights, and a local Timeline V1.

The long-term direction should be to grow from "a backlog board" into "a
personal gaming identity and history app" without losing the private-management
strength that already works.

Think in four product layers:

1. Library management:
   - backlog board
   - statuses and ordering
   - Steam/library ownership data
   - catalog metadata
   - Next Up/priority
   - saved views and filters
2. Personal history:
   - Timeline
   - journal entries
   - reviews
   - play sessions
   - events such as started, finished, rated, imported, and added to list
3. Profile/showcase:
   - signed-in owner profile
   - public profile
   - favorite games
   - review/list/stat modules
   - privacy controls
4. Discovery/community:
   - local catalog game pages
   - public reviews/lists
   - follow/friend activity
   - likes/comments
   - recommendations

Do not make public social features the next major push. First make the app
excellent for one person: own profile, settings, reviews, lists, Timeline, and
better insights. Social features become more useful after there is content
worth sharing.

## Recommended Roadmap Shape

1. Finish Timeline V1 and documentation.
2. Build a signed-in owner profile page (`/me` or `/profile`).
3. Build Settings V1.
4. Build Reviews V1 from existing thoughts/scores.
5. Build Lists V1:
   - automatic/generated lists first if we want fast value
   - custom/manual lists second if we want expressive profile value
6. Build Next Up / priority queue.
7. Build Insights V2.
8. Add private activity/event persistence.
9. Improve public profile privacy/showcase controls.
10. Add local catalog game pages for cached games.
11. Add social/friends/activity/likes only after public content exists.

This order keeps risk controlled: profile and settings create structure,
reviews and lists create content, insights/timeline make the user's history
meaningful, and only then do public/community features have enough substance.

## Cross-Cutting Product Rules

- Keep private data private by default. Steam ownership, Steam playtime, last
  played, achievements, private notes, and private Timeline events should not
  leak into public profile serializers.
- Separate personal fields from catalog metadata. Catalog data can be refreshed
  from providers; personal status, score, notes, review, tags, order, priority,
  and dates belong to the user.
- Keep public sharing explicit. When a feature can become public later, design
  its data model with visibility in mind from the beginning.
- Favor generated V1s when possible. Reviews can start from existing thoughts;
  automatic lists can start from filters; Timeline can start from current date
  fields.
- Do not overbuild community too early. Activity/following/likes need
  moderation, privacy, and enough active users to matter.
- Keep user-owned data scoped by `user_id` on the backend. Public serializers
  should have explicit allowlists.
- Reuse existing frontend service, hook, permission, and UI primitive patterns.
- Add tests for shared utilities, permissions, serializers, and schema rules
  when a feature creates a new data model.

## Feature: Owner Profile (`/me` Or `/profile`)

### Problem

The app has public profiles at `/u/:username`, but signed-in users do not have a
natural page that says "this is me." To see their own profile, the user mostly
has to open the public link. That makes profile work feel secondary and awkward.

Backloggd, Letterboxd, Goodreads, and StoryGraph all put the user profile near
the center of the product. The profile is not only a share page; it is a home
for identity, favorites, recent activity, reviews, lists, and stats.

### Product Goal

Create a private owner profile page that becomes the user's personal gaming
dashboard and the editing surface for what may later appear publicly.

The page should answer:

- What am I playing?
- What did I recently finish?
- What games represent my taste?
- What have I written or reviewed?
- What lists or collections have I made?
- How does my gaming year look?
- What does the public see?

### Suggested Route

- Preferred: `/me`
- Alternative: `/profile`

Use `/u/:username` for public read-only profiles. The owner profile can include
private data and edit controls that public profiles never see.

### V1 Scope

- Profile header:
  - username
  - avatar placeholder or uploaded avatar later
  - bio
  - public profile status
  - public profile link/copy/share affordance
- Favorite games:
  - reuse the current favorite games behavior if present
  - show poster shelf
  - link to edit/manage favorites
- Currently playing:
  - games with playing-style status
  - maybe sorted by recent Steam play or current backlog order
- Recently finished:
  - games with `finished_at`, newest first
- Basic stats:
  - total games
  - finished games
  - active games
  - backlog count
  - current year played/finished count if cheap to compute
- Review preview:
  - latest thoughts/reviews once Reviews V1 exists
- List preview:
  - latest or pinned lists once Lists V1 exists
- Public preview:
  - "View public profile"
  - "Public profile disabled/enabled"
  - clear note that private Steam data is not public

### Later Scope

- Reorderable profile modules.
- Profile theme/header image.
- Favorite lists/reviews, not only favorite games.
- Public/private controls per module.
- Profile badges, achievements, yearly wrap-up highlights.
- Owner-only profile health checklist:
  - add bio
  - choose favorites
  - write first review
  - publish profile

### Data Model Ideas

Small V1 can reuse current user fields and game favorites if already present.
For a richer profile:

- `user_profiles`
  - `user_id`
  - `display_name` or reuse username
  - `bio`
  - `avatar_url`
  - `website_url`
  - social links JSON or separate table
  - `created_at`
  - `updated_at`
- `profile_modules` or profile settings JSON later:
  - module key
  - visibility
  - sort order
  - configuration

### UI/UX Notes

- This is a dashboard/profile, not a marketing page.
- Keep it dense and useful, closer to Backloggd/Letterboxd than a landing page.
- Owner edit controls should be visible but not noisy.
- Public preview should be one click away.
- Mobile should prioritize header, stats, currently playing, and recent
  finished before deeper modules.

### Risks

- If `/me` duplicates the public profile too much, it may feel unnecessary.
- If it includes too much private backlog management, it can compete with the
  backlog page.
- Public visibility must be explicit before showing reviews, dates, Steam data,
  or notes.

### Good First Implementation

Build a read-mostly `/me` page using existing data:

- `useAuth`
- `useGames`
- existing profile/favorite helpers
- existing UI primitives
- no schema changes unless bio/avatar/social links are included in V1

Then add profile editing in Settings V1 rather than putting every form directly
on `/me`.

## Feature: Settings

### Problem

Account, profile, public sharing, preferences, data, and integration controls
are either scattered or modal-based. As the app grows, this becomes hard to
understand and hard for future features to extend.

Backloggd has a clear settings structure with Profile, Defaults,
Notifications, Data, Account, Integrations, Archive, Blocked Users, and other
sections. We do not need all of that now, but we do need the permanent home.

### Product Goal

Create a durable `/settings` route that centralizes profile/public/account/data
controls and gives future integrations a stable place to live.

### V1 Scope

- Profile:
  - username display
  - bio
  - avatar placeholder/future upload slot
  - social links if we choose to include them
  - favorite games management shortcut
- Public profile:
  - public enabled toggle
  - public link
  - "view public profile"
  - simple explanation of what is public now
- Preferences:
  - default backlog view
  - default sort
  - maybe remember filters/view mode if not already stored locally
- Data:
  - CSV export
  - JSON export later or in V1 if easy
- Integrations:
  - Steam linked status
  - links to `/steam/import` and `/steam/library`
  - last sync summary if available

### Later Scope

- Change password.
- Change username.
- Email and password reset.
- Delete account.
- Notifications.
- Blocked users.
- Advanced public visibility.
- Data import/export.
- Archive cleanup tools.
- Connected providers beyond Steam.

### Data Model Ideas

- Existing `users` can support public flag and username.
- `user_profiles` can support profile fields.
- `user_preferences` can support default view/sort/filter choices:
  - `user_id`
  - `default_backlog_view`
  - `default_sort`
  - `default_sort_direction`
  - `preferences` JSON for future options
- Public settings may later need either:
  - a `profile_visibility_settings` table
  - or a structured JSON column keyed by module/field

### UI/UX Notes

- Desktop: left-side settings nav, right-side content.
- Mobile: top tabs or compact section list.
- Use existing `Button`, `Field`, `TextInput`, `Select`, `Modal`, `useToast`,
  and `useConfirm`.
- Avoid native `alert`/`confirm`.
- Keep destructive account/data actions behind clear confirmation.
- Do not put all settings in one long form.

### Risks

- Account/security work can become large quickly.
- Username changes affect public URLs.
- Delete account and export need careful backend behavior and confirmation.
- Settings can become a dumping ground if sections are not named clearly.

### Good First Implementation

Start with profile/public/preferences/integrations. Defer password, username,
email, and delete account unless explicitly chosen.

## Feature: Timeline And Journal

### Current State

Timeline V1 exists locally in the current working tree:

- route: `/timeline`
- files:
  - `src/pages/TimelinePage.jsx`
  - `src/utils/gameTimeline.js`
  - `src/utils/gameTimeline.test.js`
- generated from existing `started_at` and `finished_at`
- private and read-only
- grouped by month
- filters for type/year/date/search
- opens the existing game detail modal

### Problem

The backlog board tells the user what exists in their library. It does not fully
tell the story of what the user played over time.

Backloggd Journal, Letterboxd Diary, Serializd diary, and Trakt history all
show that media-tracking apps become much more personal when they preserve
chronology.

### Product Goal

Make Timeline the personal history surface, and eventually let it evolve into a
Journal/Event page.

### V2 Scope

- Add a compact journal/list mode in addition to the current visual showcase
  and poster modes.
- Include event rows for:
  - started
  - finished
  - reviewed
  - rated
  - imported from Steam
  - added to backlog, once `created_at` exists on games
- Include more context on each row:
  - status at event time if available
  - current status if historical status is unavailable
  - platform/source if available
  - rating/score when relevant
  - short review excerpt when relevant
- Improve filters:
  - all events
  - started
  - finished
  - reviewed
  - rated
  - imported
  - year
  - date range
  - source/platform
- Add owner-only quick actions:
  - add missing started date
  - add missing finished date
  - write review

### Later Scope

- Manual journal entries.
- Play sessions:
  - date
  - minutes/hours
  - game
  - note
  - platform/source
- Durable event table.
- Public activity controls.
- Public profile "recent activity" module.
- Year-in-review generated from events.

### Data Model Ideas

Generated V1/V2 can compute from games and reviews. Durable history needs:

- `activity_events` or `game_events`
  - `id`
  - `user_id`
  - `game_id`
  - `catalog_game_id`
  - `event_type`
  - `event_date`
  - `visibility`
  - `source`
  - `metadata` JSON
  - `created_at`
- `play_sessions` later:
  - `id`
  - `user_id`
  - `game_id`
  - `played_on`
  - `minutes`
  - `note`
  - `platform`
  - `source`
  - `visibility`

### UI/UX Notes

- Timeline should complement Insights, not duplicate it.
- Timeline is chronological and personal.
- Insights is aggregate and analytical.
- A compact journal mode is important for scanning many entries.
- Do not imply generated current-state data is historical truth. If a row shows
  current status, label it clearly.

### Risks

- Generated timeline can misrepresent history if fields were edited later.
- Steam first-observed play is not true first play.
- Public activity needs privacy controls before exposure.

### Good First Implementation

Finish and QA Timeline V1. Then add compact journal mode and review/rating
events only after Reviews V1 exists.

## Feature: Reviews

### Problem

The app already stores score and thoughts on games, but those thoughts are
hidden inside individual game detail views. Users need a page that turns their
opinions into a first-class personal artifact.

Backloggd, Letterboxd, Goodreads, Serializd, and Steam all show reviews as one
of the most important pieces of user-generated content.

### Product Goal

Create a Reviews page that showcases what the user thought, not only what they
tracked.

### V1 Scope

- Route: `/reviews`
- Show games with:
  - non-empty thoughts
  - and/or score
- Review card/row:
  - cover
  - title
  - release year if known
  - score
  - status
  - finished date or updated date if available
  - excerpt of thoughts
  - open game modal/details
- Filters/sort:
  - recent
  - highest score
  - lowest score
  - finished year
  - status
  - has thoughts
  - has score
- Owner-only:
  - edit review via existing edit-game flow
  - quick "write thoughts" affordance for scored/no-thought games

### Later Scope

- Separate private notes from public review.
- `reviews` table rather than only `games.thoughts`.
- Review visibility:
  - private
  - public
  - unlisted maybe
- Spoiler flag.
- Review drafts.
- Multiple reviews/logs per game if journaling needs it.
- Review likes/comments after social foundation exists.

### Data Model Ideas

V1 can reuse:

- `games.score`
- `games.thoughts`
- `games.finished_at`
- `games.status`
- `games.catalog_game_id`

Richer model:

- `reviews`
  - `id`
  - `user_id`
  - `game_id`
  - `catalog_game_id`
  - `rating`
  - `body`
  - `spoiler`
  - `visibility`
  - `reviewed_at`
  - `created_at`
  - `updated_at`

If using `reviews`, decide whether `games.thoughts` becomes:

- private notes only
- migrated to first review body
- kept as legacy fallback

### UI/UX Notes

- Reviews should be readable. Give text enough width and breathing room.
- Use excerpts with expand/open details.
- For private owner pages, editing should be easy.
- For public profile, only show reviews that are explicitly public.
- Avoid adding likes/comments until there is moderation and enough users.

### Risks

- Current `thoughts` may contain private notes the user never meant to publish.
- Splitting notes/reviews later requires migration and clear UI language.
- Spoilers need explicit marking before public sharing.

### Good First Implementation

Build private `/reviews` from existing fields. Do not publish reviews publicly
until visibility settings exist.

## Feature: Lists

### Problem

Statuses and filters are good for management, but users also need expressive
collections: top games, annual plans, themed groups, recommendations, favorites,
and "games I beat in a year."

Backloggd and Letterboxd make lists a major creative/social surface. Goodreads
and Grouvee use shelves. Completionator uses stacks and custom organization.

### Product Goal

Add lists as the main bridge between private organization and public showcase.

### Two List Types

1. Automatic/generated lists:
   - Membership is defined by rules.
   - User does not manually add/remove games.
   - Sorting can be changed visually, but default membership/order comes from
     the rule.
2. Custom/manual lists:
   - User manually adds/removes games.
   - User can reorder games.
   - User can write a description.
   - User can optionally publish the list later.

### Automatic List Examples

- Games I beat in 2026.
- Games I beat in 2025.
- Games released in 2026.
- Started but not finished.
- Highest rated short games.
- Backlog games under 10 hours.
- Missing hours.
- Recently played on Steam.
- Steam linked but not reviewed.
- Wishlist by release year.
- Favorites.
- Currently playing.
- Recently finished.
- Games by personal genre.

### Custom List Examples

- Top 100 games of all time.
- Cozy games.
- Games to play with friends.
- 2026 roadmap.
- Favorite horror games.
- Games I want to stream.
- Best short games.
- Games that deserve another chance.

### V1 Scope

- Route: `/lists`
- List index:
  - automatic lists section
  - custom lists section
  - cover-collage previews
  - list title
  - game count
  - updated date where relevant
- Automatic list detail:
  - generated games
  - default sort based on rule
  - visual sort/filter controls that do not save membership
- Custom list detail:
  - add/remove games
  - manual reorder
  - title and description
  - private by default
- Owner-only controls:
  - create custom list
  - edit title/description
  - delete list
  - reorder items

### Later Scope

- Public/private list visibility.
- Ranked/unranked mode.
- List tags.
- List comments/likes.
- Follow/save another user's list.
- Collaborative lists.
- Automatic list templates.
- Pinned profile lists.
- Generated annual lists.

### Data Model Ideas

For custom lists:

- `lists`
  - `id`
  - `user_id`
  - `title`
  - `description`
  - `visibility`
  - `list_type` (`custom`, maybe `generated_template` later)
  - `ranked`
  - `created_at`
  - `updated_at`
- `list_games`
  - `list_id`
  - `game_id`
  - `catalog_game_id`
  - `position`
  - `note`
  - `created_at`

For automatic lists:

- Option 1: hardcoded generated views at first.
- Option 2: `saved_views`
  - `user_id`
  - `name`
  - `view_type`
  - `query` JSON
  - `visibility`
  - `created_at`
  - `updated_at`

### UI/UX Notes

- Cover-collage previews are important. They make lists feel alive.
- Automatic lists should make it obvious that membership is rule-based.
- Custom lists should make reorder/add/remove obvious.
- Do not overload the backlog board with list management; use a dedicated
  page/detail flow.

### Risks

- Automatic lists can confuse users if they look editable but are rule-based.
- Custom lists can overlap with tags, statuses, and Next Up.
- Public lists need privacy and moderation later.

### Good First Implementation

Start with a `/lists` page containing generated automatic lists from existing
game data. Add custom manual lists after the display patterns are settled.

## Feature: Next Up / Priority

### Problem

The backlog answers "what games do I have?" It does not clearly answer "what
should I play next?"

The user has already identified this as a likely short-to-medium follow-up.
Todoist-style priority and queue thinking applies well here.

### Product Goal

Create a calm planning surface that helps the user choose the next games to
play without disrupting the existing status/order model.

### V1 Options

Option A: simple priority field.

- Add `games.priority`.
- Values could be `none`, `low`, `medium`, `high`, or numeric 1-5.
- Add card/detail display.
- Add filter/sort.

Option B: pinned games.

- Add `games.pinned_at`.
- Pinned games appear in a Next Up surface.
- Lower complexity than a ranked queue.

Option C: ranked Next Up queue.

- Add `next_up_items` table or nullable rank fields.
- User can manually reorder queue.
- Strongest feature, more work.

### Suggested V1

Start with a small ranked queue if the user wants an actual planning surface.
Start with `pinned_at` if the user wants quick value and low schema complexity.

### UI

- Route: `/next-up` or a Backlog tab.
- Sections:
  - queued/pinned games
  - short games from backlog
  - recently played but unfinished
  - high-rated unfinished
  - Surprise Me from queue/backlog
- Actions:
  - add to Next Up
  - remove from Next Up
  - promote/demote
  - mark started

### Data Model Ideas

Simple:

- `games.priority`
- `games.pinned_at`

Queue:

- `next_up_items`
  - `user_id`
  - `game_id`
  - `position`
  - `note`
  - `created_at`
  - `updated_at`

### UI/UX Notes

- It should feel lighter than project management.
- Avoid making the user rank their whole backlog.
- Keep Next Up separate from status rank/position ordering.
- "Surprise Me" should optionally use the queue or the whole backlog.

### Risks

- Conflicts with existing manual order.
- Too many ranking systems can confuse users.
- Goals/challenges can also answer "what next"; keep the concepts distinct.

### Good First Implementation

Add "pin to Next Up" and a simple `/next-up` page. Expand to ranked ordering
only if pinning feels too shallow.

## Feature: Insights V2

### Problem

Current Insights are useful but can become more personal, more action-oriented,
and more connected to Timeline, Reviews, Lists, Steam, and future goals.

Backloggd Stats, StoryGraph stats, Habitify progress, and Linear dashboards all
suggest a better model: insights should show what happened, what it means, and
what needs attention.

### Product Goal

Turn Insights into a clear analytics surface for personal gaming history and
backlog health.

### V2 Scope

- All-time/year switcher.
- Started/finished by year.
- Monthly finished counts if yearly is too coarse.
- Average time to finish:
  - `finished_at - started_at` when both exist
  - label as date span, not playtime
- Active unfinished aging:
  - started but not finished
  - currently playing for over N days
- Status distribution.
- Play status distribution:
  - completed
  - retired/shelved/abandoned equivalents if statuses support them
- Score distribution.
- Hours by personal genre.
- Missing metadata:
  - missing hours
  - missing dates
  - missing cover/catalog link
- Steam actual vs estimate comparison:
  - estimate hours
  - Steam actual hours
  - selected display source
- Top genres, top personal tags, top sources.

### Later Scope

- Year in review.
- Goals/challenges progress.
- Series/franchise progress.
- Favorite studios/developers if metadata supports it.
- Completion streaks or cadence.
- Recommendations:
  - short games to finish
  - neglected high-priority games
  - games with recent Steam play but stale status

### Data Model Ideas

V2 can mostly compute from:

- `games`
- `user_game_sources`
- catalog metadata
- future `reviews`
- future `activity_events`
- future `goals`

If expensive, add cached aggregates carefully:

- per-user insight cache
- invalidated on game/review/list/source mutations

### UI/UX Notes

- Use a top-level time range switcher.
- Prefer "what needs attention" cards over pure chart decoration.
- Every chart should answer a question or link to filtered backlog.
- Use existing chart tokens in `src/index.css`.
- Avoid overwhelming with too many charts on one page.

### Risks

- Insights can drift from status semantics if status groups are hardcoded.
- Steam hours are actual playtime, not estimate.
- Date span is not playtime.
- Aggregates can become stale if cache invalidation is weak.

### Good First Implementation

Add all-time/year controls, score distribution, active aging, and missing
metadata actions before adding more decorative charts.

## Feature: Public Profile V2

### Problem

Public profiles exist, but future review/list/activity/profile work needs a
stronger showcase model and clearer privacy controls.

Backloggd, Letterboxd, Steam, and Goodreads all show public profiles as the
place where a user's taste and history become legible to others.

### Product Goal

Make public profiles attractive and trustworthy without exposing private data by
accident.

### V2 Scope

- Profile header:
  - bio
  - avatar
  - public stats
  - social links if enabled
- Modules:
  - favorite games
  - currently playing
  - recently finished
  - public reviews
  - public lists
  - stats snapshot
- Owner controls:
  - edit profile
  - public preview
  - module visibility settings

### Later Scope

- Reorder profile modules.
- Public activity.
- Public goals/challenges.
- Theme/header customization.
- Follow/friends once social exists.

### Data Model Ideas

- `user_profiles`
- `profile_visibility_settings`
- `reviews.visibility`
- `lists.visibility`
- `activity_events.visibility`

### Privacy Rules

- Steam ownership/playtime/last played/achievements remain private by default.
- Thoughts/private notes should not become public automatically.
- Reviews need explicit visibility.
- Dates need explicit visibility controls if public.
- Abandoned/shelved statuses may be sensitive and should be configurable later.

### UI/UX Notes

- Public profile should feel like a showcase, not an admin dashboard.
- Owner view should clearly indicate what is public.
- Public viewer should not see empty private-only modules.
- Use profile tabs only when enough sections exist.

### Risks

- Publishing private notes accidentally would be a major trust break.
- Public/social expansion creates moderation needs.
- Public pages should not make extra provider API calls just to render.

### Good First Implementation

Fold public controls into Settings V1 and let `/me` preview what public modules
will eventually show.

## Feature: Activity, Social, Friends, And Likes

### Problem

Backloggd, Letterboxd, Goodreads, Steam, Serializd, and Trakt all use social
activity to create discovery and retention. But this app currently has a small
user base, and public social features have privacy/moderation cost.

### Product Goal

Design the data foundation for activity now, but defer public social until
there is enough personal content.

### Private Activity V1

- Record private events:
  - game added
  - status changed
  - started
  - finished
  - reviewed
  - rated
  - added to list
  - imported from Steam
  - Steam play activity observed
- Use activity to power:
  - Timeline
  - owner profile recent activity
  - future public activity if enabled

### Public/Social Later

- Follow users.
- Friend/following activity feed.
- Likes on reviews/lists.
- Comments on reviews/lists.
- Notifications.
- Blocked users.
- Report content.
- Privacy controls.

### Data Model Ideas

- `activity_events`
  - `user_id`
  - `event_type`
  - `game_id`
  - `catalog_game_id`
  - `review_id`
  - `list_id`
  - `source`
  - `visibility`
  - `metadata`
  - `occurred_at`
  - `created_at`
- `follows`
  - `follower_user_id`
  - `followed_user_id`
  - `created_at`
- `likes`
  - `user_id`
  - `target_type`
  - `target_id`
  - `created_at`
- `comments` later.
- `blocked_users` later.

### UI/UX Notes

- Feed filters matter:
  - played
  - finished
  - reviews
  - lists
  - follows
  - likes
- Keep social surfaces calm. Avoid infinite-scroll addiction patterns.
- Owner activity and public activity should be clearly different.

### Risks

- Moderation and abuse.
- Privacy leaks.
- Empty social features feel sad if there are only a few users.
- Likes can distort reviews toward short jokes; avoid optimizing for likes too
  early.

### Good First Implementation

Do not build public social yet. Build private `activity_events` when Timeline
needs durable history.

## Feature: Catalog Game Pages

### Problem

Discover exists, but the app does not yet have a strong local page for a game
it knows about. Backloggd game pages, Steam game hubs, Goodreads book pages, and
Letterboxd film pages all give each catalog item a durable home.

### Product Goal

Create local catalog game pages for cached games, focused first on the current
user's relationship to the game and later on local community context.

### V1 Scope

- Route: `/games/:catalogGameId` or `/catalog/:id`.
- Show:
  - cover/header art
  - title
  - release date
  - genres
  - platforms if available
  - metadata source attribution
  - user's own backlog status
  - add/edit/backlog action
  - user's score/review if present
  - lists containing this game, once Lists exists
- Do not require a live RAWG fetch on every page load.

### Later Scope

- Local aggregate rating.
- Local review count.
- Public reviews.
- Public lists containing the game.
- Similar games.
- Series/franchise.
- Provider comparison/repair.
- Community stats.

### Data Strategy

Do not try to show every game live from RAWG. RAWG's free tier has monthly
request constraints, and any global browser should not depend on live provider
calls for every page. IGDB is a possible future provider, but it also has auth,
rate limits, and integration cost.

Better strategy:

- local `catalog_games` is the product database
- RAWG/IGDB are enrichment/search providers
- cache aggressively
- build pages only for known/cached games
- show "not enough local data yet" states gracefully

### UI/UX Notes

- Separate "external metadata" from "your data."
- Add clear provider attribution.
- If metadata is stale/unavailable, preserve the user's backlog data.

### Risks

- Provider terms/attribution.
- API limits.
- Incomplete or wrong metadata.
- Game identity merge/split problems.

### Good First Implementation

Add catalog game pages only after Reviews/Lists have content to show there.

## Feature: Goals And Challenges

### Problem

Tracking is useful, but some users also want motivation: a yearly goal, a short
game cleanup, or a genre challenge.

Goodreads and StoryGraph show annual challenges; Habitify shows goals and
progress; Completionator has challenges and goal templates.

### Product Goal

Add optional goals that motivate without making gaming feel like homework.

### V1 Ideas

- Finish X games this year.
- Finish X backlog games.
- Finish X short games.
- Play X genres.
- Finish X games already started.
- Clear X games from wishlist/backlog.

### V1 Scope

- Route: `/goals` or Settings/Profile module first.
- Create simple yearly goal.
- Progress card.
- Link to filtered backlog.
- Goal visibility private by default.

### Later Scope

- Challenge templates.
- Public optional goals.
- Yearly wrap-up.
- Goal history.
- Community challenges only much later.

### Data Model Ideas

- `goals`
  - `id`
  - `user_id`
  - `goal_type`
  - `target_count`
  - `start_date`
  - `end_date`
  - `visibility`
  - `query` JSON for rule-based goals
  - `created_at`
  - `updated_at`

### UI/UX Notes

- Use encouraging copy.
- Let users pause/archive/delete goals.
- Avoid streak pressure unless explicitly chosen.
- Always link progress to the actual games.

### Risks

- Numeric goals can make leisure feel like work.
- Public goals can create pressure.
- Rule-based goals need clear definitions.

### Good First Implementation

Defer until after Reviews/Lists/Insights V2. Use Insights V2 to learn which
goals would be most useful.

## Feature: Tags, Mood, And Personal Organization

### Problem

The app has personal genre and catalog metadata, but users may want richer
personal organization: mood, difficulty, co-op, comfort game, short game,
requires focus, replayable, or "with friends."

Letterboxd tags and StoryGraph mood/pace/length metadata show how flexible
personal descriptors can improve both organization and recommendations.
Todoist labels show how tags can work across views.

### Product Goal

Add personal tags as a flexible layer distinct from catalog metadata.

### V1 Scope

- Personal tags on games.
- Tag filter in backlog.
- Tag display in game detail.
- Tag input in add/edit forms.
- Keep existing My Genre behavior stable.

### Later Scope

- Tag management page.
- Bulk edit.
- Tag merge/rename/delete.
- Nested tags:
  - `mood:cozy`
  - `with:friend`
  - `platform:switch`
- Tags on reviews, lists, or journal entries.
- Recommendation filters from tags.

### Data Model Ideas

Simple:

- store tags as CSV/array-like text on `games` if scope is narrow

Better:

- `user_tags`
  - `id`
  - `user_id`
  - `name`
  - `slug`
  - `created_at`
- `game_tags`
  - `user_id`
  - `game_id`
  - `tag_id`

### UI/UX Notes

- Tags should be lightweight and optional.
- Do not mix personal tags with RAWG/catalog tags.
- Provide suggestions from existing user tags.
- Avoid making add/edit forms too busy.

### Risks

- Overlap with My Genre.
- Tag sprawl.
- Migration complexity if we start with text and later normalize.

### Good First Implementation

Defer until after Settings/Reviews/Lists unless the user specifically chooses
organization as the next focus.

## Feature: Data, Export, Import, And Safety

### Problem

As the app accumulates reviews, lists, timeline events, goals, and profile data,
the user's data becomes more valuable. Users need confidence that they can
export and control it.

Letterboxd's account export patterns are a good reminder: deleted or changed
content can matter, and export is part of trust.

### Product Goal

Provide safe data export and eventually import/account deletion controls.

### V1 Scope

- CSV export of games.
- JSON export of:
  - games
  - statuses
  - personal fields
  - dates
  - scores/thoughts
  - Steam link summary excluding private tokens/secrets
- Settings Data section.

### Later Scope

- Export reviews.
- Export lists.
- Export timeline/events.
- Export goals.
- Import from CSV/JSON.
- Delete account.
- Deleted content grace period.

### Data Model Ideas

No new schema required for basic export. Later deletion/grace behavior may need:

- soft delete fields
- export job table
- audit/deletion queue

### UI/UX Notes

- Redact secrets/tokens.
- Explain what is included.
- Keep destructive actions separate from export.
- Use `useConfirm` for destructive actions.

### Risks

- Exporting sensitive production data accidentally.
- Including auth tokens or provider secrets.
- Import can create duplicates without careful matching.

### Good First Implementation

Add export under Settings after `/settings` exists.

## Feature: Discovery Improvements

### Problem

The user noticed Backloggd can browse "basically every game" and show public
opinions. Our Discover page is useful, but RAWG rate limits and cache reality
make a live everything-browser risky.

RAWG offers a large database and a free tier with request constraints. IGDB is
another strong provider and powers some game sites, but it requires Twitch auth,
has rate limits, and cannot be queried directly from browsers.

### Product Goal

Improve Discover without pretending external APIs are our own infinite
database.

### Strategy

- Treat `catalog_games` as our product database.
- Treat RAWG/IGDB as provider/enrichment/search sources.
- Keep provider IDs in `external_game_ids`.
- Cache search/detail/collections aggressively.
- Prefer stale cached data over fatal errors.
- Avoid live provider calls on public pages unless explicitly refreshed.
- Seed curated shelves modestly.
- Grow local catalog from:
  - user searches
  - add-to-backlog
  - Steam imports
  - manual/admin seeding
  - future public game-page interactions

### V1 Improvements

- Better Discover empty/stale/unavailable states.
- More local filtering over cached catalog:
  - release year
  - genre
  - rating
  - platform if available
  - already in backlog
- More curated shelves:
  - popular cached
  - highly rated cached
  - upcoming cached
  - new releases cached
  - short games if hours metadata exists
- Add "known locally" language where appropriate.

### Later Scope

- Evaluate IGDB as secondary provider.
- Provider comparison/repair tooling.
- Local catalog game pages.
- Local aggregate stats.
- Recommendations from personal tags/status/reviews.
- Admin/dev metadata health page.

### UI/UX Notes

- Make provider/source attribution visible where required.
- Avoid infinite browsing if it triggers live API calls.
- Show when a game is already in backlog.
- Show "cached result" vs "search RAWG" affordances clearly.

### Risks

- API limits.
- Provider terms/attribution.
- Wrong matches.
- Duplicate catalog identities.
- Slow pages if Discover tries to hydrate too much.

### Good First Implementation

Do not switch providers now. Improve the local catalog and cache-based browsing
model first.

## Feature: Game Status And Completion Semantics

### Problem

Different sites model completion differently. Backloggd uses statuses such as
Played, Completed, Retired, Shelved, and Abandoned. Goodreads recently moved DNF
style tracking into a more explicit shelf concept. Our app has statuses like
finished and played-a-lot-but-didnt-finish, and the backend already has status
grouping helpers.

### Product Goal

Keep status semantics clear, especially as Timeline, Insights, Reviews, Lists,
and public profile grow.

### Ideas

- Review status labels for clarity.
- Decide whether "abandoned", "shelved", "retired", and "completed" map to
  current statuses or need future custom statuses.
- Keep the distinction between:
  - finished main objective
  - played enough / no ending
  - abandoned
  - shelved for later
  - wishlist/planned
  - currently playing
- Make Insights use semantic status groups, not raw labels.
- Do not silently change statuses from Steam activity.

### Data Model Ideas

- Current global statuses may remain for now.
- Future per-user statuses may need:
  - `user_statuses`
  - semantic group
  - sort rank
  - public/private display label

### Risks

- Status changes affect existing filters, reorder logic, Insights, and public
  pages.
- Custom statuses are a large feature.

### Good First Implementation

Keep using `backend/utils/status.js` and `/api/meta/status-groups`. Document
any new status behavior before adding fields.

## Feature: Background Logic And Event Capture

### Problem

Many future features need the same underlying facts:

- when a game was added
- when a status changed
- when a game was started
- when a game was finished
- when a review was written
- when a list was changed
- when Steam observed play

Today much of this must be inferred from current fields. That is fine for V1,
but not enough for durable history.

### Product Goal

Add event capture once Timeline/Reviews/Lists make the need concrete.

### Event Types

- `game_added`
- `status_changed`
- `started`
- `finished`
- `rated`
- `reviewed`
- `review_updated`
- `list_created`
- `game_added_to_list`
- `game_removed_from_list`
- `steam_imported`
- `steam_activity_observed`
- `goal_created`
- `goal_completed`

### Data Model

Use one durable event table unless a specific domain needs separate structure:

- `activity_events`
  - `id`
  - `user_id`
  - `game_id`
  - `catalog_game_id`
  - `event_type`
  - `occurred_at`
  - `source`
  - `visibility`
  - `metadata`
  - `created_at`

### Rules

- Events should be append-only where practical.
- Do not reconstruct every historical edit perfectly.
- Start recording prospectively after the table exists.
- Keep public visibility private by default.
- Do not expose Steam-derived events publicly without opt-in.

### Risks

- Double-recording events during retries.
- Hard-to-debug historical data if event writes are not transactional with
  mutations.
- Public visibility mistakes.

### Good First Implementation

Add event capture only for a narrow path first, such as review creation or
status changes, then expand.

## Suggested Documentation Updates After Choosing A Feature

When one of these features is implemented:

- Update `docs/SYSTEM_CONTEXT.md` with factual architecture changes.
- Update `docs/ROADMAP.md` to mark planning items done/deferred.
- Update this file only if product direction changes or implementation reveals
  a better plan.
- Update `README.md` only for user-facing routes, commands, setup, or major
  capabilities.
- Update `docs/testing/manual-smoke-checklist.md` for new user flows.
- Add or update planning handoff docs only when a feature remains incomplete.

## Suggested QA By Feature

- Owner profile:
  - authenticated owner
  - guest/demo
  - public disabled
  - public enabled
  - mobile layout
- Settings:
  - profile save
  - public toggle
  - preference save
  - Steam linked/unlinked
  - export if implemented
- Timeline/Journal:
  - no dated games
  - started only
  - finished only
  - same-day started/finished
  - filters
  - mobile
- Reviews:
  - no reviews
  - score only
  - thoughts only
  - long text
  - private/public behavior if implemented
- Lists:
  - no lists
  - automatic generated list
  - custom create/edit/delete
  - add/remove/reorder
  - public/private later
- Next Up:
  - add/remove
  - reorder if queue
  - interaction with status/order
  - Surprise Me behavior
- Insights V2:
  - no games
  - missing dates/hours
  - Steam linked games
  - click-through filters
  - cache invalidation if relevant
- Public profile:
  - logged-out viewer
  - owner viewer
  - private fields hidden
  - Steam fields hidden
  - disabled profile
- Catalog pages:
  - cached metadata
  - stale metadata
  - already in backlog
  - add-to-backlog
  - missing cover

## Implementation Selection Guide

If the next goal is structure:

- build `/me`
- build `/settings`

If the next goal is immediate personal value:

- build Reviews V1
- build automatic Lists V1
- improve Timeline V1

If the next goal is backlog decision-making:

- build Next Up
- add priority/pinned games
- add saved backlog views

If the next goal is analytics:

- build Insights V2 year/all-time controls
- add active aging and missing metadata actions

If the next goal is sharing:

- improve public profile controls
- make reviews/lists publishable
- defer likes/comments/friends

If the next goal is discovery:

- improve cached Discover
- add local catalog game pages
- defer provider switch until RAWG is a proven blocker

