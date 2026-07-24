// src/services/gameService.js
import { api, getLatest } from "./apiClient";

// List all games for the logged-in user
// Use getLatest with a shared key so only the newest list load can resolve
export function listGames(opts = {}) {
  return getLatest("/api/games", opts, "games-list");
}

// Create a game
export function createGame(payload, opts = {}) {
  return api.post("/api/games", payload, opts);
}

export function searchGames(query, opts = {}) {
  const q = encodeURIComponent(String(query || "").trim());
  return api.get(`/api/games/search?q=${q}`, opts);
}

// Update a game
export function updateGame(id, put, opts = {}) {
  return api.put(`/api/games/${id}`, put, opts);
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
