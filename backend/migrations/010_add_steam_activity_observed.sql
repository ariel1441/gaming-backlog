ALTER TABLE user_game_sources
  ADD COLUMN IF NOT EXISTS first_play_observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_play_observed_playtime_minutes INTEGER;

CREATE INDEX IF NOT EXISTS idx_user_game_sources_steam_first_play_observed
  ON user_game_sources (user_id, first_play_observed_at DESC)
  WHERE provider = 'steam'
    AND source_status = 'owned'
    AND first_play_observed_at IS NOT NULL;
