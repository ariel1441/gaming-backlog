import { api } from "./apiClient";

export function getSteamAccount(opts = {}) {
  return api.get("/api/steam/account", opts);
}

export function startSteamLink(opts = {}) {
  return api.get("/api/steam/auth/start", { credentials: "include", ...opts });
}

export function devLinkSteam(steamId, opts = {}) {
  return api.post("/api/steam/dev-link", { steamId }, opts);
}

export function disconnectSteam(opts = {}) {
  return api.del("/api/steam/account", opts);
}

export function startSteamLibrarySync(opts = {}) {
  return api.post("/api/steam/sync", {}, opts);
}

export function getSteamLibrarySyncJob(jobId, opts = {}) {
  return api.get(`/api/steam/sync/${jobId}`, opts);
}

export function cancelSteamLibrarySync(jobId, opts = {}) {
  return api.del(`/api/steam/sync/${jobId}`, opts);
}

function waitForPoll(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timer);
        reject(signal.reason || new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function syncSteamLibrary(opts = {}) {
  const started = await startSteamLibrarySync(opts);
  let job = started?.job;
  if (!job?.id) throw new Error("Steam sync did not return a job ID.");

  while (["queued", "running"].includes(job.status)) {
    await waitForPoll(750, opts.signal);
    const payload = await getSteamLibrarySyncJob(job.id, opts);
    job = payload?.job;
  }
  if (job?.status === "completed") return job.result || {};
  const error = new Error(
    job?.errorMessage ||
      (job?.status === "cancelled"
        ? "Steam sync was cancelled."
        : "Steam sync failed."),
  );
  error.code = job?.errorCode || `steam_sync_${job?.status || "failed"}`;
  throw error;
}

export function syncSteamAchievements(opts = {}) {
  return api.post("/api/steam/achievements/sync", {}, opts);
}

export function syncSteamGameAchievements(gameId, opts = {}) {
  return api.post(`/api/steam/games/${gameId}/achievements/sync`, {}, opts);
}

export function applySteamStatusSuggestion(gameId, payload, opts = {}) {
  return api.post(`/api/steam/games/${gameId}/status-suggestion`, payload, opts);
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
