import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

const args = new Set(process.argv.slice(2));
const confirmed =
  args.has("--confirm-local-overwrite") ||
  String(process.env.CONFIRM_LOCAL_DB_OVERWRITE).toLowerCase() === "true";

if (!confirmed) {
  throw new Error(
    "Refusing to overwrite local DB without --confirm-local-overwrite."
  );
}

const localEnv = dotenv.config({ path: ".env" }).parsed || {};
const prodEnv =
  dotenv.config({ path: ".env.production.local", override: true }).parsed || {};

const localUrl = localEnv.DATABASE_URL;
const prodUrl = prodEnv.DATABASE_URL || process.env.PROD_DATABASE_URL;

function parseDbUrl(value, label) {
  if (!value) {
    throw new Error(`${label} DATABASE_URL is required.`);
  }
  return new URL(value);
}

const local = parseDbUrl(localUrl, "Local");
const prod = parseDbUrl(prodUrl, "Production");
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

if (!localHosts.has(local.hostname)) {
  throw new Error(`Local target must be localhost, got "${local.host}".`);
}

if (localHosts.has(prod.hostname)) {
  throw new Error("Production source must not be localhost.");
}

function dbArgs(url) {
  return [
    "-h",
    url.hostname,
    "-p",
    String(url.port || 5432),
    "-U",
    decodeURIComponent(url.username),
    "-d",
    decodeURIComponent(url.pathname.slice(1)),
  ];
}

function command(name, args, url) {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        PGPASSWORD: decodeURIComponent(url.password),
      },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} exited with code ${code}`));
    });
  });
}

const dumpFile = path.join(os.tmpdir(), `gaming-backlog-prod-${Date.now()}.dump`);

try {
  console.log("Dumping production database...");
  await command(
    "pg_dump",
    [...dbArgs(prod), "--format=custom", "--no-owner", "--no-acl", "-f", dumpFile],
    prod
  );

  console.log("Resetting local public schema...");
  await command(
    "psql",
    [
      ...dbArgs(local),
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    ],
    local
  );

  console.log("Restoring production dump into local database...");
  await command(
    "pg_restore",
    [...dbArgs(local), "--no-owner", "--no-acl", dumpFile],
    local
  );

  console.log("Production data copied to local database.");
} finally {
  await fs.rm(dumpFile, { force: true });
}
