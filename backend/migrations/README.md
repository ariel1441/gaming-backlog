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

Production migrations are run by GitHub Actions on pushes to `main`. A missing
`PROD_DATABASE_URL` fails the protected production job. The workflow runs after CI
passes, connects with SSL enabled through `PGSSL=true`, shows pending
migrations, then applies them through:

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

Migrations should be backward-compatible. Minimal deterministic, schema-coupled
reference data or backfills are allowed when required to make new schema valid,
idempotent, bounded, and explicitly reviewed. Do not put production data copies,
demo content, or user-specific seed data here.

`000_core_baseline.sql` is the adoption-safe production bootstrap. It creates
only the historical core tables when missing and inserts status reference values
required by foreign keys. Never add destructive statements to it.

Status commands are read-only. If `schema_migrations` is absent they report all
migrations pending without creating metadata.

For safe deploys, prefer additive changes first, deploy code that tolerates both
old and new schema when practical, then clean up obsolete schema in a later
migration.

`018_add_steam_sync_jobs.sql` adds the durable, checkpointed Steam library sync
queue. Deploy this migration before application code that serves
`POST /api/steam/sync`.

Future automation notes live in
`docs/planning/production-migration-automation.md`.
