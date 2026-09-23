// src/services/gameService.js
import { api, getLatest } from "./apiClient.js";

// List all games for the logged-in user
// Use getLatest with a shared key so only the newest list load can resolve
export function listGames(opts = {}) {
  return getLatest("/api/games", opts, "games-list");
}

export function listGamesPage(params = {}, opts = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== "") query.append(key, String(entry));
      });
    } else if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  return api.get(`/api/games?${query}`, opts);
}

export function lookupGames(params = {}, opts = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  return api.get(`/api/games/lookup?${query}`, opts);
}

// Create a game
export function createGame(payload, opts = {}) {
  return api.post("/api/games", payload, opts);
}

export function searchGames(query, opts = {}) {
  const q = encodeURIComponent(String(query || "").trim());
  const wishlistItemId = Number(opts.wishlistItemId);
  const wishlistQuery = Number.isInteger(wishlistItemId) && wishlistItemId > 0
    ? `&wishlist_item_id=${wishlistItemId}`
    : "";
  const requestOpts = { ...opts };
  delete requestOpts.wishlistItemId;
  return api.get(`/api/games/search?q=${q}${wishlistQuery}`, requestOpts);
}

// Update a game
export function updateGame(id, put, opts = {}) {
  return api.put(`/api/games/${id}`, put, opts);
}

export function refreshGameMetadata(id, opts = {}) {
  return api.post(`/api/games/${id}/metadata/refresh`, {}, opts);
}

export function getGameGenreSuggestions(id, opts = {}) {
  return api.get(`/api/games/${id}/genre-suggestions`, opts);
}

export function applyGameGenreSuggestions(id, personalGenreIds, expectedPersonalGenreIds, opts = {}) {
  return api.post(
    `/api/games/${id}/genre-suggestions`,
    { personalGenreIds, expectedPersonalGenreIds },
    opts,
  );
}

export function dismissGameGenreSuggestions(id, personalGenreIds, opts = {}) {
  return api.post(
    `/api/games/${id}/genre-suggestions/dismiss`,
    { personalGenreIds },
    opts,
  );
}

export function listGameGenreSuggestions(opts = {}) {
  const search = new URLSearchParams();
  if (Number.isInteger(opts.limit)) search.set("limit", String(opts.limit));
  if (Number.isInteger(opts.offset) && opts.offset > 0) search.set("offset", String(opts.offset));
  if (opts.onlyWithoutPersonalGenres) search.set("only_without_personal_genres", "true");
  const requestOpts = { ...opts };
  delete requestOpts.limit;
  delete requestOpts.offset;
  delete requestOpts.onlyWithoutPersonalGenres;
  const query = search.toString();
  return api.get(`/api/games/genre-suggestions${query ? `?${query}` : ""}`, requestOpts);
}

export function finishGame(id, payload, opts = {}) {
  return api.post(`/api/games/${id}/finish`, payload, opts);
}

export function updateFavoriteGames(favoriteIds, opts = {}) {
  return api.put("/api/games/favorites", { favoriteIds }, opts);
}

// Delete a game
export function deleteGame(id, opts = {}) {
  return api.del(`/api/games/${id}`, opts);
}

// Reorder a single game within a rank. Include status only for an explicit
// same-rank status move; plain drag reorder should leave status unchanged.
export function reorderGames({ id, targetIndex, status, toIndex }, opts = {}) {
  const idx =
    typeof targetIndex === "number"
      ? targetIndex
      : typeof toIndex === "number"
        ? toIndex
        : undefined;

  const body = { targetIndex: idx };
  if (status !== undefined) body.status = status;

  return api.patch(`/api/games/${id}/position`, body, opts);
}
