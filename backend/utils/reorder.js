import { badRequest, notFound } from "./httpError.js";
import { normStatus } from "./status.js";

export function resolveTargetStatus(currentStatus, requestedStatus) {
  return requestedStatus === undefined || requestedStatus === null
    ? currentStatus
    : normStatus(requestedStatus);
}

export function assertSameRank(currentRank, targetRank) {
  if (targetRank == null || currentRank == null) {
    throw badRequest("unknown status/rank");
  }
  if (targetRank !== currentRank) {
    throw badRequest("Cross-rank reorder not allowed");
  }
}

export function buildReorderedRankList(peerRows, gameId, targetIndex) {
  const list = (Array.isArray(peerRows) ? peerRows : []).map((row) => ({
    id: row.id,
    position: row.position ?? 0,
  }));
  const fromIndex = list.findIndex((row) => row.id === gameId);
  if (fromIndex === -1) throw notFound("Game not in target rank group");

  const [moved] = list.splice(fromIndex, 1);
  const clampedIndex = Math.max(0, Math.min(Math.trunc(targetIndex), list.length));
  list.splice(clampedIndex, 0, moved);
  return list;
}
