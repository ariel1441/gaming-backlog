ALTER TABLE steam_import_candidates
  ADD COLUMN IF NOT EXISTS suggested_status TEXT,
  ADD COLUMN IF NOT EXISTS suggested_status_reason TEXT,
  ADD COLUMN IF NOT EXISTS suggested_status_confidence TEXT
    CHECK (
      suggested_status_confidence IS NULL OR
      suggested_status_confidence IN ('high', 'medium', 'low')
    ),
  ADD COLUMN IF NOT EXISTS selected_status TEXT;

CREATE INDEX IF NOT EXISTS idx_steam_import_candidates_user_match
  ON steam_import_candidates (user_id, match_confidence, import_status);

