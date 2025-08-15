// src/services/insightsService.js
import { api } from "./apiClient";

/**
 * Fetch analytics from /api/insights.
 * @param {Object} opts
 * @param {number} [opts.weeklyHours] - Hours per week for ETA.
 * @param {boolean} [opts.includeMissingNames] - Include list of titles excluded from stats.
 */
export async function fetchInsights({
  weeklyHours,
  includeMissingNames = false,
} = {}) {
  const params = new URLSearchParams();
  if (Number.isFinite(weeklyHours))
    params.set("weekly_hours", String(weeklyHours));
  if (includeMissingNames) params.set("include_missing_names", "true");
  const qs = params.toString();
  const url = qs ? `/api/insights?${qs}` : "/api/insights";
  return api.get(url);
}
