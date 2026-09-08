# Steam C.5: daily experience handoff

Updated 2026-09-08. C.5 (also called 3.5 in conversation) is the next separately
scoped UI/UX conversation after Phase C. It does not renumber master phases:
D remains external-store framework + Loaded, E Fanatical, F remaining deal and
notification polish. Loaded tracking is not implemented in C or selected for C.5.

## Starting point

Use live Git/code first. Preserve branch `fix/steam-candidate-account-isolation`
and its Phase C closeout `86a8539` plus the subsequent offer-hardening commit;
do not switch to older Dev. Ancestors include
389477a, 41c3bde, 4df6f1d, cc8d105, 877874e and 07c2816.
Migration 033 is applied only to localhost. See the
[C implementation record](gaming-backlog-steam-wishlist-phase-c-implementation-record.md)
for implementation, tests, development retry policy and offer-hardening results.
Last saved DB snapshot: 411/430 observed, zero unchecked, 19 failures, eight
unresolved local intentions. The follow-up live adapter probe resolved 15 of those
19 (14 ILS prices plus one unreleased/no-price state), without saving observations.
Four offers remain uncertain: MGS1, Path of Exile 2, Resident Evil 5 and South of
Midnight. Recheck saved coverage after the user's next refresh; don't present the
expected 426/430 as already persisted. Provider requests are paced; the latest
recovery took about five minutes. Existing successful observations remain usable.

Daily background factual updates are the confirmed direction. Pricing is wired
into the daily orchestration script, but production scheduling is not configured
and the local account has daily sync off. A retry due timestamp does not itself
launch a worker. Manual sync is chiefly recovery/testing.

## Next-chat scope to plan with the user

- Wishlist UI/UX and visual improvements; collect the user's additional observations
  before settling the design. Preserve mobile/desktop, privacy and Backlog projection.
- Saved data should appear promptly; background progress/health should be quiet and
  understandable without requiring users to press a button and wait on the page.
- Better automatic-sync controls, last-success/freshness/coverage, partial results
  and recovery. Separate unsupported/verification-needed from transient retry states.
- Lightweight activity inbox and grouped in-app notifications built on the shared
  factual-event contract, with no first-baseline notification flood.
- Plan quiet refresh of saved data and later provider catch-up explicitly; do not
  confuse a UI reread with a provider fetch or enabling a scheduler.

Notification defaults, thresholds, grouping/read behavior, automation rules and
local-intention retirement are not approved. Recommend concrete options in the next
plan. Optional acquisition/status automation, broader observation collection and
Gaming Activity remain separately scoped; their collection timing is still open.
Missing RAWG/Metacritic/HLTB metadata and cached-empty refresh need their own diagnosis;
do not assume the Steam price job repairs them.

## Verification and release boundaries

Focused provider/service/schema/frontend and desktop/mobile checks already passed;
the latest offer-hardening focused run passed 32 tests with no failures/skips.
Read the C record before choosing checks; do not repeat unchanged passing commands.
Full CI and independent review remain pending. A local commit authorizes no push,
merge, deployment, production verification or scheduler configuration. Plan C.5 in
the new conversation before implementing unsettled product behavior.
