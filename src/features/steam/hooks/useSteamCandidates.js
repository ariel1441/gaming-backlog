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
  const requestSequence = useRef(0);
  const activeController = useRef(null);

  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => () => {
    requestSequence.current += 1;
    activeController.current?.abort();
  }, []);

  const load = useCallback(
    async ({ params = {}, append = false } = {}) => {
      const request = ++requestSequence.current;
      activeController.current?.abort();
      const controller = new AbortController();
      activeController.current = controller;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setLoadingMore(false);
      }

      try {
        const offset = append ? candidatesRef.current.length : 0;
        const payload = await listSteamImportCandidates({
          ...params,
          limit,
          offset,
        }, { signal: controller.signal });
        if (request !== requestSequence.current) return null;
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
        if (request === requestSequence.current && error?.name !== "AbortError") {
          onErrorRef.current?.(error);
        }
        return null;
      } finally {
        if (request === requestSequence.current) {
          activeController.current = null;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [limit],
  );

  const clear = useCallback(() => {
    requestSequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setCandidates([]);
    setSummary(null);
    setPage(emptyPage(limit));
    setLoading(false);
    setLoadingMore(false);
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
