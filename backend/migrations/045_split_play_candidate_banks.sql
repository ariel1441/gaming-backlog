ALTER TABLE user_next_up_games
  ADD COLUMN IF NOT EXISTS candidate_role TEXT;

UPDATE user_next_up_games
   SET candidate_role = 'main'
 WHERE candidate_role IS NULL;

ALTER TABLE user_next_up_games
  ALTER COLUMN candidate_role SET DEFAULT 'main',
  ALTER COLUMN candidate_role SET NOT NULL;

ALTER TABLE user_next_up_games
  DROP CONSTRAINT IF EXISTS user_next_up_games_candidate_role_check;

ALTER TABLE user_next_up_games
  ADD CONSTRAINT user_next_up_games_candidate_role_check
  CHECK (candidate_role IN ('main', 'side'));

DROP INDEX IF EXISTS idx_user_next_up_games_user_position;
CREATE INDEX IF NOT EXISTS idx_user_next_up_games_user_role_position
  ON user_next_up_games (user_id, candidate_role, position, game_id);
