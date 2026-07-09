CREATE TABLE IF NOT EXISTS user_lists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_lists_user_updated
  ON user_lists (user_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS user_list_games (
  list_id INTEGER NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1000,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (list_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_user_list_games_list_position
  ON user_list_games (list_id, position, game_id);

CREATE INDEX IF NOT EXISTS idx_user_list_games_game_id
  ON user_list_games (game_id);
