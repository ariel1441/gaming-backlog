# Next Tasks

Updated: 2026-09-22. Live code/Git takes precedence.

## Current phase: publish the verified Dev candidate

- After a fresh fetch, local `Dev` is eight commits ahead of `origin/Dev`
  (`65f5fbe`): code candidate `4328a8a` plus the documentation handoff.
- Focused review verification passed 202 tests with no failures. Before publishing,
  finish the exact-candidate browser/release gate and keep the worktree clean.
- Push `Dev` only after the gate passes and confirm the remote SHA and CI result.
- Do not promote `main` in this phase. The user plans to open the main PR later,
  after 21:00 Israel time; the repository release rule still requires a fresh
  `origin/main` merge and post-sync exact-candidate CI before merge.

## Preferred next product direction

1. **Insights 2.0 v1 is accepted for now.** It uses private Backlog/library data:
   library, Wishlist, finished/playing/rated and estimate-coverage summaries;
   selected-year progress; current status, personal/RAWG genres, and half-point
   score distribution. It deliberately excludes ETA, activity history,
   notifications, and made-up historical Steam data. Chart click-throughs open the
   existing filtered Backlog where meaningful.
2. Make the broader **status model** the next dedicated product phase. Define
   canonical stored statuses, labels, semantic groups, transition/date behavior,
   ordering, and compatibility across Backlog, Play Next, Steam suggestions,
   Timeline, Insights, smart lists, and public views. Personal-genre identity is a
   separate decision and should not be mixed into the status migration by default.
3. After the current candidate reaches `main`, confirm the external daily Steam
   schedule, account eligibility, recovery behavior, and run evidence. Begin saving
   timestamped playtime and achievement observations. The first successful
   activity-aware sync is a baseline; cumulative totals cannot reconstruct earlier
   daily play, and missed intervals must remain explicit gaps.
4. Build detailed daily activity primarily in **Activity Center**: per-day/per-game
   playtime deltas and achievement changes. Add aggregate daily/weekly hours, active
   days, per-game deltas, and achievement deltas to Insights after observations
   accumulate; defer trends, streaks, and recaps until history is continuous enough.

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
