// src/hooks/useStatuses.js
import { useCallback, useEffect, useRef, useState } from "react";
import { listStatuses } from "../services/statusService";

export const FALLBACK_STATUSES = Object.freeze([
  "playing",
  "plan to play soon",
  "plan to play",
  "played and should come back",
  "play when in the mood",
  "maybe in the future",
  "recommended by someone",
  "not anytime soon",
  "played a bit",
  "played and wont come back",
  "played alot but didnt finish",
  "finished",
]);

let _cache = null; // simple module-level cache

export function useStatuses() {
  const [statuses, setStatuses] = useState(_cache || []);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState(null);
  const requestSequence = useRef(0);

  const refresh = useCallback(async ({ signal } = {}) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const data = await listStatuses({ signal });
      const next =
        Array.isArray(data) && data.length ? data : FALLBACK_STATUSES;
      _cache = next;
      if (sequence === requestSequence.current) setStatuses(next);
      return next;
    } catch (e) {
      if (e.name !== "AbortError" && sequence === requestSequence.current) {
        setError(e);
        if (!_cache) setStatuses(FALLBACK_STATUSES);
      }
      throw e;
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (_cache) return; // already cached
    const ac = new AbortController();
    refresh({ signal: ac.signal }).catch(() => {});
    return () => ac.abort();
  }, [refresh]);

  return { statuses, loading, error, refresh };
}
