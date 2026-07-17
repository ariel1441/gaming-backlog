# Next Tasks

Last updated: 2026-07-17

This is the short active queue. It intentionally contains no completed work.
See [`ROADMAP.md`](ROADMAP.md) for remaining candidates and
[`DONE.md`](DONE.md) for completed milestones. The July 2026 comprehensive
audit is a historical snapshot; its broad remediation landed in `34fb7c1` and
must not be treated as the current backlog without revalidation.

## Selected Next Task

Plan Play Next & Resume V1 as the next bounded product track.

Acceptance criteria:

- Choose one explicit queue model and owner. Queue ordering must remain separate
  from backlog positions, manual-list positions, and smart-list ranking.
- Define the smallest useful `/next-up` page or Backlog tab, including
  add/remove/reorder actions and short-game/high-priority views.
- Decide whether queue-aware Surprise Me belongs in V1.
- Define a lightweight private resume note and "what to do next" field for
  active games, without committing to the larger activity/playthrough model.
- Define a deliberate Start Playing action and its status/date/queue behavior.
- Preserve owner, guest/demo, and public read-only boundaries.
- Record schema, migration, mobile, empty-state, and regression-test risks
  before implementation.

## Active Order

1. Plan Play Next & Resume V1 and agree on its acceptance boundary.
2. Implement the independent queue foundation as a separate phase.
3. Add the focused Completion Flow after the queue is stable.
4. Choose between Library Control Center work (tags, saved views, data health)
   and the larger activity/events foundation.
5. Add pagination or virtualization where real large-library use demonstrates
   an unbounded rendering problem.

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
