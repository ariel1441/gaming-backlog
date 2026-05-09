export function isReadOnlyView({ readOnly = false, isPublic = false } = {}) {
  return Boolean(readOnly || isPublic);
}

export function ownsGame(user, game) {
  if (!user || !game) return false;
  if (game.user_id == null) return true;
  return String(user.id) === String(game.user_id);
}

export function canEditGame({
  user,
  game,
  isAuthenticated = false,
  readOnly = false,
} = {}) {
  return Boolean(
    isAuthenticated && !isReadOnlyView({ readOnly }) && ownsGame(user, game)
  );
}

export function canDeleteGame(options = {}) {
  return canEditGame(options);
}

export function canReorderGames({
  isAuthenticated = false,
  readOnly = false,
} = {}) {
  return Boolean(isAuthenticated && !isReadOnlyView({ readOnly }));
}

export function canTogglePublicProfile({
  user,
  isAuthenticated = false,
  isGuest = false,
} = {}) {
  return Boolean(isAuthenticated && user && !isGuest);
}
