# Agent Instructions

Live code, scripts and Git take precedence over historical documentation.

## Start and scope

- Run `git status --short --branch` before editing. Preserve existing uncommitted
  work; do not revert, format or clean it up. Inspect mixed-file risk before staging.
- Read `docs/SYSTEM_CONTEXT.md` early. Read `docs/NEXT_TASKS.md` only for priorities,
  and one directly relevant handoff/skill. Do not load history or ROADMAP by default.
- Use targeted `rg` searches and file ranges. Exclude node_modules, dist, generated
  files, caches, dumps and backend/data unless relevant. Read a named skill fully.
- Keep outputs compact: successful summaries and failing excerpts. Read an already
  inspected file again only for a specific gap or intervening change.
- Keep changes focused. For medium/large work, use one short plan, finish a coherent
  change, verify at a checkpoint, then stop. Do not add unrelated polish.
- Prefer a fresh chat when changing phase. Leave a short handoff: goal/phase, branch
  and SHA, dirty-file risks, completed work, exact checks/results and next action.
  Do not paste whole docs into the handoff or restart settled investigation.

## Modes and authorization

- PLAN ONLY: inspect/propose, no edits. REVIEW ONLY: findings first, no edits.
- DEBUG ONLY: reproduce/diagnose; fix only when asked. IMPLEMENT: change and verify.
- UI POLISH: preserve visual language, verify responsive behavior.
- RELEASE: verify authorized code/Git, CI, migrations and deployment targets.
- Local implementation does not authorize committing, pushing, merging, deployment
  or production verification. A commit is local; a push publishes only the named
  branch. `main` is production; `Dev` is integration. Prefer short-lived branches
  from Dev. Do not switch branches or discard changes merely to follow a convention.
- Review findings lead with bugs, security/data risks and missing tests, with file
  and line references. Distinguish confirmed failures from missing evidence.

## Data and safety

- Local development uses localhost Postgres. Do not bypass the remote DB guard
  without deliberate authorization. Use `npm run env:check` for redacted diagnostics.
- Never commit secrets, .env files, dumps or production data. Before exports/backups,
  verify the target is ignored; use filenames without private identifiers.
- Production schema changes go in backend/migrations/*.sql; keep backend/schema.sql
  aligned. Prefer backward-compatible, idempotent migrations. No production copies,
  demo/user seed data unless requested; schema-required bounded backfills/reference
  values need explicit review. Do not rewrite already-applied migrations.
- Reset only disposable localhost databases. Copying production data requires an
  explicit request. Tests must use mocks/disposable databases, not real providers
  or ordinary saved data unless the user explicitly authorizes that interaction.
- Preserve owner, guest/demo and public read-only flows. Scope backend data to the
  current user; fence account-bound responses/jobs against replacement and replay.

## Implementation conventions (read when applicable)

React/Vite/Tailwind frontend; Express/pg/JWT/Celebrate backend.
Read the relevant section of [docs/AGENT_WORKFLOWS.md](docs/AGENT_WORKFLOWS.md):

- Frontend work: Frontend Rules (shared primitives, permissions, services and lists).
- Backend work: Backend Rules (validation, authorization and central errors).
- Documentation: Documentation Rules.
- Git publishing/release: Git, Publishing, And Release Terms and Release Monitoring.
- Commands: Core Commands only when needed; package.json is authoritative.

Relevant repo-local skills under `docs/skills/` must be read and announced:

| Task | Skill directory (read SKILL.md) |
| --- | --- |
| Review/diff/audit | gaming-backlog-review |
| Release/deploy | gaming-backlog-release |
| React/UI | gaming-backlog-frontend-ui |
| Express/API/auth | gaming-backlog-backend-api |
| Schema/migrations/data | gaming-backlog-db-safety |
| Steam sync/import | gaming-backlog-steam |

Choose the smallest relevant set; drafts are binding here without global installation.

## Verification policy

[docs/VERIFICATION.md](docs/VERIFICATION.md) is the single detailed policy. Read it
when selecting or executing checks; this summary also applies to skills/templates.

- Docs only: proofread and `git diff --check`; no app tests/builds.
- Small/medium changes: no full local gate by default; usually one focused command
  at the end if warranted. High-risk work retains meaningful focused coverage.
- Reproduce the actual reported failure path, including affected viewport/error
  states. Do not substitute a convenient proxy test. Say when reproduction is missing.
- Finish a coherent change before final verification. Record checks/results and
  the revision tested. Never rerun an unchanged passing check; rerun failures only
  after a relevant correction, using the narrowest affected check.
- Schema work still requires the migration runner against localhost; prefer a
  disposable contract that exercises it, without a redundant ordinary-DB run.
- CI is the full gate. Do not stack full lint, tests, build and Playwright onto
  focused checks by default. Exact-candidate CI must pass before release; local
  full verification is for explicit requests or missing equivalent CI coverage.
- Report what ran, failed/skipped checks and limits. No tests or passWithNoTests
  is not coverage. User instructions override defaults; never weaken critical
  isolation, migration or failure-path tests just to save usage.
