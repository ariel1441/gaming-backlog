-- Pending factual refreshes outlive individual library jobs and their cursors.
ALTER TABLE user_game_sources
  ADD COLUMN IF NOT EXISTS achievements_pending_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS achievements_next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS achievements_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS achievements_attempts INTEGER NOT NULL DEFAULT 0 CHECK (achievements_attempts >= 0),
  ADD COLUMN IF NOT EXISTS achievements_revision BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS user_game_sources_achievement_follow_up
  ON user_game_sources (user_id, achievements_next_attempt_at, id)
  WHERE provider = 'steam' AND source_status = 'owned' AND game_id IS NOT NULL;
