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
