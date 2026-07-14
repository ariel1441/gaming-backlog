# Durable Game Metadata Architecture Plan

Status: architecture approved; Stages 0-2 implemented locally, production rollout pending

Last reviewed: 2026-07-14

Primary systems: PostgreSQL, RAWG, Steam, Express API, React client, Railway

## Implementation progress

As of 2026-07-14:

- Stage 0 production auditing is complete and was read-only.
- Production has zero null game positions, zero invalid statuses, zero duplicate
  external identity groups, and zero broken catalog links.
- Production backlog links currently resolve to 95 full catalog rows and 35
  search-result-only catalog rows; 471 game rows remain unlinked.
- Railway CLI confirms a persistent PostgreSQL volume, but recoverable backup
  status cannot be proven through the available CLI. Backup confirmation remains
  a required production-release gate.
- Migration `020_add_games_cover_compat.sql` was created to add the missing
  compatibility column.
- Migration `021_reconcile_games_core_constraints.sql` was created to restore
  the position default/nullability and status foreign key safely.
- The migration runner now verifies these core schema details instead of only
  checking table existence and ledger count.
- A historical-schema contract test now proves that tracked migrations upgrade
  an existing pre-baseline `games` table.
- Emergency cover hydration now runs only for rows with an exact RAWG ID;
  title-only rows are left for the future reviewed repair system.
- Both migrations were applied successfully to localhost PostgreSQL.
- Focused route/schema verification and the full `npm run check` passed
  locally (215 tests, lint, and production build).
- No production migration or production data write has been performed.

## Purpose

This document is the implementation handoff for replacing the application's
accidental RAWG filesystem-cache dependency with a durable, consistent metadata
architecture.

It records:

- the verified current state and incident cause;
- the architecture decisions agreed during review;
- the target data model and ownership boundaries;
- the expected behavior of every important metadata flow;
- the migration, backfill, rollout, testing, and operational plan;
- decisions that are intentionally deferred.

Future implementation work should prefer the current code, schema, migrations,
tests, and git history over this document if they diverge. Update this document
when an approved implementation decision changes.

## Safety and implementation rules

- This plan does not authorize production writes by itself.
- Production changes must use reviewed migrations under `backend/migrations/`.
- Keep `backend/schema.sql` synchronized with every schema migration.
- Do not copy production data locally or commit provider caches, dumps, secrets,
  tokens, or personal game data.
- Run production audits with aggregate/schema-only SQL inside an explicit
  `READ ONLY` transaction.
- Use additive, backward-compatible changes and dual-read/dual-write transitions
  before removing legacy behavior.
- Preserve owner, guest/demo, and public read-only behavior.
- Keep authenticated user data scoped by `req.user.id`.
- Normal page rendering must not depend on RAWG availability.

Before implementation, read:

- `AGENTS.md`
- `docs/SYSTEM_CONTEXT.md`
- `docs/NEXT_TASKS.md`
- `docs/skills/gaming-backlog-review/SKILL.md`
- `docs/skills/gaming-backlog-backend-api/SKILL.md`
- `docs/skills/gaming-backlog-db-safety/SKILL.md`
- the relevant current routes, services, migrations, and tests

## Executive summary

PostgreSQL will become the durable source of truth for displayable game
metadata. RAWG will be an ingestion, search, repair, and refresh provider—not a
runtime rendering dependency. The ignored `cached_rawg_data.json` file will be
used only as a one-time historical import source and then retired from runtime
behavior.

Each private backlog row will link to a shared canonical `catalog_games` row.
Normalized catalog columns will serve normal API responses quickly. Durable
provider snapshots will preserve the complete RAWG detail response and its
provenance. Exact external identities can be linked automatically. Title-only
or edition-ambiguous matches require review.

Repair and refresh work will be stored as resumable PostgreSQL-backed jobs so a
Railway restart cannot lose progress. Metadata refreshes will be controlled and
global. Ordinary page loads and personal game edits will not silently refresh
shared metadata.

Canonical artwork will have an explicit source. Steam artwork may remain an
explicit final fallback, but it will not silently replace RAWG artwork or count
as completed RAWG metadata.

## Why this change is required

### Incident

Before commit `c6bbde6`, `GET /api/games` silently fetched RAWG detail for
legacy games missing from process-local cache and wrote the result to
`backend/data/cached_rawg_data.json`. Railway's application filesystem is
temporary, so this was never durable storage.

Commit `c6bbde6` correctly changed normal backlog loading to database/cache-only
behavior. That exposed, rather than created, the underlying persistence gap:
many games had never stored their complete metadata in PostgreSQL.

Commit `1eb9054` synchronized Discover additions with the shared frontend game
collection. That state synchronization should be preserved while changing the
metadata persistence layer.

Commit `3637066` restored visible images using cover hydration and Steam
artwork fallback. It did not persist descriptions, ratings, Metacritic values,
release information, genres, stores, tags, or complete provider identity.

### Confirmed production failure

On 2026-07-14, a schema-only production audit was run through Railway inside an
explicit read-only transaction. It confirmed:

- `transaction_read_only = on`;
- production `games.cover` does not exist;
- all queries ended with `ROLLBACK`;
- the deployed cover-repair route writes `games.cover`;
- the deployed add-game route inserts `games.cover`.

This conclusively explains both observed `500 Database error` failures:

- `POST /api/games/hydrate-covers`;
- `POST /api/games` when adding a game.

The maintained `backend/schema.sql` includes `games.cover`, but migration
`000_core_baseline.sql` uses `CREATE TABLE IF NOT EXISTS games`. It cannot add a
column to a table that already exists, and no later migration explicitly adds
the column.

### Confirmed production aggregates

The same read-only production audit found:

| Measure | Count |
| --- | ---: |
| Backlog game rows | 601 |
| Backlog rows linked to `catalog_games` | 130 |
| Backlog rows with an exact legacy RAWG ID | 102 |
| Unlinked rows with an exact RAWG ID | 0 |
| Unlinked title-only rows | 471 |
| Catalog rows | 5,557 |
| Catalog rows marked `full` | 96 |
| Catalog rows marked `search_result` | 5,461 |

For the 5,461 production search-result catalog rows:

- 5,394 have covers;
- none have descriptions;
- 2,936 have RAWG ratings;
- 1,344 have Metacritic values.

Additional production schema drift was confirmed:

- `games.position` is nullable and has no default;
- the expected `games.status` foreign key is absent;
- 20 migration ledger rows exist despite the drift.

The user separately reports more than 300 unmatched games in their backlog.
That private per-user count was not independently queried during the aggregate
audit.

### Local development masking

The ignored local file `backend/data/cached_rawg_data.json` is approximately
7.9 MB and contains hundreds of rich RAWG objects. A read-only local audit found
approximately:

- 716 cache keys;
- 713 covers;
- 715 descriptions;
- 648 positive ratings;
- 403 Metacritic values.

Local rendering therefore appears more complete even when PostgreSQL contains
only search-result metadata. This file is not a safe deployment artifact or a
source of truth.

### Current transition behavior to understand

The following behaviors were verified during the architecture review. Recheck
the current code before changing them because later commits may differ.

- `GET /api/games` is currently database/process-cache-only and does not call
  RAWG. Preserve that fast database-only property.
- Private cover precedence currently mixes catalog cover, `games.cover`, the
  local RAWG cache, and constructed Steam header artwork.
- `POST /api/games/hydrate-covers` repairs only covers. For games without an
  exact RAWG ID, it may use the first title-search result. It does not persist
  full metadata or a reviewed identity.
- Adding a game with a selected RAWG result fetches exact detail and establishes
  the best current durable catalog connection.
- Adding by title without selecting a RAWG result may use the first search
  result for a cover without establishing durable identity.
- The current edit path can refresh shared catalog metadata as a side effect of
  editing a linked personal game. The target architecture removes this global
  side effect.
- The current manual **Change metadata** flow is the safest existing correction
  path: it saves the selected RAWG identity, fetches exact detail, upserts the
  shared catalog/external ID, and links the private game.
- A catalog search-result row normally has title, cover, release, rating,
  Metacritic, playtime, and some genres, but no full description/stores/tags.
- A catalog row marked `full` means the detail request was processed; optional
  provider fields can still legitimately be absent.
- Catalog detail/refresh operations can update the shared record for every
  linked user. Search-result ingestion should not downgrade an existing full
  record.
- Public-profile code still performs bounded live title-only RAWG hydration for
  some unlinked games. This violates the target database-only rendering rule
  and must be migrated carefully.
- Lists use database/catalog data plus legacy cover/cache fallbacks. Insights
  combines personal/Steam/HLTB/catalog/cache sources according to separate
  hours rules. Do not accidentally collapse those personal-hours semantics.
- Demo cloning preserves catalog/RAWG identity and cover values. Guest users do
  not normally perform live RAWG calls.
- The shared frontend `GamesProvider` intentionally loads the private games
  collection once and synchronizes additions. Preserve this performance model.
- Successful entries in the legacy JSON cache effectively do not expire.
  Failure entries use retry behavior, but the filesystem remains ephemeral on
  Railway.
- Broken non-empty image URLs can block server-side fallbacks; UI error handling
  is inconsistent between card/modal/timeline/review/profile surfaces.
- Steam-only cover fallback does not establish full RAWG metadata and should
  remain visually/provenance-distinct.

## Goals

1. Make PostgreSQL the durable source of truth for metadata displayed by the
   application.
2. Keep normal backlog, list, public-profile, review, timeline, insight, demo,
   and Discover rendering database-only.
3. Store newly selected games once and reuse them globally for every user.
4. Repair existing exact-identity games automatically.
5. Provide a practical review queue for ambiguous legacy games.
6. Make provider requests rate-limited, deduplicated, observable, and
   restart-safe.
7. Make refresh behavior controlled, global, and predictable.
8. Record artwork provenance and prevent silent artwork replacement.
9. Preserve private user data isolation.
10. Support cold Railway starts with an empty filesystem cache.

## Non-goals for the first implementation

- Hosting RAWG or Steam image bytes in object storage before licensing review.
- Supporting many metadata providers beyond a provider-neutral foundation.
- Automatically merging editions, remasters, DLC, demos, or regional releases.
- Building a complete catalog-administration application.
- Adding metadata localization.
- Storing unlimited historical provider snapshots.
- Building advanced recommendation algorithms for Discover.

## Agreed architecture principles

1. PostgreSQL is authoritative for displayable metadata.
2. RAWG is an external provider, not a rendering dependency.
3. Caches are disposable and rebuildable.
4. Exact RAWG identities can be connected automatically.
5. Title-only and edition-ambiguous matches require human review.
6. Shared catalog metadata is global; personal fields remain per-user.
7. Normal page loading remains fast and database-only.
8. Provider failures never delete or blank previously good metadata.
9. Metadata repair and refresh are resumable jobs, not long HTTP requests.
10. Canonical artwork and artwork source are explicit.
11. Steam artwork is an explicit alternate/fallback, not a silent RAWG
    replacement.
12. Global refreshes are controlled and are not side effects of personal edits.
13. Migration is additive, observable, and reversible until completeness gates
    are met.

## Target architecture

```text
                         Controlled provider traffic
                    search / ingest / repair / refresh
                                      |
                                      v
                                 RAWG API
                                      |
                                      v
                         provider snapshots (JSONB)
                                      |
                                      v
User-owned data       shared canonical projection       alternate artwork
----------------      ---------------------------       -----------------
games --------------> catalog_games <----------------- catalog artwork
  |                        |
  |                        +--> external_game_ids (RAWG/Steam)
  |
  +--> user_game_sources (private Steam ownership/playtime)
  +--> metadata match/review state (private)

Normal application reads: PostgreSQL only
Background/interactive provider work: controlled RAWG service only
Filesystem cache: disposable; not authoritative
```

## Data ownership and source-of-truth matrix

| Data | Durable owner | Scope | Notes |
| --- | --- | --- | --- |
| Status, ordering, score, thoughts, dates | `games` | Per user | Never changed by catalog refresh |
| Personal genre/hours preferences | `games` | Per user | Separate from provider estimates |
| Steam ownership, playtime, achievements | `user_game_sources` | Per user/private | Never exposed publicly without privacy controls |
| Catalog link | `games.catalog_game_id` | Per user link | Points to shared identity |
| Canonical title | `catalog_games` | Global | RAWG-backed unless explicitly curated |
| Description | `catalog_games` | Global | Normalized/sanitized from provider snapshot |
| Release date | `catalog_games` | Global | May refresh |
| RAWG rating and Metacritic | `catalog_games` | Global | May refresh |
| Genres, stores, tags | `catalog_games` | Global | Normalized JSON/relations used by UI |
| RAWG playtime estimate | `catalog_games` | Global | Does not overwrite personal/HLTB/Steam choices |
| Canonical cover URL | `catalog_games.cover_url` initially | Global | Add explicit provenance fields |
| Alternate RAWG/Steam artwork | Catalog artwork records or explicit columns | Global | Never silently canonicalized |
| User cover override | Future explicit field | Per user | Do not silently repurpose legacy `games.cover` |
| RAWG provider identity | `external_game_ids` | Global | Unique per provider/provider ID |
| Complete RAWG response | Provider snapshot table | Global | Durable JSONB with provenance |
| Match candidates and decisions | Repair/candidate tables | Per user/private | Scope all API access to owner |
| Repair and refresh progress | Job tables | User/global depending job | Restart-safe and observable |
| `cached_rawg_data.json` | None after migration | Disposable | One-time import source only |

## Catalog identity policy

The provider identity is the safe boundary. By default, different RAWG IDs are
different catalog games, including:

- original releases and remasters;
- base games and DLC;
- demos and full releases;
- definitive/complete editions;
- materially different regional releases.

Do not merge catalog records automatically based on normalized title. Catalog
merge is a future explicit administrative operation because linked users may
already depend on both records.

Database constraints must prevent two catalog records from claiming the same
provider/provider ID pair.

## Metadata quality model

Cover presence is not metadata completeness. The system needs explicit states.

Recommended catalog quality states:

- `search_result`: partial data ingested from search or provider collection;
- `full`: exact provider detail fetched and durably stored;
- `provider_unavailable`: exact identity known, detail temporarily unavailable;
- `invalid_provider_record`: provider response failed validation;
- `retired`: provider identity no longer resolves, but last good data remains.

Recommended per-game link/review states:

- `linked`: connected to a catalog identity;
- `pending_review`: one or more candidates require a user decision;
- `unmatched`: no credible candidate found;
- `skipped`: user intentionally deferred/rejected matching.

`full` means the exact detail endpoint was successfully processed. It does not
mean every optional provider field is non-null. The system must distinguish
"provider supplied no value" from "detail has never been fetched."

## Proposed schema responsibilities

Exact names and constraints should be finalized during implementation, but the
following responsibilities are required.

### `catalog_games`

Continue using normalized columns for fast reads. Add or clarify:

- canonical cover provenance (`cover_source`, provider image identity, or
  equivalent);
- whether the canonical cover is intentionally pinned;
- last successful detail refresh;
- next eligible refresh or a derivable freshness policy;
- normalized schema/version number if normalization rules can change;
- metadata quality/failure fields with well-defined semantics.

Retain `cover_url` as the canonical cover during the compatibility phase rather
than renaming it in a risky migration.

### Provider snapshots

Add a durable provider snapshot table with at least:

- catalog game ID;
- provider name;
- provider game ID;
- raw JSONB payload;
- fetched timestamp;
- normalized schema/version;
- payload hash for deduplication/audit;
- creation timestamp.

Only successful validated detail responses should replace the current
canonical projection. Failure state belongs on the catalog refresh/job state,
not in place of the last good snapshot.

Initially keep the latest successful snapshot and limited useful history. Do
not create unlimited snapshots without a retention policy.

### Artwork provenance

The first implementation may use explicit columns on `catalog_games`. A future
`catalog_game_artwork` table is appropriate if multiple alternatives,
dimensions, validation state, or provider histories become necessary.

Required concepts:

- URL;
- source/provider;
- provider image identity where available;
- role (`canonical`, `alternate`, `steam_header`, etc.);
- aspect ratio/dimensions where known;
- validation/broken state;
- selection reason;
- whether selection is pinned.

### Repair and refresh jobs

Persist job state in PostgreSQL. Required concepts:

- job type (`backlog_repair`, `catalog_refresh`, `cache_import`, etc.);
- user scope for private repair jobs;
- status (`queued`, `running`, `paused`, `completed`, `failed`, `cancelled`);
- durable cursor/checkpoint;
- total, processed, linked, review, unmatched, failed counts;
- attempts and next eligible attempt;
- non-sensitive error code/summary;
- created, started, updated, and completed timestamps.

Use uniqueness/idempotency rules to prevent duplicate active jobs for the same
scope.

### Match candidates

Persist candidates for ambiguous backlog games. Required concepts:

- owner-scoped backlog game ID;
- proposed catalog/provider identity;
- confidence score/category;
- evidence such as normalized title, release year, platform, and Steam mapping;
- candidate rank;
- decision (`pending`, `accepted`, `rejected`, `skipped`);
- decision timestamp.

Candidate endpoints must be authenticated and owner-scoped because the records
reveal private backlog membership.

### `games.cover` compatibility

Production needs `games.cover` immediately because the deployed code references
it. Add it through a reviewed idempotent migration, but define it as a legacy
compatibility fallback during transition.

Do not silently redefine it as a user override. If per-user overrides are later
approved, add an explicit field such as `cover_override_url` with deliberate UI
semantics. Once catalog migration is complete, legacy `games.cover` can be
deprecated and eventually removed through a separate reviewed migration.

## Major application flows

### 1. Normal private backlog rendering

1. Load owner-scoped `games` rows.
2. Join shared `catalog_games` and private Steam source data.
3. Serialize normalized catalog metadata.
4. Use explicit artwork precedence.
5. Return immediately without contacting RAWG.

Recommended artwork precedence during transition:

1. explicit future user override;
2. canonical catalog cover;
3. legacy `games.cover` compatibility value;
4. explicit Steam alternate;
5. placeholder.

After migration, remove the legacy step.

### 2. Adding from an exact RAWG search result

1. User searches through the controlled backend provider service.
2. User selects a specific RAWG result.
3. Backend resolves the unique RAWG external ID mapping.
4. Reuse the existing catalog row when present.
5. If full detail is missing or invalid, fetch the exact RAWG detail endpoint.
6. Validate and store the provider snapshot.
7. Atomically update the normalized catalog projection.
8. Create the private `games` row linked through `catalog_game_id`.
9. Return database-serialized metadata.

Concurrent requests for the same RAWG ID must coalesce or rely on unique
constraints plus retry-safe upsert logic.

### 3. Adding a title without selecting metadata

1. Create the private backlog row without guessing a permanent provider
   identity.
2. Mark it unmatched or pending candidate generation.
3. Search for candidates through the repair system.
4. Present candidates for later review.
5. Link only after an accepted decision or an exact trusted identity appears.

Never persist the first title-search result as canonical identity merely because
it ranked first.

### 4. Editing or changing metadata

1. Personal edits update only the owner-scoped `games` row.
2. Selecting "Change metadata" searches and selects an exact catalog/RAWG
   identity.
3. The private game changes its catalog link.
4. An existing complete catalog row is reused without an automatic refresh.
5. A new/incomplete exact catalog row may be populated through controlled
   detail ingestion.
6. The selection must not overwrite a different existing global catalog
   identity.

Ordinary edits must not refresh shared artwork, ratings, or descriptions as a
side effect.

### 5. Backlog repair button

Add a user-facing action such as **Repair missing metadata**.

The request creates or resumes a PostgreSQL-backed repair job and returns
quickly. It must not run hundreds of provider calls inside one HTTP request.

Processing order:

1. exact legacy RAWG ID;
2. existing globally confirmed catalog mapping;
3. trusted exact Steam-to-catalog mapping;
4. existing catalog candidate with strong identity evidence;
5. RAWG title search to generate review candidates;
6. unmatched when no credible result exists.

Automatic acceptance policy:

- exact RAWG ID: accept;
- exact trusted external-ID mapping: accept;
- previously confirmed catalog identity: reuse;
- title/year/platform high-confidence result: recommend for review initially;
- title-only result: require review;
- remaster/edition/DLC/demo disagreement: always require review.

The UI should show durable progress, for example:

```text
312 missing
84 connected automatically
173 waiting for review
41 unmatched
14 temporarily failed
```

Candidate review should support:

- current backlog title;
- best candidate cover/title/release/platform information;
- alternative candidates;
- an explanation of match confidence;
- accept, choose another, reject, or skip;
- selected bulk acceptance for reviewed high-confidence candidates.

### 6. Metadata refresh

Refresh is global because `catalog_games` is shared.

Allowed triggers:

- scheduled stale-record refresh;
- explicit administrative/global refresh;
- targeted repair of partial or failed exact identities;
- promotion of an important partial Discover record.

Disallowed implicit triggers:

- normal backlog/page loading;
- opening a public profile;
- editing personal score, status, notes, or dates;
- routine list or insight calculation.

Refresh procedure:

1. acquire an idempotency/coordination lock;
2. fetch detail by exact provider ID;
3. validate the response;
4. store the new provider snapshot;
5. compare it with the current normalized projection;
6. update allowed global fields atomically;
7. preserve previous good values when new optional values are absent;
8. preserve pinned canonical artwork unless explicitly changed or known broken;
9. record success/failure and next eligibility;
10. release the lock and update metrics.

Suggested initial freshness policy:

- unreleased/upcoming games: relatively frequent;
- recently released games: every few weeks;
- older stable games: every few months;
- incomplete/failed exact identities: retry with controlled backoff;
- permanent provider removal: retain last good data and mark retired.

Exact intervals should be configuration, not scattered constants.

### 7. Discover

Discover uses a two-stage catalog:

```text
RAWG collection/search -> partial `search_result` catalog row
user interest/addition -> full exact detail persisted in PostgreSQL
```

- Browse/filter existing shelves from PostgreSQL.
- Refresh shelves through controlled scheduled/administrative ingestion.
- A partial record is acceptable for broad discovery.
- Opening an important detail or adding a game may enqueue/promote full detail.
- Adding must wait for or safely complete exact identity persistence.
- Provider failure must not empty existing shelves.
- Future Discover improvements can operate on the same durable catalog.

### 8. Steam

- Steam remains a private ownership/playtime source in V1.
- Reuse only trusted exact Steam-to-catalog mappings automatically.
- User-specific Steam decisions must not silently create unverified global
  mappings.
- Fuzzy Steam/title matches create review candidates.
- Steam header/capsule artwork remains an explicitly labeled alternate.
- Use suitable aspect-ratio rendering; do not crop a wide header as if it were
  portrait cover art without deliberate UI treatment.
- A Steam fallback does not mean RAWG metadata is complete.

Historical global Steam mappings need a provenance audit because older code may
have created some mappings from user-specific decisions.

### 9. Public profiles, Lists, Reviews, Timeline, Insights, and Demo

All must become consistently database-only for game metadata.

- Public serializers explicitly allowlist global fields and never expose
  private Steam or personal data.
- Lists, Reviews, Timeline, and owner profile use the same catalog serializer as
  the backlog where practical.
- Insights reads normalized catalog genres/dates/estimates and preserves its
  explicit personal/Steam/HLTB hours precedence.
- Demo cloning links to shared catalog rows and does not duplicate global
  provider metadata.
- Guest/demo users never trigger live provider repair.

## RAWG request-budget architecture

All RAWG traffic must pass through one provider service with:

- PostgreSQL-first lookup;
- in-flight request coalescing by endpoint/provider ID;
- concurrency limiting;
- request-rate limiting;
- request timeout and response-size limits;
- `Retry-After` support;
- exponential backoff with jitter;
- daily/rolling request budget tracking;
- reserved capacity for interactive search/add flows;
- lower-priority resumable repair, refresh, and Discover work;
- non-sensitive request/failure metrics.

Priority order:

1. interactive metadata search;
2. exact detail required to add a selected game;
3. existing-user backlog repair;
4. stale catalog refresh;
5. Discover expansion/speculative ingestion.

Provider failures must never remove existing metadata. Failed entries must not
retry on every page load.

## Background job execution

Durable state must live in PostgreSQL regardless of worker topology.

An initial implementation may run a bounded worker loop in the backend process
using PostgreSQL locking, provided that:

- work is claimed atomically;
- batches are small;
- progress is checkpointed after every bounded unit;
- duplicate workers are safe;
- restart resumes rather than restarts;
- Railway sleep/restart behavior is tested;
- no request waits for the full job.

A dedicated Railway worker or scheduled runner can be introduced later without
changing the job data model. The UI may poll a status endpoint, but polling must
not be the sole durable execution mechanism.

## Artwork policy

Recommended canonical behavior:

1. RAWG detail artwork is the normal canonical provider choice.
2. An existing valid/pinned canonical cover does not change during routine
   refresh merely because RAWG's current primary image changed.
3. Steam artwork is stored/rendered as an alternate with explicit source.
4. A broken canonical URL may fall through to another known source and be
   queued for validation/repair.
5. Components should attempt the explicit fallback chain before showing a
   placeholder.
6. Image dimensions/aspect ratio should influence rendering.

Continue using external image URLs initially. Before proxying, copying, or
hosting provider image bytes in object storage, review current RAWG and Steam
terms, attribution requirements, and licensing. That is a separate approved
decision.

## Migration and rollout plan

### Phase 0: Production schema reconciliation

Goal: restore compatibility and make maintained schema/migrations truthful.

1. Run a full schema-parity audit between production, local PostgreSQL,
   `backend/schema.sql`, and tracked migrations.
2. Audit null `position` values and invalid/missing statuses before constraints.
3. Create the next additive idempotent migration that:
   - adds `games.cover TEXT` if absent;
   - sets the intended `position` default;
   - backfills any null positions deterministically/boundedly;
   - applies `NOT NULL` only after verifying the backfill;
   - adds the expected status foreign key safely (consider `NOT VALID` then
     validation if existing rows require staged cleanup).
4. Update `backend/schema.sql`.
5. Improve migration/schema contract tests so an old pre-baseline `games` table
   is actually upgraded, not only a fresh empty database.
6. Test add, cover repair, demo clone, and edit locally.
7. Review backup/rollback and deploy separately.

This phase restores deployed functionality but does not declare the metadata
architecture complete.

### Phase 1: Durable metadata foundation

1. Add provider snapshot storage.
2. Add cover provenance/pinning fields.
3. Add durable refresh quality/failure semantics.
4. Add job and candidate storage.
5. Add required unique constraints and indexes.
6. Introduce provider-neutral repository/service boundaries.
7. Keep existing reads working through compatibility fallbacks.

### Phase 2: Historical RAWG cache import

Build an explicit one-time import tool with:

- dry-run mode;
- aggregate-only reporting by default;
- exact embedded RAWG ID as identity;
- no title-key identity guesses;
- validation and normalization through the production catalog service;
- payload hashing/deduplication;
- bounded transactions/batches;
- resumable checkpoints;
- safe reuse/update of existing catalog rows;
- no personal data in output;
- an import report that does not expose private values.

Do not commit the cache file or turn it into a migration payload. Do not assume
the local cache is complete or current. Treat it as valuable historical provider
evidence.

### Phase 3: Exact-identity backlog repair

1. Reuse existing exact RAWG external mappings.
2. Link any safe unlinked exact identities.
3. Promote partial exact identities using imported snapshots.
4. Fetch remaining exact details within the provider budget.
5. Audit historical Steam mappings before trusting them globally.
6. Report aggregate completion and failures.

The production audit currently found no unlinked rows with an existing exact
RAWG ID, but linked rows may still point to partial catalog records.

### Phase 4: Ambiguous-match review

1. Add the repair-job API and UI action.
2. Generate title/year/platform/Steam-informed candidates.
3. Persist confidence evidence.
4. Add the owner-scoped review queue.
5. Support accept/alternative/reject/skip and safe selected bulk actions.
6. Link accepted matches without mutating personal fields.
7. Make retries resumable and rate-aware.

### Phase 5: Correct new-game and edit flows

1. Make exact selected additions persist complete detail/snapshot/catalog link.
2. Make title-only additions explicitly unresolved rather than guessed.
3. Remove global refresh side effects from ordinary edits.
4. Reuse existing global identities across users.
5. Ensure Discover and Steam additions follow the same identity rules.

### Phase 6: Controlled refresh

1. Implement refresh eligibility/freshness policy.
2. Add bounded refresh jobs and coordination locks.
3. Preserve good values and pinned covers.
4. Add an authorized manual/global refresh control if required.
5. Add audit metrics and change summaries.
6. Enable scheduling only after provider budget behavior is verified.

### Phase 7: Surface consistency

Convert and verify:

- private backlog;
- owner profile;
- Lists;
- Reviews and Timeline;
- Insights;
- public profiles;
- Demo/guest cloning;
- Discover;
- Steam import/library display paths.

All should use common normalized catalog serialization and explicit fallbacks.

### Phase 8: Retire runtime JSON-cache behavior

Only after completeness and cold-start gates pass:

1. stop reading `cached_rawg_data.json` for application responses;
2. stop writing it during add/edit/reorder behavior;
3. remove process-cache hydration as a source of truth;
4. retain only disposable bounded in-memory request coalescing if useful;
5. archive/delete local historical import material according to project policy;
6. verify clean Railway restart with no cache file.

## API design guidance

Final endpoint names should follow existing route conventions. Conceptual
capabilities are:

- start/resume an owner-scoped metadata repair job;
- read owner-scoped repair progress;
- list owner-scoped pending candidates;
- accept/reject/skip a candidate;
- retry unmatched/failed items;
- fetch catalog detail from PostgreSQL;
- request an authorized global catalog refresh;
- read non-sensitive refresh state.

Every new endpoint should use:

1. route declaration;
2. authentication/authorization guard;
3. Celebrate/Joi validation;
4. request normalization;
5. service/repository work;
6. explicit response serialization;
7. centralized error forwarding.

Preserve the error response contract:

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "requestId": "..."
  }
}
```

Log database SQLSTATE and provider failure category server-side with request/job
IDs, but do not expose SQL, credentials, provider keys, raw private records, or
internal stack traces to clients.

## Test plan

### Migration/schema tests

- Upgrade a historical `games` table that predates `cover`.
- Verify `cover`, position default/nullability, and status foreign key.
- Verify migration idempotency.
- Compare maintained schema with migrated historical schema.
- Prevent a migration ledger from passing while required columns are absent.

### Catalog/provider tests

- Persist and normalize a complete RAWG detail response.
- Preserve the raw snapshot and provenance.
- Search-result rows cannot downgrade full rows.
- Failed/partial refresh preserves previous good fields.
- Null optional fields are distinguished from never-fetched detail.
- Concurrent ingestion of one RAWG ID creates one catalog identity.
- Routine refresh preserves pinned artwork.

### Backlog repair tests

- Exact RAWG ID auto-links.
- Trusted existing mapping is reused.
- Title-only match creates candidates, not an automatic link.
- Remaster/DLC/demo ambiguity requires review.
- Job resumes after process restart.
- Rate limiting pauses and resumes without duplicated work.
- Candidate access is owner-scoped.
- Accepting a candidate never changes personal fields.

### Flow tests

- Add a completely new selected RAWG game.
- Add a game whose catalog identity already exists.
- Add a title without selecting metadata.
- Edit personal data without provider traffic.
- Change metadata to another exact identity.
- Discover add promotes/reuses durable detail.
- Steam exact/fuzzy paths follow matching policy.
- Guest users do not trigger provider calls.

### Rendering tests

- Cold startup with no JSON cache.
- RAWG unavailable during normal page loads.
- Private backlog, Lists, Reviews, Timeline, Insights, public profile, and Demo
  render from PostgreSQL only.
- Broken canonical image tries an explicit alternate then placeholder.
- Steam header artwork uses appropriate rendering.
- One global refresh appears consistently for all linked users without changing
  their personal data.

### Release gates

- `npm run db:migrate:local` against a historical-shape local database.
- Focused migration/provider/route tests.
- `npm run check`.
- Production migration status verified independently.
- Railway backend health and representative API requests verified.
- Vercel frontend behavior verified separately.
- Cold-start smoke test with an empty runtime cache.

## Observability and operational metrics

The system should expose/log non-sensitive aggregates for:

- backlog games by linked/full/partial/review/unmatched state;
- catalog records by metadata quality;
- provider requests by operation and outcome;
- rate-limit and timeout counts;
- repair/refresh jobs by state;
- job throughput and retry counts;
- candidate acceptance/rejection rates;
- refresh changes by field category;
- broken/fallback artwork counts;
- remaining legacy cache/fallback usage;
- age distribution of full metadata.

Alert or surface operational warnings when:

- schema readiness checks fail;
- provider failure/rate-limit rates rise materially;
- jobs remain stuck/running beyond a bounded period;
- full metadata coverage drops;
- runtime code attempts to depend on a missing filesystem cache.

## Main risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Wrong edition/title linked automatically | Exact IDs auto-link; ambiguous candidates require review |
| RAWG quota exhausted by repair | Central priority budget, small resumable batches, backoff |
| Railway restart loses work | PostgreSQL-backed jobs and checkpoints |
| One user changes metadata for everyone | Personal selection links only; controlled global refresh |
| Refresh removes good data | Snapshot validation, atomic projection, preserve good values |
| Artwork changes unexpectedly | Provenance and canonical-cover pinning |
| Duplicate global identities | Unique provider constraints and concurrency-safe upserts |
| Private backlog leaks through candidates/jobs | Owner-scoped tables, routes, and serializers |
| Fresh-schema tests miss historical drift again | Historical upgrade fixtures and schema parity checks |
| JSON cache remains a hidden dependency | Cold-start tests and legacy-usage metrics |
| Steam artwork looks cropped/incorrect | Explicit source and aspect-ratio-aware component behavior |
| Provider image hosting violates terms | Keep URLs initially; perform licensing review before storage |

## Decisions approved in principle

- PostgreSQL is the durable metadata authority.
- Store normalized catalog metadata plus complete RAWG detail snapshots.
- Reuse one shared catalog identity across users.
- Auto-link exact identities.
- Require review for title-only/ambiguous identities.
- Provide a resumable automatic repair button and candidate queue.
- Use controlled global refresh jobs.
- Keep normal rendering database-only.
- Preserve Steam artwork as an explicit final alternate/fallback.
- Preserve existing good metadata on provider failure.
- Import the historical local cache once, then retire it from runtime use.
- Use additive dual-read migration and measurable rollout gates.

## Decisions intentionally deferred

- Whether to offer explicit per-user cover overrides.
- Whether and when to host artwork in object storage.
- The final worker topology (backend loop versus dedicated Railway worker).
- Advanced catalog merge/administration tooling.
- Additional metadata providers.
- Rich historical snapshot comparison UI.
- Exact refresh intervals after real provider-budget measurements.
- Advanced Discover recommendation redesign.

These deferred decisions should not block the durable catalog foundation.

## Definition of done

The architecture migration is complete when:

1. production schema matches reviewed migrations and maintained schema;
2. adding a new exact-selected game succeeds and stores durable full metadata;
3. every safely identifiable existing backlog game is linked to a durable
   catalog record;
4. ambiguous games have a usable review path;
5. all major surfaces render metadata from PostgreSQL without RAWG/filesystem
   dependency;
6. repair and refresh survive restart and respect provider budgets;
7. refreshes preserve personal fields and previous good global data;
8. artwork has explicit provenance and predictable fallback behavior;
9. cold-start, historical-migration, outage, concurrency, privacy, and
   cross-surface tests pass;
10. runtime reads/writes of `cached_rawg_data.json` are removed;
11. operational metrics show metadata completeness and job/provider health;
12. the production rollout is verified independently across migrations,
    Railway, and Vercel.

## Handoff sequence for another implementation chat

Do not attempt the whole architecture in one undifferentiated patch. Use
separate reviewed phases:

1. **Schema reconciliation plan and migration**
2. **Durable snapshot/provenance foundation**
3. **Historical cache importer**
4. **Exact-identity backfill**
5. **Repair job and candidate-review UI**
6. **New add/edit/Discover/Steam flow alignment**
7. **Controlled refresh system**
8. **Cross-surface database-only conversion**
9. **Legacy cache retirement and release verification**

At the start of each phase:

- run `git status --short --branch`;
- inspect the current code/diff and newest migrations;
- restate the specific phase boundary;
- identify production data/schema evidence required;
- propose additive changes and rollback behavior;
- obtain explicit approval before production writes.
