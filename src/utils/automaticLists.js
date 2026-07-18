import { parseGameDate } from "./gameDateInsights.js";
import { hoursValueForList } from "./hours.js";
import { sortByDefaultOrder, splitCsv } from "./gameList.js";
import { defaultStatusSemantics } from "./statusSemantics.js";

const titleCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export const SMART_SORT_OPTIONS = [
  { value: "score", label: "Your score, highest first" },
  { value: "finishedDate", label: "Finish date, newest first" },
  { value: "releaseDate", label: "Release date, newest first" },
  { value: "hours", label: "Hours, shortest first" },
  { value: "default", label: "Backlog order" },
];

export const SMART_STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "finished", label: "Finished / done" },
  { value: "playing", label: "Currently playing" },
  { value: "started-unfinished", label: "Started but unfinished" },
  { value: "unfinished", label: "Not finished" },
];

export const SMART_CONTROL_OPTIONS = [
  { value: "status", label: "Game status" },
  { value: "finishedYear", label: "Finished year" },
  { value: "releasedYear", label: "Release year" },
  { value: "genre", label: "Genre" },
  { value: "maxHours", label: "Max hours" },
];

const SMART_STATUS_VALUES = new Set(SMART_STATUS_OPTIONS.map((option) => option.value));
const SMART_SORT_VALUES = new Set(SMART_SORT_OPTIONS.map((option) => option.value));
const SMART_CONTROL_VALUES = new Set(SMART_CONTROL_OPTIONS.map((option) => option.value));

export const SMART_LIST_TEMPLATES = [
  {
    key: "best-finished-year",
    name: "Best finished games",
    description: "Finished games for a chosen year, ranked by your score.",
    query: ({ year }) => ({
      status: "finished",
      finishedYear: year,
      exposedControls: ["finishedYear"],
    }),
    sortKey: "score",
  },
  {
    key: "released-year",
    name: "Best finished games by release year",
    description: "Finished games filtered by release year.",
    query: ({ year }) => ({
      status: "finished",
      releasedYear: year,
      exposedControls: ["releasedYear"],
    }),
    sortKey: "score",
  },
  {
    key: "genre",
    name: "Best games by genre",
    description: "Pick a genre and rank matching games by your score.",
    query: ({ genre }) => ({ genre, exposedControls: ["genre"] }),
    sortKey: "score",
  },
  {
    key: "short-backlog",
    name: "Short backlog games",
    description: "Unfinished games under a chosen hours limit.",
    query: () => ({
      status: "unfinished",
      maxHours: 10,
      exposedControls: ["maxHours"],
    }),
    sortKey: "hours",
  },
  {
    key: "recently-finished",
    name: "Recently finished",
    description: "Finished games ordered by the newest finish date.",
    query: () => ({ status: "finished" }),
    sortKey: "finishedDate",
  },
  {
    key: "currently-playing",
    name: "Currently playing",
    description: "Games marked as playing or started without a finish date.",
    query: () => ({ status: "playing" }),
    sortKey: "default",
  },
  {
    key: "started-unfinished",
    name: "Started but unfinished",
    description: "Started games without a finished date.",
    query: () => ({ status: "started-unfinished" }),
    sortKey: "default",
  },
  {
    key: "missing-hours",
    name: "Missing hours",
    description: "Games that still need useful playtime or estimate data.",
    query: () => ({ missingHours: true }),
    sortKey: "default",
  },
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value, maxLength = 120) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : "";
}

function numberOrNull(value, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return integer ? Math.trunc(number) : number;
}

export function normalizeSmartSortKey(sortKey = "score") {
  return SMART_SORT_VALUES.has(sortKey) ? sortKey : "score";
}

export function normalizeSmartQuery(query = {}) {
  const normalized = {};
  const status = typeof query?.status === "string" ? query.status : "";
  if (status && SMART_STATUS_VALUES.has(status)) normalized.status = status;

  const finishedYear = numberOrNull(query?.finishedYear, {
    min: 1970,
    max: 2200,
    integer: true,
  });
  if (finishedYear != null) normalized.finishedYear = finishedYear;

  const releasedYear = numberOrNull(query?.releasedYear, {
    min: 1970,
    max: 2200,
    integer: true,
  });
  if (releasedYear != null) normalized.releasedYear = releasedYear;

  const genre = cleanText(query?.genre, 80);
  if (genre) normalized.genre = genre;

  const maxHours = numberOrNull(query?.maxHours, { min: 0, max: 1000 });
  if (maxHours != null) normalized.maxHours = maxHours;

  const minScore = numberOrNull(query?.minScore, { min: 0, max: 10 });
  if (minScore != null) normalized.minScore = minScore;

  if (query?.missingHours === true) normalized.missingHours = true;

  if (Array.isArray(query?.exposedControls)) {
    const exposedControls = [];
    for (const control of query.exposedControls) {
      if (!SMART_CONTROL_VALUES.has(control) || exposedControls.includes(control)) continue;
      exposedControls.push(control);
    }
    if (exposedControls.length) normalized.exposedControls = exposedControls.slice(0, 5);
  }

  return normalized;
}

function currentYear(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return Number.isFinite(date.getFullYear()) ? date.getFullYear() : new Date().getFullYear();
}

function isDone(game, statusGroupOf) {
  return statusGroupOf(game?.status) === "done";
}

function isPlaying(game, statusGroupOf) {
  return statusGroupOf(game?.status) === "playing";
}

function scoreValue(game) {
  const score = Number(game?.my_score);
  return Number.isFinite(score) && score > 0 ? score : null;
}

function dateTime(value) {
  return parseGameDate(value)?.timestamp || 0;
}

function releaseTime(game) {
  return dateTime(game?.releaseDate || game?.released || game?.released_at);
}

function hoursValue(game) {
  const hours = Number(hoursValueForList(game));
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function genreMatches(game, genre) {
  const target = normalize(genre);
  if (!target) return true;
  const values = [...splitCsv(game?.my_genre), ...splitCsv(game?.genres)];
  return values.some((item) => normalize(item) === target);
}

function matchesStatus(game, status, statusGroupOf) {
  switch (status) {
    case "finished":
      return isDone(game, statusGroupOf);
    case "playing":
      return isPlaying(game, statusGroupOf);
    case "started-unfinished":
      return !!parseGameDate(game?.started_at) && !parseGameDate(game?.finished_at) && !isDone(game, statusGroupOf);
    case "unfinished":
      return !isDone(game, statusGroupOf);
    default:
      return true;
  }
}

function compareScore(a, b) {
  const scoreA = scoreValue(a);
  const scoreB = scoreValue(b);
  if (scoreA != null && scoreB != null && scoreA !== scoreB) return scoreB - scoreA;
  if (scoreA != null && scoreB == null) return -1;
  if (scoreA == null && scoreB != null) return 1;
  return sortByDefaultOrder(a, b);
}

export function smartListYears(games = [], field = "finished") {
  const years = new Set();
  for (const game of Array.isArray(games) ? games : []) {
    const date =
      field === "release"
        ? parseGameDate(game?.releaseDate || game?.released || game?.released_at)
        : parseGameDate(game?.finished_at);
    if (date?.year) years.add(date.year);
  }
  return Array.from(years).sort((a, b) => b - a);
}

export function smartListGenres(games = []) {
  const counts = new Map();
  for (const game of Array.isArray(games) ? games : []) {
    for (const genre of [...splitCsv(game?.my_genre), ...splitCsv(game?.genres)]) {
      const key = normalize(genre);
      if (!key) continue;
      const current = counts.get(key) || { value: genre, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  }
  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || titleCollator.compare(a.value, b.value)
  );
}

export function buildSmartQueryFromTemplate(templateKey, games = [], { now = new Date() } = {}) {
  const year = smartListYears(games)[0] || currentYear(now);
  const genre = smartListGenres(games)[0]?.value || "";
  const template =
    SMART_LIST_TEMPLATES.find((item) => item.key === templateKey) || SMART_LIST_TEMPLATES[0];
  return {
    name: template.name,
    description: template.description,
    query: normalizeSmartQuery(template.query({ year, genre })),
    sortKey: normalizeSmartSortKey(template.sortKey),
  };
}

export function smartListExposedControls(query = {}) {
  return normalizeSmartQuery(query).exposedControls || [];
}

function smartListEmptyState(query = {}) {
  if (query.missingHours) {
    return {
      emptyTitle: "No games are missing hours.",
      emptyDescription: "Every matching game already has usable playtime or estimate data.",
    };
  }
  if (query.finishedYear) {
    return {
      emptyTitle: `No finished games in ${query.finishedYear}.`,
      emptyDescription: "Choose another year, or add finish dates to games you completed then.",
    };
  }
  if (query.releasedYear) {
    return {
      emptyTitle: `No matching games released in ${query.releasedYear}.`,
      emptyDescription: "Choose another release year, or update release metadata in your backlog.",
    };
  }
  if (query.genre) {
    return {
      emptyTitle: `No games match ${query.genre}.`,
      emptyDescription: "Choose another genre, or update My genres in the backlog.",
    };
  }
  if (query.maxHours != null) {
    return {
      emptyTitle: `No games under ${query.maxHours} hours.`,
      emptyDescription: "Raise the hours limit, or add hour estimates to matching games.",
    };
  }
  if (query.status === "playing") {
    return {
      emptyTitle: "No currently playing games.",
      emptyDescription: "Mark a game as playing or add a start date to make it appear here.",
    };
  }
  if (query.status === "started-unfinished") {
    return {
      emptyTitle: "No started unfinished games.",
      emptyDescription: "Add start dates to unfinished games to fill this smart list.",
    };
  }
  if (query.status === "unfinished") {
    return {
      emptyTitle: "No unfinished games match.",
      emptyDescription: "Edit the rules, or add unfinished games to your backlog.",
    };
  }
  if (query.status === "finished") {
    return {
      emptyTitle: "No finished games match.",
      emptyDescription: "Edit the rules, or finish games in your backlog to fill this list.",
    };
  }
  return {
    emptyTitle: "No games match this smart list.",
    emptyDescription: "Edit the rules or update matching games in your backlog.",
  };
}

export function resolveSmartList(
  list,
  games = [],
  { statusGroupOf = defaultStatusSemantics.statusGroupOf } = {},
) {
  const query = normalizeSmartQuery(list?.query || {});
  const sortKey = normalizeSmartSortKey(list?.sortKey || "score");
  const filtered = (Array.isArray(games) ? games : []).filter((game) => {
    if (!matchesStatus(game, query.status, statusGroupOf)) return false;
    if (query.finishedYear && parseGameDate(game?.finished_at)?.year !== Number(query.finishedYear)) return false;
    if (query.releasedYear && parseGameDate(game?.releaseDate || game?.released || game?.released_at)?.year !== Number(query.releasedYear)) return false;
    if (query.genre && !genreMatches(game, query.genre)) return false;
    if (query.maxHours != null && query.maxHours !== "") {
      const hours = hoursValue(game);
      if (hours == null || hours > Number(query.maxHours)) return false;
    }
    if (query.minScore != null && query.minScore !== "") {
      const score = scoreValue(game);
      if (score == null || score < Number(query.minScore)) return false;
    }
    if (query.missingHours) {
      const hours = hoursValue(game);
      if (hours != null) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "score") return compareScore(a, b);
    if (sortKey === "finishedDate") {
      return dateTime(b?.finished_at) - dateTime(a?.finished_at) || sortByDefaultOrder(a, b);
    }
    if (sortKey === "releaseDate") {
      return releaseTime(b) - releaseTime(a) || sortByDefaultOrder(a, b);
    }
    if (sortKey === "hours") {
      const hoursA = hoursValue(a);
      const hoursB = hoursValue(b);
      if (hoursA != null && hoursB != null && hoursA !== hoursB) return hoursA - hoursB;
      if (hoursA != null && hoursB == null) return -1;
      if (hoursA == null && hoursB != null) return 1;
      return sortByDefaultOrder(a, b);
    }
    return sortByDefaultOrder(a, b);
  });

  return {
    games: sorted,
    ruleLabel: describeSmartQuery(query, sortKey),
    ...smartListEmptyState(query),
  };
}

export function describeSmartQuery(query = {}, sortKey = "score") {
  const normalizedQuery = normalizeSmartQuery(query);
  const normalizedSortKey = normalizeSmartSortKey(sortKey);
  const parts = [];
  const status = SMART_STATUS_OPTIONS.find((item) => item.value === (normalizedQuery.status || ""));
  if (status?.value) parts.push(status.label);
  if (normalizedQuery.finishedYear) parts.push(`Finished in ${normalizedQuery.finishedYear}`);
  if (normalizedQuery.releasedYear) parts.push(`Released in ${normalizedQuery.releasedYear}`);
  if (normalizedQuery.genre) parts.push(`Genre: ${normalizedQuery.genre}`);
  if (normalizedQuery.maxHours != null) parts.push(`Under ${normalizedQuery.maxHours} hours`);
  if (normalizedQuery.minScore != null) parts.push(`Score ${normalizedQuery.minScore}+`);
  if (normalizedQuery.missingHours) parts.push("Missing hours");
  const sort =
    SMART_SORT_OPTIONS.find((item) => item.value === normalizedSortKey)?.label || "Backlog order";
  return `${parts.length ? parts.join(" - ") : "All games"} - Ranked by ${sort.toLowerCase()}`;
}

// Compatibility aliases for the first Lists V1 test/route names.
export const automaticListYears = smartListYears;
export const automaticListGenres = smartListGenres;
