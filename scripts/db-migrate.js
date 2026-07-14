import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { buildPgConfig } from "../backend/config/pg.js";

const args = new Set(process.argv.slice(2));
const mode = args.has("--production") ? "production" : "local";
const statusOnly = args.has("--status") || args.has("--dry-run");
const MIGRATION_LOCK_ID = 42424291;

dotenv.config({
  path:
    mode === "production" && !process.env.DATABASE_URL
      ? ".env.production.local"
      : ".env",
});

const { Client } = pg;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(root, "backend", "migrations");

function parseDbUrl(value) {
  if (!value) {
    throw new Error("DATABASE_URL is required.");
  }
  return new URL(value);
}

function assertMigrationTarget(value) {
  const parsed = parseDbUrl(value);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isLocal = localHosts.has(parsed.hostname);

  if (mode === "local" && !isLocal) {
    throw new Error(`Refusing to migrate non-local database "${parsed.host}".`);
  }

  if (mode === "production") {
    const confirmed =
      args.has("--confirm-production") ||
      String(process.env.CONFIRM_PROD_MIGRATIONS).toLowerCase() === "true";
    if (!confirmed) {
      throw new Error(
        "Refusing to migrate production without --confirm-production or CONFIRM_PROD_MIGRATIONS=true."
      );
    }
    if (isLocal) {
      throw new Error("Production migration target must not be localhost.");
    }
  }
}

assertMigrationTarget(process.env.DATABASE_URL);

function describeDbUrl(value) {
  const parsed = parseDbUrl(value);
  return `${parsed.protocol}//${parsed.username || "user"}:***@${parsed.host}${parsed.pathname}`;
}

const files = (await fs.readdir(migrationsDir))
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort();

const client = new Client(buildPgConfig(process.env.DATABASE_URL));

try {
  await client.connect();
  console.log(`Migration target: ${mode} ${describeDbUrl(process.env.DATABASE_URL)}`);

  if (statusOnly) {
    let appliedFiles = new Set();
    try {
      const applied = await client.query("SELECT filename FROM schema_migrations");
      appliedFiles = new Set(applied.rows.map((row) => row.filename));
    } catch (error) {
      if (error?.code !== "42P01") throw error;
      console.log("Migration metadata table is missing; status made no changes.");
    }
    const pendingFiles = files.filter((file) => !appliedFiles.has(file));
    if (pendingFiles.length === 0) {
      console.log("No pending migrations.");
    } else {
      console.log("Pending migrations:");
      for (const file of pendingFiles) console.log(`- ${file}`);
    }
    process.exitCode = 0;
  } else {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const applied = await client.query("SELECT filename FROM schema_migrations");
    const appliedFiles = new Set(applied.rows.map((row) => row.filename));

    const lock = await client.query(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [MIGRATION_LOCK_ID]
    );
    if (!lock.rows[0]?.locked) {
      throw new Error(
        "Another migration process is already running. Refusing to run concurrently."
      );
    }

    try {
      for (const file of files) {
        if (appliedFiles.has(file)) {
          console.log(`Skipping ${file}`);
          continue;
        }

        const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
        console.log(`Applying ${file}`);

        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query(
            "INSERT INTO schema_migrations (filename) VALUES ($1)",
            [file]
          );
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    }

    const verified = await client.query(
      `
      SELECT
        to_regclass('users') IS NOT NULL AS has_users,
        to_regclass('games') IS NOT NULL AS has_games,
        to_regclass('schema_migrations') IS NOT NULL AS has_metadata,
        to_regclass('catalog_provider_snapshots') IS NOT NULL AS has_provider_snapshots,
        to_regclass('metadata_jobs') IS NOT NULL AS has_metadata_jobs,
        to_regclass('game_metadata_candidates') IS NOT NULL AS has_metadata_candidates,
        EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'games'
             AND column_name = 'cover'
        ) AS games_has_cover,
        EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'games'
             AND column_name = 'position'
             AND is_nullable = 'NO'
             AND column_default IS NOT NULL
        ) AS games_position_ready,
        EXISTS (
          SELECT 1
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON kcu.constraint_schema = tc.constraint_schema
             AND kcu.constraint_name = tc.constraint_name
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_schema = tc.constraint_schema
             AND ccu.constraint_name = tc.constraint_name
           WHERE tc.table_schema = 'public'
             AND tc.table_name = 'games'
             AND tc.constraint_type = 'FOREIGN KEY'
             AND kcu.column_name = 'status'
             AND ccu.table_name = 'statuses'
             AND ccu.column_name = 'status'
        ) AS games_has_status_fk,
        (
          SELECT COUNT(*) = 6
            FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'catalog_games'
             AND column_name IN (
               'cover_source',
               'cover_external_id',
               'cover_pinned',
               'metadata_normalization_version',
               'metadata_next_refresh_at',
               'metadata_retired_at'
             )
        ) AS catalog_metadata_foundation_ready,
        (SELECT COUNT(*)::int FROM schema_migrations) AS applied_count
      `,
    );
    const state = verified.rows[0];
    if (
      !state?.has_users ||
      !state?.has_games ||
      !state?.has_metadata ||
      !state?.games_has_cover ||
      !state?.games_position_ready ||
      !state?.games_has_status_fk ||
      !state?.has_provider_snapshots ||
      !state?.has_metadata_jobs ||
      !state?.has_metadata_candidates ||
      !state?.catalog_metadata_foundation_ready ||
      Number(state.applied_count) !== files.length
    ) {
      throw new Error("Post-migration schema/version verification failed.");
    }

    console.log(`${mode} migrations complete.`);
  }
} finally {
  await client.end();
}
