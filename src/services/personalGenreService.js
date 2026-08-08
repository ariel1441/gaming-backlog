import { api } from "./apiClient";

export function listPersonalGenres(opts = {}) {
  return api.get("/api/personal-genres", opts);
}

export function createPersonalGenre(name, opts = {}) {
  return api.post("/api/personal-genres", { name }, opts);
}

export function renamePersonalGenre(id, name, opts = {}) {
  return api.put(`/api/personal-genres/${id}`, { name }, opts);
}

export function mergePersonalGenre(id, targetId, opts = {}) {
  return api.post(`/api/personal-genres/${id}/merge`, { targetId }, opts);
}

export function deletePersonalGenre(id, opts = {}) {
  return api.del(`/api/personal-genres/${id}`, opts);
}
