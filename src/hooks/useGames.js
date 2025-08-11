// src/hooks/useGames.js
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  listGames as listGamesApi,
  createGame as createGameApi,
  updateGame as updateGameApi,
  deleteGame as deleteGameApi,
  reorderGames as reorderGamesApi, // PATCH /api/games/:id/position
} from "../services/gameService";

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

  // Reorder a single game on the server (no refresh on success to avoid flicker).
  // GameGrid handles optimistic UI already.
  const reorderGame = useCallback(
    async (id, targetIndex, status) => {
      await reorderGamesApi(
        { id, targetIndex, status },
        { auth: false, headers: getAuthHeaders() }
      );
    },
    [getAuthHeaders]
  );

  return {
    games,
    loading,
    error,
    refresh,
    addGame,
    editGame,
    removeGame,
    reorderGame,
    setGames, // kept for rare advanced flows
  };
}
