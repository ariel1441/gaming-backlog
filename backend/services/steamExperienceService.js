import { pool } from "../db.js";
import { assertSavedAccountUser } from "./steamWishlistService.js";
import { getSteamAccount, serializeSteamAccount } from "./steamService.js";
import { serializeIntegrationSyncRun } from "./integrationSyncService.js";
import { listDailyAutomationRunsForAccount } from "./dailyAutomationRunService.js";

// A read of saved work, never a provider request or a scheduling trigger.
export async function getSteamExperienceHealth(userId) {
  await assertSavedAccountUser(userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const account = await getSteamAccount(userId, client);
    if (!account) {
      await client.query("COMMIT");
      return {
        account: null,
        activeJob: null,
        runs: [],
        dailyRuns: [],
        lastScheduledAt: null,
      };
    }
    const { rows: jobs } = await client.query(
      `SELECT id, sync_kind, status, cursor, total, progress_json, created_at
      FROM steam_sync_jobs WHERE user_id = $1 AND account_id = $2 AND status IN ('queued', 'running')
      ORDER BY created_at DESC LIMIT 1`,
      [userId, account.id],
    );
    const { rows: runs } = await client.query(
      `SELECT DISTINCT ON (r.sync_kind) r.*
      FROM integration_sync_runs r JOIN steam_sync_jobs j ON j.sync_run_id = r.id AND j.user_id = r.user_id
      WHERE r.user_id = $1 AND j.account_id = $2 ORDER BY r.sync_kind, r.started_at DESC, r.id DESC`,
      [userId, account.id],
    );
    const { rows: scheduled } = await client.query(
      `SELECT MAX(created_at) AS last_scheduled_at FROM steam_sync_jobs
      WHERE user_id = $1 AND account_id = $2 AND trigger_type = 'scheduled'`,
      [userId, account.id],
    );
    const dailyRuns = await listDailyAutomationRunsForAccount(userId, account.id, 10, client);
    await client.query("COMMIT");
    const job = jobs[0];
    return {
      account: serializeSteamAccount(account),
      activeJob: job
        ? {
            id: job.id,
            syncKind: job.sync_kind,
            status: job.status,
            processed: job.cursor,
            total: job.total,
            progress: job.progress_json || {},
            createdAt: job.created_at,
          }
        : null,
      runs: runs.map(serializeIntegrationSyncRun),
      dailyRuns,
      lastScheduledAt: scheduled[0]?.last_scheduled_at || null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
