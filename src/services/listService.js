import { api, getLatest } from "./apiClient";

export function listUserLists(opts = {}) {
  return getLatest("/api/lists", opts, "user-lists");
}

export function createUserList(payload, opts = {}) {
  return api.post("/api/lists", payload, opts);
}

export function getUserList(id, opts = {}) {
  return api.get(`/api/lists/${id}`, opts);
}

export function updateUserList(id, payload, opts = {}) {
  return api.put(`/api/lists/${id}`, payload, opts);
}

export function deleteUserList(id, opts = {}) {
  return api.del(`/api/lists/${id}`, opts);
}

export function addGameToList(id, gameId, opts = {}) {
  return api.post(`/api/lists/${id}/games`, { gameId }, opts);
}

export function removeGameFromList(id, gameId, opts = {}) {
  return api.del(`/api/lists/${id}/games/${gameId}`, opts);
}

export function reorderListGames(id, payload, opts = {}) {
  return api.patch(`/api/lists/${id}/games/reorder`, payload, opts);
}
