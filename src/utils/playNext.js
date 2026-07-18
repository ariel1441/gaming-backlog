function numericId(game) {
  const id = Number(game?.id);
  return Number.isFinite(id) ? id : Number.MAX_SAFE_INTEGER;
}

function stableById(a, b) {
  return numericId(a) - numericId(b);
}

function knownHours(game) {
  const hours = Number(game?.how_long_to_beat);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

export function playNextStatusGroup(status, statusGroupOf) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "playing") return "playing";
  if (normalized === "played and should come back") return "returning";
  return statusGroupOf(status);
}

function eligibleGames(games, statusGroupOf) {
  return (games || []).filter(
    (game) =>
      !["playing", "done"].includes(
        playNextStatusGroup(game?.status, statusGroupOf),
      ),
  );
}

function genresOf(game) {
  return String(game?.my_genre || "")
    .split(",")
    .map((genre) => genre.trim().toLowerCase())
    .filter(Boolean);
}

export function matchesMyGenres(game, selectedGenres = []) {
  const selected = new Set(
    (selectedGenres || []).map((genre) => String(genre).trim().toLowerCase()),
  );
  if (!selected.size) return true;
  return genresOf(game).some((genre) => selected.has(genre));
}

function moodReason(selectedGenres) {
  const labels = (selectedGenres || []).filter(Boolean);
  if (!labels.length) return "";
  return ` Matches your ${labels.join(" or ")} mood.`;
}

function withoutDismissed(games, dismissedIds) {
  const dismissed = new Set(
    [...(dismissedIds || [])].map((id) => String(id)),
  );
  return games.filter((game) => !dismissed.has(String(game.id)));
}

export function recommendationCandidates({
  games = [],
  queueIds = [],
  statusGroupOf,
  dismissed = {},
  selectedGenres = [],
}) {
  const byId = new Map(games.map((game) => [String(game.id), game]));
  const queue = queueIds
    .map((id) => byId.get(String(id)))
    .filter(Boolean);
  const eligible = eligibleGames(games, statusGroupOf).filter((game) =>
    matchesMyGenres(game, selectedGenres),
  );
  const eligibleIds = new Set(eligible.map((game) => String(game.id)));
  const eligibleQueue = queue.filter((game) =>
    eligibleIds.has(String(game.id)),
  );
  const activeGames = games.filter(
    (game) =>
      playNextStatusGroup(game?.status, statusGroupOf) === "playing" &&
      matchesMyGenres(game, selectedGenres),
  );

  const priority = withoutDismissed(
    eligibleQueue,
    dismissed.priority,
  )[0];

  const shortest = (pool) =>
    withoutDismissed(pool, dismissed.quick)
      .filter((game) => knownHours(game) != null)
      .sort(
        (a, b) =>
          knownHours(a) - knownHours(b) || stableById(a, b),
      )[0];
  const planned = (pool) =>
    pool.filter(
      (game) =>
        playNextStatusGroup(game?.status, statusGroupOf) === "planned",
    );
  const quick = shortest(planned(eligibleQueue)) || shortest(planned(eligible));

  const continuePool = withoutDismissed(
    activeGames,
    dismissed.continue,
  );
  const withNote = continuePool
    .filter((game) => String(game?.resume_note || "").trim())
    .sort(stableById);
  let continuing = withNote[0];
  let continueReason = continuing
    ? "You left yourself a Next time note."
    : "";

  if (!continuing) {
    const withSteamDate = continuePool
      .filter(
        (game) =>
          game?.steamLastPlayedAt &&
          !Number.isNaN(new Date(game.steamLastPlayedAt).getTime()),
      )
      .sort(
        (a, b) =>
          new Date(a.steamLastPlayedAt) - new Date(b.steamLastPlayedAt) ||
          stableById(a, b),
      );
    continuing = withSteamDate[0];
    continueReason = continuing
      ? "Least recently played game among what you are playing."
      : "";
  }

  if (!continuing) {
    const withStartDate = continuePool
      .filter(
        (game) =>
          game?.started_at &&
          !Number.isNaN(new Date(game.started_at).getTime()),
      )
      .sort(
        (a, b) =>
          new Date(a.started_at) - new Date(b.started_at) ||
          stableById(a, b),
      );
    continuing = withStartDate[0];
    continueReason = continuing
      ? "Your longest-running current game."
      : "";
  }

  return [
    priority
      ? {
          lane: "priority",
          title: "Your priority",
          game: priority,
          reason: `First in your queue.${moodReason(selectedGenres)}`,
        }
      : null,
    quick
      ? {
          lane: "quick",
          title: "Quick win",
          game: quick,
          reason: `Shortest known estimate: about ${knownHours(quick)}h.${moodReason(selectedGenres)}`,
        }
      : null,
    continuing
      ? {
          lane: "continue",
          title: "Continue playing",
          game: continuing,
          reason: `${continueReason}${moodReason(selectedGenres)}`,
        }
      : null,
  ].filter(Boolean);
}

export function surprisePool({
  pool,
  games,
  queueIds,
  statusGroupOf,
  selectedGenres = [],
}) {
  const eligible = eligibleGames(games, statusGroupOf);
  if (pool === "next-up") {
    const byId = new Map(eligible.map((game) => [String(game.id), game]));
    return queueIds
      .map((id) => byId.get(String(id)))
      .filter((game) => game && matchesMyGenres(game, selectedGenres));
  }
  if (pool === "backlog") {
    return eligible
      .filter((game) => matchesMyGenres(game, selectedGenres))
      .sort(stableById);
  }
  return [];
}

export function moveQueueItem(gameIds, gameId, destination) {
  const ids = [...gameIds];
  const from = ids.findIndex((id) => String(id) === String(gameId));
  if (from < 0) return ids;
  let to = from;
  if (destination === "up") to = Math.max(0, from - 1);
  if (destination === "down") to = Math.min(ids.length - 1, from + 1);
  if (destination === "top") to = 0;
  if (typeof destination === "number") {
    to = Math.max(0, Math.min(ids.length - 1, destination));
  }
  if (to === from) return ids;
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved);
  return ids;
}
