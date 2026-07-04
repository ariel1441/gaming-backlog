CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_backlog_view TEXT NOT NULL DEFAULT 'grid'
    CHECK (default_backlog_view IN ('grid', 'compact', 'list')),
  default_backlog_sort_key TEXT NOT NULL DEFAULT ''
    CHECK (
      default_backlog_sort_key IN (
        '',
        'name',
        'hoursPlayed',
        'rawgRating',
        'metacritic',
        'releaseDate',
        'startedDate',
        'finishedDate',
        'steamLastPlayed'
      )
    ),
  default_backlog_sort_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  default_landing_path TEXT NOT NULL DEFAULT '/'
    CHECK (
      default_landing_path IN (
        '/',
        '/me',
        '/timeline',
        '/discover',
        '/insights'
      )
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
