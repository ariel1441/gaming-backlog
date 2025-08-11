// src/hooks/useStatuses.js
import { useEffect, useState } from "react";
import { listStatuses } from "../services/statusService";

let _cache = null; // simple module-level cache

export function useStatuses() {
  const [statuses, setStatuses] = useState(_cache || []);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (_cache) return; // already cached
    const ac = new AbortController();
    setLoading(true);
    listStatuses({ signal: ac.signal })
      .then((data) => {
        _cache = Array.isArray(data) ? data : [];
        setStatuses(_cache);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e);
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  return { statuses, loading, error };
}
