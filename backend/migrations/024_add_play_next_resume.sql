ALTER TABLE games
  ADD COLUMN IF NOT EXISTS resume_note TEXT;

ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_resume_note_length;

ALTER TABLE games
  ADD CONSTRAINT games_resume_note_length
  CHECK (resume_note IS NULL OR char_length(resume_note) <= 1000);

CREATE TABLE IF NOT EXISTS user_next_up_games (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_user_next_up_games_user_position
  ON user_next_up_games (user_id, position, game_id);

CREATE INDEX IF NOT EXISTS idx_user_next_up_games_game_id
  ON user_next_up_games (game_id);

DROP TRIGGER IF EXISTS user_next_up_games_owner_guard ON user_next_up_games;
CREATE TRIGGER user_next_up_games_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON user_next_up_games
  FOR EACH ROW EXECUTE FUNCTION enforce_owned_game_relationship();

CREATE OR REPLACE FUNCTION prevent_game_owner_change_with_relationships()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id = OLD.user_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM user_list_games WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_game_sources WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM steam_import_candidates WHERE duplicate_game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM game_metadata_candidates WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM user_next_up_games WHERE game_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change game owner while owned relationships exist'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_default_landing_path_check;

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_default_landing_path_check
  CHECK (
    default_landing_path IN (
      '/',
      '/next-up',
      '/me',
      '/timeline',
      '/discover',
      '/insights'
    )
  );
