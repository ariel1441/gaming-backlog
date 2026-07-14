export function metadataJobProgress(job) {
  const total = Math.max(0, Number(job?.totalCount || 0));
  const processed = Math.min(total, Math.max(0, Number(job?.processedCount || 0)));
  return {
    total,
    processed,
    percent: total ? Math.round((processed / total) * 100) : job ? 100 : 0,
    active: ["queued", "running", "paused"].includes(job?.status),
  };
}

export function groupMetadataCandidates(candidates = []) {
  const groups = new Map();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate?.gameId) continue;
    const key = String(candidate.gameId);
    const group = groups.get(key) || {
      gameId: candidate.gameId,
      gameName: candidate.gameName || "Untitled game",
      candidates: [],
    };
    group.candidates.push(candidate);
    groups.set(key, group);
  }
  return [...groups.values()];
}
