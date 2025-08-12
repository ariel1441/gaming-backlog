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

/** ---- helpers (kept local to the hook file) ---- **/

// Infer the status_rank for a given status by sampling existing games.
// Fallback to 999 so unknown statuses sink to the bottom (until server replies).
function inferStatusRank(status, list) {
  const sample = list.find(
    (g) => String(g?.status) === String(status) && g?.status_rank != null
  );
  return sample?.status_rank ?? 999;
}

// Compute a provisional "end of group" position for a given status.
// Uses sparse ranks (steps of 1000) to minimize churn until server returns canonical positions.
function nextPositionForStatus(status, list) {
  const sameStatus = list.filter((g) => String(g?.status) === String(status));
  if (sameStatus.length === 0) return 1000;
  const maxPos = Math.max(
    ...sameStatus.map((g) => (g?.position == null ? 0 : Number(g.position)))
  );
  return (isFinite(maxPos) ? maxPos : 0) + 1000;
}

// Stable baseline ordering: status_rank → position → id
function sortGames(arr) {
  return [...arr].sort((a, b) => {
    const srA = a?.status_rank ?? 999;
    const srB = b?.status_rank ?? 999;
    if (srA !== srB) return srA - srB;

    const posA = a?.position ?? Number.POSITIVE_INFINITY;
    const posB = b?.position ?? Number.POSITIVE_INFINITY;
    if (posA !== posB) return posA - posB;

    // Tie-breaker on numeric id (temp ids become very large to keep stable order)
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
    };
    return num(a?.id) - num(b?.id);
  });
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
        setGames(sortGames(list));
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
      setGames(sortGames(list));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  // --- Add (optimistic): insert immediately at end of the target status group
  const addGame = useCallback(
    async (payload) => {
      const tempId = `temp-${Date.now()}`;
      let optimistic;
      setGames((prev) => {
        const pos = nextPositionForStatus(payload.status, prev);
        const sr = inferStatusRank(payload.status, prev);
        optimistic = {
          id: tempId,
          ...payload,
          position: pos,
          status_rank: sr,
        };
        return sortGames([...prev, optimistic]);
      });

      try {
        const created = await createGameApi(payload, {
          auth: false,
          headers: getAuthHeaders(),
        });

        // Reconcile temp with server record (id, position, status_rank, etc.)
        setGames((prev) =>
          sortGames(
            prev.map((g) =>
              String(g.id) === tempId
                ? { ...optimistic, ...(created ?? {}) }
                : g
            )
          )
        );

        return created ?? optimistic;
      } catch (e) {
        // Roll back the optimistic insert on error
        setGames((prev) => prev.filter((g) => String(g.id) !== tempId));
        throw e;
      }
    },
    [getAuthHeaders]
  );

  // --- Edit (optimistic): apply immediately; on status change, move to new group end
  const editGame = useCallback(
    async (id, patch) => {
      let rollback = null;

      // Apply changes optimistically and keep order stable
      setGames((prev) => {
        rollback = prev;
        const next = prev.map((g) => {
          if (String(g.id) !== String(id)) return g;

          // If status is changing, give a provisional end-of-group position and rank
          if (patch?.status && patch.status !== g.status) {
            const pos = nextPositionForStatus(patch.status, prev);
            const sr = inferStatusRank(patch.status, prev);
            return { ...g, ...patch, position: pos, status_rank: sr };
          }
          return { ...g, ...patch };
        });
        return sortGames(next);
      });

      try {
        const updated = await updateGameApi(id, patch, {
          auth: false,
          headers: getAuthHeaders(),
        });

        // Merge authoritative server result (position/status_rank may change)
        setGames((prev) =>
          sortGames(
            prev.map((g) =>
              String(g.id) === String(id) ? { ...g, ...(updated ?? patch) } : g
            )
          )
        );

        return updated ?? patch;
      } catch (e) {
        // Roll back to the exact pre-optimistic snapshot
        if (rollback) setGames(rollback);
        throw e;
      }
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
