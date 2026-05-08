import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Client } = pg;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(root, "backend", "migrations");

function assertLocalDatabase(value) {
  if (!value) {
    throw new Error("DATABASE_URL is required.");
  }

  const parsed = new URL(value);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(`Refusing to migrate non-local database "${parsed.host}".`);
  }
}

assertLocalDatabase(process.env.DATABASE_URL);

const files = (await fs.readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}`);
    await client.query(sql);
  }
  console.log("Local migrations complete.");
} finally {
  await client.end();
}
