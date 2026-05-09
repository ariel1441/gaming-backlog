# Metadata And Catalog Refactor Notes

Last updated: 2026-05-09

This is a planning handoff for a future large refactor. It should not be read as
a final implementation plan. The goal is to preserve the thinking so a future
chat can help design the feature carefully instead of bolting metadata changes
onto the current app too quickly.

## Current Context

The app currently stores user backlog rows in `games`. Those rows include
personal fields such as status, thoughts, score, started/finished dates, and
custom genre.

The app also enriches those rows with external metadata from RAWG and local HLTB
data. Historically, RAWG matching was mostly title-based. A newer improvement
added a RAWG search picker in the add/edit flows and stores:

- `games.rawg_id`
- `games.rawg_slug`

That makes matching more accurate, but it is still not a full catalog model.

The current RAWG cache is mostly a JSON cache under `backend/data/`, with logic
inside/near `backend/routes/games.js`. Public profile hydration and private game
hydration are not fully unified. This is acceptable for now, but it is not the
ideal long-term model.

## Why This Matters

The user wants a future system where they can browse/search games that are not
yet in their backlog, then add selected games to their personal collection.
They also want smarter metadata caching, a manual refresh action, and possibly
automatic refresh for stale metadata, such as weekly refreshes where quota and
rate limits make that safe.

That idea overlaps with several future features:

- searchable game catalog
- better add-game flow
- metadata refresh
- Steam import/sync
- Steam-owned library data
- Steam playtime as actual played hours
- Steam achievements and last-played data
- wishlist
- ownership/platform fields
- recommendations
- public profile metadata
- large-library management

Because these features all touch game identity and metadata, the refactor should
be designed deliberately.

The next chat should treat this as a data-model/product-design refactor first
and an implementation task second. There are several valid designs, and the user
wants the tradeoffs considered before code is changed.

## User Goals For The Big Refactor

The main goals currently discussed:

- Smarter caching for RAWG, HLTB, Metacritic-like data, and later Steam data.
- Manual metadata refresh per game.
- Maybe automatic refresh, such as weekly refresh, only if quota and background
  execution are handled safely.
- A general gaming catalog where users can browse/search games that are not in
  their backlog yet.
- Add games from that catalog into the user's backlog.
- Keep the design compatible with a future Steam import/sync feature.
- Use Steam user data where it is better than estimates, especially actual
  played time for games marked finished or played-a-lot-but-did-not-finish.
- Eventually support Steam-owned games, profile/library import, achievements,
  last played, and similar user-specific Steam data.
- Avoid rushing into a RAWG-only design that blocks Steam, wishlist, ownership,
  or catalog browsing later.

## RAWG Quota Concern

RAWG API quota should shape the design.

RAWG public docs currently mention a Free API quota around 20,000 requests per
month, though some RAWG docs/pages have historically shown different numbers.
The safer assumption is to design around the lower number.

Weekly automatic refresh can look safe for a small personal backlog, but it can
become expensive when combined with:

- search-as-you-type
- public profile views
- cold cache rebuilds
- retries
- Steam import matching
- catalog browsing
- multiple users
- future background jobs

Do not add broad automatic refresh without quota protection.

## Main Architectural Options

### Option A: Keep Metadata Mostly In The Current Cache

Keep the current `games` table as the main user-owned record. Store selected
RAWG identity on each game row and continue decorating from a cache.

Possible additions:

- `rawg_fetched_at`
- `rawg_failed_at`
- `rawg_failure_reason`
- manual refresh endpoint
- cooldown/rate-limit metadata refresh

Pros:

- Smaller change.
- Faster to implement.
- Lower migration risk.
- Current UI and API shape can mostly stay the same.
- Good enough for a personal app in the short term.

Cons:

- Metadata remains duplicated conceptually across user rows.
- Same RAWG game can be refreshed multiple times for different users/rows.
- Browsing games outside the collection is awkward.
- Steam import and catalog features still need another refactor later.
- JSON cache may become a weak foundation for long-term metadata state.

### Option B: Introduce A Real Catalog Table

Separate global/external game identity from each user's personal backlog item.

Possible shape:

```txt
catalog_games
- id
- rawg_id
- rawg_slug
- name
- released
- cover
- rating
- metacritic
- genres
- metadata_fetched_at
- metadata_failed_at
- metadata_failure_reason
- created_at
- updated_at

user_games
- id
- user_id
- catalog_game_id
- status
- position
- my_genre
- thoughts
- my_score
- how_long_to_beat / manual estimate
- actual_played_minutes / actual hours source, possibly Steam
- preferred_hours_source / hours_locked
- started_at
- finished_at
```

Pros:

- One metadata record can serve many users.
- Search/browse catalog becomes natural.
- Metadata refresh happens once per catalog game.
- Better foundation for Steam import and future external sources.
- Public profiles and private backlogs can share the same metadata source.
- Easier to add wishlist/ownership/platform concepts later.

Cons:

- Bigger migration.
- Existing `games` rows need to be mapped into catalog records.
- API serializers need careful compatibility work.
- Duplicate handling gets more complex.
- Need to decide how editions, remasters, DLC, and platform variants work.
- More backend surface area and testing required.

### Option C: Hybrid Transitional Model

Add `catalog_games` but keep old `games` columns temporarily. New games use the
catalog relation, while old rows are gradually backfilled.

Pros:

- Safer migration path.
- Lets the app keep working while the model evolves.
- Allows incremental UI/API changes.

Cons:

- Temporary dual source of truth.
- More code complexity during transition.
- Requires a clear cleanup plan.

## Metadata Refresh Ideas

Refresh should update external metadata, not personal user data.

External metadata might include:

- cover
- release date
- RAWG rating
- Metacritic
- RAWG genres
- RAWG playtime
- stores/platform metadata, if used

Personal data should not be overwritten:

- status
- position
- thoughts
- my score
- my genre/tags
- started date
- finished date
- manual hour estimate
- actual Steam playtime, unless a Steam sync explicitly updates it
- user-selected preferred hours source or locked override

Suggested refresh strategy:

- Prefer `rawg_id` over title search.
- If no selected identity exists, ask the user to choose a match.
- Track successful fetch time.
- Track failed fetch time and failure reason.
- Retry failed fetches slowly.
- Add per-game refresh cooldown.
- Add endpoint-level rate limiting.
- Consider a global daily/monthly RAWG budget.
- Avoid weekly refresh of every user row.
- Refresh catalog records, not individual collection rows, if using a catalog.
- Make manual refresh explicit in the UI.
- Show last refreshed / failed state somewhere, at least in details/edit/admin
  surfaces.
- Let "change match" and "refresh current match" be separate actions.

Possible stale windows:

- Upcoming or recently released games: refresh more often.
- Released/older games: refresh less often.
- Failed lookups: retry after a longer delay.
- Manual refresh: allowed with cooldown.

Possible implementation modes:

- Manual-only refresh first. Lowest risk and easiest to reason about.
- Lazy refresh on read when metadata is stale. Useful, but must avoid slowing
  page loads or firing too many requests.
- Scheduled refresh. Best user experience later, but requires quota budgets,
  background execution, and failure monitoring.
- Admin-triggered refresh. Useful while building the system.

Avoid a broad "refresh every user game every week" design. If automatic refresh
is added, prefer refreshing distinct catalog records with a quota budget and
different stale windows based on release date, failure state, and popularity.

## Source Priority And Field Ownership

The refactor should decide which system owns each field. Suggested mental model:

- Catalog metadata: external/global facts about the game.
- User relationship data: the user's status, ownership, backlog/wishlist state,
  platform, notes, score, and dates.
- User source data: Steam playtime, achievements, last played, import source,
  and sync timestamps.
- User overrides: manual values that should win over external metadata.

For each field, decide source priority. Examples:

- Cover: user override, then RAWG, then Steam capsule image.
- Release date: RAWG or another catalog source.
- Genres: RAWG/catalog genres separate from user My Genre/tags.
- Estimated hours: manual override, then HLTB, then RAWG playtime estimate.
- Actual played hours: Steam user playtime when linked, then manual actual time
  if added later.
- Insights hours for planned games: usually estimated hours.
- Insights hours for finished / played-a-lot-but-did-not-finish games: consider
  actual Steam playtime when available, otherwise estimated hours.

External refresh should not silently overwrite user-entered fields. Steam sync
is special because it updates user-specific external fields, not global catalog
metadata.

## Hours Model

Hours are important enough to deserve a deliberate model instead of one generic
`how_long_to_beat` value.

Possible concepts:

- Estimated main-story hours.
- Estimated extra/completionist hours.
- Estimated hours source, such as HLTB, RAWG, or manual.
- Actual played minutes/hours.
- Actual hours source, such as Steam.
- User override/preferred hours.
- A lock that prevents future refreshes from changing the chosen hours.

Important question for insights: should completed games count estimated hours or
actual played time? The current user preference is leaning toward using Steam
actual hours for finished and played-a-lot-but-did-not-finish games when Steam
data exists.

## Search And Browse Catalog

The future product direction may include a page or flow where the user can
search/browse games even before adding them to the backlog.

Important design questions:

- Is the catalog only RAWG-backed, or can it include Steam/IGDB/manual games?
- Are search results stored immediately, or only after a user selects a game?
- Can a user wishlist a catalog game without adding it to backlog?
- Does "owned" differ from "in backlog"?
- Can the same catalog game appear multiple times for one user on different
platforms/editions?
- Should catalog browsing be a new main app route, or an add-game modal flow
  first?
- Should catalog records be created for every search result, or only when a
  user opens/adds/selects the game?
- How does the UI show "already in backlog", "owned on Steam", "wishlist", and
  "add to backlog"?

The catalog may eventually become a second major product surface: "Catalog" for
discovery and "My Backlog" for the user's collection.

## Wishlist, Ownership, And User Relationship

Before adding browse/catalog features, decide how a user relates to a catalog
game.

Possible relationship states:

- in backlog
- wishlist
- owned
- imported from Steam
- ignored/hidden
- archived
- manually added

Open design choice: wishlist could be a status inside `user_games`, a separate
table, or a relationship flag. A unified user-game relationship table is likely
more flexible, but it needs clear constraints so the same user does not get
confusing duplicates.

## Steam Import Relationship

Steam import will likely need the same identity model.

A Steam import could create or match catalog records using:

- Steam app id
- title
- release metadata
- RAWG match, if available

Potential future fields:

```txt
catalog_games.rawg_id
catalog_games.steam_app_id
catalog_games.igdb_id
catalog_games.name

external_game_ids
- catalog_game_id
- source
- external_id
- slug_or_url
- confidence / match_state

user_games.ownership_source
user_games.platform
user_games.import_source
user_games.external_library_id

user_game_external_data
- user_game_id
- source
- steam_app_id
- playtime_minutes
- achievements_unlocked
- achievements_total
- last_played_at
- last_synced_at
```

Steam import may also introduce:

- playtime
- achievements
- last played
- owned/not-owned state
- import conflict review
- owned games that are not in the backlog yet
- hidden/ignored games that should not clutter the backlog
- duplicate matching between existing manual/RAWG games and Steam app ids

Do not design the catalog model as RAWG-only if Steam import is likely.

Steam data has two categories:

- Global Steam/catalog data, such as app id, title, capsule image, store page,
  release date, and platform availability.
- User-specific Steam data, such as ownership, playtime, achievements, last
  played, and import/sync timestamps.

These should not live in the same place without a clear reason.

Steam import should probably use a review screen rather than blindly importing
everything into the backlog. The review can show likely matches, duplicates,
already-owned games, and default status decisions.

## Identity Matching Risks

Game identity is one of the hardest parts of this refactor.

Examples that can be ambiguous:

- Same title across different years, such as "DOOM" or "God of War".
- Remasters and complete editions.
- DLC, demos, soundtracks, bundles, and tools.
- Regional titles or renamed releases.
- Steam app ids that do not map cleanly to one RAWG game.

Recommended direction: create an internal `catalog_game_id` as the app's real
identity, then attach external ids to it. Do not make RAWG id or Steam app id
the only primary identity for all future features.

The add/import flows should allow the user to correct bad matches.

## Background Jobs And Automation

Manual refresh is simple. Automatic weekly refresh is attractive, but it needs
background execution and quota protection.

Possible job approaches:

- Lazy refresh during normal reads, with strict cooldowns.
- GitHub scheduled action calling an admin endpoint.
- Railway cron/job if available in the deployment setup.
- A small job table processed by the backend.
- Later, a real queue if the app grows.

For the first refactor, it may be enough to design the schema so jobs can be
added later, while implementing only manual refresh plus stale-state tracking.

## Privacy And Public Profile

Steam and richer metadata can expose more personal information.

Decisions needed before showing this publicly:

- Can public profiles show actual Steam playtime?
- Can public profiles show achievements?
- Can users hide owned games?
- Can users hide wishlist items?
- Can users hide started/finished dates?
- Can users disconnect Steam and delete synced data?
- What happens to Steam/user metadata on account deletion?

Public profile serializers should be explicit about which fields are exposed.

## Admin And Debug Needs

This refactor will be easier to maintain if there is a small way to inspect
metadata state.

Useful future tools:

- Show the catalog record for a user game.
- Show attached RAWG/Steam/other external ids.
- Show last fetched, next refresh, failed reason, and source.
- Trigger manual refresh for one catalog game.
- See recent metadata failures.
- Repair a bad match.

These can start as simple backend/debug endpoints or admin-only UI later.

## Decisions To Make Before The Big Refactor

Before implementing the large refactor, decide:

1. Should there be a first-class `catalog_games` table?
2. Should `games` be renamed/split into `user_games` or `collection_items`?
3. What external sources matter long-term: RAWG only, Steam, IGDB, others?
4. Is a game identity source-specific or unified across sources?
5. Can one user add the same catalog game more than once?
6. How should editions, remasters, DLC, bundles, and platform variants work?
7. Are wishlist and backlog the same table with different status, or separate concepts?
8. Should ownership/source/platform be part of the first refactor?
9. What metadata is stored in DB versus cache?
10. Should RAWG search results be cached? For how long?
11. Should metadata refresh be manual only at first?
12. Should there be automatic refresh? If yes, what stale windows and quota limits?
13. What user fields can override external metadata?
14. How should HLTB/manual hours/RAWG playtime be represented?
15. How should Steam actual playtime affect hours and insights?
16. Which statuses should prefer actual hours over estimated hours?
17. How should Steam achievements and last-played data be stored?
18. Should Steam import create backlog rows immediately or use a review queue?
19. How should public profiles read metadata after the split?
20. What privacy controls are required for Steam/user-specific data?
21. What migration path preserves existing user games safely?
22. What tests are required before changing the data model?
23. How will production migrations be run automatically and safely?

## Suggested Future Process

For the future chat that works on this:

1. Re-read current `docs/SYSTEM_CONTEXT.md` and this file.
2. Inspect current `games` schema, routes, serializers, public profile route,
   insights route, and frontend services.
3. Sketch the target data model before coding.
4. Decide the migration path and rollback risk.
5. Add focused backend tests before broad rewrites.
6. Keep API response shape compatible where possible.
7. Implement in phases instead of one huge unreviewable diff.

Possible phases:

1. Add catalog table and serializer while keeping current frontend shape.
2. Backfill catalog records from existing games using `rawg_id` when available.
3. Link user games to catalog records.
4. Move RAWG fetch/cache/refresh logic into a metadata service.
5. Update add/edit flows to use catalog records.
6. Add browse/search catalog page.
7. Add manual metadata refresh with cooldown.
8. Add hours-source modeling and update insights carefully.
9. Add Steam-compatible external id/user-source tables, even if Steam sync is
   implemented later.
10. Only then consider automatic refresh jobs.
11. Implement Steam import/sync as a separate big feature after catalog basics
   are stable, unless the chosen schema requires a small Steam foundation now.

## Current Recommendation

Do not implement broad automatic metadata refresh on the current JSON cache.

The recently added RAWG picker is a useful stepping stone. The next serious
metadata work should be designed as part of the catalog/collection split, because
that same model will support browsing external games, Steam import, wishlist,
and future recommendations.

Recommended first implementation direction:

1. Design `catalog_games`, external ids, and user-game relationship tables.
2. Keep the existing API response shape compatible while internally linking to
   catalog records.
3. Implement manual refresh and stale/failure tracking before automatic refresh.
4. Model estimated hours, actual hours, source, and user override deliberately.
5. Let Steam influence the schema now, but consider implementing full Steam sync
   as the next major branch after the catalog foundation is stable.
