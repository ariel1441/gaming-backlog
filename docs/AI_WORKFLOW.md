# Working With AI On This Project

Status: maintained human workflow guide. For instructions that an AI agent
should follow every time, use the root [`AGENTS.md`](../AGENTS.md).

Use this as the default playbook when asking Codex or another AI assistant to work on the repo.

## Start Every Task With Context

Give the assistant:

- The branch you are on.
- The exact feature, bug, or cleanup goal.
- The user flow that should work when done.
- Whether database schema changes are allowed.
- Whether UI style should match live, current local changes, or a new direction.

Good prompt:

```text
Work on branch feature/hour-filter. Add an hours range filter to the backlog grid.
Use the existing filter panel style. Local DB is okay, but do not change production data.
Add/adjust tests if practical and run npm run check.
```

## Use Small Branches

Prefer one branch per task:

- `feature/hour-filter`
- `fix/public-profile-empty-state`
- `chore/migration-runner`
- `style/card-refresh`

Small branches make AI review and rollback much easier.

## Ask For A Plan When The Task Is Big

For large features, ask for:

1. Current code map.
2. Proposed data/API/UI changes.
3. Migration plan, if needed.
4. Test plan.
5. Rollout risks.

Then let the assistant implement after the plan makes sense.

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

When judging UI, test:

- desktop
- mobile
- long game titles
- missing cover art
- public read-only view
- guest/demo user view

## Reviews

Before merging, ask:

```text
Review this diff for bugs, regressions, database risks, and missing tests.
Prioritize findings with file and line references.
```

## Useful Local Checks

```bash
npm run env:check
npm run db:migrate:local
npm run check
```

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

## Skills And Reusable Agent Rules

Good reusable skills/rules for this project:

- **Frontend UI skill**: React/Tailwind patterns, responsive checks, public/demo/admin states.
- **Backend API skill**: Express route style, auth rules, validation, error shape.
- **Database migration skill**: migration + `schema.sql` updates, backward-compatible releases.
- **Code review skill**: findings first, file/line references, regression and test focus.
- **Release skill**: `Dev` to `main`, CI, Vercel/Railway, production migration caution.

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

For implementation:

```text
Implement this end to end. Keep the diff focused. Do not modify unrelated files.
Run npm run check and explain any warnings.
```

For debugging:

```text
Reproduce the error first. Identify root cause. Make the smallest fix.
Add a regression test if practical.
```

For UI:

```text
Check desktop and mobile layouts. Long titles and missing cover art must still look good.
Do not introduce a new visual language unless asked.
```

For database:

```text
Use a migration. Make it backward-compatible. Update schema.sql.
Do not change production data.
```

## Good Habits

- Never paste real secrets into chat.
- Keep `.env` files local and ignored.
- Commit working checkpoints before major refactors.
- Tell the assistant when existing local changes are experiments.
- Ask the assistant to keep unrelated files untouched.
- Use production data locally only through `npm run db:copy-prod-to-local`.
