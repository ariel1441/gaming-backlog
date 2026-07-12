// src/hooks/useGames.js
import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  listGames as listGamesApi,
  createGame as createGameApi,
  updateGame as updateGameApi,
  updateFavoriteGames as updateFavoriteGamesApi,
  deleteGame as deleteGameApi,
  reorderGames as reorderGamesApi, // PATCH /api/games/:id/position
} from "../services/gameService";

// Consider a row "not hydrated" until we have a cover or HLTB minutes
const needsHydration = (g) => !g?.cover || !g?.how_long_to_beat;

function inferStatusRank(status, list) {
  const sample = list.find(
    (g) => String(g?.status) === String(status) && g?.status_rank != null,
  );
  return sample?.status_rank ?? 999;
}

// Compute a provisional "end of group" position for a given status.
// Uses sparse ranks (steps of 1000) to minimize churn until server returns canonical positions.
function nextPositionForStatus(status, list) {
  const sameStatus = list.filter((g) => String(g?.status) === String(status));
  if (sameStatus.length === 0) return 1000;
  const maxPos = Math.max(
    ...sameStatus.map((g) => (g?.position == null ? 0 : Number(g.position))),
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

// Apply authoritative rank order from the server payload after reorder
function applyRankOrder(prevList, payload) {
  const { game, rank_order } = payload || {};
  if (!Array.isArray(prevList) || !game || !Array.isArray(rank_order)) {
    return prevList;
  }
  const byId = new Map(prevList.map((g) => [g.id, g]));
  // merge moved game fields
  if (byId.has(game.id)) {
    byId.set(game.id, { ...byId.get(game.id), ...game });
  }
  // apply authoritative status/position for all ids in the rank group
  for (const { id, status, position } of rank_order) {
    const g = byId.get(id);
    if (g) {
      // status_rank stays the same (shared rank group); keep existing sr
      byId.set(id, { ...g, status, position });
    }
  }
  return sortGames(Array.from(byId.values()));
}

export function useGames() {
  const { getAuthHeaders, isAuthenticated, loading: authLoading } = useAuth();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // latest-wins guard for list loads/refreshes
  const reqSeq = useRef(0);
  const gamesRef = useRef([]);
  const editSeq = useRef(new Map());
  const hydrationTimerRef = useRef(null);
  const refreshControllersRef = useRef(new Set());

  useEffect(
    () => () => {
      if (hydrationTimerRef.current) clearTimeout(hydrationTimerRef.current);
      refreshControllersRef.current.forEach((controller) => controller.abort());
      refreshControllersRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    gamesRef.current = games;
  }, [games]);

  // Initial load (latest-wins + abort)
  useEffect(() => {
    if (authLoading) return undefined;

    if (!isAuthenticated) {
      reqSeq.current += 1;
      setGames([]);
      setError(null);
      setLoading(false);
      return undefined;
    }

    const ac = new AbortController();
    const seq = ++reqSeq.current;

    setLoading(true);
    setError(null);
    listGamesApi({ signal: ac.signal, auth: false, headers: getAuthHeaders() })
      .then((data) => {
        if (seq !== reqSeq.current) return; // stale response, ignore
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
      .finally(() => {
        if (seq === reqSeq.current) setLoading(false);
      });
    return () => ac.abort();
  }, [authLoading, getAuthHeaders, isAuthenticated]);

  // Refresh; can run "silent" so UI doesn't flicker, and uses latest-wins
  const refresh = useCallback(
    async (opts = {}) => {
      if (!isAuthenticated) {
        reqSeq.current += 1;
        setGames([]);
        setError(null);
        setLoading(false);
        return [];
      }

      const silent = !!opts.silent; // default false
      const seq = ++reqSeq.current;
      const controller = new AbortController();
      refreshControllersRef.current.add(controller);

      if (!silent) setLoading(true);
      if (!silent) setError(null);
      try {
        const data = await listGamesApi({
          auth: false,
          headers: getAuthHeaders(),
          signal: controller.signal,
        });
        if (seq !== reqSeq.current) return; // a newer refresh started → ignore

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

          // Silent refresh remains authoritative while preserving in-flight
          // optimistic creates that the server cannot know about yet.
          const byId = new Map(prev.map((g) => [g.id, g]));
          const merged = list.map((ng) => {
            const old = byId.get(ng.id);
            return old ? { ...old, ...ng } : ng;
          });
          const optimistic = prev.filter((game) => game?._optimistic);
          return sortGames([...merged, ...optimistic]);
        });
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (!silent) setError(e);
        throw e;
      } finally {
        refreshControllersRef.current.delete(controller);
        if (!silent && seq === reqSeq.current) setLoading(false);
      }
    },
    [getAuthHeaders, isAuthenticated],
  );

  // --- Add (optimistic): insert immediately at end of the target status group
  const addGame = useCallback(async (payload) => {
    // 1) Optimistic add at the end of the chosen status group
    const tempId = `temp-${Date.now()}`;
    const status = String(payload?.status || "plan to play");
    setGames((prev) => {
      const optimistic = {
        id: tempId,
        name: String(payload?.name || "").trim(),
        status,
        status_rank: inferStatusRank(status, prev),
        position: nextPositionForStatus(status, prev),
        my_genre: payload?.my_genre ?? null,
        my_score: payload?.my_score ?? null,
        how_long_to_beat: payload?.how_long_to_beat ?? null,
        thoughts: payload?.thoughts ?? null,
        cover: payload?.rawg_cover ?? null,
        releaseDate: payload?.rawg_released ?? null,
        rawg_id: payload?.rawg_id ?? null,
        rawg_slug: payload?.rawg_slug ?? null,
        started_at: payload?.started_at ?? null,
        finished_at: payload?.finished_at ?? null,
        _optimistic: true,
      };
      return sortGames([...prev, optimistic]);
    });

    try {
      // 2) Create on the server
      const created = await createGameApi(payload);

      // 3) Replace optimistic with authoritative row from server, then resort
      setGames((prev) => {
        const replaced = prev.map((g) =>
          g.id === tempId ? { ...g, ...created, _optimistic: false } : g,
        );
        return sortGames(replaced);
      });

      return created; // truthy, for callers that want the new row
    } catch (err) {
      // Remove optimistic row on failure
      setGames((prev) => prev.filter((g) => g.id !== tempId));
      throw err;
    }
  }, []);

  // --- Edit (optimistic): apply immediately; on status change, move to new group end
  const editGame = useCallback(
    async (id, patch) => {
      const mutationId = (editSeq.current.get(id) || 0) + 1;
      editSeq.current.set(id, mutationId);
      const beforeGame =
        gamesRef.current.find((game) => game.id === id) || null;

      setGames((prev) => {
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
        if (beforeGame && editSeq.current.get(id) === mutationId) {
          setGames((prev) =>
            sortGames(prev.map((game) => (game.id === id ? beforeGame : game))),
          );
        }
        throw e;
      }

      // Merge any server-provided fields back in (keep our placement if server omitted)
      if (editSeq.current.get(id) !== mutationId) return updated ?? patch;
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
              : g,
          ),
        ),
      );

      // If the name changed (new RAWG lookup likely) or still not hydrated, silent revalidate
      const nameChanged =
        typeof patch?.name === "string" && patch.name.trim() !== "";
      if (nameChanged || needsHydration(updated)) {
        if (hydrationTimerRef.current) clearTimeout(hydrationTimerRef.current);
        hydrationTimerRef.current = setTimeout(() => {
          hydrationTimerRef.current = null;
          refresh({ silent: true }).catch(() => {});
        }, 400);
      }

      return updated ?? patch;
    },
    [getAuthHeaders, refresh],
  );

  const removeGame = useCallback(
    async (id) => {
      await deleteGameApi(id, { auth: false, headers: getAuthHeaders() });
      setGames((prev) => prev.filter((g) => g.id !== id));
    },
    [getAuthHeaders],
  );

  const updateFavorites = useCallback(
    async (favoriteIds) => {
      const updatedGames = await updateFavoriteGamesApi(favoriteIds, {
        auth: false,
        headers: getAuthHeaders(),
      });
      const list = Array.isArray(updatedGames) ? updatedGames : [];
      setGames(sortGames(list));
      return list;
    },
    [getAuthHeaders],
  );

  // Reorder a single game:
  // - apply server's authoritative rank_order immediately (no extra GET)
  // - parent state becomes the source of truth, so modals/re-renders can't "snap back"
  const reorderGame = useCallback(
    async (id, targetIndex, status) => {
      const payload = await reorderGamesApi(
        { id, targetIndex, status },
        { auth: false, headers: getAuthHeaders() },
      );
      if (payload && payload.rank_order) {
        setGames((prev) => applyRankOrder(prev, payload));
      } else {
        // Fallback: rare older server without rank_order → silent revalidate
        await refresh({ silent: true });
      }
    },
    [getAuthHeaders, refresh],
  );

  return {
    games,
    loading,
    error,
    refresh,
    addGame,
    editGame,
    removeGame,
    updateFavorites,
    reorderGame,
    setGames, // kept for rare advanced flows
  };
}
