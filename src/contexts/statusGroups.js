export { FALLBACK_STATUS_GROUPS } from "../utils/statusSemantics.js";
import { FALLBACK_STATUS_GROUPS } from "../utils/statusSemantics.js";

export function normalizeStatusGroupsPayload(payload) {
  return payload && payload.groups && payload.buckets
    ? payload
    : FALLBACK_STATUS_GROUPS;
}
