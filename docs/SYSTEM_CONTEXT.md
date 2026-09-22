# System Context

Updated: 2026-09-22. Compact architecture and current handoff; live code/Git wins.
Read linked details only for the active task, not as a startup checklist.

## Current checkpoint

Release-preparation update (2026-09-22): after a fresh fetch, local `Dev` is eight
commits ahead of `origin/Dev` (`65f5fbe`), with code candidate `4328a8a` followed
by this documentation handoff. The candidate
adds split Play Next banks, alternate completion outcomes, stable Steam candidate
pagination, paginated private collections and route-aware loading, Wishlist price/
deletion fixes, and Backlog-added dates. Focused review verification passed 202
tests with no failures; full CI and browser verification remain release gates.

Insights 2.0 v1 has been visually accepted for now. The next product phase is a
project-wide status-model decision and implementation. After the current candidate
reaches `main`, verify daily Steam automation and begin retaining timestamped Steam
observations before building a detailed Activity Center timeline and aggregated
activity Insights. See [NEXT_TASKS.md](NEXT_TASKS.md),
[planning/gaming-activity.md](planning/gaming-activity.md) and
[AUTOMATION.md](AUTOMATION.md).

The preparation bullets below describe the earlier local checkpoint. Their
unpublished/pending wording is historical, not the current integration state.


- Branch: `fix/steam-candidate-account-isolation`; runtime candidate `6dd5338`,
  following isolation commit `9ed7fa1`. Local preparation also includes a subsequent
  documentation commit. Recheck Git before acting; no push or deployment occurred.
- Release review, fixes and the requested full local verification are complete:
  396 Node tests and all 46 enabled browser cases passed across the gate and focused
  corrections; one saved-data browser case stays opt-in/skipped. Build budget passed.
  [Preparation record](daily_sync__wishlist_and_loaded/local-release-preparation.md)
  gives commands, initial failures and environment limits. Remote CI remains pending.
- Migration 035 was exercised only in disposable localhost databases. Earlier
  records report 034 applied to development; reverify target migration state before
  an authorized application. Use the migration runner's genre-backfill preflight.
- Next: authorize publishing the local candidate for exact-candidate CI, then separately authorized
  migration/deployment verification. No release action is authorized by this file.

## Architecture map

- React 18/Vite/Tailwind app in src; Express/pg/JWT/Celebrate backend in backend.
  Hosting model: Vercel frontend, Railway backend/Postgres; not a deploy status claim.
- `src/App.jsx`: providers/routes; `src/components/AppShell.jsx` and Sidebar: shell.
  Backlog lives under src/pages/Backlog; Wishlist in WishlistPage and pages/Wishlist.
- `src/services/apiClient.js`: network/auth boundary; authService and AuthContext:
  sessions. Services/hooks handle saved data. Use gameList and permissions utilities
  and shared components/ui primitives rather than duplicating behavior.
- `backend/index.js`: server/middleware/routes; backend/routes and validators:
  endpoints/contracts; backend/services: workflows; backend/db.js: guarded pg pool.
  Migrations evolve production schema; schema.sql is a destructive fresh-install
  schema, never an upgrade mechanism. `/healthz` is liveness, not DB readiness.
- Private capabilities include Backlog/statuses/personal genres/table view, Next Up,
  Lists, Discover, Timeline, Insights, profile/settings and Steam review. Guest/demo
  and public `/u/:username` flows have separate privacy/permission requirements.
- Catalog/RAWG/HLTB metadata and caches are distinct from user-owned fields. Preserve
  user edits and stale/failure fallback behavior when touching enrichment.

## Steam and daily experience boundaries

- Library jobs maintain ownership, playtime, achievement eligibility/retries and
  recovery. User/account/job fencing matters on replacement, cancellation and replay.
  Steam facts do not authorize automatic personal status/date changes.
- Steam Wishlist membership and optional local intentions are separate. Empty-response
  protection/removal history remain; owned imports must not silently retire intentions.
- Israel price jobs verify offers and retain history, freshness/coverage, retry state
  and price events. Multiple exact identities remain unresolved, not arbitrarily priced.
- C.5 shares Backlog/Wishlist details, sorting/filtering and artwork treatment; saved
  data caching/polling keeps views current. Steam diagnostics live in Settings >
  Integrations; Wishlist status stays quiet.
- Notifications use toolbar bells on Backlog/Wishlist, a sidebar bell on other desktop
  pages and a mobile header bell. Reading does not clear pending decisions. Acquisition,
  acceptance, linking, Ignore, hiding/pagination and optional retirement are explicit;
  partial retirement failures must not cause duplicate imports. Details and evidence:
  [C.5 record](daily_sync__wishlist_and_loaded/gaming-backlog-steam-phase-c5-implementation-record.md),
  [notification design](daily_sync__wishlist_and_loaded/notification-panel-design.md),
  [fix record](daily_sync__wishlist_and_loaded/release-review-fixes.md).
- Scheduling (provider jobs), saved-data polling (reads), metadata refresh and metadata
  repairs are separate. Code/local settings do not prove production scheduling or
  external verification. Do not enable automation as incidental implementation work.

## Where to look next

- Priorities: [NEXT_TASKS.md](NEXT_TASKS.md); broader candidates: [ROADMAP.md](ROADMAP.md).
- Commands/environment: package.json and [DEVELOPMENT.md](../DEVELOPMENT.md).
- Check selection: [VERIFICATION.md](VERIFICATION.md); task conventions:
  [AGENT_WORKFLOWS.md](AGENT_WORKFLOWS.md); release infrastructure: [CI_CD.md](CI_CD.md).
- Historical architecture/phase details are preserved in
  [the pre-trim snapshot](SYSTEM_CONTEXT_history_2026-09-11.md). It contains superseded
  priorities and verification claims; retrieve a relevant section only when necessary.
