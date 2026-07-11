# Steam Integration: Remaining Work

Last updated: 2026-07-11

Steam V1/V1.2 is complete enough to pause. Completed capabilities are listed in
[`../DONE.md`](../DONE.md), and current routes/data behavior is documented in
[`../SYSTEM_CONTEXT.md`](../SYSTEM_CONTEXT.md). Do not expand Steam unless the
next chosen task is explicitly Steam-related.

## Required Hardening

- Bind Steam OpenID linking to the initiating browser/session.
- Prevent per-user matching decisions from rewriting global Steam/catalog
  mappings.
- Remove the status-suggestion write to nonexistent `games.updated_at`.
- Preserve manual-list membership during duplicate merges.
- Make related import/review/source writes transactional.
- Add Steam request deadlines and explicit failure states.
- Bound large-library sync work to avoid timeout and partial-completion risks.
- Cover ownership, transactions, and schema behavior with real-Postgres tests.

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
