import { useCallback, useEffect, useRef, useState } from "react";
import { listSteamImportCandidates } from "../../../services/steamService";

const emptyPage = (limit) => ({ offset: 0, limit, total: 0, hasMore: false });

export function useSteamCandidates({ limit = 100, onError } = {}) {
  const [candidates, setCandidates] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(() => emptyPage(limit));
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const candidatesRef = useRef(candidates);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const load = useCallback(
    async ({ params = {}, append = false } = {}) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const offset = append ? candidatesRef.current.length : 0;
        const payload = await listSteamImportCandidates({
          ...params,
          limit,
          offset,
        });
        const nextCandidates = payload?.candidates || [];

        setCandidates((current) =>
          append ? [...current, ...nextCandidates] : nextCandidates,
        );
        setSummary(payload?.summary || null);
        setPage(
          payload?.page || {
            ...emptyPage(limit),
            offset,
            total: nextCandidates.length,
          },
        );
        return payload;
      } catch (error) {
        onErrorRef.current?.(error);
        return null;
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [limit],
  );

  const clear = useCallback(() => {
    setCandidates([]);
    setSummary(null);
    setPage(emptyPage(limit));
  }, [limit]);

  return {
    candidates,
    setCandidates,
    summary,
    page,
    loading,
    loadingMore,
    load,
    clear,
  };
}
