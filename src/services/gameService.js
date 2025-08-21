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

// Update a game
export function updateGame(id, put, opts = {}) {
  return api.put(`/api/games/${id}`, put, opts);
}

// Delete a game
export function deleteGame(id, opts = {}) {
  return api.del(`/api/games/${id}`, opts);
}

// Reorder a single game within a rank (or move across same-rank statuses)
export function reorderGames({ id, targetIndex, status, toIndex }, opts = {}) {
  const idx =
    typeof targetIndex === "number"
      ? targetIndex
      : typeof toIndex === "number"
        ? toIndex
        : undefined;

  return api.patch(
    `/api/games/${id}/position`,
    { targetIndex: idx, status },
    opts
  );
}
