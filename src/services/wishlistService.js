import { api } from "./apiClient.js";
import { invalidateWishlistCache } from './wishlistCache.js';

export function listWishlist(params = {}, opts = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query}` : "";
  return api.get(`/api/wishlist${suffix}`, opts);
}

async function readCompleteWishlist(params = {}, opts = {}) {
  const limit = 100;
  let offset = 0;
  let result = null;
  const items = [];
  do {
    const page = await listWishlist({ ...params, limit, offset }, opts);
    if (result && (String(result.snapshotVersion || "") !== String(page.snapshotVersion || "") ||
        String(result.priceRevision || '') !== String(page.priceRevision || '') || result.total !== page.total)) {
      const error = new Error("Wishlist changed while loading. Please retry.");
      error.code = 'wishlist_revision_changed';
      throw error;
    }
    result ||= page;
    items.push(...(page.items || []));
    offset += page.items?.length || 0;
    if (!page.items?.length || offset >= Number(page.total || 0)) break;
  } while (offset < 100_000);
  if (new Set(items.map((item) => item.id)).size !== items.length || items.length !== Number(result?.total || 0)) {
    throw new Error("Could not load a complete wishlist. Please retry.");
  }
  return { ...(result || {}), items, total: Number(result?.total || items.length) };
}

export async function listAllWishlist(params = {}, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await readCompleteWishlist(params, opts); }
    catch (error) { if (attempt >= 1 || error.code !== 'wishlist_revision_changed' || opts.signal?.aborted) throw error; }
  }
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason || new DOMException("Aborted", "AbortError")); return; }
    const done = () => { signal?.removeEventListener("abort", abort); resolve(); };
    const timer = globalThis.setTimeout(done, milliseconds);
    const abort = () => {
      globalThis.clearTimeout(timer);
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function syncWishlist({ confirmEmpty = false, prices = false, onJob, ...opts } = {}) {
  const started = await api.post(prices ? '/api/wishlist/prices/sync' : confirmEmpty ? "/api/wishlist/confirm-empty" : "/api/wishlist/sync", {}, opts);
  let job = started?.job;
  if (!job?.id) throw new Error("Wishlist sync did not return a job ID.");
  onJob?.(job);
  while (["queued", "running"].includes(job.status)) {
    await wait(750, opts.signal);
    job = (await api.get(`/api/steam/sync/${job.id}`, opts))?.job;
    onJob?.(job);
  }
  if (job?.status === "completed") return job.result || {};
  const error = new Error(job?.errorMessage || (job?.status === "cancelled" ? "Wishlist sync was cancelled." : "Wishlist sync failed."));
  error.code = job?.errorCode || "steam_wishlist_sync_failed";
  throw error;
}

export function cancelWishlistSync(jobId, opts = {}) {
  return api.del(`/api/steam/sync/${jobId}`, opts);
}

export async function moveWishlistToBacklog(itemId, status, opts = {}) {
  const result = await api.post(`/api/wishlist/${itemId}/move-to-backlog`, { status }, opts);
  invalidateWishlistCache();
  return result;
}

export async function retireWishlistIntention(itemId, gameId, opts = {}) {
  const result = await api.post(`/api/wishlist/${itemId}/retire-intention`, { gameId }, opts);
  invalidateWishlistCache();
  return result;
}
