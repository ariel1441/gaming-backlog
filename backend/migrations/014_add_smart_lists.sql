ALTER TABLE user_lists
  ADD COLUMN IF NOT EXISTS list_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (list_type IN ('manual', 'smart')),
  ADD COLUMN IF NOT EXISTS query_json JSONB,
  ADD COLUMN IF NOT EXISTS sort_key TEXT;

CREATE INDEX IF NOT EXISTS idx_user_lists_user_type_updated
  ON user_lists (user_id, list_type, updated_at DESC, id DESC);
