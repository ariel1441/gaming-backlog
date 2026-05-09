export function normalizeGameTitle(value = "") {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2018\u2019\u02bc]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isSameGameTitle(a, b) {
  const first = normalizeGameTitle(a);
  const second = normalizeGameTitle(b);
  return !!first && first === second;
}

export function findDuplicateGameTitle(title, games = [], { excludeId } = {}) {
  const normalizedTitle = normalizeGameTitle(title);
  if (!normalizedTitle) return null;

  return (
    (Array.isArray(games) ? games : []).find((game) => {
      if (!game) return false;
      if (excludeId != null && Number(game.id) === Number(excludeId)) {
        return false;
      }
      return normalizeGameTitle(game.name) === normalizedTitle;
    }) || null
  );
}
