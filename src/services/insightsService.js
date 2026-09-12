// src/services/insightsService.js
import { api } from "./apiClient";

/**
 * Fetch analytics from /api/insights.
 * @param {Object} opts
 * @param {number} [opts.year] - Calendar year used for the focused summary.
 */
export async function fetchInsights({
  year,
} = {}, requestOptions = {}) {
  const params = new URLSearchParams();
  if (Number.isFinite(year)) params.set("year", String(year));
  const qs = params.toString();
  const url = qs ? `/api/insights?${qs}` : "/api/insights";
  return api.get(url, requestOptions);
}
