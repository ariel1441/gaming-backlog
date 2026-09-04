ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_default_backlog_view_check,
  DROP CONSTRAINT IF EXISTS user_preferences_default_backlog_sort_key_check;

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_default_backlog_view_check
    CHECK (default_backlog_view IN ('grid', 'compact', 'list', 'table')),
  ADD CONSTRAINT user_preferences_default_backlog_sort_key_check
    CHECK (
      default_backlog_sort_key IN (
        '',
        'name',
        'status',
        'personalGenres',
        'estimatedHours',
        'score',
        'hoursPlayed',
        'rawgRating',
        'metacritic',
        'releaseDate',
        'startedDate',
        'finishedDate',
        'steamLastPlayed'
      )
    );
