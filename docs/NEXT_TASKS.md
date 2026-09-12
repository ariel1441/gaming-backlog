# Next Tasks

Updated: 2026-09-12. Live code/Git takes precedence.

## Current phase: understand automation before changing it

- Recorded `origin/Dev`: `d624b4a`, including Steam branch `716cb5b`.
- Main promotion is on hold because of Railway free-tier limitations. Remote CI
  and deployments have not been reverified in this planning pass.
- Read [AUTOMATION.md](AUTOMATION.md) for triggers, defaults and local configuration.
- Discuss timing, freshness, budgets, retries and visibility before implementing
  or enabling automation changes.

## Preferred next product direction

1. **Insights 2.0 v1 is implemented locally and ready for user visual review.** It
   uses private Backlog/library data: library, Wishlist, finished/playing/rated and
   estimate-coverage summaries; selected-year progress; current status, personal/
   RAWG genres, and half-point score distribution. It deliberately excludes ETA,
   activity history, notifications, and made-up historical Steam data. Chart
   click-throughs open the existing filtered Backlog where meaningful.
2. Make the broader **status grouping and personal-genre identity** decisions in a
   separately scoped project-wide discussion. Insights currently consumes the
   existing semantic groups and must inherit—not create—the eventual stable model.
3. Confirm the external daily Steam schedule and account eligibility before relying
   on Gaming Activity. The first successful activity-aware sync is a baseline;
   current cumulative totals cannot reconstruct previous daily play. Preserve gaps
   rather than inventing calendar-day values.
4. Add the Steam/activity slice to Insights only after real observations accumulate:
   start with daily/weekly hours, active days, per-game deltas and achievement
   deltas; defer trends, streaks and recaps until there is enough continuous history.

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
