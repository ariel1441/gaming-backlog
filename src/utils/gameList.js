import { smartFuzzySearch } from "./fuzzySearch.js";
import { parseGameDate } from "./gameDateInsights.js";

const normalize = (value = "") => String(value).toLowerCase().trim();

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

export function findDuplicateGameByTitle(title, games = []) {
  const normalizedTitle = normalizeGameTitle(title);
  if (!normalizedTitle) return null;

  return (
    (Array.isArray(games) ? games : []).find((game) => {
      if (!game) return false;
      return [game.name, game.displayName].some(
        (candidate) => normalizeGameTitle(candidate) === normalizedTitle
      );
    }) || null
  );
}

export function splitCsv(value) {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const numberOrMax = (value) =>
  Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER;

const numberOrNegativeInfinity = (value) =>
  value == null || Number.isNaN(Number(value)) ? -Infinity : Number(value);

const dateValue = (value) => (value ? Date.parse(value) || 0 : 0);

const validDateValue = (value) => {
  const parsed = parseGameDate(value);
  return parsed ? parsed.timestamp : null;
};

const compareOptionalDates = (a, b, field, isReversed) => {
  const valueA = validDateValue(a?.[field]);
  const valueB = validDateValue(b?.[field]);
  const hasA = valueA != null;
  const hasB = valueB != null;

  if (hasA && hasB && valueA !== valueB) {
    return isReversed ? valueB - valueA : valueA - valueB;
  }
  if (hasA !== hasB) return hasA ? -1 : 1;
  return sortByDefaultOrder(a, b);
};

export function sortByDefaultOrder(a, b) {
  const rankA = a?.status_rank ?? 999;
  const rankB = b?.status_rank ?? 999;
  if (rankA !== rankB) return rankA - rankB;

  const positionA = a?.position ?? Number.POSITIVE_INFINITY;
  const positionB = b?.position ?? Number.POSITIVE_INFINITY;
  if (positionA !== positionB) return positionA - positionB;

  return numberOrMax(a?.id) - numberOrMax(b?.id);
}

export function sortGames(
  games = [],
  { sortKey = "", isReversed = false } = {}
) {
  const dateSortKey =
    sortKey === "startedDate" || sortKey === "finishedDate" ? sortKey : "";
  const sorted = [...(Array.isArray(games) ? games : [])].sort((a, b) => {
    switch (sortKey) {
      case "name":
        return String(a?.name || "").localeCompare(
          String(b?.name || ""),
          undefined,
          { sensitivity: "base" }
        );
      case "hoursPlayed":
        return (
          numberOrNegativeInfinity(a?.hoursPlayed ?? a?.how_long_to_beat) -
          numberOrNegativeInfinity(b?.hoursPlayed ?? b?.how_long_to_beat)
        );
      case "rawgRating":
        return (
          numberOrNegativeInfinity(a?.rawgRating ?? a?.rating) -
          numberOrNegativeInfinity(b?.rawgRating ?? b?.rating)
        );
      case "metacritic":
        return (
          numberOrNegativeInfinity(a?.metacritic) -
          numberOrNegativeInfinity(b?.metacritic)
        );
      case "releaseDate":
        return (
          dateValue(a?.releaseDate ?? a?.released) -
          dateValue(b?.releaseDate ?? b?.released)
        );
      case "startedDate":
        return compareOptionalDates(a, b, "started_at", isReversed);
      case "finishedDate":
        return compareOptionalDates(a, b, "finished_at", isReversed);
      default:
        return sortByDefaultOrder(a, b);
    }
  });

  if (isReversed && !dateSortKey) sorted.reverse();
  return sorted;
}

export function isHoursFilterActive(hoursRange, hoursBounds) {
  return (
    hoursBounds?.max > hoursBounds?.min &&
    !!hoursRange &&
    (hoursRange.min > hoursBounds.min || hoursRange.max < hoursBounds.max)
  );
}

function subtractMonths(date, months) {
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth() - months,
      date.getDate()
    )
  );
}

export function matchesDateFilter(game, dateFilter, now = new Date()) {
  if (!dateFilter?.type) return true;

  const started = parseGameDate(game?.started_at);
  const finished = parseGameDate(game?.finished_at);

  switch (dateFilter.type) {
    case "startedYear":
      return started?.year === Number(dateFilter.year);
    case "finishedYear":
      return finished?.year === Number(dateFilter.year);
    case "activeUnfinished":
      return !!started && !finished;
    case "activeOlderThanMonths": {
      if (!started || finished) return false;
      const months = Number.isFinite(Number(dateFilter.months))
        ? Math.max(0, Number(dateFilter.months))
        : 6;
      return started.timestamp <= subtractMonths(now, months).getTime();
    }
    default:
      return true;
  }
}

export function applyGameFilters(
  games = [],
  {
    selectedStatuses = [],
    selectedGenres = [],
    selectedMyGenres = [],
    hoursRange = null,
    hoursBounds = null,
    dateFilter = null,
    now = new Date(),
  } = {}
) {
  const statuses = selectedStatuses.length
    ? new Set(selectedStatuses.map(normalize))
    : null;
  const genres = selectedGenres.length
    ? new Set(selectedGenres.map(normalize))
    : null;
  const myGenres = selectedMyGenres.length
    ? new Set(selectedMyGenres.map(normalize))
    : null;
  const hoursActive = isHoursFilterActive(hoursRange, hoursBounds);

  return (Array.isArray(games) ? games : []).filter((game) => {
    if (!game) return false;

    if (statuses && !statuses.has(normalize(game.status))) return false;

    if (genres) {
      const gameGenres = splitCsv(game.genres).map(normalize);
      if (!gameGenres.some((genre) => genres.has(genre))) return false;
    }

    if (myGenres) {
      const gameMyGenres = splitCsv(game.my_genre).map(normalize);
      if (!gameMyGenres.some((genre) => myGenres.has(genre))) return false;
    }

    if (hoursActive) {
      const hours = Number(game?.how_long_to_beat);
      if (!Number.isFinite(hours)) return false;
      if (hours < hoursRange.min || hours > hoursRange.max) return false;
    }

    if (!matchesDateFilter(game, dateFilter, now)) return false;

    return true;
  });
}

export function buildDisplayGames({
  games = [],
  searchQuery = "",
  selectedStatuses = [],
  selectedGenres = [],
  selectedMyGenres = [],
  hoursRange = null,
  hoursBounds = null,
  dateFilter = null,
  sortKey = "",
  isReversed = false,
} = {}) {
  const filtered = applyGameFilters(games, {
    selectedStatuses,
    selectedGenres,
    selectedMyGenres,
    hoursRange,
    hoursBounds,
    dateFilter,
  });

  const searched = searchQuery?.trim()
    ? smartFuzzySearch(filtered, searchQuery)
    : filtered;

  return sortGames(searched, { sortKey, isReversed });
}
