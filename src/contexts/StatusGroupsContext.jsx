// src/contexts/StatusGroupsContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useState,
} from "react";
import { api } from "../services/apiClient"; // your existing API client
import {
  FALLBACK_STATUS_GROUPS,
  normalizeStatusGroupsPayload,
} from "./statusGroups.js";

const Ctx = createContext(null);
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .trim();

function makeSets(defs) {
  return Object.fromEntries(
    Object.entries(defs).map(([k, list]) => [k, new Set(list.map(norm))])
  );
}

export function StatusGroupsProvider({ children }) {
  const [defs, setDefs] = useState(null);
  const [buckets, setBuckets] = useState(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/meta/status-groups", { signal });
      const next = normalizeStatusGroupsPayload(res);
      setDefs(next.groups);
      setBuckets(next.buckets);
      setReady(true);
      return res;
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err);
        setDefs(FALLBACK_STATUS_GROUPS.groups);
        setBuckets(FALLBACK_STATUS_GROUPS.buckets);
        setReady(true);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    refresh({ signal: ac.signal }).catch(() => {});
    return () => {
      ac.abort();
    };
  }, [refresh]);

  const sets = useMemo(() => (defs ? makeSets(defs) : {}), [defs]);
  const groupKeys = useMemo(() => Object.keys(defs || {}), [defs]);
  const doneKeys = useMemo(() => buckets?.done ?? [], [buckets]);
  const backlogKeys = useMemo(() => buckets?.backlog ?? [], [buckets]);

  const statusGroupOf = (status) => {
    const s = norm(status);
    for (const k of groupKeys) if (sets[k]?.has(s)) return k;
    return "other";
  };

  const toGroup = (value) => {
    const s = norm(value);
    if (groupKeys.includes(s)) return s; // already a group id
    return statusGroupOf(s);
  };

  const rawStatusesForGroup = (group) => defs?.[group] ?? [];

  const value = {
    ready,
    loading,
    error,
    defs,
    buckets,
    groupKeys,
    doneKeys,
    backlogKeys,
    statusGroupOf,
    toGroup,
    rawStatusesForGroup,
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStatusGroups() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error(
      "useStatusGroups must be used inside <StatusGroupsProvider>"
    );
  return ctx;
}
