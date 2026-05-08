import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const args = new Set(process.argv.slice(2));
const mode = args.has("--production") ? "production" : "local";

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

const files = (await fs.readdir(migrationsDir))
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort();

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const applied = await client.query("SELECT filename FROM schema_migrations");
  const appliedFiles = new Set(applied.rows.map((row) => row.filename));

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

  console.log(`${mode} migrations complete.`);
} finally {
  await client.end();
}
