// src/hooks/useGames.js
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  listGames as listGamesApi,
  createGame as createGameApi,
  updateGame as updateGameApi,
  deleteGame as deleteGameApi,
  reorderGames as reorderGamesApi,
} from "../services/gameService";

function reorderLocally(games, status, orderedIds) {
  const laneIndex = new Map(orderedIds.map((id, i) => [String(id), i]));
  // Create a new array but keep non-lane items’ order stable
  const inLane = [];
  const outLane = [];
  for (const g of games) {
    if (g.status === status && laneIndex.has(String(g.id))) inLane.push(g);
    else outLane.push(g);
  }
  inLane.sort(
    (a, b) => laneIndex.get(String(a.id)) - laneIndex.get(String(b.id))
  );
  // Merge back, preserving relative order of outLane
  const result = [];
  let i = 0;
  for (const g of games) {
    if (g.status === status && laneIndex.has(String(g.id))) {
      result.push(inLane[i++]);
    } else {
      result.push(g);
    }
  }
  return result;
}

export function useGames() {
  const { getAuthHeaders } = useAuth();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initial load
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    listGamesApi({ signal: ac.signal, auth: false, headers: getAuthHeaders() })
      .then((data) => {
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.games)
            ? data.games
            : Array.isArray(data?.data)
              ? data.data
              : Array.isArray(data?.rows)
                ? data.rows
                : [];
        setGames(list);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e);
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [getAuthHeaders]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listGamesApi({
        auth: false,
        headers: getAuthHeaders(),
      });
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.games)
          ? data.games
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.rows)
              ? data.rows
              : [];
      setGames(list);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  const addGame = useCallback(
    async (payload) => {
      const created = await createGameApi(payload, {
        auth: false,
        headers: getAuthHeaders(),
      });
      setGames((prev) => [...prev, created ?? payload]);
      return created ?? payload;
    },
    [getAuthHeaders]
  );

  const editGame = useCallback(
    async (id, patch) => {
      const updated = await updateGameApi(id, patch, {
        auth: false,
        headers: getAuthHeaders(),
      });
      setGames((prev) =>
        prev.map((g) =>
          String(g.id) === String(id) ? { ...g, ...(updated ?? patch) } : g
        )
      );
      return updated ?? patch;
    },
    [getAuthHeaders]
  );

  const removeGame = useCallback(
    async (id) => {
      await deleteGameApi(id, { auth: false, headers: getAuthHeaders() });
      setGames((prev) => prev.filter((g) => g.id !== id));
    },
    [getAuthHeaders]
  );

  const reorderGames = useCallback(
    async ({ status, orderedIds, optimistic = true }) => {
      if (optimistic) {
        const prev = games;
        setGames((pg) => reorderLocally(pg, status, orderedIds));
        try {
          await reorderGamesApi(
            { status, gameIds: orderedIds },
            { auth: false, headers: getAuthHeaders() }
          );
        } catch (e) {
          setGames(prev); // rollback
          throw e;
        }
      } else {
        await reorderGamesApi(
          { status, gameIds: orderedIds },
          { auth: false, headers: getAuthHeaders() }
        );
        await refresh();
      }
    },
    [games, getAuthHeaders, refresh]
  );

  return {
    games,
    loading,
    error,
    refresh,
    addGame,
    editGame,
    removeGame,
    reorderGames,
    setGames, // for rare advanced flows
  };
}
