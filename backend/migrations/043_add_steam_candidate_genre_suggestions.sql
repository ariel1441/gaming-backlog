ALTER TABLE steam_import_candidates
  ADD COLUMN IF NOT EXISTS personal_genre_suggestions_json JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'steam_import_candidates_personal_genre_suggestions_array'
       AND conrelid = 'steam_import_candidates'::regclass
  ) THEN
    ALTER TABLE steam_import_candidates
      ADD CONSTRAINT steam_import_candidates_personal_genre_suggestions_array
      CHECK (jsonb_typeof(personal_genre_suggestions_json) = 'array');
  END IF;
END $$;
