# Next Tasks

Last updated: 2026-07-16

This is the short active queue. It intentionally contains no completed work.
See [`ROADMAP.md`](ROADMAP.md) for remaining candidates and
[`DONE.md`](DONE.md) for completed milestones. The July 2026 comprehensive
audit is a historical snapshot; its broad remediation landed in `34fb7c1` and
must not be treated as the current backlog without revalidation.

## Selected Next Task

Complete Phase 1 of the focused UI/UX consistency plan as one bounded change:
small copy/terminology defects, title recovery, manual-list loading independence,
and shared resilient game artwork.

Acceptance criteria:

- Replace internal implementation wording with clear user-facing language and
  standardize the affected list/Steam/view terminology.
- Make truncated game/list names recoverable and let a manual list render when
  its own request completes instead of waiting for the full backlog.
- Add one shared game-artwork primitive with missing/broken URL fallback, lazy
  loading, asynchronous decoding, and consistent aspect ratios.
- Adopt it across the surfaces named in the focused plan without redesigning
  those screens or changing data behavior.
- Preserve all four themes plus owner, demo, and public read-only behavior, and
  check representative desktop and mobile states.

## Active Order

1. Complete the selected UI/UX Phase 1 above.
2. Add short-lived Discover result caching keyed by user, query, filters, sort,
   and page, with quiet revalidation and mutation-aware backlog membership.
3. Finish the remaining operational work: backup/restore documentation,
   migration failure/rollback guidance, and safe health/diagnostic views.
4. Choose one product candidate. Next Up / Priority Queue remains the strongest
   bounded product option; Insights V2 and public-profile privacy are larger.

## Selected UI/UX Consolidation Track

The remaining UI/UX, editing, navigation, media fallback, loading-state, and
accessibility work is consolidated in
[`planning/ui-ux-consistency-plan.md`](planning/ui-ux-consistency-plan.md).
Implement one bounded phase at a time. Phase 1 remains the recommended entry
point; do not combine the entire track into one change.

## Workflow Improvements

- Install/adapt repo-local skill drafts only if the active Codex environment
  needs direct installation.
- Use the prompt templates in `docs/templates/` for repeated phases.
- Add practical pre-task, pre-export, pre-commit, and pre-release hooks where
  the environment supports them.

## Default New-Chat Context

```text
Follow AGENTS.md.
Read docs/SYSTEM_CONTEXT.md for current architecture.
Read docs/NEXT_TASKS.md only when choosing priorities.
For the selected UI/UX track, read docs/planning/ui-ux-consistency-plan.md.
Read one focused planning or historical audit section only when directly
relevant.
Mode:
Goal:
Acceptance criteria:
Checks:
```
