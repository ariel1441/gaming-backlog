// src/features/insights/InsightsTab.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchInsights } from "../../services/insightsService";
import { api } from "../../services/apiClient";
import { useStatusGroups } from "../../contexts/StatusGroupsContext";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

/* ========================= ROUTE CONFIG ========================= */
const GAMES_ROUTE = "/"; // your games list route

/* ========================= Small helpers ========================= */
const fmtInt = (n) => (Number.isFinite(n) ? n.toLocaleString() : "0");
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const HUES = [206, 28, 142, 46, 264, 12, 182, 320];
const colorAt = (i) => `hsl(${HUES[i % HUES.length]} 70% 50%)`;
const norm = (s) => {
  const t = String(s || "").trim();
  if (!t) return "Unknown";
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
};
const splitCSV = (s) =>
  String(s || "")
    .split(",")
    .map((x) => norm(x))
    .filter((x) => x && x !== "Unknown");

// query-backed state (syncs to URL + optional localStorage)
const parseBool = (v, d = false) => (v == null ? d : v === "true");
const parseIntSafe = (v, d = 0) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : d;
};
function useQueryBackedState({
  key,
  defaultValue,
  parse,
  serialize,
  storageKey,
}) {
  const [sp, setSp] = useSearchParams();
  const raw =
    sp.get(key) ?? (storageKey ? localStorage.getItem(storageKey) : null);
  const initial = parse ? parse(raw, defaultValue) : (raw ?? defaultValue);
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const next = new URLSearchParams(sp);
    next.set(key, serialize ? serialize(value) : String(value));
    setSp(next, { replace: true });
    if (storageKey) localStorage.setItem(storageKey, String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return [value, setValue];
}

// compact UI atoms
function Tile({ label, value }) {
  return (
    <div className="rounded-2xl border p-4 md:p-5 flex flex-col gap-1">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-lg md:text-xl font-semibold">{value}</div>
    </div>
  );
}
function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              "px-2.5 py-1 text-xs",
              active ? "bg-primary text-white" : "bg-white hover:bg-gray-100",
              i > 0 ? "border-l border-gray-300" : "",
            ].join(" ")}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
function ChartCard({ title, children, right = null }) {
  return (
    <section className="rounded-2xl border p-4 md:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex items-center gap-2">{right}</div>
      </div>
      {children}
    </section>
  );
}
function Skeleton({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-200/70 ${className}`} />
  );
}
function KPISkeleton() {
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border p-4 md:p-5">
          <Skeleton className="h-3 w-20 mb-3" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </section>
  );
}
function ChartSkeleton() {
  return (
    <section className="rounded-2xl border p-4 md:p-5 space-y-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-64 w-full" />
    </section>
  );
}

/* ========================= Component ========================= */
export default function InsightsTab() {
  const nav = useNavigate();
  const { ready, statusGroupOf, toGroup, doneKeys, groupKeys } =
    useStatusGroups();

  // URL-backed controls (shareable + persistent)
  const [weeklyHours, setWeeklyHours] = useQueryBackedState({
    key: "wh",
    defaultValue: 10,
    parse: (v, d) => parseIntSafe(v, d),
    serialize: String,
    storageKey: "insights.wh",
  });
  const [includeMissing, setIncludeMissing] = useQueryBackedState({
    key: "missing",
    defaultValue: false,
    parse: parseBool,
    serialize: String,
    storageKey: "insights.missing",
  });
  const [genreMetric, setGenreMetric] = useQueryBackedState({
    key: "genreMetric",
    defaultValue: "count",
    parse: (v, d) => (v === "hours" || v === "count" ? v : d),
    serialize: (v) => v,
    storageKey: "insights.genreMetric",
  });
  const [genreType, setGenreType] = useQueryBackedState({
    key: "genreType",
    defaultValue: "my",
    parse: (v, d) => (v === "rawg" || v === "my" ? v : d),
    serialize: (v) => v,
    storageKey: "insights.genreType",
  });
  const [genreStatus, setGenreStatus] = useQueryBackedState({
    key: "genreStatus",
    defaultValue: "all",
    parse: (v, d) =>
      ["all", "planned", "playing", "done"].includes(v || "") ? v : d,
    serialize: (v) => v,
    storageKey: "insights.genreStatus",
  });

  // data
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);
  const [games, setGames] = useState([]);

  const load = async (opts) => {
    setLoading(true);
    setErr("");
    try {
      const [insights, gamesRes] = await Promise.all([
        fetchInsights({
          weeklyHours: opts?.weeklyHours ?? weeklyHours,
          includeMissingNames: opts?.includeMissing ?? includeMissing,
        }),
        api.get("/api/games"),
      ]);

      setData(insights);

      const g = Array.isArray(gamesRes)
        ? gamesRes.map((x) => ({
            my_genre: x.my_genre ?? null,
            rawg_genres: x.genres ?? null,
            hours: Number.isFinite(x.how_long_to_beat)
              ? x.how_long_to_beat
              : null,
            status: x.status || null,
          }))
        : [];
      setGames(g);

      const serverWH =
        insights?.eta?.weekly_hours ?? insights?.params?.weekly_hours;
      if (Number.isFinite(serverWH)) setWeeklyHours(serverWH);
    } catch (e) {
      setErr(e?.message || "Failed to load insights");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------- From here on, ALWAYS call hooks in same order; branch in JSX only ---------

  // Safeguards so memos can run even if not ready/loading
  const safeGroupKeys = groupKeys || [];
  const doneSet = useMemo(() => new Set(doneKeys || []), [doneKeys]);

  const totals = data?.totals || {};
  const byStatus = data?.byStatus || [];
  const eta = data?.eta || {};
  const missing = data?.meta?.missing_names || [];
  const missingCount = data?.meta?.missing_stats_count || 0;

  // Hours by status (bar) and base for ETA pie
  const statusData = useMemo(
    () =>
      (byStatus || []).map((s) => ({
        name: s.status,
        value: Number(s.hours || 0),
        count: Number(s.count || 0),
      })),
    [byStatus]
  );

  // ETA pie excludes all groups the server marks as "done"
  const etaPieData = useMemo(
    () =>
      statusData.filter((row) => {
        // toGroup is stable from context; if not ready, doneSet is empty so nothing is filtered out
        const g = toGroup(row.name);
        return !doneSet.has(g);
      }),
    [statusData, doneSet, toGroup]
  );

  // Genres: filter by selected group (all/planned/playing/done)
  const filteredGames = useMemo(() => {
    if (genreStatus === "all") return games;
    return games.filter((g) => statusGroupOf(g.status) === genreStatus);
  }, [games, genreStatus, statusGroupOf]);

  // Build genre distributions with fair split across multiple tags
  const { myGenreData, rawgGenreData } = useMemo(() => {
    const myMap = new Map();
    const rawgMap = new Map();

    const add = (map, key, countInc, hoursInc) => {
      const k = key || "Unknown";
      const cur = map.get(k) || { key: k, count: 0, hours: 0 };
      cur.count += countInc;
      cur.hours += hoursInc;
      map.set(k, cur);
    };

    for (const g of filteredGames) {
      const hours = Number.isFinite(g.hours) ? g.hours : 0;

      const myTags = new Set(splitCSV(g.my_genre));
      const mSize = myTags.size || 1;
      const mShare = hours / mSize;
      if (myTags.size === 0) add(myMap, "Unknown", 1, hours);
      else for (const t of myTags) add(myMap, t, 1, mShare);

      const rawgTags = new Set(splitCSV(g.rawg_genres));
      const rSize = rawgTags.size || 1;
      const rShare = hours / rSize;
      if (rawgTags.size === 0) add(rawgMap, "Unknown", 1, hours);
      else for (const t of rawgTags) add(rawgMap, t, 1, rShare);
    }

    const arrMy = Array.from(myMap.values()).sort(
      (a, b) =>
        b.count - a.count || b.hours - a.hours || a.key.localeCompare(b.key)
    );
    const arrRawg = Array.from(rawgMap.values()).sort(
      (a, b) =>
        b.count - a.count || b.hours - a.hours || a.key.localeCompare(b.key)
    );

    const cap = 12;
    const topMy = arrMy.slice(0, cap);
    const tailMy = arrMy.slice(cap);
    if (tailMy.length) {
      topMy.push({
        key: "Other",
        count: tailMy.reduce((a, x) => a + x.count, 0),
        hours: tailMy.reduce((a, x) => a + x.hours, 0),
      });
    }

    const topRawg = arrRawg.slice(0, cap);
    const tailRawg = arrRawg.slice(cap);
    if (tailRawg.length) {
      topRawg.push({
        key: "Other",
        count: tailRawg.reduce((a, x) => a + x.count, 0),
        hours: tailRawg.reduce((a, x) => a + x.hours, 0),
      });
    }

    return { myGenreData: topMy, rawgGenreData: topRawg };
  }, [filteredGames]);

  // Rounded-UP hours for display as requested
  const myGenreDisplay = useMemo(
    () => myGenreData.map((d) => ({ ...d, hoursRounded: Math.ceil(d.hours) })),
    [myGenreData]
  );
  const rawgGenreDisplay = useMemo(
    () =>
      rawgGenreData.map((d) => ({ ...d, hoursRounded: Math.ceil(d.hours) })),
    [rawgGenreData]
  );

  const genreAccessor = genreMetric === "hours" ? "hoursRounded" : "count";
  const genreData = genreType === "my" ? myGenreDisplay : rawgGenreDisplay;
  const genreTitleSuffix = genreType === "my" ? "My Genre" : "RAWG Genre";

  const toQP = useCallback((obj) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(obj))
      if (v != null) sp.set(k, String(v));
    const s = sp.toString();
    return s ? `?${s}` : "";
  }, []);

  const applyPreset = (v) => load({ weeklyHours: v, includeMissing });
  const handleApply = () => load({ weeklyHours, includeMissing });

  // Build dynamic group options (works even if not ready → empty list)
  const groupOptions = useMemo(
    () =>
      [{ value: "all", label: "All" }].concat(
        (safeGroupKeys || []).map((g) => ({
          value: g,
          label: g[0].toUpperCase() + g.slice(1),
        }))
      ),
    [safeGroupKeys]
  );

  // ---------------------------- Render ----------------------------
  const showSkeletons = !ready || loading;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl md:text-2xl font-semibold">Insights</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {[5, 10, 15, 20].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={[
                  "px-2.5 py-1 rounded-lg text-sm border",
                  p === weeklyHours
                    ? "bg-primary text-white border-primary"
                    : "hover:bg-gray-100 border-gray-300",
                ].join(" ")}
                aria-pressed={p === weeklyHours}
              >
                {p}h
              </button>
            ))}
          </div>
          <label className="flex items-center gap-3 text-sm">
            <span className="text-gray-600 whitespace-nowrap">
              Weekly hours
            </span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={Number.isFinite(weeklyHours) ? weeklyHours : 0}
              onChange={(e) =>
                setWeeklyHours(
                  clamp(parseInt(e.target.value || "0", 10), 0, 40)
                )
              }
              className="w-36"
              aria-label="Weekly hours"
            />
            <input
              type="number"
              min={0}
              step={1}
              value={Number.isFinite(weeklyHours) ? weeklyHours : 0}
              onChange={(e) =>
                setWeeklyHours(
                  clamp(parseInt(e.target.value || "0", 10), 0, 999)
                )
              }
              className="w-20 border rounded px-2 py-1 text-sm"
              aria-label="Weekly hours value"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeMissing}
              onChange={(e) => setIncludeMissing(e.target.checked)}
            />
            <span className="text-gray-600">Show missing</span>
          </label>
          <button
            onClick={handleApply}
            className="px-3 py-1.5 rounded bg-primary text-white text-sm hover:bg-primary-dark disabled:opacity-50"
            disabled={loading}
          >
            Apply
          </button>
        </div>
      </div>

      {err ? (
        <div className="p-3 rounded bg-red-50 text-red-600 text-sm">{err}</div>
      ) : null}

      {showSkeletons ? (
        <div className="space-y-6">
          <KPISkeleton />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
          <ChartSkeleton />
        </div>
      ) : data ? (
        <>
          {/* KPI tiles */}
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Tile label="Total games" value={fmtInt(totals.count)} />
            <Tile
              label="Playing hours"
              value={`${fmtInt(totals.hours_playing)} h`}
            />
            <Tile
              label="Planned hours"
              value={`${fmtInt(totals.hours_planned)} h`}
            />
            <Tile label="Done hours" value={`${fmtInt(totals.hours_done)} h`} />
            <Tile
              label="Backlog hours"
              value={`${fmtInt(eta.remaining_hours)} h`}
            />
            <Tile label="Avg hours" value={`${fmtInt(totals.avg_hours)} h`} />
          </section>

          {/* Hours by status + ETA */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            <ChartCard title="Hours by status">
              {statusData.length === 0 ? (
                <div className="text-sm text-gray-500">No data.</div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={statusData}
                      margin={{ top: 4, right: 8, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <RTooltip
                        formatter={(value, _name, { payload }) => [
                          `${fmtInt(value)} h`,
                          `${payload.name} (${fmtInt(payload.count)} games)`,
                        ]}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {statusData.map((row, i) => (
                          <Cell
                            key={i}
                            fill={colorAt(i)}
                            cursor="pointer"
                            title={`View ${row.name} games`}
                            onClick={() =>
                              nav(
                                `${GAMES_ROUTE}${toQP({ group: toGroup(row.name) })}`
                              )
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="ETA">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-center">
                <div className="h-64">
                  {etaPieData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-gray-500">
                      No planned/playing hours to visualize.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={etaPieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="55%"
                          outerRadius="85%"
                          paddingAngle={2}
                        >
                          {etaPieData.map((row, i) => (
                            <Cell
                              key={i}
                              fill={colorAt(i)}
                              cursor="pointer"
                              title={`View ${row.name} games`}
                              onClick={() =>
                                nav(
                                  `${GAMES_ROUTE}${toQP({ group: toGroup(row.name) })}`
                                )
                              }
                            />
                          ))}
                        </Pie>
                        <RTooltip
                          formatter={(value, name, { payload }) => [
                            `${fmtInt(value)} h`,
                            `${name} (${fmtInt(payload.count)} games)`,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between gap-6">
                    <span className="text-gray-600">Remaining</span>
                    <span className="font-medium">
                      {fmtInt(eta.remaining_hours)} h
                    </span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-gray-600">Weekly pace</span>
                    <span className="font-medium">
                      {fmtInt(eta.weekly_hours)} h/wk
                    </span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-gray-600">ETA (weeks)</span>
                    <span className="font-medium">{eta.weeks ?? "—"}</span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-gray-600">Finish date</span>
                    <span className="font-medium">
                      {eta.finish_date || "—"}
                    </span>
                  </div>
                </div>
              </div>
            </ChartCard>
          </div>

          {/* Genres */}
          <ChartCard
            title={`Genres (${genreTitleSuffix})`}
            right={
              <>
                <Segmented
                  value={genreType}
                  onChange={setGenreType}
                  options={[
                    { value: "my", label: "My" },
                    { value: "rawg", label: "RAWG" },
                  ]}
                />
                <Segmented
                  value={genreMetric}
                  onChange={setGenreMetric}
                  options={[
                    { value: "count", label: "Count" },
                    { value: "hours", label: "Hours" },
                  ]}
                />
                <Segmented
                  value={genreStatus}
                  onChange={setGenreStatus}
                  options={[{ value: "all", label: "All" }].concat(
                    (safeGroupKeys || []).map((g) => ({
                      value: g,
                      label: g[0].toUpperCase() + g.slice(1),
                    }))
                  )}
                />
              </>
            }
          >
            {genreData.length === 0 ? (
              <div className="text-sm text-gray-500">
                No data. Tip: tag some games with{" "}
                <span className="font-medium">My Genre</span> to populate this
                chart.
              </div>
            ) : (
              <div className="h-[22rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={genreData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 32 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="key"
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                      height={60}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <RTooltip
                      formatter={(value, _name, { payload }) => [
                        genreMetric === "hours"
                          ? `${fmtInt(value)} h`
                          : `${fmtInt(value)} games`,
                        payload.key,
                      ]}
                      labelFormatter={() => ""}
                    />
                    <Bar dataKey={genreAccessor} radius={[6, 6, 0, 0]}>
                      {genreData.map((row, i) => (
                        <Cell
                          key={i}
                          fill={colorAt(i)}
                          cursor="pointer"
                          title={`View ${row.key} games`}
                          onClick={() =>
                            nav(
                              `${GAMES_ROUTE}${toQP({
                                genreType,
                                genre: row.key,
                                group:
                                  genreStatus !== "all"
                                    ? genreStatus
                                    : undefined,
                                metric: genreMetric,
                              })}`
                            )
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          {/* Missing list */}
          {includeMissing && missing?.length ? (
            <section className="rounded-2xl border p-4 md:p-5">
              <h2 className="font-semibold mb-2">Missing hours (excluded)</h2>
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                {missing.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <div className="text-sm text-gray-500">No insights available.</div>
      )}
    </div>
  );
}
