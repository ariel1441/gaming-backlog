# Next Tasks

Last updated: 2026-07-17

This is the short active queue. It intentionally contains no completed work.
See [`ROADMAP.md`](ROADMAP.md) for remaining candidates and
[`DONE.md`](DONE.md) for completed milestones. The July 2026 comprehensive
audit is a historical snapshot; its broad remediation landed in `34fb7c1` and
must not be treated as the current backlog without revalidation.

## Selected Next Task

Finish the remaining operational safety work as one bounded reliability track.

Acceptance criteria:

- Document production backup and restore.
- Document migration failure, recovery, and rollback guidance.
- Add safe health and diagnostic views for database, cache, environment, and
  demo-template state without exposing secrets.

## Active Order

1. Finish the selected operational safety work above.
2. Choose one product candidate. Next Up / Priority Queue remains the strongest
   bounded product option; Insights V2 and public-profile privacy are larger.
3. Add pagination or virtualization where real large-library use demonstrates
   an unbounded rendering problem.

## Selected UI/UX Consolidation Track

The remaining UI/UX, editing, navigation, media fallback, loading-state, and
accessibility work is consolidated in
[`planning/ui-ux-consistency-plan.md`](planning/ui-ux-consistency-plan.md).
Phases 1A, 1B, 2, 3, 4, 5, 6, 7, and 8 are complete. Reopen a phase only for a
demonstrated regression or a separately approved follow-up.

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
