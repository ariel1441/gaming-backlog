import { useCallback, useEffect, useState } from "react";
import { listPersonalGenres } from "../services/personalGenreService";

export function usePersonalGenres(enabled = true) {
  const [genres, setGenres] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setGenres([]);
      setLoading(false);
      return [];
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await listPersonalGenres();
      const next = Array.isArray(payload?.genres) ? payload.genres : [];
      setGenres(next);
      return next;
    } catch (nextError) {
      setError(nextError);
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  return { genres, loading, error, refresh, setGenres };
}
