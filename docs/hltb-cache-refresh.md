# HLTB cache refresh

Updated 2026-10-09. Local implementation only; no commit, push, deployment,
production verification or schedule enablement.

## Current snapshot

The repository cache is `backend/data/hltb_data.json`. The app loads it into memory
when registering backend routes. `HLTB_DATA_PATH` can override the runtime path;
`HLTB_UNITS` defaults to seconds. This importer deliberately updates only the
repository cache and writes seconds. It does not access Postgres or providers.

The refresh uses the full community CSV mirrored in
[johagan94/hltb-dataset-plugin](https://github.com/johagan94/hltb-dataset-plugin/blob/92a3e7d7b2bba167df0249ee4a5d270ddeeb9f29/dataset/hltb_dataset.csv).
It was crawled on 2026-03-27, not October 2026. Its SHA256 is
`306496d018c54c9a84ff35aeb6bc3103fb93ff41d2df2e290281042c2a6e2516`;
the downloaded bytes matched upstream Git blob
`00134f171e914ef45d9d492676c70b1d7d960ba6`.
The upstream README identifies it as a point-in-time snapshot. Its linked
[Kaggle dataset](https://www.kaggle.com/datasets/b4n4n4p0wer/how-long-to-beat-video-game-playtime-dataset)
describes averages in hours and research/educational use. Review reuse terms before
publishing the refreshed dataset; the mirror's plugin license is marked TBD.

Of 166,754 source entries, 56,981 have a positive Main Story, Main + Extras or
Completionist estimate. Relative to the original 48,907 cache rows:

- Added 7,612 rows; refreshed 46,545; retained 2,362 original rows.
- Final cache: 56,519 rows, mapping to 55,969 normalized lookup titles.
- Retained 15,126 legacy metric values where the newer row lacks that metric.
- Resolved 2,078 title groups using a unique exact legacy name or established HLTB ID.
- Skipped 5,488 ambiguous/empty normalized title groups (including untimed source
  entries). These are groups, not a count of games with missing times.

User selected newer averages for existing games. Refreshed metrics use accurately
named `game_comp_*_avg` fields; unavailable metrics keep their legacy values.
The loader now supports average fallbacks for all three categories. No average is
relabeled as a median. Rows without any supported estimate cannot fill an estimate
and are excluded from additions. The complete downloaded CSV remains in ignored
`test-results/hltb/source.csv` for local investigation.

## Website behavior

Main Story is the default. `hltb_pref` accepts `main`, `plus` and `comp` on supported
add/update APIs, but there is no frontend category selector. Times are rounded to
whole hours. The cache contains all three categories.

Saved hours take precedence; additions can copy a local estimate into the user's
saved game. Replacing the cache does not rewrite previously saved values or manual
edits. Backlog estimates use saved values, then RAWG playtime where available.
Wishlist uses saved estimates, local Main Story, then RAWG playtime. Insights can
use Steam actual hours according to the existing preference/status policy;
otherwise saved hours, local Main Story, then RAWG. A field labeled HLTB in the UI
therefore does not guarantee that its value came from this dataset.

Restart the backend after updating the cache. Development nodemon ignores
`backend/data/**`, so replacing only the JSON does not trigger reload. Publishing
this tracked file requires the separately authorized normal release process.
No database migration is required for this file update. Refreshing old saved
estimates is a separate feature: current saved hours lack reliable provenance to
safely distinguish manual entries from historic automatic HLTB values.

## Repeating an import

Download a newer full CSV with the same documented columns, retain its source URL
and crawl date, then preview:

```powershell
npm run hltb:import -- --input=test-results/hltb/source.csv
```

Or write a reviewable candidate without replacing the active file:

```powershell
npm run hltb:import -- --input=test-results/hltb/source.csv --output=test-results/hltb/candidate.json --source=SOURCE_URL
```

After reviewing its coverage and provenance, update the local repository file:

```powershell
npm run hltb:import -- --input=test-results/hltb/source.csv --apply --source=SOURCE_URL
```

The importer validates identities, timestamps, durations and structure; refuses
older matching snapshots; checks the active file has not changed during parsing;
writes via a temporary file; and retains content-addressed `.bak` rollback copies.
Backups are ignored by Git. `backend/data/hltb_data.json.manifest.json` records the
latest import's source, checksum, date range and per-import counts. Repeated imports
of the same source do not rewrite unchanged cache data. This command does not
fetch data or schedule itself. Retain the source CSV separately for future runs.

Original rollback copy from this task:
`backend/data/hltb_data.json.6959d43e0000ee59.bak`.
To undo this entire cache refresh locally, copy that file over the JSON and remove
or update its manifest, then restart the backend. The average fallbacks are
backward compatible with the original dataset.

## Proposed periodic refresh (not enabled)

A monthly maintenance workflow could check a selected upstream snapshot's hash
and crawl date, download only changed input, run the importer and focused tests,
and open a review PR with added/refreshed/retained counts. Reject older snapshots,
keep the last good cache on download/validation failure, and preserve missing
values. Only publish through the ordinary release gate. A monthly download of an
unchanged March snapshot cannot produce new estimates; the source itself needs
fresh collection. Broad direct crawling is a separate provider integration.

Keep this separate from Steam sync and RAWG weekly metadata maintenance. If later
replacing bundled files with runtime refresh, use persistent storage plus explicit
reload/version invalidation across backend instances; writing inside an ephemeral
Railway checkout alone does not establish durable refresh.

## Handoff and verification

- Goal/phase: refresh the local HLTB snapshot and provide a repeatable import;
  implementation checkpoint complete. Next action: review source suitability and
  local changes, then a separately authorized publish/release; decide a scheduler
  and maintained source if recurring refresh is wanted.
- Branch `Dev`, base SHA `f55bb9b` (ahead of origin/Dev by one at task start).
  Checks cover this task's uncommitted HLTB/cache/package/scripts/docs changes.
- Preserved pre-existing dirty files: `backend/services/steamActivityService.js`,
  `backend/services/steamActivityService.test.js`,
  `backend/steamDetailedActivity.contract.test.js`. Inspect mixed scope before staging.
- `node --test scripts/import-hltb-cache.test.js`: initial six tests passed.
  After rollback and title-matching additions, only affected tests ran using
  `--test-name-pattern="actual app loader|cache replacement"` and
  `--test-name-pattern="ambiguous titles|unique exact"`: both two-test invocations
  passed. Eight distinct tests have passing coverage; providers mocked/fixtures,
  no ordinary saved data or database access. Host Node was 22.23.1; target Node 20
  and full CI were not exercised here.
- Targeted ESLint passed using `--rulesdir scripts/eslint-rules` on changed JS.
  Initial ESLint invocation without the repository rules directory failed with
  missing `jsx-no-undef`; corrected invocation passed. Initial candidate import
  rejected numeric legacy game titles; supporting those titles corrected it.
- Final full-file comparison against the original backup plus source passed;
  repeated merge produced zero refreshed rows and identical data. Actual loader
  resolved all three categories for Silksong (28/46/64), Clair Obscur (29/45/68),
  Death Stranding 2 (35/63/116), Hades II (30/51/104) and Kingdom Come II (55/98/142).
  Hours are snapshot averages rounded by the application, not current live claims.
- `npm run env:check` passed with localhost DB configuration, default HLTB path and
  seconds. Ignored rollback status verified. `git diff --check` passed.
- Full app gate, browser flow and production checks were not run; existing saved
  estimates were not updated. No automation, Git publishing or release action ran.
