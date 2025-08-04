-- Optional: Clear old tables if you're in dev
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS statuses;

-- Statuses table defines all possible statuses and their rank
CREATE TABLE statuses (
  id SERIAL PRIMARY KEY,
  status TEXT UNIQUE NOT NULL,
  rank INTEGER NOT NULL
);

-- Games table
CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,

  status TEXT NOT NULL REFERENCES statuses(status),
  position INTEGER NOT NULL DEFAULT 1000,

  my_genre TEXT,
  my_score TEXT,
  how_long_to_beat TEXT,
  thoughts TEXT,
  cover TEXT
);
