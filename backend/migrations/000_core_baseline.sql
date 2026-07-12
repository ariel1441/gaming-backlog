-- Canonical production bootstrap for databases created before tracked migrations.
-- Every statement is adoption-safe for an existing historical core schema.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS statuses (
  id SERIAL PRIMARY KEY,
  status TEXT UNIQUE NOT NULL,
  rank INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL REFERENCES statuses(status),
  position INTEGER NOT NULL DEFAULT 1000,
  my_genre TEXT,
  how_long_to_beat INTEGER,
  my_score NUMERIC(3,1),
  thoughts TEXT,
  cover TEXT,
  started_at DATE,
  finished_at DATE
);

-- Statuses are schema-coupled reference values required by game foreign keys.
INSERT INTO statuses (status, rank) VALUES
  ('playing', 1),
  ('plan to play soon', 2),
  ('plan to play', 3),
  ('played and should come back', 4),
  ('play when in the mood', 5),
  ('maybe in the future', 6),
  ('recommended by someone', 7),
  ('not anytime soon', 8),
  ('played a bit', 9),
  ('played and wont come back', 10),
  ('played alot but didnt finish', 11),
  ('finished', 12)
ON CONFLICT (status) DO NOTHING;
