# Steam daily experience: product vision and handoff

Recorded: 2026-09-05.

Status: discussion and planning record, with local checkpoint closeout authorized
separately by the user on 2026-09-05. Implementation is saved in `cc8d105`;
this handoff is saved in a separate documentation commit. Next chat: independent
A/B closeout review. Future feature implementation, push, deployment and production
scheduling are not authorized by this document.

Read alongside the [master plan](gaming-backlog-steam-wishlist-master-plan.md),
[Phase A plan](steam-library-daily-sync-implementation-plan.md) and
[Phase B implementation record](gaming-backlog-steam-wishlist-phase-b-implementation-plan.md).
Use live code and Git state for implementation facts. This companion records the
newer product direction; it does not mean the proposals below already exist.

## 1. Confirmed direction

- After linking Steam and enabling automation, ordinary users should not need to
  press Sync to keep their data current. Keep manual sync as an optional recovery tool.
- Once per day is sufficient for now. Automatic catch-up on page opening is a
  later idea, not a current requirement.
- Daily processing should efficiently update playtime and achievements for the
  games that need work, without repeating expensive work across the whole library.
- Steam Wishlist additions should appear automatically. Confirmed Steam removals
  should leave the active Steam Wishlist while preserving history and local intent.
- Daily decisions need a friendlier experience than the current import/review
  page. Retain bulk review for initial connection, bulk changes and uncertain matches.
- Explore automatic additions and Playing transitions, but do not assume the user
  has selected a default policy. New acquisitions defaulting to Plan to Play is
  explicitly undecided.
- A future Gaming Activity view should show daily play amounts, games played,
  achievements and related statistics. It complements the existing started/finished
  Timeline. Exact session start/end times were not requested.
- Finish assessing and closing the A/B foundations before treating them as an
  unattended production feature. Phase C remains Steam Wishlist prices; later
  experience improvements need their own bounded implementation plans.

## 2. Current implementation versus the intended experience

| Area | Current working tree | Follow-up direction |
| --- | --- | --- |
| Daily execution | `npm run steam:sync:daily` runs Library then Wishlist for linked, opted-in, non-guest accounts | Configure and verify the production scheduler after release authorization |
| Queue | Manual and scheduled work share durable jobs, leases, cancellation and run history | Keep this orchestration; do not replace it with another queue |
| Library efficiency | One broad owned-library snapshot; local diff; expensive work selected for new/changed games | Measure provider calls and stage duration; handle outstanding retries independently of new activity |
| Achievements | Changed eligible sources linked to ordinary Backlog games receive summary refreshes | Retry failed/skipped due work; consider a bounded recent-activity follow-up window |
| First play | Positive observed playtime can create review suggestions | Define a meaningful-play threshold and allowed transitions before automation |
| New ownership | Steam Library/import candidate and activity evidence; no automatic ordinary Backlog creation | Friendly acquisition decisions; optional automatic policies remain undecided |
| Status changes | Suggestions require user action | Optional explicit rules with explanations, exceptions and safe undo |
| Wishlist | Membership, history, metadata, persisted Steam order, shared Backlog presentation | Reconcile ownership/removal observations into a coherent user-facing update |
| Notifications | Durable events exist; current review UI consumes Library events | A lightweight activity inbox shared eventually with price events |
| Detailed history | Current source totals and run/review records; no complete daily per-game observation ledger | Persist observations and later build Gaming Activity |
| Freshness on screen | Reopening/refreshing reads saved updates; an open page is not continuously updated by unattended runs | Quiet freshness information; automatic page catch-up is deferred |

The backend's 15-second queue worker drains/reclaims existing jobs. It does not
create a daily Steam schedule. The Settings toggle marks eligibility; a separate
scheduler must launch the command. No production cron service was created or
verified in this conversation. Schedules configured outside Git remain unverified.

The daily command does not enforce one run per calendar day. Library has a
15-minute cooldown; Wishlist currently does not. Daily frequency comes from the
external schedule. Manual buttons handle their respective domains.

## 3. Proposed acquisition and status policies

These are recommendations, not approved defaults or implemented behavior.

### New acquisitions

Keep the first baseline separate from later discoveries. Establishing historical
ownership must never flood Backlog or create hundreds of "new game" prompts.

For later acquisitions, offer a compact decision such as:

> You now own three new games. Choose which to add and their statuses.
> Choose games / Later

Possible future policies:

1. Review new acquisitions and choose their statuses.
2. Automatically add confidently identified new acquisitions as Plan to Play.
3. Automatically add games only after meaningful new play is observed.

The user has not chosen between these. Until that decision, retain current explicit
import behavior. Attach existing games instead of duplicating them; preserve ignored
items; filter non-game content; route uncertain identities to review. "Later" should
retain a pending decision without repeatedly notifying the user.

### Playing transitions

- Proposed initial threshold: 10 minutes, configurable; the number is not agreed.
- Accumulate qualifying newly observed play across small launches. Do not require
  crossing the threshold within one daily interval.
- Apply only after trustworthy baseline/new activity evidence. Old lifetime hours
  on first connection do not establish a newly started game.
- Proposed eligible statuses are planned/unstarted states. Preserve Finished,
  Paused, Abandoned, custom statuses and explicit user overrides unless a separately
  approved rule allows a transition.
- Keep acquisition automation and status automation as separate controls.
- Explain each automatic change and retain enough prior state for Undo. Undo must
  not overwrite a later manual edit. Per-game exclusions should be possible.
- Record returning to a finished game as renewed activity without erasing completion.
- Do not infer Finished from playtime or achievement completion alone. Automatic
  started-date changes are also a separate policy, not implied by Playing automation.

### Wishlist becoming owned

Combine compatible observations into one update: "Now owned; removed from Steam
Wishlist", followed by the Backlog action allowed by the user's acquisition policy.
Prefer "now owned" to claiming a purchase. If ownership appears on a later run,
reconcile the earlier removal rather than leaving contradictory notifications.

Keep historical Steam removal and local Wishlist intention separate. Neither
ownership nor Steam removal automatically authorizes erasing a local intention or
deleting an ordinary Backlog game. Local-intention retirement policy remains open.

## 4. Recommended scope of Gaming Activity

Recommendation, awaiting a firm user decision: include all qualified Steam games
the user actually plays, whether or not they are in Backlog.

| Area | Meaning |
| --- | --- |
| Steam Library | Provider-reported ownership |
| Gaming Activity | Observed play and achievement activity |
| Backlog | Games the user chooses to manage |
| Wishlist | Interest in acquiring/playing a game |

This would make activity totals independent of manual Backlog organization. Recording
activity must not create ordinary game rows. An untracked activity entry can offer
Add to Backlog. Suggested filters are All Steam activity and Backlog games only,
with per-game statistics exclusions for testing, idle applications or other noise.
This requires extending the current achievement selection beyond linked Backlog games.

### Daily observation accuracy

The requested view is a daily journal, not a session recorder. Examples: minutes
played per game, total playtime observed, games played, achievements unlocked,
acquisitions, starts and weekly/monthly totals.

Once-daily cumulative snapshots measure an increase since the previous successful
observation. They cannot always establish exact calendar-day attribution. Store
actual interval boundaries and display gaps or combined intervals when syncs are
missed or Steam reports delayed activity. Do not divide a multi-day increase into
invented daily totals. Day-boundary scheduling/timezone remains an implementation
decision to resolve; a morning-to-morning interval is not a midnight-to-midnight day.

Distinguish achievement unlock timestamps, when trustworthy and available, from
first observation timestamps. Do not count historical totals imported at baseline as
new activity. Handle counter decreases/resets as corrections, not negative playtime.

Proposed foundation: append per-game observations before building the full view,
retaining source identity, run/observation time, previous/current counters, elapsed
interval and quality/gap information. A future detailed achievement history also
needs individual identities and timestamps beyond today's summary counts.
This storage has not been implemented. Do not promise reconstructing prior daily
history from the current overwritten source totals.

## 5. Activity inbox and notifications

Proposed experience: a lightweight Activity inbox with Needs your attention and
Recent updates. Preserve the import/review page for bulk onboarding and difficult
matches; do not force daily users through that workflow.

- Quiet factual updates contribute to game displays and a digest; they do not each
  create an unread task.
- Group related changes by game and observation period. Acquisition, Wishlist
  removal and a Playing action can appear as one understandable update.
- Offer contextual actions: choose status, Add, Ignore, Review match, View and Undo.
- Distinguish unseen information from unresolved decisions. Remember dismissal,
  permit category muting, and retire obsolete suggestions automatically.
- Explain status automation using observed evidence. Preserve manual corrections
  so the next sync does not repeat the unwanted change.
- Reuse existing durable activity events where suitable; notification delivery/read
  state and factual observation history have different purposes.
- Later price changes should use the same inbox: target prices, meaningful discounts,
  or sale changes, with suppression once ownership is confirmed.
- In-app delivery first is a recommendation. Email, push and other external channels
  remain later options, not current requirements.

## 6. Additional candidates, not commitments

- Since your last visit digest and an optional weekly recap.
- Quiet last-success information; actionable attention for persistent sync problems.
- Spoiler-safe achievement presentation: reveal hidden details deliberately.
- Per-game automation/statistics exclusions and replay-aware activity.
- Remembered acquisition decisions and grouped notifications that age sensibly.
- Later automatic catch-up on opening stale data; daily-only is sufficient now.
- Price thresholds and useful deal alerts through Phase C and the later store work.

## 7. Reliability and acceptance targets for follow-up planning

- Measure a 1,000-game account with two changed games and one new acquisition:
  broad snapshot requests are acceptable, expensive follow-up should target the
  relevant games and explicitly due retries, not all 1,000 games.
- Failed achievement work remains eligible without requiring another playtime
  change or a manual Sync. Evaluate the same issue for cooldown-skipped work.
- Evaluate a bounded follow-up window for delayed achievement updates. Define
  retry/backoff and metadata freshness independently from playtime changes.
- No-change runs avoid repeated expensive work except explicitly due refreshes.
- Baseline imports produce neither acquisition floods nor fabricated daily activity.
- Automatic changes, if introduced, are idempotent, explainable, reversible and
  subordinate to later manual decisions.
- Cross-run ownership/Wishlist reconciliation avoids duplicate or obsolete messages.
- All new activity/history/notification data stays private unless separate public
  privacy controls are explicitly designed and approved.

## 8. Phase boundaries and next-chat choices

Keep the existing phase names: A Library foundation, B Wishlist relationship/UI,
C Steam prices, D external store framework/Loaded, E Fanatical, F notifications/deal
polish. Do not silently renumber them or absorb all this work into A/B.

Suggested order, not selected yet:

1. Review the final A/B working tree, assess outstanding unattended-sync reliability,
   complete the appropriate verification/release gates, and configure daily execution
   only when separately authorized.
2. Consider bringing a small part of F (daily inbox and automation policy design)
   forward before or alongside C. Keep external notification channels later.
3. Implement C prices against the agreed activity-event presentation contract.
4. Collect activity observations in a bounded data-foundation phase, then build the
   separate Gaming Activity UI. Decide when collection starts before promising history.

Open decisions:

- Which new-acquisition policy should be the default? User is explicitly undecided.
- Should automatic Playing be opt-in, which transitions qualify, and what threshold?
- Should Gaming Activity include all played Steam games? Recommended, not finalized.
- When should local Wishlist intention retire after ownership or Backlog addition?
- After the selected A/B closeout review, which bounded implementation task comes
  next? C planning and the daily inbox/automation plan remain later choices.

### Current handoff facts (2026-09-05, revalidate before acting)

- Repository: `C:\Users\ariel\projects\ultimate_backlog\gaming_backlog_website`.
- Branch `Dev`; the two earlier commits were already local at the start of closeout.
- `877874e` is the existing Phase A commit; `07c2816` is the earlier Backlog table
  commit. Neither was pushed in this conversation. Do not rewrite or duplicate them.
- Phase B plus focused A hardening are saved in `cc8d105`, including shared-file
  integration, tests and operational documentation. Vision/implementation records
  and context links are in the following documentation commit. Neither new commit
  is intended as a production-readiness assertion. Revalidate Git state and preserve
  any subsequent uncommitted work and local data.
- Migrations 030 and 031 were applied locally. 030 was preserved during the repair.
- Prior local repair: 435 active Steam memberships plus eight local intentions = 443
  active entries; one removal retained in history; ordinary game count remained 601.
  These are dated observations, not fixed future acceptance counts.
- Focused tests, real PostgreSQL contracts and desktop/mobile Chromium checks ran;
  the real local Wishlist rendered browser-loadable covers and provider order.
  Full suite/CI and production rollout are not complete. See the B record for evidence.
- At the last read-only check, the one local linked saved account had daily sync off.
- No production scheduler was configured or verified. New functionality is local.

### Testing the scheduled path after choosing to do so

Start the local app with `npm run dev`, link/sign in and enable Daily Steam sync.
In a second terminal, run `npm run env:check` and confirm localhost before running
`npm run steam:sync:daily`. It performs real local writes for all eligible local
accounts using the scheduled orchestration; it is not a dry run and does not need
an open browser. Library may skip within its 15-minute cooldown.

Check separate Library/Wishlist results, saved activity after reopening the app,
no-change deduplication, and opt-out behavior. Use disposable PostgreSQL contract
databases for failure/crash scenarios. Production timing and recovery need separate
verification after scheduler setup; local command success does not prove a deployed
daily trigger exists.

### Starter for the next chat

```text
REVIEW ONLY: close out Steam Phases A/B before further feature work.
Follow AGENTS.md and relevant repo-local skills.
Read docs/SYSTEM_CONTEXT.md and
docs/daily_sync__wishlist_and_loaded/gaming-backlog-steam-daily-experience-vision.md.
Use the linked A/B implementation records, live Dev, implementation commit
cc8d105 and its following documentation commit as the source of truth.
Preserve 877874e (Phase A), 07c2816 (Backlog table), subsequent commits,
any remaining working-tree changes and the local database.
Distinguish confirmed direction from proposed defaults and open decisions.
Assess achievement retry/cooldown eligibility, incremental provider request
budgets, queue/account safety, Wishlist/Backlog privacy, and remaining
verification and production-scheduler gates. Use recorded check evidence;
do not repeat unchanged passing commands merely because this is a new chat.
Return severity-ranked findings and the smallest ordered closeout plan.
Do not modify files/data, stage, commit, push, deploy or configure production
during this review. Keep pricing, notifications, status automation and
daily activity history out of the implementation scope.
```
