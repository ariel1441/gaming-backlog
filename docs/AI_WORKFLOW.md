# Working With AI On This Project

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

## Good Habits

- Never paste real secrets into chat.
- Keep `.env` files local and ignored.
- Commit working checkpoints before major refactors.
- Tell the assistant when existing local changes are experiments.
- Ask the assistant to keep unrelated files untouched.
- Use production data locally only through `npm run db:copy-prod-to-local`.
