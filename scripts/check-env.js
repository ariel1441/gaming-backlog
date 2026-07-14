import dotenv from "dotenv";
import { redactEnvironmentValue } from "./env-summary.js";

dotenv.config();

const required = [
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "JWT_SECRET",
];

const optional = [
  "RAWG_API_KEY",
  "DB_USER",
  "DB_HOST",
  "DB_NAME",
  "DB_PASSWORD",
  "DB_PORT",
  "PGSSL",
  "PGSSL_CA",
  "PGSSL_CA_FILE",
  "PGSSL_ALLOW_UNVERIFIED_DEV",
  "VITE_API_BASE_URL",
  "VITE_FRONTEND_BASE_URL",
  "VITE_PORT",
  "FRONTEND_BASE_URL",
  "APP_BASE_URL",
  "ALLOWED_ORIGINS",
  "ALLOWED_ORIGIN_SUFFIXES",
  "MICROCACHE_TTL_MS",
  "MICROCACHE_MAX_KEYS",
  "RAWG_FAIL_TTL_MS",
  "RAWG_TIMEOUT_MS",
  "RAWG_MAX_RESPONSE_BYTES",
  "RAWG_CACHE_MAX_ENTRIES",
  "RAWG_INGEST_CONCURRENCY",
  "METADATA_REPAIR_PROVIDER_BUDGET",
  "METADATA_REPAIR_INTERVAL_MS",
  "METADATA_REFRESH_ENABLED",
  "METADATA_REFRESH_PROVIDER_BUDGET",
  "METADATA_REFRESH_MAX_ITEMS",
  "METADATA_REFRESH_INTERVAL_MS",
  "HLTB_DATA_PATH",
  "HLTB_UNITS",
  "DEMO_ENABLED",
  "DEMO_TEMPLATE_USERNAME",
  "DEMO_GUEST_TTL_HOURS",
  "CATALOG_AUTO_SEED",
  "CATALOG_SEED_LIMIT",
  "STEAM_WEB_API_KEY",
  "STEAM_OPENID_RETURN_URL",
  "STEAM_OPENID_REALM",
  "STEAM_FRONTEND_RETURN_URL",
  "STEAM_MOCK_OWNED_GAMES_JSON",
  "STEAM_MOCK_PLAYER_SUMMARY_JSON",
  "STEAM_DEV_SYNC_SAMPLE",
  "STEAM_TIMEOUT_MS",
  "STEAM_MAX_RESPONSE_BYTES",
  "STEAM_SYNC_CHUNK_SIZE",
  "ALLOW_REMOTE_DB_IN_DEV",
  "CONFIRM_LOCAL_DB_OVERWRITE",
  "CONFIRM_PROD_MIGRATIONS",
];

function isLocalDatabase(value) {
  try {
    const parsed = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

let failed = false;

console.log("Environment summary:");
for (const key of [...required, ...optional]) {
  console.log(`- ${key}: ${redactEnvironmentValue(key, process.env[key])}`);
}

for (const key of required) {
  if (!process.env[key]) {
    failed = true;
    console.error(`Missing required env var: ${key}`);
  }
}

if (
  process.env.NODE_ENV !== "production" &&
  process.env.DATABASE_URL &&
  !isLocalDatabase(process.env.DATABASE_URL) &&
  String(process.env.ALLOW_REMOTE_DB_IN_DEV).toLowerCase() !== "true"
) {
  failed = true;
  console.error(
    "Development DATABASE_URL is not localhost. Refusing because this can modify live data."
  );
}

process.exit(failed ? 1 : 0);
