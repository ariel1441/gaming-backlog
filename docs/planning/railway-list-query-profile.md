# Backlog list-query profile: local diagnostic checkpoint

Recorded 2026-10-24. Diagnostic only; no application query, cache, schema or
frontend behavior was changed. These are synthetic localhost measurements,
not production/Railway measurements or a proposed replacement revision.

## Reproduction and scope

Run `node scripts/profile-backlog-list-queries.js` from the repository root.
The script checks for a localhost DATABASE_URL, creates a uniquely named disposable
database, runs the existing migration runner there, seeds only synthetic data,
and drops that database in finally. It never imports the app server or providers,
reads ordinary saved game data, or bypasses a remote guard. No secrets are printed.

Raw plans/results are written to ignored
`test-results/railway-list-query-profile.json`; ignore status is verified before
writing. Playwright can clear test-results, so regenerate this artifact when
needed. The compact evidence below is retained in this document.

- Branch/HEAD: `Dev`, `07641d9d257608b916ec8f33678cf1ab668b7c21`, with the existing
  uncommitted status-model and seven cost-efficiency checkpoints preserved.
- The live, locally modified gameAccess.js builders were used, not an extracted
  historical SQL copy. Query-builder SHA256:
  `5a7c8453538e75c08da558a917f7dfbd1a69376cc75671093a4480afee42dc07`.
- Fresh migration setup includes the pre-existing uncommitted migration 052.
  This is evidence for that working tree, not deployed code or green CI.
- PostgreSQL 17.5, Windows x86-64, work_mem 4MB, jit setting on. No server settings,
  indexes or memory ceilings were changed.
- One owner with 100/1000/5000 games, all linked to synthetic catalog/Steam rows,
  three statuses, two personal genres per game, two focus slots, and another owner
  sharing one catalog row. Catalogs contain genres/tags/stores and pseudo-random
  MD5-string descriptions with 1 KiB or 16 KiB bodies plus an HTML wrapper. This
  avoids a single repeated character unrealistically compressing the whole body.
- ANALYZE and parity reads precede three sequential EXPLAIN ANALYZE/BUFFERS samples
  per query, with per-node timing off and no cache flush. The table reports median
  PostgreSQL execution time, excluding row transfer, Express decoration, HTTP,
  browser work and compression. This is a small warm local sample, not a load test.

## Observed execution time

Milliseconds, rounded to one decimal. First-page size 12 matches desktop grid;
the next page requests 100 rows from offset 12. Facets are a separate query.

| Games | Description body | First 12 | Next 100 | Facets | First 12, no-hash control |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 1 KiB | 6.1 | 6.2 | 6.1 | 3.1 |
| 1000 | 1 KiB | 44.1 | 44.1 | 45.4 | 15.3 |
| 5000 | 1 KiB | 228.4 | 229.7 | 232.1 | 82.7 |
| 100 | 16 KiB | 39.7 | 40.7 | 39.8 | 3.0 |
| 1000 | 16 KiB | 380.5 | 381.6 | 385.1 | 14.1 |
| 5000 | 16 KiB | 1992.7 | 2011.0 | 2088.9 | 75.1 |

The no-hash control replaces the revision expression with a constant **only in
the profiler's query string**. It retains total counting and the joined query,
but has no valid revision/invalidation semantics. It is not an implementation or
safe optimization; removing that expression can also change planner choices.
The comparison is evidence that serializing/hashing wide joined rows warrants
attention, not a precise attribution of every millisecond to hashing.

The 5000-game rich-metadata first-page samples were 1990.2, 2004.8 and 1992.7 ms.
Its CTE materialized all 5000 filtered rows despite returning 12. The next-page
plan also materialized 5000; facets materialized the full 5000-row backlog. Each
had 65,337 shared-buffer hits and zero shared reads in its median plan. The
no-hash control had 40,337 hits. These are logical accesses, not disk IO counts
or unique buffer pages; root counts are recorded without summing child counts.

Personal-genre lookups reached 10,000 inner node loops for 5000 games/two genres.
The 1 KiB 5000-game page used 901 temporary read/write blocks, while the 16 KiB
case used none. Tuple/TOAST representation and planner/materialization behavior
make temporary spill non-monotonic in logical body size; this does not justify
changing global work_mem. The raw artifact retains the plans for inspection.

A filtered playing + Action + descending-score query was also exercised. At 5000
games/16 KiB it had 833 matches and a 361.1 ms median for 12 returned rows. Smaller
filtered cases were not monotonically timed; do not extrapolate one curve to all
filter/selectivity distributions. Actual account mixes, concurrent load and
production plans remain unknown.

First-query raw JSON was about 31.5 KB with 1 KiB bodies and 215.8 KB with 16 KiB
bodies for 12 rows, largely independent of collection size. This is raw builder
output, not an actual decorated/compressed API response measurement. A small
response bounds transfer rows, but not the hash's server-side scan.

## Revision dependencies checked

The profiler ran 21 transaction/rollback probes against the 100-game fixture.
The changed game was outside the first page. All assertions passed, including
page/facet revision parity and non-overlapping consecutive page IDs in every
profile scenario.

| Dependency | Observed/proven boundary | Writers to include in a future design |
| --- | --- | --- |
| games | Off-page notes, status, position, insertion, deletion and Wishlist exclusion change revision | games routes, imports/acquisition, merges, Next Up/status/date flows, demo cloning and migrations; g.* means every selected game column |
| catalog_games | Shared description, genres and rating edits change revision; description edit changes both owners' revisions | Metadata ingestion/repair and catalog link changes; all owners referencing a shared catalog row |
| user_game_sources | Playtime, achievements, owned eligibility and selection of a different owned source change revision | Steam sync/achievement/source linking, disconnect/replacement and merge flows; include potential winners, not just the previously selected source |
| steam_import_candidates | Selected app's steam_name changes revision | Candidate refresh/reconciliation, scoped by owner + Steam app |
| user_play_focus_games | Adding a focus membership changes revision | Next Up assign/remove/reset and acquisition/delete cleanup; selected field is focus_role |
| personal genres | Dictionary rename, membership removal and order reversal change revision | Personal-genre service, game/import assignments, rename/merge/delete; selected JSON contains ordered id/name pairs |
| statuses | Global rank edit changes revision | Status dictionary/migrations; rank affects ordering and joined row content across owners |
| Isolation/unselected fields | Foreign owner's game edit does not change this owner's revision; unselected catalog.updated_at change also does not | Account/user fences must remain. A timestamp alone is not the existing content contract |

Key source paths: backend/utils/gameAccess.js (`listOwnedGamesQuery`, page/facet
builders), backend/routes/games.js, backend/routes/nextUp.js,
backend/services/personalGenreService.js, backend/services/metadataIngestionService.js
and backend/services/steamService.js. This identifies dependency families, not a
complete proof that every writer/failure/replay path has been audited.

Further design requirements not solved by these probes:

- Cache keys must include owner, normalized filters, ordering/direction and query
  version. Equal current hash tokens across different sort orders do not mean
  the same page rows. Catalog edits can change filtered membership without any
  user-game edit; empty results need invalidation too.
- NOW-based Steam-recent and added/active date filters change membership without
  writes. A persisted owner revision alone needs a coherent time boundary/expiry
  contract. Do not replace this hash with MAX(updated_at) or a partial field list.
- A persistent per-user generation requires transactional coverage of all these
  writers, shared catalog/status fan-out and source selection. Per-row generation
  updates can add write amplification and contention during large imports.
- An in-memory saved snapshot needs explicit global/byte bounds, TTL, eviction,
  account/owner fencing and cross-process invalidation. The earlier cache fix
  must not be undone by introducing another unbounded store.
- Current first-page and facet statements use separate pool.query calls. This
  profile did not simulate a concurrent mutation between them. A combined read
  should have focused concurrent-write and empty/filter/sort/facet parity coverage.

## Frontend correction and bounded next step

The original audit overstates unchanged refresh hydration. Live
`src/pages/Backlog/useInfiniteGames.js` uses `sameSnapshot` in
`assembleRefreshedGames` to reuse already-loaded later rows when the first page's
revision/total match. A normal unchanged refresh still requests the first page
with facets; it does **not** re-fetch every already-loaded later page. Initial
background hydration and changed-snapshot refreshes can span the collection in
100-row batches. Text search additionally combines the full owned collection
with server search for current UX; this profile did not model that path.

The safest next candidate to investigate is a single coherent first-page/facet
read that reuses joined rows and exact row digests, retaining the existing hash
inputs and filtered/full-collection meanings. Compare results and plans before
shipping; avoid changing hydration/search UX incidentally. A persisted collection
revision is a larger separate design, not justified solely by these timings.

Verification: `node scripts/profile-backlog-list-queries.js` completed with exit 0,
six scenarios, 21 mutation/isolation assertions and all pagination/facet checks.
Disposable database cleanup completed. Whitespace checks passed for script/report/
handoff. App suites, build, browser and CI were not run for this diagnostic-only
checkpoint. No production magnitude, Railway resource/billing savings or expected
speedup for an unimplemented replacement is claimed.
