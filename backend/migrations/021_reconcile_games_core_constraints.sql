-- Reconcile historical games tables with the maintained core schema.
-- The preflight makes a bad status explicit before the foreign key is added.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM games g
      LEFT JOIN statuses s ON s.status = g.status
     WHERE s.status IS NULL
  ) THEN
    RAISE EXCEPTION 'games status foreign-key preflight failed: unknown status values exist';
  END IF;
END $$;

ALTER TABLE games
  ALTER COLUMN position SET DEFAULT 1000;

UPDATE games
   SET position = 1000
 WHERE position IS NULL;

ALTER TABLE games
  ALTER COLUMN position SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'games_status_fkey'
       AND conrelid = 'games'::regclass
  ) THEN
    ALTER TABLE games
      ADD CONSTRAINT games_status_fkey
      FOREIGN KEY (status) REFERENCES statuses(status) NOT VALID;
  END IF;
END $$;

ALTER TABLE games
  VALIDATE CONSTRAINT games_status_fkey;
