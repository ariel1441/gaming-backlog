# Steam Integration: Remaining Work

Last updated: 2026-07-11

Steam V1/V1.2 is complete enough to pause. Completed capabilities are listed in
[`../DONE.md`](../DONE.md), and current routes/data behavior is documented in
[`../SYSTEM_CONTEXT.md`](../SYSTEM_CONTEXT.md). Do not expand Steam unless the
next chosen task is explicitly Steam-related.

## Completed Hardening Baseline

The audit-era hardening is complete: one-use browser linking, per-user match
boundaries, valid status-suggestion writes, duplicate-merge membership
preservation, transactional review/import work, provider deadlines, bounded
large-library jobs, and focused real-Postgres contracts. See
[`../DONE.md`](../DONE.md).

Treat Steam V1/V1.2 as a stopping point. Reopen hardening only for a reproduced
regression or when a selected follow-up changes the affected contract.

## Focused Follow-Up Candidates

- Perform real-library QA with private, empty, large, and partially matched
  libraries.
- Improve safe match repair and correction memory.
- Add explicit privacy controls before exposing ownership, playtime, last
  played, or achievements.
- Add achievement detail/global rarity only if it improves the core product.
- Improve start/finish/status suggestions while keeping every change reviewed;
  Steam must never silently change personal status or dates.

## Larger Future Work

- Scheduled/background sync with bounded jobs, retry policy, progress, failure
  recovery, and operational visibility.
- Rich achievement history and completion tracking.
- Broader ownership/library modeling beyond Steam.
- Wishlist integration only after the user/catalog relationship model is
  settled.

## Production Verification Still Required For Steam Changes

- Verify migrations, Railway backend, Vercel frontend, and GitHub/CI separately.
- Verify real linking and sync with production callback origins.
- Confirm private-library or achievement failures do not break backlog reads.
- Confirm import/attach/repair paths do not create duplicate backlog rows.
- Confirm public serializers expose no Steam-specific private data.
- Confirm mock/sample sync is disabled.
