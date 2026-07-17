# Production Migration: Remaining Improvements

Last updated: 2026-07-17

The baseline automated production migration workflow is complete and summarized
in [`../DONE.md`](../DONE.md). Current migration behavior is documented in
[`../SYSTEM_CONTEXT.md`](../SYSTEM_CONTEXT.md) and `DEVELOPMENT.md`. This file
contains only remaining safety work.

## Configuration To Verify Externally

- Confirm `PROD_DATABASE_URL` exists as a GitHub secret.
- Keep the GitHub `production` Environment enabled.
- Consider required reviewers for production migration runs.
- Keep production deployments connected to `main`.
- Verify the migration job result after each production merge rather than
  assuming deployment and migration completed together.

## Remaining Automation

- Add a manual migration-status workflow that reports pending files without
  deploying code.
- Add a complete production backup/restore runbook. Current CI/CD guidance
  requires a restorable Railway backup or recovery window but does not document
  an end-to-end restore exercise.
- Add a staging database and run production-like migrations there first.
- Add enforceable checkpoints for expand/deploy/backfill/cleanup sequencing
  when a large refactor needs them.
- Add migration-failure alerts.
- Add migration-specific recovery notes when a risky migration is proposed;
  the general application-versus-database rollback policy already lives in
  [`../CI_CD.md`](../CI_CD.md).

## Safety Rule

Do not mix user-data edits, seed changes, or production cleanup into ordinary
schema migrations. Use a separately reviewed and recoverable data process.
