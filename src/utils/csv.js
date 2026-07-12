const FORMULA_PREFIX = /^[\s]*[=+\-@]/;

export function csvValue(value) {
  if (value == null) return "";
  const isString = typeof value === "string";
  let text = String(value);
  if (isString && (FORMULA_PREFIX.test(text) || /^[\t\r]/.test(text))) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function backlogCsv(games = []) {
  const fields = [
    ["id", "id"], ["name", "name"], ["status", "status"],
    ["genre", "my_genre"], ["score", "my_score"],
    ["estimated_hours", "how_long_to_beat"], ["started_at", "started_at"],
    ["finished_at", "finished_at"], ["thoughts", "thoughts"],
    ["rawg_id", "rawg_id"], ["rawg_slug", "rawg_slug"],
    ["release_date", "releaseDate"], ["cover", "cover"],
    ["favorite_rank", "favorite_rank"], ["catalog_game_id", "catalog_game_id"],
  ];
  const lines = [
    fields.map(([label]) => csvValue(label)).join(","),
    ...games.map((game) => fields.map(([, key]) => csvValue(game?.[key])).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
