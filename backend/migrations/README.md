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

`028_add_steam_daily_sync_foundation.sql` extends that queue with linked generic
run history, persistent private activity-review events, and the per-account
Steam daily-sync opt-in. It does not add wishlist or store-price data.

`029_add_steam_sync_job_lease_token.sql` adds per-claim ownership fencing to the
Steam sync queue so lease recovery cannot leave two workers able to finalize the
same job.

`030_add_steam_wishlist.sql` adds private wishlist relationships, safe legacy
status backfill, per-domain account health, and a wishlist discriminator on the
existing Steam queue. It does not create backlog games for synced wishlist apps.

`031_harden_steam_wishlist_sync.sql` adds explicit provider order, metadata
provenance, incremental ownership evidence and queued Steam account identity.
Apply it before running the hardened sync code; it preserves migration 030 and
existing membership/local intentions.

`032_add_steam_achievement_follow_up.sql` adds durable pending achievement work,
retry timing and source revisions. Apply it before the A/B closeout service code.
It only adds columns/indexes; it does not backfill or replace saved Steam data.

`049_add_activity_foundation.sql` preserves the existing Steam observation ledger,
corrects observation boundaries only from saved job snapshot evidence, and records
explicit baseline/daily/uncertain precision plus the canonical 05:00 Jerusalem
activity day. Legacy rows without snapshot evidence remain retained and uncertain.

`050_add_detailed_activity_events.sql` adds account-fenced named Steam achievement
unlocks with raw provider timestamps and a per-source detailed-event baseline. It
freezes the transition timestamp for existing Steam sources, does not announce
older unlocks from the first detailed achievement fetch, and retains post-boundary
timestamps as new exact events. It also adds the nullable
daily-closeout idempotency key/index used by the guarded Railway command.

Future automation notes live in
`docs/planning/production-migration-automation.md`.
