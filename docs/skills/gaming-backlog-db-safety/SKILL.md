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

For schema changes:

1. `npm run db:migrate:local`
2. `npm run check` when practical

For production-derived data:

1. confirm source/target
2. confirm read/write direction
3. confirm ignore path
4. summarize what was copied without exposing secrets or private values
