import dotenv from "dotenv";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const production = args.has("--production");

dotenv.config({
  path: production && !process.env.DATABASE_URL ? ".env.production.local" : ".env",
  override: production && !process.env.DATABASE_URL,
});

function assertSafeTarget(value) {
  if (!value) throw new Error("DATABASE_URL is required.");
  const parsed = new URL(value);
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (!production && !local) {
    throw new Error(`Refusing to repair non-local database "${parsed.host}".`);
  }
  if (production) {
    if (local) throw new Error("Production repair target must not be localhost.");
    const confirmed =
      args.has("--confirm-production") &&
      String(process.env.CONFIRM_PROD_EXACT_LINK_REPAIR).toLowerCase() === "true";
    if (!confirmed) {
      throw new Error(
        "Production apply requires --confirm-production and CONFIRM_PROD_EXACT_LINK_REPAIR=true.",
      );
    }
  }
}

assertSafeTarget(process.env.DATABASE_URL);

const { pool } = await import("../backend/db.js");
const { auditExactMetadataLinks, repairExactMetadataLinks } = await import(
  "../backend/services/exactMetadataRepairService.js"
);

try {
  if (!apply) {
    const audit = await auditExactMetadataLinks(pool);
    console.log(JSON.stringify({ mode: "dry-run", ...audit }));
  } else {
    const result = await repairExactMetadataLinks(pool);
    console.log(
      JSON.stringify({
        mode: production ? "production-apply" : "local-apply",
        ...result,
      }),
    );
  }
} finally {
  await pool.end();
}
