const VISIBLE_SCALARS = new Set([
  "NODE_ENV",
  "PORT",
  "VITE_API_BASE_URL",
  "PGSSL",
  "MICROCACHE_TTL_MS",
  "DEMO_ENABLED",
  "DEMO_GUEST_TTL_HOURS",
  "CATALOG_AUTO_SEED",
  "CATALOG_SEED_LIMIT",
  "RAWG_TIMEOUT_MS",
  "RAWG_MAX_RESPONSE_BYTES",
  "RAWG_CACHE_MAX_ENTRIES",
  "PUBLIC_RAWG_CONCURRENCY",
  "PUBLIC_RAWG_HYDRATE_LIMIT",
  "STEAM_DEV_SYNC_SAMPLE",
  "STEAM_TIMEOUT_MS",
  "STEAM_MAX_RESPONSE_BYTES",
  "STEAM_SYNC_CHUNK_SIZE",
  "ALLOW_REMOTE_DB_IN_DEV",
]);

export function redactEnvironmentValue(key, value) {
  if (!value) return "<missing>";
  if (key === "DATABASE_URL") {
    try {
      const parsed = new URL(value);
      return `${parsed.protocol}//***@${parsed.host}${parsed.pathname}`;
    } catch {
      return "<invalid>";
    }
  }
  if (VISIBLE_SCALARS.has(key)) return value;
  return `<set: ${Buffer.byteLength(value, "utf8")} bytes>`;
}
