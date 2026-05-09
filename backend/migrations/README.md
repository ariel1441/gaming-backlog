# Database Migrations

Status: maintained migration guide.

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
npm run db:migrate:status
```

Production migrations are run by GitHub Actions on pushes to `main` when the
`PROD_DATABASE_URL` repository secret is configured. The workflow runs after CI
passes, shows pending migrations, then applies them through:

```bash
npm run db:migrate:prod
```

The production job uses the `production` GitHub Environment, so repository
owners can add required reviewers or environment protection rules in GitHub
without changing the workflow. Production migration runs are serialized with a
workflow concurrency group, and the migration script also uses a Postgres
advisory lock so two migration processes cannot apply files at the same time.

Useful production status command:

```bash
npm run db:migrate:prod:status
```

Migrations should be schema-only and backward-compatible. Do not put production
data copies or seed data here.

For safe deploys, prefer additive changes first, deploy code that tolerates both
old and new schema when practical, then clean up obsolete schema in a later
migration.
