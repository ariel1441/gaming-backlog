import { personalGenreNames, sortGames, splitCsv } from "./gameList.js";
import { parseGameDate } from "./gameDateInsights.js";

const REVIEW_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function normalizeReviewText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function reviewText(game) {
  return String(game?.thoughts || "").trim();
}

export function hasReview(game) {
  return Boolean(reviewText(game));
}

export function formatReviewDate(value) {
  if (!value) return null;
  const parsed = parseGameDate(value);
  if (parsed?.date) return REVIEW_DATE_FORMATTER.format(parsed.date);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return REVIEW_DATE_FORMATTER.format(date);
}

export function hasRealScore(value) {
  if (value === null || value === undefined) return false;
  const stringValue = String(value).trim().toLowerCase();
  if (!stringValue || stringValue === "null" || stringValue === "undefined") {
    return false;
  }
  return Number.isFinite(Number(value));
}

export function formatReviewScore(value) {
  if (!hasRealScore(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function scoreValue(value) {
  return hasRealScore(value) ? Number(value) : -Infinity;
}

export function matchesReviewSearch(game, query) {
  const q = normalizeReviewText(query);
  if (!q) return true;
  const haystack = normalizeReviewText(
    [
      game?.name,
      game?.thoughts,
      personalGenreNames(game).join(" "),
      game?.genres,
      game?.status,
    ]
      .filter(Boolean)
      .join(" ")
  );
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export function sortReviewGames(games, sortKey, isReversed) {
  if (sortKey !== "myScore") return sortGames(games, { sortKey, isReversed });

  const sorted = [...(Array.isArray(games) ? games : [])].sort((a, b) => {
    const diff = scoreValue(a?.my_score) - scoreValue(b?.my_score);
    if (diff) return diff;
    return sortGames([a, b])[0] === a ? -1 : 1;
  });
  return isReversed ? sorted.reverse() : sorted;
}

export function filterReviewGames({
  games = [],
  search = "",
  reviewFilter = "all",
  sortKey = "",
  isReversed = false,
  isDone = () => false,
} = {}) {
  const filtered = (Array.isArray(games) ? games : [])
    .filter(hasReview)
    .filter((game) => matchesReviewSearch(game, search))
    .filter((game) => {
      if (reviewFilter === "completed") return isDone(game);
      if (reviewFilter === "notCompleted") return !isDone(game);
      return true;
    });

  return sortReviewGames(filtered, sortKey, isReversed);
}

export function reviewGenres(game, { myLimit = 2, rawgLimit = 1 } = {}) {
  return {
    myGenres: personalGenreNames(game).slice(0, myLimit),
    rawgGenres: splitCsv(game?.genres).slice(0, rawgLimit),
  };
}
