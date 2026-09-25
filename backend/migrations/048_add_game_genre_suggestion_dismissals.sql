CREATE TABLE IF NOT EXISTS game_genre_suggestion_dismissals (
  user_id INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  personal_genre_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, personal_genre_id),
  FOREIGN KEY (user_id, game_id)
    REFERENCES games(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, personal_genre_id)
    REFERENCES user_personal_genres(user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS game_genre_suggestion_dismissals_user_genre
  ON game_genre_suggestion_dismissals (user_id, personal_genre_id, game_id);
