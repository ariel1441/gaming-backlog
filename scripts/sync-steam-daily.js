import "dotenv/config";
import { pathToFileURL } from "node:url";
import { pool } from "../backend/db.js";
import {
  gamingActivityCloseoutDay,
  isGamingActivityCloseoutHour,
} from "../backend/utils/gamingActivityDay.js";
import {
  enqueueSteamSync,
  listEligibleSteamAutoSyncUsers,
  waitForSteamSyncJob,
} from "../backend/services/steamLibrarySyncService.js";
import {
  beginDailyAutomationRun,
  failDailyAutomationRun,
  finishDailyAutomationAccount,
  finishDailyAutomationRun,
  registerDailyAutomationAccounts,
} from "../backend/services/dailyAutomationRunService.js";

function number(value) {
  return Math.max(0, Number(value) || 0);
}

export function dailyPhaseDiagnostics(syncKind, result = {}, run = {}) {
  const summary = result?.summary || run?.summary || {};
  if (syncKind === "library") {
    return {
      itemsSeen: number(summary.total ?? run?.itemsSeen),
      activityObservations: number(summary.activityObservations),
      activityBaselines: number(summary.activityBaselines),
      activityDailyObservations: number(summary.activityDailyObservations),
      activityUncertainObservations: number(summary.activityUncertainObservations),
      activityObservationChanges: number(summary.activityObservationChanges),
      reviewItemsCreated: number(summary.reviewItemsCreated),
      librarySnapshotSucceeded: Boolean(summary.librarySnapshotSucceeded),
      achievementFailures: number(summary.achievementFailures),
      achievementUnavailable: number(summary.achievementUnavailable),
      achievementSkipped: number(summary.achievementSkipped),
      achievementNewUnlocks: number(summary.achievementNewUnlocks),
      achievementBaselineUnlocks: number(summary.achievementBaselineUnlocks),
    };
  }
  if (syncKind === "wishlist") {
    return {
      itemsSeen: number(summary.total ?? run?.itemsSeen),
      added: number(summary.added),
      removed: number(summary.removed),
      priorityChanged: number(summary.priorityChanged),
      metadataComplete: Boolean(summary.metadata?.complete),
      metadataFailedPages: Array.isArray(summary.metadata?.failedPages)
        ? summary.metadata.failedPages.length
        : 0,
    };
  }
  return {
    itemsSeen: number(run?.itemsSeen),
    requests: number(summary.requests),
    succeeded: number(summary.succeeded),
    failed: number(summary.failed),
    changed: number(summary.changed),
    deferred: number(summary.deferred),
    pendingRetries: number(summary.pendingRetries),
    firstAttemptSelected: number(summary.firstAttemptSelected),
    firstAttemptDeferred: number(summary.firstAttemptDeferred),
    priceMode: summary.priceMode || "unknown",
    feedErrorCode: summary.feedErrorCode || null,
    reason: summary.reason || null,
    errorCounts: summary.errorCounts || {},
    retryScheduled: Boolean(summary.cooldownUntil),
  };
}

export async function runDailySteamSync({
  listUsers = listEligibleSteamAutoSyncUsers,
  enqueue = enqueueSteamSync,
  waitForJob = waitForSteamSyncJob,
  logger = console,
  now = () => Date.now(),
  onAccountsReady = async () => {},
  onAccountFinished = async () => {},
  dailyAutomationRunId = null,
} = {}) {
  const userIds = await listUsers();
  await onAccountsReady(userIds);
  const totals = {
    eligible: userIds.length,
    library: { succeeded: 0, partial: 0, failed: 0, skipped: 0 },
    wishlist: { succeeded: 0, partial: 0, failed: 0, skipped: 0 },
    wishlist_prices: { succeeded: 0, partial: 0, failed: 0, skipped: 0 },
  };

  const logPhase = (details) =>
    logger.log(`Steam daily phase: ${JSON.stringify(details)}`);

  for (const [accountIndex, { userId, accountId }] of userIds.entries()) {
    const accountTotals = {
      library: { succeeded: 0, partial: 0, failed: 0, skipped: 0 },
      wishlist: { succeeded: 0, partial: 0, failed: 0, skipped: 0 },
      wishlist_prices: { succeeded: 0, partial: 0, failed: 0, skipped: 0 },
    };
    const accountDetails = {};
    for (const syncKind of ["library", "wishlist", "wishlist_prices"]) {
      const phaseStartedAt = now();
      try {
        const options = { trigger: "scheduled", force: false, syncKind, expectedAccountId: accountId };
        if (dailyAutomationRunId) options.dailyAutomationRunId = dailyAutomationRunId;
        const queued = await enqueue(userId, options);
        if (!queued) {
          totals[syncKind].skipped += 1;
          accountTotals[syncKind].skipped += 1;
          accountDetails[syncKind] = { status: "skipped" };
          logPhase({ event: "skipped", accountIndex: accountIndex + 1, syncKind, elapsedMs: Math.max(0, now() - phaseStartedAt) });
          continue;
        }
        logPhase({ event: "started", accountIndex: accountIndex + 1, syncKind, jobId: queued.id });
        const job = await waitForJob(userId, queued.id);
        const runStatus = job?.result?.run?.status || job?.run?.status;
        if (job?.status === "failed") {
          totals[syncKind].failed += 1;
          accountTotals[syncKind].failed += 1;
        } else if (["partial", "skipped", "succeeded"].includes(runStatus)) {
          totals[syncKind][runStatus] += 1;
          accountTotals[syncKind][runStatus] += 1;
        } else {
          totals[syncKind].failed += 1;
          accountTotals[syncKind].failed += 1;
        }
        const result = job?.result || {};
        accountDetails[syncKind] = {
          status: runStatus || (job?.status === "failed" ? "failed" : "unknown"),
          diagnostics: dailyPhaseDiagnostics(syncKind, result, job?.run || result?.run),
          notificationDecisions: result?.notificationDecisions || null,
        };
        logPhase({
          event: "finished",
          accountIndex: accountIndex + 1,
          syncKind,
          jobId: queued.id,
          jobStatus: job?.status || "unknown",
          runStatus: runStatus || "unknown",
          elapsedMs: Math.max(0, now() - phaseStartedAt),
          newlyObserved: Number(result?.summary?.newlyObserved || 0),
          candidatesCreated: Number(result?.candidatesCreated || 0),
          notificationDecisions: result?.notificationDecisions || null,
          diagnostics: dailyPhaseDiagnostics(syncKind, result, job?.run || result?.run),
        });
      } catch (error) {
        totals[syncKind].failed += 1;
        accountTotals[syncKind].failed += 1;
        accountDetails[syncKind] = { status: "failed", errorCode: error?.code || "unknown" };
        logger.error(
          `Steam daily phase failed: ${JSON.stringify({
            accountIndex: accountIndex + 1,
            syncKind,
            elapsedMs: Math.max(0, now() - phaseStartedAt),
            errorCode: error?.code || "unknown",
          })}`,
        );
      }
    }
    await onAccountFinished({ userId, accountId, totals: accountTotals, details: accountDetails });
  }

  logger.log(
    `Steam daily sync: eligible=${totals.eligible} library=${JSON.stringify(totals.library)} wishlist=${JSON.stringify(totals.wishlist)} prices=${JSON.stringify(totals.wishlist_prices)}`,
  );
  return totals;
}

export async function runDailySteamSyncCommand({
  argv = process.argv,
  observedAt = new Date(),
  logger = console,
  beginRun = beginDailyAutomationRun,
  registerAccounts = registerDailyAutomationAccounts,
  finishAccount = finishDailyAutomationAccount,
  finishRun = finishDailyAutomationRun,
  failRun = failDailyAutomationRun,
  runSync = runDailySteamSync,
  close = () => pool.end(),
} = {}) {
  if (argv.includes("--jerusalem-closeout") &&
      !isGamingActivityCloseoutHour(observedAt)) {
    logger.log("Steam daily sync: skipped outside the 05:00 Asia/Jerusalem closeout hour.");
    await close();
    return { skipped: true, reason: "outside_jerusalem_closeout_hour" };
  }
  let auditRun = null;
  try {
    const closeoutDay = argv.includes("--jerusalem-closeout")
      ? gamingActivityCloseoutDay(observedAt)
      : null;
    auditRun = await beginRun({
      idempotencyKey: closeoutDay ? `steam-closeout:${closeoutDay}` : null,
    });
    if (!auditRun) {
      logger.warn("Steam daily sync: another daily runner is already active.");
      return { skipped: true, reason: "active_runner" };
    }
    const totals = await runSync({
      dailyAutomationRunId: auditRun.id,
      onAccountsReady: (accounts) => registerAccounts(auditRun.id, accounts),
      onAccountFinished: (account) => finishAccount(auditRun.id, account),
    });
    await finishRun(auditRun.id, { totals });
    const failed = Boolean(totals.library.failed || totals.wishlist.failed || totals.wishlist_prices.failed);
    return { skipped: false, failed, totals };
  } catch (error) {
    await failRun(auditRun?.id, error);
    logger.error(`Steam daily sync failed: ${JSON.stringify({ errorCode: error?.code || "unknown" })}`);
    return { skipped: false, failed: true, error };
  } finally {
    await close();
  }
}

async function main() {
  const result = await runDailySteamSyncCommand();
  if (result?.failed) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  await main();
}
