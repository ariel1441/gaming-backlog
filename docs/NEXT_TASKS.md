# Next Tasks

Status: maintained short active queue. Keep this file brief so new AI sessions
can understand the current work without reading the full roadmap.

For durable architecture facts, read `docs/SYSTEM_CONTEXT.md`. For broad ideas
and future planning, read `docs/ROADMAP.md`.

## Current Workflow Improvements

1. Finish AI workflow hardening:
   - keep `AGENTS.md` focused on durable agent rules
   - keep `docs/AI_WORKFLOW.md` focused on human prompting/workflow
   - avoid using long planning docs as default startup context
2. Install or adapt the repo-local skill drafts if the active Codex environment
   should use them directly:
   - `docs/skills/gaming-backlog-review`
   - `docs/skills/gaming-backlog-release`
   - `docs/skills/gaming-backlog-frontend-ui`
   - `docs/skills/gaming-backlog-backend-api`
   - `docs/skills/gaming-backlog-db-safety`
   - `docs/skills/gaming-backlog-steam`
3. Use prompt templates from `docs/templates/` for repeated work:
   - planning
   - implementation
   - review
   - release
   - handoff
4. Add or configure practical hooks if the environment supports them:
   - pre-task `git status --short --branch`
   - pre-backup/export ignored-path check
   - pre-release production route checklist
   - pre-commit staged/unrelated-files summary

## Product Candidates

These are candidates, not commitments. Choose one before implementing.

1. Next Up / priority queue.
2. Insights V2 with year/all-time controls and more actionable missing-data
   surfaces.
3. Public profile privacy/showcase controls before making reviews, lists, or
   Steam data public.
4. Steam follow-up only if explicitly chosen: real-library QA, match repair,
   privacy controls, or achievement detail.
5. Data export/import safety improvements, especially JSON export and safer
   production-derived local workflows.

## Default New Chat Context

Use this minimal startup context unless the task needs more:

```text
Follow AGENTS.md.
Read docs/SYSTEM_CONTEXT.md for current architecture.
Read docs/NEXT_TASKS.md only if choosing priorities.
Read one focused planning/handoff doc only when it is directly relevant.
Mode:
Goal:
Acceptance criteria:
Checks:
```
