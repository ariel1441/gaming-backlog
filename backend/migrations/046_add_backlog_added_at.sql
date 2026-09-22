ALTER TABLE games
  ADD COLUMN IF NOT EXISTS backlog_added_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS backlog_added_at_source TEXT;

ALTER TABLE games
  ALTER COLUMN backlog_added_at SET DEFAULT NOW(),
  ALTER COLUMN backlog_added_at_source SET DEFAULT 'app';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'games_backlog_added_at_source_check'
      AND conrelid = 'games'::regclass
  ) THEN
    ALTER TABLE games
      ADD CONSTRAINT games_backlog_added_at_source_check
      CHECK (
        (backlog_added_at IS NULL AND backlog_added_at_source IS NULL)
        OR
        (backlog_added_at IS NOT NULL AND backlog_added_at_source IN (
          'app',
          'guest_clone',
          'steam_observed',
          'steam_license_history'
        ))
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS games_user_backlog_added_at
  ON games (user_id, backlog_added_at DESC, id DESC);
