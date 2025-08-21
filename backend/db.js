// backend/db.js
import dotenv from "dotenv";
dotenv.config();
import pkg from "pg";

const { Pool, types } = pkg;

// Keep DATE (OID 1082) as string (YYYY-MM-DD)
types.setTypeParser(1082, (val) => val);

// Prefer a single connection string (Railway/Neon/Supabase/etc.)
// Fallback to discrete DB_* vars for local dev.
const connectionString = process.env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({
      connectionString,
      // Most managed PG require TLS. In prod, enable SSL; allow override via PGSSL=false.
      ssl:
        process.env.PGSSL === "false"
          ? false
          : process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,
    })
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST || "localhost",
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT || 5432),
    });
