# Next Tasks

Last updated: 2026-07-11

This is the short active queue. It intentionally contains no completed work.
See [`ROADMAP.md`](ROADMAP.md) for all remaining candidates and
[`DONE.md`](DONE.md) for completed milestones.

## Active Order

1. Complete one Priority 0 remediation group from the comprehensive audit:
   authentication/session handling, Steam link/mapping boundaries, the shipped
   Steam runtime error, or export/diagnostic hardening.
2. Establish real-Postgres migration and authorization test coverage before
   adding database constraints.
3. Add database invariants and transactional write paths in small, reviewed
   migrations.
4. Fix provider deadlines/outage semantics and put a guardrail around large
   Steam syncs.
5. Repair reorder, demo lifecycle, Insights races, and accessibility.
6. Repair and enforce the real Playwright browser suite.
7. Choose one product candidate: Next Up, Insights V2, or public-profile privacy
   controls are the strongest current options.

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
Read one focused planning or audit section only when directly relevant.
Mode:
Goal:
Acceptance criteria:
Checks:
```
