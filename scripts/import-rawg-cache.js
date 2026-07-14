import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import dotenv from "dotenv";

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => !arg.includes("=")));
const apply = flags.has("--apply");
const production = flags.has("--production");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name, fallback) {
  const prefix = `${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function positiveInt(value, fallback, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, max)
    : fallback;
}

function parseDbUrl(value) {
  if (!value) throw new Error("DATABASE_URL is required in apply mode.");
  return new URL(value);
}

function assertSafeTarget(value) {
  const parsed = parseDbUrl(value);
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (!production && !local) {
    throw new Error(`Refusing to import into non-local database "${parsed.host}".`);
  }
  if (production) {
    if (local) throw new Error("Production import target must not be localhost.");
    const confirmed =
      flags.has("--confirm-production") &&
      String(process.env.CONFIRM_PROD_METADATA_IMPORT).toLowerCase() === "true";
    if (!confirmed) {
      throw new Error(
        "Production apply requires --confirm-production and CONFIRM_PROD_METADATA_IMPORT=true.",
      );
    }
  }
}

async function assertIgnoredIfInsideRepo(file) {
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return;
  try {
    await execFileAsync("git", ["check-ignore", "--quiet", "--", relative], {
      cwd: root,
    });
  } catch {
    throw new Error(`Refusing to use non-ignored repository file "${relative}".`);
  }
}

async function writeCheckpoint(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8");
  await fs.rename(temporary, file);
}

dotenv.config({
  path: production && !process.env.DATABASE_URL ? ".env.production.local" : ".env",
  override: production && !process.env.DATABASE_URL,
});

const sourceFile = path.resolve(
  root,
  option("--file", "backend/data/cached_rawg_data.json"),
);
const checkpointFile = path.resolve(
  root,
  option("--checkpoint", "backend/data/rawg-import-checkpoint.json"),
);
const batchSize = positiveInt(option("--batch-size", "10"), 10, 50);

await assertIgnoredIfInsideRepo(sourceFile);
await assertIgnoredIfInsideRepo(checkpointFile);

const sourceBytes = await fs.readFile(sourceFile);
const sourceStat = await fs.stat(sourceFile);
const sourceFingerprint = crypto.createHash("sha256").update(sourceBytes).digest("hex");
const cache = JSON.parse(sourceBytes.toString("utf8"));
const {
  buildHistoricalRawgImportPlan,
  executeHistoricalRawgImport,
} = await import("../backend/services/historicalRawgImportService.js");
const plan = buildHistoricalRawgImportPlan(cache, {
  sourceObservedAt: sourceStat.mtime,
});

if (!apply) {
  console.log(
    JSON.stringify({
      mode: "dry-run",
      ...plan.report,
      databaseContacted: false,
      nextAction: "Re-run with --apply to target localhost PostgreSQL.",
    }),
  );
} else {
  assertSafeTarget(process.env.DATABASE_URL);
  let checkpoint = null;
  if (flags.has("--reset-checkpoint")) {
    await fs.rm(checkpointFile, { force: true });
  } else {
    try {
      checkpoint = JSON.parse(await fs.readFile(checkpointFile, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  if (checkpoint && checkpoint.sourceFingerprint !== sourceFingerprint) {
    throw new Error(
      "Checkpoint belongs to a different source file; review and use --reset-checkpoint.",
    );
  }

  const { ingestRawgMetadataSnapshot } = await import(
    "../backend/services/metadataIngestionService.js"
  );
  const { pool } = await import("../backend/db.js");
  try {
    const result = await executeHistoricalRawgImport({
      items: plan.items,
      ingestSnapshot: ingestRawgMetadataSnapshot,
      startAfterRawgId: Number(checkpoint?.lastRawgId) || 0,
      batchSize,
      onBatchComplete: async (progress) => {
        await writeCheckpoint(checkpointFile, {
          sourceFingerprint,
          lastRawgId: progress.lastRawgId,
          imported: progress.imported,
          snapshotsStored: progress.snapshotsStored,
          updatedAt: new Date().toISOString(),
        });
      },
    });
    console.log(
      JSON.stringify({
        mode: production ? "production-apply" : "local-apply",
        distinctRawgIds: plan.report.distinctRawgIds,
        ...result,
      }),
    );
  } finally {
    await pool.end();
  }
}
