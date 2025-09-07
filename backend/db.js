// backend/db.js
import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";
const { Pool, types } = pkg;

// Keep DATE (OID 1082) as string (YYYY-MM-DD)
types.setTypeParser(1082, (val) => val);

const connectionString = process.env.DATABASE_URL;

// Allow forcing SSL off with PGSSL=false (rare, mostly for local DBs)
const forceDisableSSL =
  String(process.env.PGSSL || "").toLowerCase() === "false";

// Auto-detect when SSL is needed (Railway/managed PG or sslmode=require in URL)
const needSSL =
  !forceDisableSSL &&
  (/sslmode=require/i.test(connectionString || "") ||
    /(railway|heroku|neon|supabase|render|azure|amazonaws|cockroach|gcp)/i.test(
      connectionString || ""
    ));

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: needSSL ? { rejectUnauthorized: false } : undefined,
    })
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST || "localhost",
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT || 5432),
    });

// Helpful log in dev to confirm which DB you're using
if (process.env.NODE_ENV !== "production" && connectionString) {
  const redacted = connectionString.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@");
  console.log("[DB] Using", redacted);
}
