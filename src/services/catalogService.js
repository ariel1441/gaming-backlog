import { api, getLatest } from "./apiClient";

export function searchCatalog(query, opts = {}) {
  const q = encodeURIComponent(String(query || "").trim());
  return getLatest(`/api/catalog/search?q=${q}`, opts, "catalog-search");
}

export function listRecentCatalog(opts = {}) {
  return api.get("/api/catalog/recent", opts);
}

export function browseCatalog(params = {}, opts = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get(`/api/catalog/browse${suffix}`, opts);
}

export function loadMoreCatalogCollection(key, opts = {}) {
  return api.post(`/api/catalog/collections/${encodeURIComponent(key)}/load-more`, null, opts);
}

export function getCatalogGame(id, opts = {}) {
  return api.get(`/api/catalog/${id}`, opts);
}

export function refreshCatalogGame(id, opts = {}) {
  return api.post(`/api/catalog/${id}/refresh`, null, opts);
}

export function addCatalogGameToBacklog(id, payload, opts = {}) {
  return api.post(`/api/catalog/${id}/add-to-backlog`, payload, opts);
}
