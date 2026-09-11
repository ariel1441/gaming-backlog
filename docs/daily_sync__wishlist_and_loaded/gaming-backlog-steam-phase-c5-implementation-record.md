# Steam C.5: Daily Experience UI/UX

Local implementation: 2026-09-08. Working-tree changes on
`fix/steam-candidate-account-isolation`, based on `21dfd7e`. Earlier commits,
including `86a8539` and `389477a`, remain untouched. No commit or release was made.

## Wishlist presentation

- Uses Backlog's page padding, toolbar, grid and card image behavior. Removes the
  extra AppPage wrapper that narrowed the grid. At a 1920px viewport the tested
  card view has four columns, matching Backlog.
- Opens the shared GameModal with its artwork/overview layout and explicit
  Wishlist actions. Wishlist projections remain read-only; personal lifecycle
  editing is not enabled for them. Saved descriptions are sanitized.
- Adds price and discount sorting through `gameList.js`, plus an On sale toggle.
  Unknown, expired, failed and paused prices sort last in either direction.
  On sale includes only fresh verified discounted observations; free-to-play and
  last-known discounts do not count as active sales.
- Gives current ILS prices and discounts clearer styling. Exact observation time
  remains in details, not every card or the collapsed status strip.
- Moves Wishlist beside Backlog in desktop navigation, keeps it accessible in
  mobile More, and adds the private Activity route. Wishlist projections and
  inbox entries can deep-link to a Wishlist item's details.

## Daily sync experience

- Bounded per-user in-memory saved-data cache, shared by Wishlist and Backlog
  projections. Return visits render cached complete snapshots; visible pages
  quietly reread the database on focus and at 60-second intervals.
- Pagination retains membership/price revision guards and retries one revision
  conflict. Failed revalidation keeps the previous complete snapshot and shows
  a small retry message. Provider fetching is never triggered by these reads.
- Private saved sync-health endpoint discovers existing jobs and returns current
  connection domain results. The app polls every 60 seconds while visible, or
  five seconds while a job is active, and refreshes affected saved data.
- Sync details expose the existing daily opt-in, independent domain results,
  saved coverage, freshness, verification limits, cooldown and recovery controls.
  Background work survives navigation. Manual refresh remains a secondary tool.
- Coverage distinguishes verification, unsupported content and temporary errors.
  Saved observation coverage and latest-attempt health can overlap.
- Settings describe prices as part of daily factual sync. A enabled preference
  is not proof of an operating schedule; no exact next-run promise is made.

## Private inbox

- `/activity` has Recent updates and Needs attention. Existing Library review
  decisions remain actionable through the existing explicit review flow.
- Saved price transitions retain their permanent identity and group key. Other
  events group by source, run and game; the UI combines these into run summaries.
  No external delivery, automated popups, deal threshold or navigation unread
  badge is introduced.
- Migration 034 adds inbox activation baselines and owner-guarded per-event
  read/hide receipts. These are independent of facts and review resolution.
  First activation makes historical information quiet. Later facts can show New;
  reading does not resolve decisions, and hiding does not permit event replay.
- Cursor pagination uses a fixed event snapshot. Current-account joins fence
  prior connections. Current-connection ownership suppresses price delivery,
  including ignored owned sources; removal copy says now owned rather than
  claiming a purchase. Previously dismissed review events do not resurface.

## Verification

Historical C.5 checkpoint: the results and next steps below describe that phase.
The later [notification implementation](notification-panel-design.md) and
[release review fixes](release-review-fixes.md) supersede the pending review and
local-intention retirement boundaries below. They retain their own check records;
overlapping test totals must not be added together.

- `npm run env:check` confirmed development and localhost, with remote DB access
  disabled. `npm run db:migrate:local` applied only 034; schema includes 034.
- Focused Node coverage: 50 tests passed across C.5 database/API contracts,
  existing price contracts, shared list/presentation logic and saved-data service
  tests, with no remaining failures or skips after targeted fixes/reruns.
  Initial schema comparison assertions required CRLF normalization.
- Four focused Chromium tests passed: desktop/mobile C.5 flows plus existing
  desktop/mobile price views and recovery. These use mocked APIs and test artwork.
  The new tests compare the same artwork and card dimensions on Backlog/Wishlist,
  check sorting/sale filters, background completion, retained data on error, and
  inbox read/hide persistence and game deep links. Screenshots were inspected.
- In-app browser discovery returned no available browser. Repository Playwright
  was used; Vite needed sandbox escalation to read its configuration. Test fixes
  addressed subpixel measurement, the API client's retry delay, and link semantics.
- Full lint/build/test CI and independent review remain pending. No live Steam
  provider sync, production verification or saved price coverage probe was run.

## Boundaries and next phase

Daily production scheduling and deployment remain separately authorized release
work. Provider offer acceptance, retry cadence and queue mechanics are unchanged.
Notification thresholds, richer preferences/grouping rules, acquisition/status
automation and local-intention retirement remain separate choices. No ordinary
Backlog games, statuses or dates are created or changed by factual refresh/inbox
delivery. Metadata repairs and broader Gaming Activity remain separate.

Loaded stays D, Fanatical E, remaining deal/notification polish F. Next: review
this local diff in a fresh conversation, then select commit/release work explicitly.
