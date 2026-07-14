-- Durable provider metadata foundation. This migration is additive: current
-- catalog reads continue using the existing normalized catalog_games columns.
ALTER TABLE catalog_games
  ADD COLUMN IF NOT EXISTS cover_source TEXT,
  ADD COLUMN IF NOT EXISTS cover_external_id TEXT,
  ADD COLUMN IF NOT EXISTS cover_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS metadata_normalization_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS metadata_next_refresh_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata_retired_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'catalog_games_cover_source_nonempty'
       AND conrelid = 'catalog_games'::regclass
  ) THEN
    ALTER TABLE catalog_games
      ADD CONSTRAINT catalog_games_cover_source_nonempty
      CHECK (cover_source IS NULL OR btrim(cover_source) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'catalog_games_normalization_version_positive'
       AND conrelid = 'catalog_games'::regclass
  ) THEN
    ALTER TABLE catalog_games
      ADD CONSTRAINT catalog_games_normalization_version_positive
      CHECK (metadata_normalization_version > 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS catalog_provider_snapshots (
  id BIGSERIAL PRIMARY KEY,
  catalog_game_id INTEGER NOT NULL REFERENCES catalog_games(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (btrim(provider) <> ''),
  provider_game_id TEXT NOT NULL CHECK (btrim(provider_game_id) <> ''),
  payload_json JSONB NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  payload_hash TEXT NOT NULL CHECK (btrim(payload_hash) <> ''),
  normalization_version INTEGER NOT NULL DEFAULT 1 CHECK (normalization_version > 0),
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (catalog_game_id, provider, payload_hash)
);

CREATE INDEX IF NOT EXISTS catalog_provider_snapshots_catalog_fetched
  ON catalog_provider_snapshots (catalog_game_id, provider, fetched_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS catalog_provider_snapshots_identity_fetched
  ON catalog_provider_snapshots (provider, provider_game_id, fetched_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS metadata_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL
    CHECK (job_type IN (
      'backlog_repair',
      'catalog_refresh',
      'cache_import',
      'exact_backfill',
      'discover_ingest'
    )),
  scope_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  scope_catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE CASCADE,
  requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  parameters_json JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(parameters_json) = 'object'),
  cursor_json JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(cursor_json) = 'object'),
  total_count INTEGER CHECK (total_count IS NULL OR total_count >= 0),
  processed_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  linked_count INTEGER NOT NULL DEFAULT 0 CHECK (linked_count >= 0),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  unmatched_count INTEGER NOT NULL DEFAULT 0 CHECK (unmatched_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS metadata_jobs_one_active_per_scope
  ON metadata_jobs (
    job_type,
    COALESCE(scope_user_id, 0),
    COALESCE(scope_catalog_game_id, 0)
  )
  WHERE status IN ('queued', 'running', 'paused');

CREATE INDEX IF NOT EXISTS metadata_jobs_runnable
  ON metadata_jobs (status, next_attempt_at, lease_expires_at, created_at, id)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS metadata_jobs_scope_user_updated
  ON metadata_jobs (scope_user_id, updated_at DESC, id DESC)
  WHERE scope_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS game_metadata_candidates (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (btrim(provider) <> ''),
  provider_game_id TEXT NOT NULL CHECK (btrim(provider_game_id) <> ''),
  candidate_rank INTEGER NOT NULL CHECK (candidate_rank > 0),
  confidence_score NUMERIC(5,4)
    CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1),
  confidence_level TEXT NOT NULL DEFAULT 'none'
    CHECK (confidence_level IN ('exact', 'high', 'medium', 'low', 'none')),
  match_reason TEXT,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence_json) = 'object'),
  decision TEXT NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'accepted', 'rejected', 'skipped')),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, provider, provider_game_id),
  CHECK (decision <> 'accepted' OR catalog_game_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS game_metadata_candidates_one_accepted
  ON game_metadata_candidates (game_id)
  WHERE decision = 'accepted';

CREATE INDEX IF NOT EXISTS game_metadata_candidates_user_decision
  ON game_metadata_candidates (user_id, decision, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS game_metadata_candidates_game_rank
  ON game_metadata_candidates (game_id, candidate_rank, id);

DROP TRIGGER IF EXISTS game_metadata_candidates_owner_guard
  ON game_metadata_candidates;

CREATE TRIGGER game_metadata_candidates_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON game_metadata_candidates
  FOR EACH ROW EXECUTE FUNCTION enforce_owned_game_relationship();

CREATE OR REPLACE FUNCTION prevent_game_owner_change_with_relationships()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id = OLD.user_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM user_list_games WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_game_sources WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM steam_import_candidates WHERE duplicate_game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM game_metadata_candidates WHERE game_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change game owner while owned relationships exist'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
