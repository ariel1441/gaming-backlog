ALTER TABLE games
  ADD COLUMN IF NOT EXISTS rawg_id INTEGER,
  ADD COLUMN IF NOT EXISTS rawg_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_games_rawg_id ON games(rawg_id);
