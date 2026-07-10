# Documentation Index

This folder is for supporting project notes. Prefer the running app and source
code when a note appears stale.

## Maintained Docs

- [`../README.md`](../README.md) - project overview, setup, and command map.
- [`../DEVELOPMENT.md`](../DEVELOPMENT.md) - local workflow, environments,
  deployment, and database process.
- [`../AGENTS.md`](../AGENTS.md) - durable AI-agent instructions for this repo.
- [`AI_WORKFLOW.md`](AI_WORKFLOW.md) - human-facing guide for asking AI tools to
  work on this codebase.
- [`AI_WORKFLOW_AUDIT.md`](AI_WORKFLOW_AUDIT.md) - short summary of lessons
  learned from previous AI/Codex sessions.
- [`AI_TOOLING.md`](AI_TOOLING.md) - practical guide for optional plugins, MCP,
  skills, and hooks.
- [`NEXT_TASKS.md`](NEXT_TASKS.md) - short active queue for current priorities
  and low-token new-chat startup context.
- [`ROADMAP.md`](ROADMAP.md) - current improvement plan, priorities, and future
  feature tracks.
- [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md) - compact architecture and current
  status handoff for new sessions.
- [`../backend/migrations/README.md`](../backend/migrations/README.md) -
  database migration conventions.
- [`testing/manual-smoke-checklist.md`](testing/manual-smoke-checklist.md) -
  manual QA checklist for flows beyond the mocked Playwright smoke suite.

## Templates

- [`templates/ai-plan-brief.md`](templates/ai-plan-brief.md) - planning-only
  prompt template.
- [`templates/ai-implementation-brief.md`](templates/ai-implementation-brief.md) -
  implementation prompt template.
- [`templates/ai-review-brief.md`](templates/ai-review-brief.md) - code review
  prompt template.
- [`templates/ai-release-brief.md`](templates/ai-release-brief.md) - release
  verification prompt template.
- [`templates/ai-handoff.md`](templates/ai-handoff.md) - compact handoff prompt
  for starting a new chat.
- [`templates/bug-report.md`](templates/bug-report.md) - issue/debugging brief.
- [`templates/feature-request.md`](templates/feature-request.md) - feature task
  brief.

These templates are prompts/checklists. They are not authoritative product
documentation.

## Skill Drafts

`skills/` contains repo-local skill drafts. They are not automatically active
unless copied or installed into the Codex skills location used by your
environment.

- [`skills/gaming-backlog-review/SKILL.md`](skills/gaming-backlog-review/SKILL.md)
- [`skills/gaming-backlog-release/SKILL.md`](skills/gaming-backlog-release/SKILL.md)
- [`skills/gaming-backlog-frontend-ui/SKILL.md`](skills/gaming-backlog-frontend-ui/SKILL.md)
- [`skills/gaming-backlog-backend-api/SKILL.md`](skills/gaming-backlog-backend-api/SKILL.md)
- [`skills/gaming-backlog-db-safety/SKILL.md`](skills/gaming-backlog-db-safety/SKILL.md)
- [`skills/gaming-backlog-steam/SKILL.md`](skills/gaming-backlog-steam/SKILL.md)

## Hook Drafts

- [`hooks/README.md`](hooks/README.md) - draft lifecycle checks for pre-task,
  pre-edit, pre-backup/export, pre-commit, schema-change, and release safety.

## Planning Notes

- [`planning/ideas.md`](planning/ideas.md) - rough backlog ideas.
- [`planning/metadata-catalog-refactor.md`](planning/metadata-catalog-refactor.md) -
  historical V1 design notes and future extension guidance for metadata
  refresh, catalog browsing, Steam import, wishlist, and ownership work.
- [`planning/product-research-long-term-plan.md`](planning/product-research-long-term-plan.md) -
  detailed research-backed plan for owner profile, settings, timeline/journal,
  reviews, lists, next up, insights V2, public profile, activity/social,
  catalog pages, goals, tags, data export, and discovery improvements.
- [`planning/steam-integration-handoff.md`](planning/steam-integration-handoff.md) -
  current Steam V1 implementation summary, known rough edges, next-work ideas,
  and a prompt for continuing Steam integration in a new chat.
- [`planning/production-migration-automation.md`](planning/production-migration-automation.md) -
  future improvements for production migration safety.

Planning notes are intentionally unverified. Before implementing one, inspect
the current code and confirm the idea still makes sense.

## Images

`images/` contains screenshots and a reorder GIF used by older README versions.
Treat them as visual references only; they may not exactly match the current UI.
