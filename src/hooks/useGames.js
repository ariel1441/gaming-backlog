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

// Consider a row "not hydrated" until we have a cover or HLTB minutes
const needsHydration = (g) => !g?.cover || !g?.how_long_to_beat;

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

  // Refresh; can run "silent" so UI doesn't flicker
  const refresh = useCallback(
    async (opts = {}) => {
      const silent = !!opts.silent; // default false
      if (!silent) setLoading(true);
      if (!silent) setError(null);
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

        setGames((prev) => {
          if (!silent) return sortGames(list);

          // silent refresh: merge new fields into existing rows by id, then re-sort
          const byId = new Map(prev.map((g) => [g.id, g]));
          for (const ng of list) {
            const old = byId.get(ng.id);
            byId.set(ng.id, old ? { ...old, ...ng } : ng);
          }
          return sortGames(Array.from(byId.values()));
        });
      } catch (e) {
        if (!silent) setError(e);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [getAuthHeaders]
  );

  // --- Add (optimistic): insert immediately at end of the target status group
  const addGame = useCallback(
    async (payload) => {
      // Create a temp row so UI updates instantly, placed correctly
      const tempId = `temp-${Date.now()}`;
      const optimistic = (prev) => {
        const sr = inferStatusRank(payload.status, prev);
        const pos = nextPositionForStatus(payload.status, prev);
        return {
          id: tempId,
          name: payload.name ?? "",
          status: payload.status ?? "plan to play",
          status_rank: sr,
          position: pos,
          my_genre: payload.my_genre ?? "",
          genres: payload.genres ?? "",
          how_long_to_beat: payload.how_long_to_beat ?? null,
          rating: payload.rating ?? null,
          thoughts: payload.thoughts ?? "",
          cover: payload.cover ?? "",
          // any other fields from your schema can be echoed here safely
        };
      };

      // Optimistic insert
      setGames((prev) => sortGames([...prev, optimistic(prev)]));

      let created;
      try {
        created = await createGameApi(payload, {
          auth: false,
          headers: getAuthHeaders(),
        });
      } catch (e) {
        // Rollback on failure
        setGames((prev) => prev.filter((g) => g.id !== tempId));
        throw e;
      }

      // Reconcile temp row with server row (preserve placement fields if missing)
      setGames((prev) => {
        const temp = prev.find((g) => g.id === tempId);
        const finalized = {
          ...temp,
          ...created,
          status_rank:
            created?.status_rank != null
              ? created.status_rank
              : temp?.status_rank,
          position:
            created?.position != null ? created.position : temp?.position,
        };
        return sortGames(prev.map((g) => (g.id === tempId ? finalized : g)));
      });

      // RAWG hydrate may finish shortly after create → silent revalidate
      if (needsHydration(created)) {
        setTimeout(() => {
          refresh({ silent: true }).catch(() => {});
        }, 400);
        setTimeout(() => {
          refresh({ silent: true }).catch(() => {});
        }, 1600);
      }

      return created;
    },
    [getAuthHeaders, refresh]
  );

  // --- Edit (optimistic): apply immediately; on status change, move to new group end
  const editGame = useCallback(
    async (id, patch) => {
      // Snapshot for rollback
      let before;
      setGames((prev) => {
        before = prev;
        const idx = prev.findIndex((g) => g.id === id);
        if (idx === -1) return prev;

        const current = prev[idx];
        const nextStatus = patch?.status ?? current.status;
        const statusChanged = String(nextStatus) !== String(current.status);

        const next = { ...current, ...patch };

        if (statusChanged) {
          // Move to end of new status group with inferred rank/position
          const listWithout = prev.filter((g) => g.id !== id);
          next.status_rank = inferStatusRank(nextStatus, listWithout);
          next.position = nextPositionForStatus(nextStatus, listWithout);
          return sortGames([...listWithout, next]);
        }

        // Same status → keep position; just merge fields
        const copy = [...prev];
        copy[idx] = next;
        return sortGames(copy);
      });

      let updated;
      try {
        updated = await updateGameApi(id, patch, {
          auth: false,
          headers: getAuthHeaders(),
        });
      } catch (e) {
        // Roll back on failure
        if (before) setGames(before);
        throw e;
      }

      // Merge any server-provided fields back in (keep our placement if server omitted)
      setGames((prev) =>
        sortGames(
          prev.map((g) =>
            g.id === id
              ? {
                  ...g,
                  ...updated,
                  status_rank:
                    updated?.status_rank != null
                      ? updated.status_rank
                      : g.status_rank,
                  position:
                    updated?.position != null ? updated.position : g.position,
                }
              : g
          )
        )
      );

      // If the name changed (new RAWG lookup likely) or still not hydrated, silent revalidate
      const nameChanged =
        typeof patch?.name === "string" && patch.name.trim() !== "";
      if (nameChanged || needsHydration(updated)) {
        setTimeout(() => {
          refresh({ silent: true }).catch(() => {});
        }, 400);
      }

      return updated ?? patch;
    },
    [getAuthHeaders, refresh]
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
