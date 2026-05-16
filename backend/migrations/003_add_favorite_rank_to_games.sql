ALTER TABLE games
  ADD COLUMN IF NOT EXISTS favorite_rank INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'games_favorite_rank_range'
  ) THEN
    ALTER TABLE games
      ADD CONSTRAINT games_favorite_rank_range
      CHECK (favorite_rank IS NULL OR favorite_rank BETWEEN 1 AND 5);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS games_user_favorite_rank_unique
  ON games (user_id, favorite_rank)
  WHERE favorite_rank IS NOT NULL;
