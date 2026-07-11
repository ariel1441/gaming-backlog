# Production Migration: Remaining Improvements

Last updated: 2026-07-11

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
- Add a documented backup/Railway checkpoint before production migrations.
- Add a staging database and run production-like migrations there first.
- Enforce expand/deploy/backfill/cleanup sequencing for large refactors.
- Add migration-failure alerts.
- Add rollback notes for risky migrations.
- Add a preflight/CI check that detects schema-changing migrations without the
  equivalent `backend/schema.sql` update.
- Make migration bootstrapping fail safely for existing databases.
- Reconcile migration history, schema parity, and the schema-only policy.

## Safety Rule

Do not mix user-data edits, seed changes, or production cleanup into ordinary
schema migrations. Use a separately reviewed and recoverable data process.
