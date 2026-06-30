const BASE_URL = "https://api.rawg.io/api/games";

function apiKey() {
  const RAWG_API_KEY = process.env.RAWG_API_KEY;
  if (!RAWG_API_KEY) {
    console.error("RAWG_API_KEY is missing!");
    return null;
  }
  return RAWG_API_KEY;
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
      ? game.genres.map((genre) => ({ name: genre?.name })).filter((genre) => genre.name)
      : [],
  };
}

export async function searchRAWGGames(query, { pageSize = 8 } = {}) {
  try {
    const key = apiKey();
    if (!key) return [];

    const search = String(query || "").trim();
    if (!search) return [];

    const searchUrl = `${BASE_URL}?key=${key}&search=${encodeURIComponent(
      search
    )}&page_size=${Math.min(Math.max(Number(pageSize) || 8, 1), 20)}`;
    const searchRes = await fetch(searchUrl);

    if (!searchRes.ok) {
      console.error(
        `RAWG search failed: ${searchRes.status} ${searchRes.statusText}`
      );
      return [];
    }

    const searchData = await searchRes.json();
    return (searchData.results || [])
      .map(serializeRawgSearchResult)
      .filter((game) => game?.rawg_id && game?.name);
  } catch (err) {
    console.error(`Error searching RAWG for "${query}":`, err);
    return [];
  }
}

export async function fetchRAWGGames(params = {}, { pageSize = 20 } = {}) {
  try {
    const key = apiKey();
    if (!key) return [];

    const searchParams = new URLSearchParams();
    searchParams.set("key", key);
    searchParams.set("page_size", String(Math.min(Math.max(Number(pageSize) || 20, 1), 40)));
    Object.entries(params).forEach(([paramKey, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.set(paramKey, String(value));
      }
    });

    const listRes = await fetch(`${BASE_URL}?${searchParams.toString()}`);
    if (!listRes.ok) {
      console.error(`RAWG list failed: ${listRes.status} ${listRes.statusText}`);
      return [];
    }

    const listData = await listRes.json();
    return (listData.results || [])
      .map(serializeRawgSearchResult)
      .filter((game) => game?.rawg_id && game?.name);
  } catch (err) {
    console.error("Error fetching RAWG game list:", err);
    return [];
  }
}

export async function fetchGameDataByIdOrSlug(idOrSlug) {
  try {
    const key = apiKey();
    if (!key) return null;

    const value = String(idOrSlug || "").trim();
    if (!value) return null;

    const detailUrl = `${BASE_URL}/${encodeURIComponent(value)}?key=${key}`;
    const detailRes = await fetch(detailUrl);

    if (!detailRes.ok) {
      console.error(
        `RAWG detail fetch failed for "${value}": ${detailRes.status} ${detailRes.statusText}`
      );
      return null;
    }

    const gameDetails = await detailRes.json();
    console.log("Game details fetched:", gameDetails.name);

    return gameDetails;
  } catch (err) {
    console.error(`Error fetching game data from RAWG for "${idOrSlug}":`, err);
    return null;
  }
}

export async function fetchGameData(gameName) {
  try {
    const RAWG_API_KEY = apiKey();
    if (!RAWG_API_KEY) return null;

    const searchUrl = `${BASE_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(gameName)}&page_size=1`;
    const searchRes = await fetch(searchUrl);

    if (!searchRes.ok) {
      console.error(`RAWG search failed: ${searchRes.status} ${searchRes.statusText}`);
      return null;
    }

    const searchData = await searchRes.json();
    const firstResult = searchData.results?.[0];
    if (!firstResult) {
      console.warn(`No search results found for: "${gameName}"`);
      return null;
    }

    const gameSlug = firstResult.slug;
    return fetchGameDataByIdOrSlug(gameSlug);

  } catch (err) {
    console.error(`Error fetching game data from RAWG for "${gameName}":`, err);
    return null;
  }
}
