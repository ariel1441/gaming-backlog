# AI Tooling Guide

Status: maintained practical guide for optional AI tooling around this repo.
This is not required reading for every task.

## Default Tooling Priority

1. Local repo context and `AGENTS.md`.
2. Focused files and tests.
3. Browser/visual verification for UI work.
4. GitHub/CI/deploy tools for release work.
5. External planning/design tools only when the work actually lives there.

Avoid adding tools just because they exist. Each tool should reduce context
paste, improve verification, or make a repeated workflow safer.

## Useful Plugins / MCP

### GitHub

Highest-value plugin for this project once installation works.

Use for:

- PR review context
- CI status
- commit/branch visibility
- issue creation and triage
- release verification

Still verify local files and `git status`; GitHub does not replace local
worktree awareness.

### Browser / In-App Browser

Use early for:

- UI polish
- responsive checks
- visual regressions
- production smoke checks
- long titles, missing covers, empty states, demo/public read-only flows

For visual work, screenshots reduce repeated text-only tuning.

### Figma

Use only if design work moves into Figma. Otherwise, the repo's existing UI
tokens and components are the source of truth.

### Slack / Email / Calendar / Drive / Notion

Skip unless project planning or decisions move into those tools. Repo docs are
currently the main project memory.

## Recommended Skills

Start with the repo-local drafts in `docs/skills/`:

1. `gaming-backlog-review`
2. `gaming-backlog-release`
3. `gaming-backlog-frontend-ui`
4. `gaming-backlog-backend-api`
5. `gaming-backlog-db-safety`
6. `gaming-backlog-steam`

Install only the skills you will actually invoke. Too many always-on workflows
can become another form of context noise.

Important distinction:

- Repo-local drafts in `docs/skills/` are available to agents through repo
  instructions and can be read like normal docs.
- Installed Codex skills are available as first-class skills in the active
  Codex environment.

`AGENTS.md` tells agents in this repo to consult the matching draft
proactively, so you do not need to remember the exact skill name every time.
Installing them globally is still useful if you want the same workflows outside
this repo or surfaced as true Codex skills.

## Recommended Hooks

Draft hook ideas live in `docs/hooks/README.md`. Prefer hooks for mechanical
safety checks, not nuanced product decisions.
