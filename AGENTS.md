# Agent Instructions

This repo is a Vite/React frontend with an Express/Postgres backend.

## Core Commands

- `npm run dev` starts backend and frontend locally.
- `npm run check` runs lint, tests, and build.
- `npm run env:check` prints a redacted environment summary.
- `npm run db:migrate:local` applies tracked migrations to localhost.
- `npm run db:copy-prod-to-local` overwrites the local DB with a production dump.

## Branches

- `main` is production.
- `Dev` is the integration branch.
- Use short-lived `feature/...`, `fix/...`, or `chore/...` branches for work.

## Database Rules

- Local development must use a localhost database.
- Production schema changes must go through `backend/migrations/*.sql`.
- Keep `backend/schema.sql` updated for fresh installs.
- Migrations should be schema-only and backward-compatible.
- Do not put production data changes in migrations unless explicitly requested.

## Before Editing

- Check `git status --short --branch`.
- Do not overwrite or revert uncommitted user changes.
- If existing local changes are unrelated, leave them alone.
- For feature work, prefer creating a short-lived branch from `Dev`.
- For larger tasks, state the plan before making broad changes.

## Before Finishing

- Run `npm run check` when code changed.
- Mention if tests are absent or only `--passWithNoTests` succeeded.
- Summarize changed files and any remaining local modifications.

## AI Collaboration

- Keep changes focused on the user request.
- Ask whether UI should match live, current local refresh, or a new direction.
- For schema changes, always add a migration and update `backend/schema.sql`.
- For reviews, lead with bugs and risks before summaries.
