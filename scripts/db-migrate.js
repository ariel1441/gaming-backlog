import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

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

function buildPgConfig(connectionString) {
  const forceEnableSSL =
    String(process.env.PGSSL || "").toLowerCase() === "true";
  const forceDisableSSL =
    String(process.env.PGSSL || "").toLowerCase() === "false";
  const needSSL =
    forceEnableSSL ||
    (!forceDisableSSL &&
    (/sslmode=require/i.test(connectionString || "") ||
      /(railway|heroku|neon|supabase|render|azure|amazonaws|cockroach|gcp)/i.test(
        connectionString || ""
      )));

  return {
    connectionString,
    ssl: needSSL ? { rejectUnauthorized: false } : undefined,
  };
}

const files = (await fs.readdir(migrationsDir))
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort();

const client = new Client(buildPgConfig(process.env.DATABASE_URL));

try {
  await client.connect();
  console.log(`Migration target: ${mode} ${describeDbUrl(process.env.DATABASE_URL)}`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const applied = await client.query("SELECT filename FROM schema_migrations");
  const appliedFiles = new Set(applied.rows.map((row) => row.filename));
  const pendingFiles = files.filter((file) => !appliedFiles.has(file));

  if (statusOnly) {
    if (pendingFiles.length === 0) {
      console.log("No pending migrations.");
    } else {
      console.log("Pending migrations:");
      for (const file of pendingFiles) console.log(`- ${file}`);
    }
    process.exitCode = 0;
  } else {
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

    console.log(`${mode} migrations complete.`);
  }
} finally {
  await client.end();
}
