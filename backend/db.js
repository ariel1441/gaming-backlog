// backend/db.js
import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";
import { buildPgConfig } from "./config/pg.js";
const { Pool, types } = pkg;

// Keep DATE (OID 1082) as string (YYYY-MM-DD)
types.setTypeParser(1082, (val) => val);

const connectionString = process.env.DATABASE_URL;

function isLocalHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(
    String(hostname || "").toLowerCase()
  );
}

function describeConnectionString(value) {
  try {
    const parsed = new URL(value);
    const user = parsed.username || "user";
    return `${parsed.protocol}//${user}:***@${parsed.host}${parsed.pathname}`;
  } catch {
    return "<invalid DATABASE_URL>";
  }
}

function assertSafeDevelopmentDatabase(value) {
  if (!value || process.env.NODE_ENV === "production") return;
  if (String(process.env.ALLOW_REMOTE_DB_IN_DEV).toLowerCase() === "true") {
    return;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return;
  }

  if (!isLocalHost(parsed.hostname)) {
    throw new Error(
      [
        "Refusing to start development server with a remote DATABASE_URL.",
        `Current DB: ${describeConnectionString(value)}`,
        "Use a localhost Postgres database for normal development, or set ALLOW_REMOTE_DB_IN_DEV=true for a deliberate one-off task.",
      ].join(" ")
    );
  }
}

assertSafeDevelopmentDatabase(connectionString);

export const pool = connectionString
  ? new Pool(buildPgConfig(connectionString))
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST || "localhost",
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT || 5432),
    });

// Helpful log in dev to confirm which DB you're using
if (process.env.NODE_ENV !== "production" && connectionString) {
  console.log("[DB] Using", describeConnectionString(connectionString));
}
