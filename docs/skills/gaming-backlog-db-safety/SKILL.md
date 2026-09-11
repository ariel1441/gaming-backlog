---
name: gaming-backlog-db-safety
description: Use for migrations, schema changes, production-derived data, local DB sync, exports, backups, and database safety decisions.
---

# Gaming Backlog DB Safety

## Use When

- The task touches migrations, `backend/schema.sql`, production/local database
  data, exports, backups, or data-copy scripts.

## Rules

- Production schema changes go in `backend/migrations/*.sql`.
- Keep `backend/schema.sql` in sync.
- Prefer additive, backward-compatible migrations.
- Do not put seed/demo/user data changes in migrations unless explicitly asked.
- Local development must use localhost Postgres unless remote DB access is
  deliberately enabled.
- Before creating backups, exports, dumps, or production-derived files, verify
  the output path is ignored by git.
- Use generic filenames without usernames or private account identifiers.

## Verification

Follow [the shared verification policy](../../VERIFICATION.md); the notes below
identify task-specific coverage, not additional automatic test runs.

For schema changes:

1. Exercise the migration runner once at the final checkpoint against disposable
   localhost data. A contract that invokes `scripts/db-migrate.js` satisfies this;
   do not repeat it against the ordinary development DB just to run the npm alias.
2. Cover upgrade compatibility, idempotency and data preservation where relevant.
   Reuse that contract's coverage; add focused checks only for uncovered risks.
3. Rely on CI for the full suite unless the task explicitly requires a local
   full gate.

For production-derived data:

1. confirm source/target
2. confirm read/write direction
3. confirm ignore path
4. summarize what was copied without exposing secrets or private values
