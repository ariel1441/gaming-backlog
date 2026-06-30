import { pool } from "../backend/db.js";
import {
  CATALOG_COLLECTIONS,
  seedCatalogCollections,
} from "../backend/services/catalogService.js";

const args = new Map();
for (const rawArg of process.argv.slice(2)) {
  if (!rawArg || rawArg === "--") continue;
  const arg = rawArg.replace(/^--/, "");
  const [key, value = "true"] = arg.split("=");
  if (key) args.set(key, value);
}

const limit = Number(args.get("limit") || process.env.npm_config_limit || 24);
const only = args.get("only") || process.env.npm_config_only || "";

try {
  console.log(
    `Seeding catalog collections: ${only || CATALOG_COLLECTIONS.map((c) => c.key).join(", ")}`
  );
  const results = await seedCatalogCollections({ limit, only });
  for (const result of results) {
    if (result.error) {
      console.log(`- ${result.key}: failed (${result.error})`);
    } else {
      console.log(`- ${result.key}: ${result.count} games`);
    }
  }
} finally {
  await pool.end();
}
