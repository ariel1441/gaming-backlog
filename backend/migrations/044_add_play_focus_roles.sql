CREATE TABLE IF NOT EXISTS user_play_focus_games (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  focus_role TEXT NOT NULL
    CHECK (focus_role IN ('main', 'side', 'occasional')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_play_focus_single_slot
  ON user_play_focus_games (user_id, focus_role)
  WHERE focus_role IN ('main', 'side');

CREATE INDEX IF NOT EXISTS idx_user_play_focus_user_role
  ON user_play_focus_games (user_id, focus_role, assigned_at, game_id);

DROP TRIGGER IF EXISTS user_play_focus_games_owner_guard ON user_play_focus_games;
CREATE TRIGGER user_play_focus_games_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, game_id ON user_play_focus_games
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
     OR EXISTS (SELECT 1 FROM user_play_focus_games WHERE game_id = OLD.id)
     OR EXISTS (SELECT 1 FROM game_personal_genres WHERE game_id = OLD.id) THEN
    RAISE EXCEPTION 'cannot change game owner while owned relationships exist'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
