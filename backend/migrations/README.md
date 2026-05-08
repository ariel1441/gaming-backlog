# Database Migrations

Put intentional schema changes here before applying them to production.

Suggested naming:

```text
001_add_example_table.sql
002_add_game_indexes.sql
```

Keep `backend/schema.sql` as the full fresh-install schema. Keep migrations as
the step-by-step history for existing databases.

The migration runner stores applied filenames in `schema_migrations`.

Use:

```bash
npm run db:migrate:local
```

Production migrations are run by GitHub Actions on pushes to `main` when the
`PROD_DATABASE_URL` repository secret is configured.

Migrations should be schema-only and backward-compatible. Do not put production
data copies or seed data here.
