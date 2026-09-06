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
    library: { succeeded: 0, partial: 0, failed: 0, skipped: 0 },
    wishlist: { succeeded: 0, partial: 0, failed: 0, skipped: 0 },
  };

  for (const { userId, accountId } of userIds) {
    for (const syncKind of ["library", "wishlist"]) {
      try {
        const queued = await enqueue(userId, { trigger: "scheduled", force: false, syncKind, expectedAccountId: accountId });
        if (!queued) { totals[syncKind].skipped += 1; continue; }
        const job = await waitForJob(userId, queued.id);
        const runStatus = job?.result?.run?.status || job?.run?.status;
        if (job?.status === "failed") totals[syncKind].failed += 1;
        else if (["partial", "skipped", "succeeded"].includes(runStatus)) totals[syncKind][runStatus] += 1;
        else totals[syncKind].failed += 1;
      } catch (error) {
        totals[syncKind].failed += 1;
        logger.error(`Steam ${syncKind} daily sync failed for user ${userId}: ${error?.message || error}`);
      }
    }
  }

  logger.log(
    `Steam daily sync: eligible=${totals.eligible} library=${JSON.stringify(totals.library)} wishlist=${JSON.stringify(totals.wishlist)}`,
  );
  return totals;
}

async function main() {
  try {
    const totals = await runDailySteamSync();
    process.exitCode = totals.library.failed || totals.wishlist.failed ? 1 : 0;
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  await main();
}
