-- DEV RESET (optional)
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS statuses;
DROP TABLE IF EXISTS users;

-- Users who own their games
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Statuses (global lookup)
CREATE TABLE statuses (
  id SERIAL PRIMARY KEY,
  status TEXT UNIQUE NOT NULL,
  rank INTEGER NOT NULL
);

-- Games, owned by a user
CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL REFERENCES statuses(status),
  position INTEGER NOT NULL DEFAULT 1000,
  my_genre TEXT,
  how_long_to_beat INTEGER,
  my_score NUMERIC(3,1),           
  thoughts TEXT,
  cover TEXT
);
