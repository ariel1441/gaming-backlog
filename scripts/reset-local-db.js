import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Client } = pg;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const allowRemote = process.argv.includes("--allow-remote");

function assertLocalDatabase(value) {
  if (!value) {
    throw new Error("DATABASE_URL is required.");
  }

  const parsed = new URL(value);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(parsed.hostname) && !allowRemote) {
    throw new Error(
      `Refusing to reset non-local database host "${parsed.hostname}".`
    );
  }
}

async function readSql(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

assertLocalDatabase(process.env.DATABASE_URL);

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(await readSql("backend/schema.sql"));
  await client.query(await readSql("backend/seed.sql"));
  console.log("Local database reset complete.");
} finally {
  await client.end();
}
