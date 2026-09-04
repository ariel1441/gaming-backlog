ALTER TABLE user_external_accounts
  ADD COLUMN IF NOT EXISTS auto_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS integration_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  sync_kind TEXT NOT NULL,
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('manual', 'scheduled')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  items_seen INTEGER NOT NULL DEFAULT 0 CHECK (items_seen >= 0),
  items_changed INTEGER NOT NULL DEFAULT 0 CHECK (items_changed >= 0),
  errors_count INTEGER NOT NULL DEFAULT 0 CHECK (errors_count >= 0),
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integration_sync_runs_user_domain_started
  ON integration_sync_runs (user_id, provider, sync_kind, started_at DESC);

CREATE INDEX IF NOT EXISTS integration_sync_runs_recent_problems
  ON integration_sync_runs (started_at DESC)
  WHERE status IN ('partial', 'failed');

ALTER TABLE steam_sync_jobs
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS sync_run_id BIGINT REFERENCES integration_sync_runs(id) ON DELETE SET NULL;

ALTER TABLE steam_sync_jobs
  DROP CONSTRAINT IF EXISTS steam_sync_jobs_trigger_type_check;

ALTER TABLE steam_sync_jobs
  ADD CONSTRAINT steam_sync_jobs_trigger_type_check
    CHECK (trigger_type IN ('manual', 'scheduled'));

CREATE UNIQUE INDEX IF NOT EXISTS steam_sync_jobs_sync_run_unique
  ON steam_sync_jobs (sync_run_id)
  WHERE sync_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_activity_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  external_id TEXT,
  sync_run_id BIGINT REFERENCES integration_sync_runs(id) ON DELETE SET NULL,
  dedupe_key TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  state TEXT NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'resolved', 'dismissed')),
  seen_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_activity_events_user_state_created
  ON user_activity_events (user_id, state, created_at DESC);

CREATE INDEX IF NOT EXISTS user_activity_events_user_source_created
  ON user_activity_events (user_id, source, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS user_activity_events_open_dedupe
  ON user_activity_events (user_id, source, dedupe_key)
  WHERE state = 'open';

DROP TRIGGER IF EXISTS user_activity_events_owner_guard ON user_activity_events;
CREATE TRIGGER user_activity_events_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON user_activity_events
  FOR EACH ROW EXECUTE FUNCTION enforce_owned_game_relationship();

CREATE OR REPLACE FUNCTION prevent_game_owner_change_with_relationships()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id = OLD.user_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM user_list_games WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_game_sources WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM steam_import_candidates WHERE duplicate_game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_activity_events WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM game_metadata_candidates WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_next_up_games WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM game_personal_genres WHERE game_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change game owner while owned relationships exist'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
