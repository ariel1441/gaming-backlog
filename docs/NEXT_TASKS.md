# Next Tasks

Last updated: 2026-07-18

This is the short active queue. It intentionally contains no completed work.
See [`ROADMAP.md`](ROADMAP.md) for remaining candidates and
[`DONE.md`](DONE.md) for completed milestones. The July 2026 comprehensive
audit is a historical snapshot; its broad remediation landed in `34fb7c1` and
must not be treated as the current backlog without revalidation.

## Selected Next Task

No product implementation task is currently selected. Play Next & Resume V1 is
implemented on `Dev`; choose the next bounded candidate before starting another
implementation phase.

The planned
[`Play Next V2 mood and session matching`](planning/play-next-session-matching-v2.md)
work is documented for later alongside Insights V2, Timeline V2, Completion
Flow, and the other candidates in [`ROADMAP.md`](ROADMAP.md). It is not the
default next task.

## Active Order

1. Promote the green Play Next V1 candidate from `Dev` only when a production
   release is explicitly selected.
2. Choose one bounded product candidate from `ROADMAP.md`.
3. Review its focused brief and current-code assumptions before implementation.
4. Keep planning, implementation, review, and release as separate phases for
   medium or larger work.

Operational safety is no longer the selected product task. Remaining
database-aware readiness, diagnostic, and production backup/restore work stays
in the Engineering Follow-Up section of [`ROADMAP.md`](ROADMAP.md) until the
repository contains and verifies the complete behavior.

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
