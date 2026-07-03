import { api } from "./apiClient";

export function getSteamAccount(opts = {}) {
  return api.get("/api/steam/account", opts);
}

export function startSteamLink(opts = {}) {
  return api.get("/api/steam/auth/start", opts);
}

export function devLinkSteam(steamId, opts = {}) {
  return api.post("/api/steam/dev-link", { steamId }, opts);
}

export function disconnectSteam(opts = {}) {
  return api.del("/api/steam/account", opts);
}

export function syncSteamLibrary(opts = {}) {
  return api.post("/api/steam/sync", {}, opts);
}

export function syncSteamAchievements(opts = {}) {
  return api.post("/api/steam/achievements/sync", {}, opts);
}

export function syncSteamGameAchievements(gameId, opts = {}) {
  return api.post(`/api/steam/games/${gameId}/achievements/sync`, {}, opts);
}

export function listSteamImportCandidates(params = {}, opts = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get(`/api/steam/import-candidates${suffix}`, opts);
}

export function updateSteamImportCandidate(id, payload, opts = {}) {
  return api.patch(`/api/steam/import-candidates/${id}`, payload, opts);
}

export function bulkUpdateSteamImportCandidates(payload, opts = {}) {
  return api.post("/api/steam/import-candidates/bulk", payload, opts);
}

export function autoMatchSteamImportCandidates(limit = 250, opts = {}) {
  return api.post("/api/steam/import-candidates/auto-match", { limit }, opts);
}

export function listSteamLinkCandidates(params = {}, opts = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get(`/api/steam/link-candidates${suffix}`, opts);
}

export function attachSteamCandidate(candidateId, gameId, opts = {}) {
  return api.post(`/api/steam/link-candidates/${candidateId}/attach`, { gameId }, opts);
}

export function unlinkSteamGame(gameId, steamAppId, opts = {}) {
  return api.del(`/api/steam/games/${gameId}/link/${steamAppId}`, opts);
}

export function listSteamDuplicateGames(opts = {}) {
  return api.get("/api/steam/duplicate-games", opts);
}

export function mergeSteamDuplicateGames(payload, opts = {}) {
  return api.post("/api/steam/duplicate-games/merge", payload, opts);
}

export function importSteamCandidates(candidateIds, opts = {}) {
  return api.post("/api/steam/import", { candidateIds }, opts);
}

export function importSteamCandidateScope(scope, opts = {}) {
  return api.post("/api/steam/import", { scope }, opts);
}
