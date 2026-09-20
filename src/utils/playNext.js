import { personalGenreNames } from "./gameList.js";
import { resolveGameHours } from "./hours.js";

function numericId(game) {
  const id = Number(game?.id);
  return Number.isFinite(id) ? id : Number.MAX_SAFE_INTEGER;
}

function stableById(a, b) {
  return numericId(a) - numericId(b);
}

function knownHours(game) {
  const hours = Number(resolveGameHours(game).hours);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function lengthReason(game, kind) {
  const resolved = resolveGameHours(game);
  if (!resolved.hours) return "";
  if (resolved.sourceLabel === "RAWG playtime fallback") {
    return `RAWG playtime signal: about ${resolved.hours}h, not a completion estimate.`;
  }
  return `${kind} estimate: about ${resolved.hours}h.`;
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
      String(game?.status || "").trim().toLowerCase() !== "wishlist" &&
      !["playing", "done"].includes(
        playNextStatusGroup(game?.status, statusGroupOf),
      ),
  );
}

function genresOf(game) {
  return personalGenreNames(game).map((genre) => genre.toLowerCase());
}

const MAIN_GENRES = new Set(["story focus", "rpg", "open world"]);
const MAIN_SUPPORTING_GENRES = new Set([
  "soulslike",
  "strategy",
  "survival",
  "metroidvania",
]);
const SIDE_GENRES = new Set([
  "roguelike",
  "platformer",
  "beat em up",
  "card game",
  "relaxing",
]);
const SIDE_SUPPORTING_GENRES = new Set(["action", "shooter"]);
const DROP_IN_GENRES = new Set([
  "roguelike",
  "platformer",
  "beat em up",
  "card game",
  "shooter",
]);
const INTENSE_GENRES = new Set(["soulslike", "action", "horror", "shooter"]);

function intersects(values, expected) {
  return values.some((value) => expected.has(value));
}

export function focusRoleCandidates({
  games = [],
  role,
  partnerGame = null,
  queueIds = [],
  statusGroupOf,
}) {
  const queuePosition = new Map(
    queueIds.map((id, index) => [String(id), index]),
  );
  const partnerGenres = genresOf(partnerGame);
  const partnerNeedsContext = intersects(
    partnerGenres,
    new Set(["story focus", "rpg", "open world", "strategy"]),
  );
  const partnerIsIntense = intersects(partnerGenres, INTENSE_GENRES);

  return games
    .map((game) => {
      const genres = genresOf(game);
      const hours = knownHours(game);
      const active = playNextStatusGroup(game.status, statusGroupOf) === "playing";
      let score = 0;
      let reason = active ? "Already in Playing." : "Available from your backlog.";

      const position = queuePosition.get(String(game.id));
      if (position != null) {
        if (!active) reason = position === 0 ? "First in your shortlist." : "Saved in your shortlist.";
      }

      if (role === "main") {
        if (hours != null && hours >= 20) {
          score += 4;
          if (!active) reason = lengthReason(game, "Longer total");
        } else if (hours != null && hours >= 12) score += 1;
        if (intersects(genres, MAIN_GENRES)) {
          score += 3;
          if (!active && hours == null) reason = "Your genres suggest a substantial, continuity-friendly game.";
        } else if (intersects(genres, MAIN_SUPPORTING_GENRES)) score += 1;
      } else {
        if (hours != null && hours <= 12) {
          score += 6;
          if (!active) reason = lengthReason(game, "Shorter total");
        } else if (hours != null && hours <= 20) score += 2;
        if (intersects(genres, SIDE_GENRES)) {
          score += 3;
          if (!active && hours == null) reason = "Your genres suggest a flexible Side-game fit.";
        } else if (intersects(genres, SIDE_SUPPORTING_GENRES)) score += 1;
        if (partnerNeedsContext && intersects(genres, DROP_IN_GENRES)) {
          score += 2;
          if (!active) reason = "A drop-in contrast to your current Main game.";
        }
        if (partnerIsIntense && genres.includes("relaxing")) {
          score += 2;
          if (!active) reason = "A calmer contrast to your current Main game.";
        }
      }

      const strongThreshold = role === "main" ? 4 : 5;
      const possibleThreshold = role === "main" ? 1 : 2;
      const roleLabel = role === "main" ? "Main" : "Side";
      const fitLabel = active
        ? "Already playing"
        : score >= strongThreshold
          ? `Strong ${roleLabel} fit`
          : score >= possibleThreshold
            ? `Possible ${roleLabel} fit`
            : `Unusual ${roleLabel} fit`;
      const fitRank = active
        ? 0
        : score >= strongThreshold
          ? 1
          : score >= possibleThreshold
            ? 2
            : 3;

      return { game, score, reason, active, fitLabel, fitRank };
    })
    .sort(
      (a, b) =>
        Number(playNextStatusGroup(b.game.status, statusGroupOf) === "playing") -
          Number(playNextStatusGroup(a.game.status, statusGroupOf) === "playing") ||
        b.score - a.score ||
        Number(a.game?.status_rank ?? Number.MAX_SAFE_INTEGER) -
          Number(b.game?.status_rank ?? Number.MAX_SAFE_INTEGER) ||
        Number(a.game?.position ?? Number.MAX_SAFE_INTEGER) -
          Number(b.game?.position ?? Number.MAX_SAFE_INTEGER) ||
        stableById(a.game, b.game),
    );
}

export function focusSuggestionGroups({ candidates = [], queueIds = [] }) {
  const queuePosition = new Map(
    queueIds.map((id, index) => [String(id), index]),
  );
  const backlogPool = candidates
    .filter(({ active }) => !active)
    .sort(
      (a, b) =>
        Number(a.game?.status_rank ?? Number.MAX_SAFE_INTEGER) -
          Number(b.game?.status_rank ?? Number.MAX_SAFE_INTEGER) ||
        Number(a.game?.position ?? Number.MAX_SAFE_INTEGER) -
          Number(b.game?.position ?? Number.MAX_SAFE_INTEGER) ||
        stableById(a.game, b.game),
    );
  const backlogPosition = new Map(
    backlogPool.map(({ game }, index) => [String(game.id), index]),
  );
  const decorate = (candidate, source) => {
    const sourcePosition =
      source === "shortlist"
        ? queuePosition.get(String(candidate.game.id))
        : backlogPosition.get(String(candidate.game.id));
    return {
      ...candidate,
      source,
      sourcePosition,
      sourceLabel:
        source === "playing"
          ? "Already playing"
          : source === "shortlist"
            ? `Shortlist #${sourcePosition + 1}`
            : `Backlog priority #${sourcePosition + 1}`,
    };
  };
  const active = candidates
    .filter(({ active: isActive }) => isActive)
    .map((candidate) => decorate(candidate, "playing"));
  const shortlist = backlogPool
    .filter(({ game }) => queuePosition.has(String(game.id)))
    .sort(
      (a, b) =>
        a.fitRank - b.fitRank ||
        queuePosition.get(String(a.game.id)) -
          queuePosition.get(String(b.game.id)),
    )
    .map((candidate) => decorate(candidate, "shortlist"));
  const backlog = backlogPool
    .filter(({ game }) => !queuePosition.has(String(game.id)))
    .sort(
      (a, b) =>
        a.fitRank - b.fitRank ||
        backlogPosition.get(String(a.game.id)) -
          backlogPosition.get(String(b.game.id)),
    )
    .map((candidate) => decorate(candidate, "backlog"));

  let recommended = [];
  if (shortlist.length && backlog.length) {
    recommended = [shortlist[0], backlog[0]];
  } else {
    recommended = (shortlist.length ? shortlist : backlog).slice(0, 2);
  }

  return { active, shortlist, backlog, recommended };
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

  const priority =
    withoutDismissed(eligibleQueue, dismissed.priority)[0] ||
    (selectedGenres.length
      ? withoutDismissed(eligible, dismissed.priority)[0]
      : null);

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
          reason: `${eligibleQueue.includes(priority) ? "First matching game in your shortlist." : "Highest matching game in your backlog."}${moodReason(selectedGenres)}`,
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
