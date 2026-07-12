import {
  ProviderRequestError,
  fetchProviderResponse,
  providerHttpError,
  readProviderJson,
} from "./providerFetch.js";

const BASE_URL = "https://api.rawg.io/api/games";
const RAWG_TIMEOUT_MS = Number(process.env.RAWG_TIMEOUT_MS) || 10_000;
const RAWG_MAX_RESPONSE_BYTES =
  Number(process.env.RAWG_MAX_RESPONSE_BYTES) || 2 * 1024 * 1024;

function apiKey() {
  const key = process.env.RAWG_API_KEY;
  if (!key) {
    throw new ProviderRequestError(
      "rawg",
      "rawg_not_configured",
      "RAWG is not configured.",
      { retryable: false },
    );
  }
  return key;
}

async function rawgJson(url, { allowNotFound = false } = {}) {
  const response = await fetchProviderResponse("rawg", url, {
    headers: { Accept: "application/json" },
    timeoutMs: RAWG_TIMEOUT_MS,
    maxBytes: RAWG_MAX_RESPONSE_BYTES,
  });
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) throw providerHttpError("rawg", response);
  return readProviderJson("rawg", response, {
    maxBytes: RAWG_MAX_RESPONSE_BYTES,
  });
}

export function serializeRawgSearchResult(game) {
  if (!game) return null;
  return {
    rawg_id: game.id ?? null,
    rawg_slug: game.slug ?? null,
    name: game.name ?? "",
    released: game.released ?? null,
    cover: game.background_image ?? null,
    rating:
      typeof game.rating === "number" && game.rating > 0 ? game.rating : null,
    metacritic:
      typeof game.metacritic === "number" && game.metacritic > 0
        ? game.metacritic
        : null,
    added: typeof game.added === "number" ? game.added : 0,
    ratings_count:
      typeof game.ratings_count === "number" ? game.ratings_count : 0,
    reviews_count:
      typeof game.reviews_count === "number" ? game.reviews_count : 0,
    playtime: typeof game.playtime === "number" ? game.playtime : null,
    genres: Array.isArray(game.genres)
      ? game.genres
          .map((genre) => ({ name: genre?.name }))
          .filter((genre) => genre.name)
      : [],
  };
}

function serializeResults(data) {
  return (Array.isArray(data?.results) ? data.results : [])
    .map(serializeRawgSearchResult)
    .filter((game) => game?.rawg_id && game?.name);
}

export async function searchRAWGGames(query, { pageSize = 8 } = {}) {
  const search = String(query || "").trim();
  if (!search) return [];
  const url = new URL(BASE_URL);
  url.searchParams.set("key", apiKey());
  url.searchParams.set("search", search);
  url.searchParams.set(
    "page_size",
    String(Math.min(Math.max(Number(pageSize) || 8, 1), 20)),
  );
  return serializeResults(await rawgJson(url));
}

export async function fetchRAWGGames(params = {}, { pageSize = 20 } = {}) {
  const url = new URL(BASE_URL);
  url.searchParams.set("key", apiKey());
  url.searchParams.set(
    "page_size",
    String(Math.min(Math.max(Number(pageSize) || 20, 1), 40)),
  );
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return serializeResults(await rawgJson(url));
}

export async function fetchGameDataByIdOrSlug(idOrSlug) {
  const value = String(idOrSlug || "").trim();
  if (!value) return null;
  const url = new URL(`${BASE_URL}/${encodeURIComponent(value)}`);
  url.searchParams.set("key", apiKey());
  return rawgJson(url, { allowNotFound: true });
}

export async function fetchGameData(gameName) {
  const search = String(gameName || "").trim();
  if (!search) return null;
  const url = new URL(BASE_URL);
  url.searchParams.set("key", apiKey());
  url.searchParams.set("search", search);
  url.searchParams.set("page_size", "1");
  const data = await rawgJson(url);
  const firstResult = data?.results?.[0];
  if (!firstResult) return null;
  return fetchGameDataByIdOrSlug(firstResult.slug || firstResult.id);
}
