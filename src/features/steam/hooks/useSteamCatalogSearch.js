import { useCallback, useEffect, useRef, useState } from "react";
import { searchCatalog } from "../../../services/catalogService";

export function useSteamCatalogSearch({ minLength = 3, onError } = {}) {
  const [candidate, setCandidate] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const open = useCallback((nextCandidate) => {
    setCandidate(nextCandidate);
    setQuery(nextCandidate?.steamName || nextCandidate?.name || "");
    setResults([]);
  }, []);

  const close = useCallback(() => {
    setCandidate(null);
    setQuery("");
    setResults([]);
  }, []);

  const search = useCallback(async () => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < minLength) return [];

    setLoading(true);
    try {
      const payload = await searchCatalog(normalizedQuery);
      const nextResults = payload?.results || [];
      setResults(nextResults);
      return nextResults;
    } catch (error) {
      onErrorRef.current?.(error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [minLength, query]);

  return {
    candidate,
    setCandidate,
    query,
    setQuery,
    results,
    setResults,
    loading,
    open,
    close,
    search,
  };
}
