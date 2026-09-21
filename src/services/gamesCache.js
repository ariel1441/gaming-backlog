const listeners = new Set();

export function subscribeGamesInvalidation(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateGamesCache(userId) {
  const scope = String(userId || "");
  if (!scope) return;
  listeners.forEach((listener) => listener(scope));
}
