// src/services/gameService.js
import { api } from "./apiClient";

// You can pass opts={ auth:false, headers:getAuthHeaders(), signal } from hooks

export function listGames(opts = {}) {
  return api.get("/api/games", opts);
}

export function createGame(game, opts = {}) {
  return api.post("/api/games", game, opts);
}

// Backend expects PUT /api/games/:id and requires name + status
export function updateGame(id, body, opts = {}) {
  return api.put(`/api/games/${id}`, body, opts);
}

export function deleteGame(id, opts = {}) {
  return api.del(`/api/games/${id}`, opts);
}

// If you later switch to batch reorder
export function reorderGames({ status, gameIds }, opts = {}) {
  return api.patch("/api/games/reorder", { status, gameIds }, opts);
}
