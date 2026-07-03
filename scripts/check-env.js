import dotenv from "dotenv";

dotenv.config();

const required = [
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "JWT_SECRET",
  "VITE_API_BASE_URL",
];

const optional = [
  "RAWG_API_KEY",
  "PGSSL",
  "ALLOWED_ORIGINS",
  "ALLOWED_ORIGIN_SUFFIXES",
  "MICROCACHE_TTL_MS",
  "DEMO_ENABLED",
  "DEMO_TEMPLATE_USERNAME",
  "DEMO_GUEST_TTL_HOURS",
  "CATALOG_AUTO_SEED",
  "CATALOG_SEED_LIMIT",
  "STEAM_WEB_API_KEY",
  "STEAM_OPENID_RETURN_URL",
  "STEAM_OPENID_REALM",
  "STEAM_MOCK_OWNED_GAMES_JSON",
  "STEAM_DEV_SYNC_SAMPLE",
];

function redact(key, value) {
  if (!value) return "<missing>";
  if (/SECRET|KEY|TOKEN|PASSWORD/i.test(key)) return "<set>";
  if (key === "DATABASE_URL") {
    try {
      const parsed = new URL(value);
      const user = parsed.username || "user";
      return `${parsed.protocol}//${user}:***@${parsed.host}${parsed.pathname}`;
    } catch {
      return "<invalid>";
    }
  }
  return value;
}

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
  console.log(`- ${key}: ${redact(key, process.env[key])}`);
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
