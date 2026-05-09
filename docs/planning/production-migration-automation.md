# Production Migration Automation Notes

Status: future improvement notes after the first automated migration workflow.

The project now has a GitHub Actions job that can apply schema migrations to
production after CI passes on pushes to `main`. The current workflow is safe
enough for small additive schema changes, but there are a few things to do
before relying on it for larger refactors.

## What Exists Now

- Production migrations run from `.github/workflows/ci.yml` only on pushes to
  `main`.
- The migration job waits for lint, tests, and build to pass.
- The job uses the `production` GitHub Environment.
- The job requires the `PROD_DATABASE_URL` GitHub secret.
- The job connects with `PGSSL=true`.
- The migration script records applied files in `schema_migrations`.
- The migration script uses a Postgres advisory lock so two migration runners
  cannot apply files at the same time.
- Migrations are SQL files in `backend/migrations/`.
- `backend/schema.sql` should stay updated for fresh local installs.

## Setup To Confirm In GitHub

1. Add `PROD_DATABASE_URL` as a GitHub secret.
2. Keep the `production` GitHub Environment enabled.
3. Consider adding required reviewers to the `production` Environment before the
   migration job can run.
4. Keep production deploys connected to `main`, not `Dev`.
5. After merging `Dev` to `main`, check the GitHub Actions run and confirm the
   migration job either applied the expected files or reported no pending
   migrations.

## Improvements To Consider Later

- Add a manual `workflow_dispatch` migration status workflow that only reports
  pending migrations without deploying code.
- Add a backup step or documented Railway backup checkpoint before production
  migrations.
- Add a staging database and run production-like migrations there before `main`.
- Add stronger migration rules for big refactors:
  - additive migration first
  - deploy compatible app code
  - backfill data separately if needed
  - cleanup migration later
- Add alerts or notifications when production migrations fail.
- Add rollback notes per migration when a change is risky.
- Add a preflight check that fails if `backend/schema.sql` is not updated with a
  migration that changes schema.

## Important Rule

Do not put user data edits, seed changes, or production data cleanup inside
normal schema migrations unless that is intentionally planned. For big data
changes, create a separate reviewed process so schema deployment and data
movement are not mixed together by accident.

