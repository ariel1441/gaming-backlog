# Next Tasks

Last updated: 2026-07-18

This is the short active queue. It intentionally contains no completed work.
See [`ROADMAP.md`](ROADMAP.md) for remaining candidates and
[`DONE.md`](DONE.md) for completed milestones. The July 2026 comprehensive
audit is a historical snapshot; its broad remediation landed in `34fb7c1` and
must not be treated as the current backlog without revalidation.

## Selected Next Task

Review and approve the focused
[`Play Next & Resume V1`](planning/play-next-resume-v1.md) brief, then implement
its queue and private-note foundation as a separate phase.

Acceptance criteria:

- Confirm the seven recommended defaults in the focused brief, especially
  automatic queue removal on Start playing.
- Keep Next Up as an independent ordered relationship and `resume_note` as one
  private field, with database-enforced owner integrity.
- Implement the queue, note, and atomic Start playing foundation before the
  explained recommendation layer.
- Preserve owner, guest/demo, signed-out, and public read-only boundaries.
- Treat `/next-up` as a focused decision page, not another full-library grid.
- Keep mood/energy, AI, events, persistent dismissal, goals, and public sharing
  outside V1.

## Active Order

1. Review the Play Next & Resume V1 product decisions.
2. Implement queue/private-note data and API foundations.
3. Implement the focused `/next-up` page and explained decision layer.
4. Add the focused Completion Flow after Play Next is stable.
5. Choose between Library Control Center work (tags, saved views, data health)
   and the larger activity/events foundation.
6. Add pagination or virtualization where real large-library use demonstrates
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
