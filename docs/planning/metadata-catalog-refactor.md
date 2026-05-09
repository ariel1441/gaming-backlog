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

That idea overlaps with several future features:

- searchable game catalog
- better add-game flow
- metadata refresh
- Steam import/sync
- wishlist
- ownership/platform fields
- recommendations
- public profile metadata
- large-library management

Because these features all touch game identity and metadata, the refactor should
be designed deliberately.

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

Possible stale windows:

- Upcoming or recently released games: refresh more often.
- Released/older games: refresh less often.
- Failed lookups: retry after a longer delay.
- Manual refresh: allowed with cooldown.

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

user_games.ownership_source
user_games.platform
user_games.import_source
user_games.external_library_id
```

Steam import may also introduce:

- playtime
- achievements
- last played
- owned/not-owned state
- import conflict review

Do not design the catalog model as RAWG-only if Steam import is likely.

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
15. How should public profiles read metadata after the split?
16. What migration path preserves existing user games safely?
17. What tests are required before changing the data model?
18. How will production migrations be run automatically and safely?

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
8. Only then consider automatic refresh jobs.

## Current Recommendation

Do not implement broad automatic metadata refresh on the current JSON cache.

The recently added RAWG picker is a useful stepping stone. The next serious
metadata work should be designed as part of the catalog/collection split, because
that same model will support browsing external games, Steam import, wishlist,
and future recommendations.
