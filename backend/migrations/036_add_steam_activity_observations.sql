CREATE TABLE IF NOT EXISTS steam_activity_observations (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sync_run_id BIGINT NOT NULL REFERENCES integration_sync_runs(id) ON DELETE CASCADE,
  source_id INTEGER REFERENCES user_game_sources(id) ON DELETE SET NULL,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  steam_app_id TEXT NOT NULL,
  game_name TEXT NOT NULL,
  cover_url TEXT,
  playtime_minutes_forever INTEGER NOT NULL CHECK (playtime_minutes_forever >= 0),
  playtime_delta_minutes INTEGER NOT NULL DEFAULT 0 CHECK (playtime_delta_minutes >= 0),
  achievements_unlocked INTEGER,
  achievements_total INTEGER,
  achievements_delta INTEGER NOT NULL DEFAULT 0 CHECK (achievements_delta >= 0),
  interval_started_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sync_run_id, steam_app_id),
  CHECK (achievements_unlocked IS NULL OR achievements_unlocked >= 0),
  CHECK (achievements_total IS NULL OR achievements_total >= 0),
  CHECK (achievements_unlocked IS NULL OR achievements_total IS NULL OR achievements_unlocked <= achievements_total)
);

CREATE INDEX IF NOT EXISTS steam_activity_observations_user_observed
  ON steam_activity_observations (user_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS steam_activity_observations_user_app_observed
  ON steam_activity_observations (user_id, steam_app_id, observed_at DESC);

DROP TRIGGER IF EXISTS steam_activity_observations_owner_guard ON steam_activity_observations;
CREATE TRIGGER steam_activity_observations_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON steam_activity_observations
  FOR EACH ROW EXECUTE FUNCTION enforce_owned_game_relationship();
