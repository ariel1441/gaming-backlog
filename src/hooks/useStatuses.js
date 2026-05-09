// src/hooks/useStatuses.js
import { useCallback, useEffect, useState } from "react";
import { listStatuses } from "../services/statusService";

let _cache = null; // simple module-level cache

export function useStatuses() {
  const [statuses, setStatuses] = useState(_cache || []);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState(null);

  const refresh = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listStatuses({ signal });
      _cache = Array.isArray(data) ? data : [];
      setStatuses(_cache);
      return _cache;
    } catch (e) {
      if (e.name !== "AbortError") setError(e);
      throw e;
    } finally {
      setLoading(false);
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
