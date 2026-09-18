import crypto from "node:crypto";
import { pool } from "../db.js";

export const DAILY_AUTOMATION_STALE_MS = 4 * 60 * 60 * 1000;

function count(value) {
  return Math.max(0, Number(value) || 0);
}

export function dailyRunStatus(totals = {}) {
  const phases = Object.values(totals);
  const succeeded = phases.reduce((total, phase) => total + count(phase?.succeeded), 0);
  const partial = phases.reduce((total, phase) => total + count(phase?.partial), 0);
  const failed = phases.reduce((total, phase) => total + count(phase?.failed), 0);
  const skipped = phases.reduce((total, phase) => total + count(phase?.skipped), 0);
  if (failed && !succeeded && !partial) return "failed";
  if (failed || partial) return "partial";
  if (skipped && !succeeded) return "skipped";
  return "succeeded";
}

function deploymentRevision() {
  return [
    process.env.RAILWAY_GIT_COMMIT_SHA,
    process.env.RAILWAY_DEPLOYMENT_ID,
    process.env.GITHUB_SHA,
  ].find(Boolean) || null;
}

export async function beginDailyAutomationRun({ revision = deploymentRevision() } = {}) {
  await pool.query(
    `WITH stale AS (
       UPDATE daily_automation_runs
          SET status = 'abandoned', finished_at = NOW(),
              error_code = 'daily_run_heartbeat_expired',
              error_message = 'The daily Steam runner did not finish before its safety timeout.'
        WHERE automation_key = 'steam_daily' AND status = 'running'
          AND heartbeat_at < NOW() - ($1::double precision * INTERVAL '1 millisecond')
        RETURNING id
     ) UPDATE daily_automation_run_accounts account
          SET status = 'abandoned', finished_at = NOW(),
              error_code = 'daily_run_heartbeat_expired',
              error_message = 'The daily Steam runner did not finish before its safety timeout.'
        WHERE account.automation_run_id IN (SELECT id FROM stale)
          AND account.status = 'running'`,
    [DAILY_AUTOMATION_STALE_MS],
  );
  const id = crypto.randomUUID();
  try {
    const { rows } = await pool.query(
      `INSERT INTO daily_automation_runs (id, automation_key, deployment_revision)
       VALUES ($1, 'steam_daily', $2) RETURNING *`,
      [id, revision],
    );
    return rows[0] || null;
  } catch (error) {
    if (error?.code === "23505") return null;
    throw error;
  }
}

export async function registerDailyAutomationAccounts(runId, accounts = []) {
  if (!runId || !accounts.length) return;
  await pool.query(
    `INSERT INTO daily_automation_run_accounts (automation_run_id, user_id, account_id)
     SELECT $1, item.user_id, item.account_id
       FROM jsonb_to_recordset($2::jsonb) AS item(user_id integer, account_id integer)
     ON CONFLICT (automation_run_id, account_id) DO NOTHING`,
    [runId, JSON.stringify(accounts.map(({ userId, accountId }) => ({ user_id: userId, account_id: accountId })) )],
  );
}

export async function finishDailyAutomationAccount(runId, { userId, accountId, totals, details = {} }) {
  if (!runId || !userId || !accountId) return;
  const status = dailyRunStatus(totals);
  await pool.query(
    `UPDATE daily_automation_run_accounts
        SET status = $4, summary_json = $5::jsonb, finished_at = NOW()
      WHERE automation_run_id = $1 AND user_id = $2 AND account_id = $3`,
    [runId, userId, accountId, status, JSON.stringify({ phases: totals || {}, details })],
  );
  await pool.query(
    `UPDATE daily_automation_runs SET heartbeat_at = NOW() WHERE id = $1 AND status = 'running'`,
    [runId],
  );
}

export async function finishDailyAutomationRun(runId, { totals, status = dailyRunStatus(totals) } = {}) {
  if (!runId) return null;
  const { rows } = await pool.query(
    `UPDATE daily_automation_runs
        SET status = $2, heartbeat_at = NOW(), finished_at = NOW(), summary_json = $3::jsonb
      WHERE id = $1 RETURNING *`,
    [runId, status, JSON.stringify({ totals: totals || {} })],
  );
  return rows[0] || null;
}

export async function failDailyAutomationRun(runId, error) {
  if (!runId) return null;
  const { rows } = await pool.query(
    `UPDATE daily_automation_runs
        SET status = 'failed', heartbeat_at = NOW(), finished_at = NOW(),
            error_code = $2, error_message = $3
      WHERE id = $1 RETURNING *`,
    [runId, error?.code || "daily_automation_failed", String(error?.message || "Daily Steam runner failed.").slice(0, 300)],
  );
  await pool.query(
    `UPDATE daily_automation_run_accounts
        SET status = 'failed', finished_at = NOW(), error_code = 'daily_automation_failed',
            error_message = 'The daily Steam runner stopped before this account finished.'
      WHERE automation_run_id = $1 AND status = 'running'`,
    [runId],
  );
  return rows[0] || null;
}

export function serializeDailyAutomationRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.account_status || row.status,
    startedAt: row.started_at,
    finishedAt: row.account_finished_at || row.finished_at,
    summary: row.account_summary || row.summary_json || {},
    errorCode: row.account_error_code || row.error_code || null,
    errorMessage: row.account_error_message || row.error_message || null,
  };
}

export async function listDailyAutomationRunsForAccount(userId, accountId, limit = 10, client = pool) {
  const { rows } = await client.query(
    `SELECT run.*, account.status AS account_status, account.summary_json AS account_summary,
            account.error_code AS account_error_code, account.error_message AS account_error_message,
            account.finished_at AS account_finished_at
       FROM daily_automation_run_accounts account
       JOIN daily_automation_runs run ON run.id = account.automation_run_id
      WHERE account.user_id = $1 AND account.account_id = $2
      ORDER BY run.started_at DESC
      LIMIT $3`,
    [userId, accountId, Math.min(Math.max(Number(limit) || 10, 1), 10)],
  );
  return rows.map(serializeDailyAutomationRun);
}
