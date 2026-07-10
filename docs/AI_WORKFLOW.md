# Working With AI On This Project

Status: maintained human workflow guide. For instructions that an AI agent
should follow every time, use the root [`AGENTS.md`](../AGENTS.md).

Use this as the default playbook when asking Codex or another AI assistant to work on the repo.

## Choose A Mode First

Start each request with one mode. This prevents the assistant from planning,
coding, reviewing, and releasing all in the same thread.

- `PLAN ONLY`: discuss product shape, options, risks, and test plan. No edits.
- `REVIEW ONLY`: inspect code/diff and return findings first. No edits.
- `IMPLEMENT`: make one focused change, verify it, and summarize.
- `DEBUG ONLY`: reproduce and diagnose first; fix only after the cause is clear.
- `UI POLISH`: improve a specific screen/state without changing product scope.
- `RELEASE`: prepare or verify deploys, migrations, CI, and production smoke
  checks.

Good mode prompt:

```text
Mode: PLAN ONLY
Goal: Decide whether Next Up should be a priority field, a queue, or a smart list.
Do not edit files. Give 3 options max with user value, data impact, risks, and
your recommendation.
```

## Start Every Task With Context

Give the assistant:

- The branch you are on.
- The exact feature, bug, or cleanup goal.
- The user flow that should work when done.
- Whether database schema changes are allowed.
- Whether UI style should match live, current local changes, or a new direction.
- Acceptance criteria and checks, if you know them.

Good prompt:

```text
Work on branch feature/hour-filter. Add an hours range filter to the backlog grid.
Use the existing filter panel style. Local DB is okay, but do not change production data.
Add/adjust tests if practical and run npm run check.
```

## Use Less Context By Default

Most tasks should start with only:

- `AGENTS.md`
- `docs/SYSTEM_CONTEXT.md`
- one directly relevant feature doc, if needed

Use `docs/NEXT_TASKS.md` for the current short queue. Use `docs/ROADMAP.md`
only when choosing broader priorities. Avoid asking every new chat to read all
planning docs unless the task is genuinely strategic.

## Use Small Branches

Prefer one branch per task:

- `feature/hour-filter`
- `fix/public-profile-empty-state`
- `chore/migration-runner`
- `style/card-refresh`

Small branches make AI review and rollback much easier.

If two features touch the same files, stop before commit time and decide whether
to split branches, stash, or finish one feature first. Selective commits are
possible, but they get risky when unrelated work shares files.

## Ask For A Plan When The Task Is Big

For large features, ask for:

1. Current code map.
2. Proposed data/API/UI changes.
3. Migration plan, if needed.
4. Test plan.
5. Rollout risks.

Then let the assistant implement after the plan makes sense.

Large features should usually be split into separate chats or phases:

1. Planning and product decisions.
2. Schema/backend implementation.
3. Frontend implementation.
4. QA and review.
5. Release/deploy verification.

## Database Work

For schema changes, ask for both:

- a migration under `backend/migrations/`
- an update to `backend/schema.sql`

Run locally:

```bash
npm run db:migrate:local
npm run check
```

Production migrations are handled from `main` by GitHub Actions when `PROD_DATABASE_URL` is configured.

## UI Work

Be explicit about the visual target:

- "match the current live style"
- "continue the local UI refresh"
- "make a new design direction"
- "only fix spacing, do not redesign"
- "keep card heights equal"
- "show full review text"
- "prioritize compact scanning"

When judging UI, test:

- desktop
- mobile
- long game titles
- missing cover art
- public read-only view
- guest/demo user view

For UI polish, use browser screenshots or visual inspection early. Repeated
small text/spacing/image tweaks are cheaper when the assistant can see the
screen state before changing code again.

## Reviews

Before merging, ask:

```text
Review this diff for bugs, regressions, database risks, and missing tests.
Prioritize findings with file and line references.
```

## Release Work

Release work should verify each system separately instead of assuming one
successful push means everything updated.

Checklist:

- `git status --short --branch`
- relevant local checks, usually `npm run check`
- GitHub Actions status
- production migrations, if any
- Vercel frontend deployment
- Railway backend deployment
- representative production API routes

For backend route releases, smoke test the backend directly before testing the
frontend. Example for protected routes: unauthenticated production calls should
return an auth error such as `401`, not a generic `404`.

## Useful Local Checks

```bash
npm run env:check
npm run db:migrate:local
npm run check
```

## Templates To Reuse

Use the templates under `docs/templates/` instead of rewriting long prompts
from scratch:

- `ai-plan-brief.md`
- `ai-implementation-brief.md`
- `ai-review-brief.md`
- `ai-release-brief.md`
- `ai-handoff.md`

For small tasks, paste only the relevant sections. The point is to reduce
guessing, not to make every prompt long.

## Codex-Specific Setup

This repo has an `AGENTS.md` file at the root. Codex-style agents should read it
automatically or can be told:

```text
Read AGENTS.md first and follow it for this task.
```

Keep durable project rules in `AGENTS.md`, not in random chat history or
stale planning notes:

- branch model
- database rules
- required commands
- files that should not be touched casually
- review expectations

Use `docs/AI_WORKFLOW.md` for human workflow guidance and `AGENTS.md` for rules
the agent should obey every time.

For optional tooling, plugin, skill, and hook guidance, see
`docs/AI_TOOLING.md`.

## When To Start A New Chat

Start a new chat or phase when:

- the task changes from planning to implementation
- implementation is done and the next step is review or release
- the thread has accumulated unrelated debugging/deployment context
- a large feature starts pulling in adjacent feature ideas
- selective commit/staging becomes confusing

Before switching, ask for a compact handoff:

```text
Create a compact handoff for the next chat:
- current goal
- branch/status
- changed files
- decisions made
- checks run/results
- unresolved risks
- next 3 steps
```

## Skills And Reusable Agent Rules

Good reusable skills/rules for this project:

- **Frontend UI skill**: React/Tailwind patterns, responsive checks, public/demo/admin states.
- **Backend API skill**: Express route style, auth rules, validation, error shape.
- **Database migration skill**: migration + `schema.sql` updates, backward-compatible releases.
- **Code review skill**: findings first, file/line references, regression and test focus.
- **Release skill**: `Dev` to `main`, CI, Vercel/Railway, production migration caution.
- **Steam skill**: reviewed import, duplicate safety, private source data, and
  explicit privacy controls before public exposure.

If your Codex environment supports custom skills, create small focused skills
instead of one huge project skill. A good skill includes:

- when to use it
- files/folders it applies to
- commands to run
- risks to watch for
- examples of good output

Example request:

```text
Use the database migration skill. Add a nullable column for Steam app id.
Update backend/schema.sql, add a migration, update API validation if needed,
run npm run db:migrate:local and npm run check.
```

Repo-local skill drafts live under `docs/skills/`. They are reference material
until installed into your active Codex skills location. `AGENTS.md` now tells
agents working in this repo to proactively consult the relevant draft even when
you forget to ask.

Skill selection guide:

| Work type | Skill draft |
| --- | --- |
| Review, audit, risky diff | `docs/skills/gaming-backlog-review/SKILL.md` |
| Release, deploy, production verification | `docs/skills/gaming-backlog-release/SKILL.md` |
| React, Tailwind, UI, forms, layout | `docs/skills/gaming-backlog-frontend-ui/SKILL.md` |
| Express routes, validators, auth, API errors | `docs/skills/gaming-backlog-backend-api/SKILL.md` |
| Migrations, schema, backups, exports, prod/local data | `docs/skills/gaming-backlog-db-safety/SKILL.md` |
| Steam import, library, sync, achievements, playtime | `docs/skills/gaming-backlog-steam/SKILL.md` |

You can still explicitly prompt:

```text
Use the relevant repo-local skill draft from docs/skills if this task matches one.
```

## Agent Task Briefs

For bigger work, create or paste a short task brief:

```text
Branch: feature/import-csv
Goal: Import games from a CSV file.
User flow: admin opens import modal, uploads CSV, previews rows, confirms import.
DB: schema changes allowed if needed.
UI style: match current local UI refresh.
Must not touch: production data, unrelated public profile styling.
Checks: npm run check, manual import flow.
```

This makes agents much better because it removes guessing.

## Recommended Coding/AI Tools

Useful AI/coding tools, beyond editor extensions:

- **Codex CLI / Codex in IDE** for repo-aware implementation.
- **GitHub Copilot Chat** for quick inline questions and small edits.
- **Continue** or similar local-agent IDE tools if you want model/provider choice.
- **Aider** for terminal-based patch work on focused branches.
- **GitHub Actions** as the objective check after AI edits.
- **pgAdmin plus local Postgres** for DB inspection after migrations.

Do not run multiple agents editing the same files unless each agent has a clear,
non-overlapping ownership area.

## Good Agent Prompts

For planning:

```text
Mode: PLAN ONLY
Goal:
User flow:
Constraints:
Read only AGENTS.md, SYSTEM_CONTEXT.md, and files directly relevant to this topic.
Output 3 options max, a recommendation, risks, and a test plan.
Do not edit files.
```

For implementation:

```text
Mode: IMPLEMENT
Scope:
Acceptance criteria:
Allowed changes:
Do not touch:
Checks to run:
Start with git status, inspect relevant files, then make the smallest focused diff.
```

For debugging:

```text
Mode: DEBUG ONLY
Reproduce the error first. Identify the root cause. Make the smallest fix only
after the cause is clear. Add a regression test if practical.
```

For UI:

```text
Mode: UI POLISH
Target screen/state:
Visual priority:
Keep the existing visual language. Check desktop/mobile, long titles, missing
covers, empty states, demo, and public read-only flows.
```

For database:

```text
Use a migration. Make it backward-compatible. Update schema.sql.
Do not change production data.
```

For release:

```text
Mode: RELEASE
Verify GitHub/CI, production migrations, Vercel, Railway, and direct production
API smoke checks separately. Do not assume the backend deployed just because the
frontend did.
```

## Good Habits

- Never paste real secrets into chat.
- Keep `.env` files local and ignored.
- Commit working checkpoints before major refactors.
- Tell the assistant when existing local changes are experiments.
- Ask the assistant to keep unrelated files untouched.
- Use production data locally only through `npm run db:copy-prod-to-local`.
- Before creating backups, exports, or production-derived files, confirm the
  output path is ignored by git and avoid private identifiers in filenames.
