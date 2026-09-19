-- Durable, provider-independent audit records for the Railway daily Steam runner.
-- These are deliberately structured summaries, not raw provider payloads or
-- container logs. The parent records a process invocation; account rows remain
-- private to the connected Steam account owner.
CREATE TABLE IF NOT EXISTS daily_automation_runs (
  id UUID PRIMARY KEY,
  automation_key TEXT NOT NULL CHECK (automation_key IN ('steam_daily')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'abandoned', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  deployment_revision TEXT,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_automation_runs_one_active
  ON daily_automation_runs (automation_key)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS daily_automation_runs_recent
  ON daily_automation_runs (automation_key, started_at DESC);

CREATE TABLE IF NOT EXISTS daily_automation_run_accounts (
  automation_run_id UUID NOT NULL REFERENCES daily_automation_runs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES user_external_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'abandoned', 'skipped')),
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  finished_at TIMESTAMPTZ,
  PRIMARY KEY (automation_run_id, account_id)
);

CREATE INDEX IF NOT EXISTS daily_automation_run_accounts_history
  ON daily_automation_run_accounts (user_id, account_id, automation_run_id);

ALTER TABLE steam_sync_jobs
  ADD COLUMN IF NOT EXISTS daily_automation_run_id UUID
    REFERENCES daily_automation_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS steam_sync_jobs_daily_automation_run
  ON steam_sync_jobs (daily_automation_run_id)
  WHERE daily_automation_run_id IS NOT NULL;

ALTER TABLE integration_sync_runs
  ADD COLUMN IF NOT EXISTS daily_automation_run_id UUID
    REFERENCES daily_automation_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS integration_sync_runs_daily_automation_run
  ON integration_sync_runs (daily_automation_run_id)
  WHERE daily_automation_run_id IS NOT NULL;
