# Next Tasks

Last updated: 2026-07-17

This is the short active queue. It intentionally contains no completed work.
See [`ROADMAP.md`](ROADMAP.md) for remaining candidates and
[`DONE.md`](DONE.md) for completed milestones. The July 2026 comprehensive
audit is a historical snapshot; its broad remediation landed in `34fb7c1` and
must not be treated as the current backlog without revalidation.

## Selected Next Task

Complete mobile Phase 5 of the focused UI/UX consistency plan as one separate,
bounded change. This remains intentionally last in the UI/UX track.

Acceptance criteria:

- Reduce the fixed mobile bottom bar to approximately five primary
  destinations.
- Add an accessible More sheet/drawer that keeps every desktop destination and
  account action discoverable.
- Use the real profile avatar in the mobile header.
- Give the active mobile destination a complete selected treatment.

## Active Order

1. Complete the selected mobile UI/UX Phase 5 above.
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
Implement one bounded phase at a time. Phases 1A, 1B, 2, 3, 4, 6, 7, and 8
are complete. Mobile Phase 5 is the only remaining phase and still requires
separate approval before implementation.

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
