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
- [`ROADMAP.md`](ROADMAP.md) - current improvement plan, priorities, and future
  feature tracks.
- [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md) - compact architecture and current
  status handoff for new sessions.
- [`../backend/migrations/README.md`](../backend/migrations/README.md) -
  database migration conventions.
- [`testing/manual-smoke-checklist.md`](testing/manual-smoke-checklist.md) -
  manual QA checklist for flows beyond the mocked Playwright smoke suite.

## Templates

- [`templates/bug-report.md`](templates/bug-report.md) - issue/debugging brief.
- [`templates/feature-request.md`](templates/feature-request.md) - feature task
  brief.

These templates are prompts/checklists. They are not authoritative product
documentation.

## Planning Notes

- [`planning/ideas.md`](planning/ideas.md) - rough backlog ideas.
- [`planning/metadata-catalog-refactor.md`](planning/metadata-catalog-refactor.md) -
  historical V1 design notes and future extension guidance for metadata
  refresh, catalog browsing, Steam import, wishlist, and ownership work.
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
