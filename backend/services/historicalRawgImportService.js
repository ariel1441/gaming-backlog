import {
  normalizeRawgDetailSnapshot,
  providerPayloadHash,
} from "./metadataIngestionService.js";

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function completenessScore(detail) {
  return [
    detail.coverUrl,
    detail.releasedAt,
    detail.descriptionHtml,
    detail.rawgRating,
    detail.metacritic,
    detail.rawgPlaytimeHours,
    detail.genres.length,
    detail.stores.length,
    detail.tags.length,
  ].reduce((score, value) => score + (value ? 1 : 0), 0);
}

export function buildHistoricalRawgImportPlan(cache, { sourceObservedAt } = {}) {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
    throw new TypeError("Historical RAWG cache must be a JSON object.");
  }

  const byRawgId = new Map();
  const invalidCodes = new Map();
  let validEntries = 0;
  let duplicateAliases = 0;
  let conflictingPayloads = 0;

  for (const payload of Object.values(cache)) {
    try {
      const detail = normalizeRawgDetailSnapshot(payload);
      validEntries += 1;
      const hash = providerPayloadHash(payload);
      const candidates = byRawgId.get(detail.rawgId) || new Map();
      if (candidates.has(hash)) {
        duplicateAliases += 1;
      } else {
        candidates.set(hash, {
          rawgId: detail.rawgId,
          payload,
          payloadHash: hash,
          fetchedAt: validDate(sourceObservedAt),
          providerUpdatedAt: validDate(payload.updated),
          completeness: completenessScore(detail),
        });
      }
      byRawgId.set(detail.rawgId, candidates);
    } catch (error) {
      const code = String(error?.code || "invalid_payload");
      invalidCodes.set(code, (invalidCodes.get(code) || 0) + 1);
    }
  }

  const items = [];
  for (const candidates of byRawgId.values()) {
    const ranked = [...candidates.values()].sort((left, right) => {
      if (right.completeness !== left.completeness) {
        return right.completeness - left.completeness;
      }
      return (
        (right.providerUpdatedAt?.getTime() || 0) -
        (left.providerUpdatedAt?.getTime() || 0)
      );
    });
    items.push(ranked[0]);
    conflictingPayloads += Math.max(0, ranked.length - 1);
  }
  items.sort((left, right) => left.rawgId - right.rawgId);

  return {
    items,
    report: {
      sourceEntries: Object.keys(cache).length,
      validEntries,
      invalidEntries: Object.keys(cache).length - validEntries,
      distinctRawgIds: items.length,
      duplicateAliases,
      conflictingPayloads,
      invalidCodes: Object.fromEntries([...invalidCodes].sort()),
    },
  };
}

export async function executeHistoricalRawgImport({
  items,
  ingestSnapshot,
  startAfterRawgId = 0,
  batchSize = 10,
  onBatchComplete = async () => {},
}) {
  if (typeof ingestSnapshot !== "function") {
    throw new TypeError("ingestSnapshot is required.");
  }
  const size = Math.min(Math.max(Number(batchSize) || 10, 1), 50);
  const pending = items.filter((item) => item.rawgId > startAfterRawgId);
  let imported = 0;
  let snapshotsStored = 0;

  for (let index = 0; index < pending.length; index += size) {
    const batch = pending.slice(index, index + size);
    const results = await Promise.all(
      batch.map((item) =>
        ingestSnapshot(item.payload, {
          expectedRawgId: item.rawgId,
          fetchedAt: item.fetchedAt || undefined,
          preserveExistingFull: true,
        }),
      ),
    );
    imported += results.length;
    snapshotsStored += results.filter((result) => result.snapshotStored).length;
    await onBatchComplete({
      lastRawgId: batch.at(-1).rawgId,
      imported,
      snapshotsStored,
    });
  }

  return {
    eligible: pending.length,
    imported,
    snapshotsStored,
    lastRawgId: pending.at(-1)?.rawgId || startAfterRawgId,
  };
}
