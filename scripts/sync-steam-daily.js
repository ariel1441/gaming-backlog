import "dotenv/config";
import { pathToFileURL } from "node:url";
import { pool } from "../backend/db.js";
import {
  enqueueSteamSync,
  listEligibleSteamAutoSyncUsers,
  waitForSteamSyncJob,
} from "../backend/services/steamLibrarySyncService.js";

export async function runDailySteamSync({
  listUsers = listEligibleSteamAutoSyncUsers,
  enqueue = enqueueSteamSync,
  waitForJob = waitForSteamSyncJob,
  logger = console,
} = {}) {
  const userIds = await listUsers();
  const totals = {
    eligible: userIds.length,
    succeeded: 0,
    partial: 0,
    failed: 0,
    skipped: 0,
  };

  for (const userId of userIds) {
    try {
      const queued = await enqueue(userId, {
        trigger: "scheduled",
        force: false,
      });
      const job = await waitForJob(userId, queued.id);
      const runStatus = job?.result?.run?.status || job?.run?.status;
      if (job?.status === "failed") totals.failed += 1;
      else if (runStatus === "partial") totals.partial += 1;
      else if (runStatus === "skipped") totals.skipped += 1;
      else if (runStatus === "succeeded") totals.succeeded += 1;
      else totals.failed += 1;
    } catch (error) {
      totals.failed += 1;
      logger.error(
        `Steam daily sync failed for user ${userId}: ${error?.message || error}`,
      );
    }
  }

  logger.log(
    `Steam daily sync: eligible=${totals.eligible} succeeded=${totals.succeeded} partial=${totals.partial} skipped=${totals.skipped} failed=${totals.failed}`,
  );
  return totals;
}

async function main() {
  try {
    const totals = await runDailySteamSync();
    process.exitCode = totals.failed ? 1 : 0;
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  await main();
}
