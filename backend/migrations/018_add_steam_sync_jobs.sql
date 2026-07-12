CREATE TABLE IF NOT EXISTS steam_sync_jobs (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES user_external_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  force BOOLEAN NOT NULL DEFAULT FALSE,
  cursor INTEGER NOT NULL DEFAULT 0 CHECK (cursor >= 0),
  total INTEGER,
  payload_json JSONB,
  progress_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB,
  error_code TEXT,
  error_message TEXT,
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS steam_sync_jobs_one_active_per_user
  ON steam_sync_jobs (user_id)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS steam_sync_jobs_runnable
  ON steam_sync_jobs (status, locked_at, created_at)
  WHERE status IN ('queued', 'running');
