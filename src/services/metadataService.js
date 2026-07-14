import { api } from "./apiClient";

export function startMetadataRepair(opts = {}) {
  return api.post("/api/metadata/repair-jobs", {}, opts);
}

export function getLatestMetadataRepair(opts = {}) {
  return api.get("/api/metadata/repair-jobs/latest", opts);
}

export function listMetadataCandidates(
  { decision = "pending", limit = 100 } = {},
  opts = {},
) {
  return api.get(
    `/api/metadata/candidates?decision=${encodeURIComponent(decision)}&limit=${limit}`,
    opts,
  );
}

export function decideMetadataCandidate(id, action, opts = {}) {
  return api.patch(`/api/metadata/candidates/${id}`, { action }, opts);
}

export function selectGameMetadata(gameId, rawgId, opts = {}) {
  return api.post(
    `/api/metadata/games/${gameId}/select`,
    { rawg_id: rawgId },
    opts,
  );
}
