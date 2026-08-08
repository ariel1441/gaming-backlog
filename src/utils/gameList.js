import { smartFuzzySearch } from "./fuzzySearch.js";
import { parseGameDate } from "./gameDateInsights.js";
import { hoursValueForList } from "./hours.js";
import {
  NO_PERSONAL_GENRE_FILTER,
  NO_RAWG_GENRE_FILTER,
} from "./filterOptions.js";

const normalize = (value = "") => String(value).toLowerCase().trim();
const titleCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

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
        (candidate) => normalizeGameTitle(candidate) === normalizedTitle,
      );
    }) || null
  );
}

export function splitCsv(value) {
  if (Array.isArray(value)) {
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function personalGenreNames(game) {
  if (Array.isArray(game?.personal_genres)) {
    return game.personal_genres
      .map((genre) =>
        typeof genre === "string" ? genre : genre?.name,
      )
      .map((name) => String(name || "").trim())
      .filter(Boolean);
  }
  return splitCsv(game?.my_genre);
}

const numberOrMax = (value) =>
  Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER;

const numberOrNegativeInfinity = (value) =>
  value == null || Number.isNaN(Number(value)) ? -Infinity : Number(value);

const dateValue = (value) => (value ? Date.parse(value) || 0 : 0);

const validDateValue = (value) => {
  const parsed = parseGameDate(value);
  if (parsed) return parsed.timestamp;
  const nativeTimestamp = Date.parse(value);
  return Number.isFinite(nativeTimestamp) ? nativeTimestamp : null;
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
  { sortKey = "", isReversed = false } = {},
) {
  const dateSortKey =
    sortKey === "startedDate" ||
    sortKey === "finishedDate" ||
    sortKey === "steamLastPlayed"
      ? sortKey
      : "";
  const sorted = [...(Array.isArray(games) ? games : [])].sort((a, b) => {
    switch (sortKey) {
      case "name":
        return titleCollator.compare(
          String(a?.name || ""),
          String(b?.name || ""),
        );
      case "hoursPlayed":
        return (
          numberOrNegativeInfinity(a?.hoursPlayed ?? hoursValueForList(a)) -
          numberOrNegativeInfinity(b?.hoursPlayed ?? hoursValueForList(b))
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
      case "steamLastPlayed":
        return compareOptionalDates(a, b, "steamLastPlayedAt", isReversed);
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
    Date.UTC(date.getFullYear(), date.getMonth() - months, date.getDate()),
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

export function matchesSourceFilter(
  game,
  sourceFilter = "all",
  now = new Date(),
) {
  switch (sourceFilter) {
    case "steam_linked":
      return !!game?.steamOwned;
    case "steam_unlinked":
      return !game?.steamOwned;
    case "steam_playtime":
      return !!game?.steamOwned && Number(game?.steamPlaytimeHours || 0) > 0;
    case "steam_no_playtime":
      return !!game?.steamOwned && Number(game?.steamPlaytimeHours || 0) <= 0;
    case "steam_recent": {
      if (!game?.steamOwned || !game?.steamLastPlayedAt) return false;
      const playedAt = Date.parse(game.steamLastPlayedAt);
      const current = now instanceof Date ? now.getTime() : Date.parse(now);
      if (!Number.isFinite(playedAt) || !Number.isFinite(current)) return false;
      return playedAt >= current - 30 * 24 * 60 * 60 * 1000;
    }
    case "steam_achievements":
      return (
        !!game?.steamOwned &&
        game?.steamAchievements?.status === "synced" &&
        Number(game?.steamAchievements?.total || 0) > 0
      );
    case "steam_achievements_complete":
      return (
        !!game?.steamOwned &&
        game?.steamAchievements?.status === "synced" &&
        Number(game?.steamAchievements?.percent || 0) >= 100
      );
    case "steam_achievements_close": {
      const percent = Number(game?.steamAchievements?.percent);
      return (
        !!game?.steamOwned &&
        game?.steamAchievements?.status === "synced" &&
        Number.isFinite(percent) &&
        percent >= 80 &&
        percent < 100
      );
    }
    case "steam_achievements_not_synced":
      return (
        !!game?.steamOwned &&
        (!game?.steamAchievements?.lastSyncedAt ||
          !game?.steamAchievements?.status ||
          game?.steamAchievements?.status === "unknown")
      );
    case "steam_achievements_unavailable":
      return (
        !!game?.steamOwned &&
        ["private", "unavailable", "failed"].includes(
          game?.steamAchievements?.status,
        )
      );
    case "all":
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
    sourceFilter = "all",
    now = new Date(),
  } = {},
) {
  const statuses = selectedStatuses.length
    ? new Set(selectedStatuses.map(normalize))
    : null;
  const wantsNoRawgGenre = selectedGenres.includes(NO_RAWG_GENRE_FILTER);
  const genres = selectedGenres.some((value) => value !== NO_RAWG_GENRE_FILTER)
    ? new Set(
        selectedGenres
          .filter((value) => value !== NO_RAWG_GENRE_FILTER)
          .map(normalize),
      )
    : null;
  const wantsNoPersonalGenre = selectedMyGenres.includes(
    NO_PERSONAL_GENRE_FILTER,
  );
  const myGenres = selectedMyGenres.some(
    (value) => value !== NO_PERSONAL_GENRE_FILTER,
  )
    ? new Set(
        selectedMyGenres
          .filter((value) => value !== NO_PERSONAL_GENRE_FILTER)
          .map(normalize),
      )
    : null;
  const hoursActive = isHoursFilterActive(hoursRange, hoursBounds);

  return (Array.isArray(games) ? games : []).filter((game) => {
    if (!game) return false;

    if (statuses && !statuses.has(normalize(game.status))) return false;

    if (genres || wantsNoRawgGenre) {
      const gameGenres = splitCsv(game.genres).map(normalize).filter(Boolean);
      const matchesKnownGenre =
        !!genres && gameGenres.some((genre) => genres.has(genre));
      const matchesMissingGenre = wantsNoRawgGenre && gameGenres.length === 0;
      if (!matchesKnownGenre && !matchesMissingGenre) return false;
    }

    if (myGenres || wantsNoPersonalGenre) {
      const gameMyGenres = personalGenreNames(game)
        .map(normalize)
        .filter(Boolean);
      const matchesKnownGenre =
        !!myGenres && gameMyGenres.some((genre) => myGenres.has(genre));
      const matchesMissingGenre =
        wantsNoPersonalGenre && gameMyGenres.length === 0;
      if (!matchesKnownGenre && !matchesMissingGenre) return false;
    }

    if (hoursActive) {
      const hours = Number(hoursValueForList(game));
      if (!Number.isFinite(hours)) return false;
      if (hours < hoursRange.min || hours > hoursRange.max) return false;
    }

    if (!matchesDateFilter(game, dateFilter, now)) return false;
    if (!matchesSourceFilter(game, sourceFilter, now)) return false;

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
  sourceFilter = "all",
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
    sourceFilter,
  });

  const searched = searchQuery?.trim()
    ? smartFuzzySearch(filtered, searchQuery)
    : filtered;

  return sortGames(searched, { sortKey, isReversed });
}
