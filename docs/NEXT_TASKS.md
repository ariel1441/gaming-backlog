# Next Tasks

Updated: 2026-09-25. Live code/Git takes precedence.

## Current phase: verify the published Gaming Activity Dev candidate

- The local `Dev` candidate contains Gaming Activity Phases 1-5, the shared-row
  polish and auditable **Choose dates** allocation for uncertain Steam playtime.
  Migrations 049-051, focused service/schema/route contracts, configured lint and
  the five Activity Playwright scenarios pass locally. See
  [planning/gaming-activity.md](planning/gaming-activity.md) for the exact evidence.
- `50a1ae3` was published only to `Dev`; its exact-candidate CI found two shared-UI
  browser regressions after lint, tests and build passed. Publish the narrow
  corrective follow-up only to `Dev`, require CI on that exact SHA and stop. Do not
  merge or push `main`, deploy, change Railway or run production migrations as part
  of this step.
- Before the later `main` promotion, fetch `origin`, merge current `origin/main`
  into `Dev`, resolve conflicts, and require exact-candidate CI on that post-sync
  SHA. Respect the after-21:10 Israel Railway deployment window.
- The production release must apply migrations 049-051 in the documented order,
  deploy backend before frontend, configure and verify the DST-safe daily closeout,
  and inspect the first real baseline/closeout for notification or activity floods.

## Preferred next product direction

1. Promote the verified Activity candidate to `main` only in a separately
   authorized release session, then verify migrations, backend/frontend deployments,
   the Railway schedule and real daily-sync evidence independently.
2. Let real observations accumulate before drawing pattern conclusions. The first
   successful production observation is a baseline; cumulative Steam totals cannot
   reconstruct earlier daily play, and missed intervals remain explicit unless the
   user assigns their dates.
3. Make **Activity Insights improvements** the next product phase after release:
   start with a Sunday-Saturday weekday chart using average playtime per covered
   occurrence, include reliable zero-play days and user-chosen dates, exclude
   missing/unresolved days, and show sample size and coverage rather than claiming
   a pattern from insufficient history.
4. Then evaluate monthly playtime, play frequency, richer new/return/achievement
   summaries and per-game activity pages. Keep boundary-crossing time outside exact
   range metrics and do not infer Steam session count, duration or time of day.
5. Revisit the broader canonical status-model phase after this Activity/Insights
   pass unless priorities change.

Routine Steam decisions belong in the daily experience. Connection, bulk changes
and difficult repair remain on Steam management pages. A separate Library Needs
Attention page is not selected. Play Next is deferred behind the status/activity
decisions.

Loaded remains Phase D, Fanatical E, and remaining deal polish F; these are later
candidates. The notification inbox is already implemented. Broader candidates are
in [ROADMAP.md](ROADMAP.md). The earlier
[daily experience vision](daily_sync__wishlist_and_loaded/gaming-backlog-steam-daily-experience-vision.md)
records Gaming Activity proposals; its dated implementation claims are historical.

## Release work, when resumed

- Require exact-candidate CI and inspect actual target migration state using the
  approved runner. Migration 035's recorded local evidence is disposable-only.
- Verify migrations, Railway, Vercel and production smoke separately.
- Verify the external daily Steam trigger; the account toggle is not a cron.
- At the user's request, review configuration across the whole deployed app during
  main promotion, including features unrelated to the latest diff. Inventory what
  is enabled, disabled, missing, or failing: Steam cron/account opt-in, metadata
  refresh/repair, Discover seeding, provider credentials, HLTB dataset availability,
  service sleep/worker behavior and freshness diagnostics. Verify actual settings
  and execution evidence; do not automatically enable every inactive feature.
- The [local preparation record](daily_sync__wishlist_and_loaded/local-release-preparation.md)
  preserves earlier checks, not current remote status.

No commit, push, deploy or configuration change is implied by this queue. Preserve
branch pointers, stashes and uncommitted work.
