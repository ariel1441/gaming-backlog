-- Retain exact, named Steam achievement unlocks without treating the first
-- detailed fetch as current activity. Provider identity is part of the durable
-- key so reconnecting a different Steam account never reuses another account's
-- baseline.
ALTER TABLE user_game_sources
  ADD COLUMN IF NOT EXISTS achievement_events_initialized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS achievement_events_baseline_at TIMESTAMPTZ;

-- Freeze the detailed-event transition for sources that predate this feature.
UPDATE user_game_sources
SET achievement_events_baseline_at = NOW()
WHERE provider = 'steam' AND achievement_events_baseline_at IS NULL;

ALTER TABLE daily_automation_runs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS daily_automation_runs_idempotency
  ON daily_automation_runs (automation_key, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS steam_achievement_unlocks (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES user_external_accounts(id) ON DELETE CASCADE,
  source_id INTEGER REFERENCES user_game_sources(id) ON DELETE SET NULL,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  catalog_game_id INTEGER REFERENCES catalog_games(id) ON DELETE SET NULL,
  first_seen_run_id BIGINT REFERENCES integration_sync_runs(id) ON DELETE SET NULL,
  steam_app_id TEXT NOT NULL,
  achievement_api_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  unlock_at TIMESTAMPTZ,
  activity_day DATE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, steam_app_id, achievement_api_name),
  CHECK ((unlock_at IS NULL) = (activity_day IS NULL))
);

CREATE INDEX IF NOT EXISTS steam_achievement_unlocks_user_day
  ON steam_achievement_unlocks (user_id, activity_day DESC, unlock_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS steam_achievement_unlocks_user_app_time
  ON steam_achievement_unlocks (user_id, steam_app_id, unlock_at DESC, id DESC);

CREATE OR REPLACE FUNCTION enforce_steam_achievement_unlock_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE account_owner INTEGER; source_owner INTEGER; game_owner INTEGER;
BEGIN
  SELECT user_id INTO account_owner FROM user_external_accounts WHERE id = NEW.account_id;
  IF account_owner IS NULL OR account_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'steam achievement account owner mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.source_id IS NOT NULL THEN
    SELECT user_id INTO source_owner FROM user_game_sources WHERE id = NEW.source_id;
    IF source_owner IS NULL OR source_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'steam achievement source owner mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.game_id IS NOT NULL THEN
    SELECT user_id INTO game_owner FROM games WHERE id = NEW.game_id;
    IF game_owner IS NULL OR game_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'steam achievement game owner mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS steam_achievement_unlocks_owner_guard ON steam_achievement_unlocks;
CREATE TRIGGER steam_achievement_unlocks_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, account_id, source_id, game_id
  ON steam_achievement_unlocks
  FOR EACH ROW EXECUTE FUNCTION enforce_steam_achievement_unlock_owner();
