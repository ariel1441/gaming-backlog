-- Delivery state is independent of facts and existing review decisions.
CREATE UNIQUE INDEX IF NOT EXISTS user_activity_events_id_owner ON user_activity_events(id, user_id);
CREATE TABLE IF NOT EXISTS user_activity_inbox (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  baseline_event_id BIGINT NOT NULL DEFAULT 0 CHECK (baseline_event_id >= 0),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_activity_receipts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id BIGINT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, event_id),
  FOREIGN KEY (event_id, user_id) REFERENCES user_activity_events(id, user_id) ON DELETE CASCADE
);
