import { pool } from "../db.js";

export function serializeIntegrationSyncRun(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    provider: row.provider,
    syncKind: row.sync_kind,
    triggerType: row.trigger_type,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    itemsSeen: Number(row.items_seen) || 0,
    itemsChanged: Number(row.items_changed) || 0,
    errorsCount: Number(row.errors_count) || 0,
    summary: row.summary_json || {},
    errorCode: row.error_code || null,
    errorMessage: row.error_message || null,
  };
}

export async function createIntegrationSyncRun(
  userId,
  { provider, syncKind, triggerType, dailyAutomationRunId = null },
  client = pool,
) {
  const { rows } = await client.query(
    `
    INSERT INTO integration_sync_runs (
      user_id, provider, sync_kind, trigger_type, daily_automation_run_id, status
    )
    VALUES ($1, $2, $3, $4, $5, 'running')
    RETURNING *
    `,
    [userId, provider, syncKind, triggerType, dailyAutomationRunId],
  );
  return rows[0] || null;
}

export async function finishIntegrationSyncRun(
  runId,
  {
    status,
    itemsSeen = 0,
    itemsChanged = 0,
    errorsCount = 0,
    summary = {},
    errorCode = null,
    errorMessage = null,
  },
  client = pool,
) {
  const { rows } = await client.query(
    `
    UPDATE integration_sync_runs
       SET status = $2,
           finished_at = NOW(),
           items_seen = $3,
           items_changed = $4,
           errors_count = $5,
           summary_json = $6::jsonb,
           error_code = $7,
           error_message = $8
     WHERE id = $1
     RETURNING *
    `,
    [
      runId,
      status,
      Math.max(0, Number(itemsSeen) || 0),
      Math.max(0, Number(itemsChanged) || 0),
      Math.max(0, Number(errorsCount) || 0),
      JSON.stringify(summary || {}),
      errorCode,
      errorMessage,
    ],
  );
  return rows[0] || null;
}

export async function getIntegrationSyncRun(runId, client = pool) {
  if (!runId) return null;
  const { rows } = await client.query(
    "SELECT * FROM integration_sync_runs WHERE id = $1 LIMIT 1",
    [runId],
  );
  return rows[0] || null;
}
