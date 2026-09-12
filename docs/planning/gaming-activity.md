# Gaming Activity

## V1 decisions

- Record private Steam observations for every owned or ignored Steam app, whether
  or not it is in Backlog.
- Activity is calculated from changes between successful library observations;
  it is not reconstructed from historic cumulative totals.
- Display observations in `Asia/Jerusalem`. A run more than 36 hours after its
  prior observation is shown as one interval/gap, never split into invented days.
- The first successful sync after the feature is deployed is a zero-delta
  baseline. Later successful syncs can show playtime and achievement-count deltas.
- Untracked played games remain outside Backlog and use the existing Steam
  activity review/notification flow rather than being added automatically.
- Activity Center lives in the private Activity page as Play history. Timeline
  continues to represent intentional lifecycle events such as starting/finishing.

## Automation boundary

The existing daily Steam command is the only activity collection path. The
intended production schedule is 06:00 `Asia/Jerusalem`; configuring the external
Railway/production scheduler is deliberately deferred to release preparation.
The account opt-in is not itself a scheduler.

## V1 presentation

- Daily total playtime and active-day count.
- Per-game playtime, including games not in Backlog.
- Achievement-count deltas and current totals when Steam returned them.
- Clear interval labels for missed checks.

## Insights follow-up

Insights 2.0 v1 intentionally uses existing private Backlog/library data only.
It does not treat Steam's current cumulative playtime as a historic activity
ledger, and it does not include notifications or ETA predictions.

Add the activity-driven Insights slice only after the production daily schedule is
configured and successful observations have accumulated. A first useful slice is
daily/weekly playtime, active-day count, per-game deltas, and achievement deltas.
Do not present a last-seven-days view until at least seven consecutive successful
observations exist; use a longer continuous period before trends, streaks,
most-played comparisons, or recap claims. Show missed intervals as gaps.

## Later improvements

- Weekly/monthly recaps, streaks, calendar heatmaps, and most-played summaries.
- Exact named achievement history where reliable provider data and storage are
  available.
- Optional session notes, manual sessions, multiple playthroughs, and per-game
  activity exclusions.
- Goals, challenges, progress recaps, and richer Insights charts after enough
  observation history exists.
- User-configurable timezone and retention/export controls if those needs emerge.
