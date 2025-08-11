// src/services/gameService.js
import { api } from "./apiClient";

// List all games for the logged-in user
export function listGames(opts = {}) {
  return api.get("/api/games", opts);
}

// Create a game
export function createGame(payload, opts = {}) {
  return api.post("/api/games", payload, opts);
}

// Update a game (partial)
export function updateGame(id, put, opts = {}) {
  return api.put(`/api/games/${id}`, put, opts);
}

// Delete a game
export function deleteGame(id, opts = {}) {
  return api.del(`/api/games/${id}`, opts);
}

// ✅ Reorder a single game within a status (or move to another status)
export function reorderGames({ id, targetIndex, status, toIndex }, opts = {}) {
  // server expects { targetIndex, status } — we keep toIndex as alias for safety
  const idx = typeof targetIndex === "number" ? targetIndex : toIndex;
  return api.patch(
    `/api/games/${id}/position`,
    { targetIndex: idx, status },
    opts
  );
}
