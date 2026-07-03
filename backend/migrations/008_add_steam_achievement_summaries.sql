ALTER TABLE user_game_sources
  ADD COLUMN IF NOT EXISTS achievements_unlocked INTEGER,
  ADD COLUMN IF NOT EXISTS achievements_total INTEGER,
  ADD COLUMN IF NOT EXISTS achievements_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS achievements_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (achievements_status IN ('unknown', 'synced', 'none', 'private', 'unavailable', 'failed')),
  ADD COLUMN IF NOT EXISTS achievements_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS achievements_last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS achievements_last_error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_user_game_sources_steam_achievements
  ON user_game_sources (user_id, achievements_status, achievements_percent)
  WHERE provider = 'steam' AND source_status = 'owned';
