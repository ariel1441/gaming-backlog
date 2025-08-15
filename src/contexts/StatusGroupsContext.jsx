// src/contexts/StatusGroupsContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "../services/apiClient"; // your existing API client

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
  const [defs, setDefs] = useState(null); // { planned:[...], playing:[...], done:[...] }
  const [buckets, setBuckets] = useState(null); // { backlog:[...], done:[...] }
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await api.get("/api/meta/status-groups");
        if (!live) return;
        if (res && res.groups && res.buckets) {
          setDefs(res.groups);
          setBuckets(res.buckets);
        } else {
          setDefs({});
          setBuckets({ backlog: [], done: [] });
        }
      } catch {
        setDefs({});
        setBuckets({ backlog: [], done: [] });
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

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
    defs,
    buckets,
    groupKeys,
    doneKeys,
    backlogKeys,
    statusGroupOf,
    toGroup,
    rawStatusesForGroup,
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
