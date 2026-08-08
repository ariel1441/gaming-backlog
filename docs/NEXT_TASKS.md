# Next Tasks

Last updated: 2026-08-08

This is the short active queue. It intentionally contains no completed work.
See [`ROADMAP.md`](ROADMAP.md) for remaining candidates and
[`DONE.md`](DONE.md) for completed milestones. The July 2026 comprehensive
audit is a historical snapshot; its broad remediation landed in `34fb7c1` and
must not be treated as the current backlog without revalidation.

## Selected Next Task

Close out production verification for the current `main` candidate, then
implement the approved
[`Personal Genre And Status Model V1`](planning/personal-genre-status-v1.md)
foundation in bounded slices. The focused plan defines the genre-management
behavior, stable status identities, compatibility contract, migration order,
and approval gates that must be settled before schema work begins.

Play Next & Resume V1 and Finish Game V1 are complete on `main`. The planned
[`Play Next V2 mood and session matching`](planning/play-next-session-matching-v2.md)
work remains a later candidate and is not the selected next task.

Acceptance criteria for the next planning phase:

- Replace comma-separated personal genres with a backward-compatible,
  user-owned model that supports reuse, rename, merge, and future presets.
- Keep personal genres distinct from provider metadata genres.
- Separate stable status identity and semantic grouping from user-facing
  wording before renaming existing statuses.
- Preserve ordering, filtering, Insights, Lists, owner/demo, and public
  read-only behavior through the migration.
- Identify the compatibility sequence for the API, frontend, migrations, and
  existing saved data before implementation.

## Active Order

1. Independently smoke-check the current `main` SHA in Railway, Vercel, and
   representative production routes.
2. Approve and implement Personal Genre And Status Model V1 in bounded slices.
3. Add the main-backlog table view as the first consumer of the remaining
   shared-table foundation.
4. Add a focused Library Needs Attention view for data cleanup and repair.
5. Build Insights V2 on the stable genre and status models.
6. Organize the public profile into optional modules and add explicit privacy
   controls before exposing newer private data.
7. Add opt-in daily Steam sync that processes only new or changed games.
8. Keep planning, implementation, review, and release as separate phases for
   medium or larger work.

Operational safety is no longer the selected product task. Remaining
database-aware readiness, diagnostic, and production backup/restore work stays
in the Engineering Follow-Up section of [`ROADMAP.md`](ROADMAP.md) until the
repository contains and verifies the complete behavior.

## Completed UI/UX Consolidation Track

The completed UI/UX, editing, navigation, media fallback, loading-state, and
accessibility phases are preserved in the historical
[`planning/ui-ux-consistency-plan.md`](planning/ui-ux-consistency-plan.md).
Phases 1A, 1B, 2, 3, 4, 5, 6, 7, and 8 are complete. Reopen a phase only for a
demonstrated regression or a separately approved follow-up.

The remaining shared-UI work is intentionally narrow: table primitives,
table-specific responsive and interaction behavior, a development showcase,
and representative cross-theme visual regression coverage. It should be driven
by the selected backlog table feature rather than treated as another broad
redesign.

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
