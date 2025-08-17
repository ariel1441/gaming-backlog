// src/features/insights/InsightsTab.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchInsights } from "../../services/insightsService";
import { api } from "../../services/apiClient";
import { useStatusGroups } from "../../contexts/StatusGroupsContext";
import { useAuth } from "../../contexts/AuthContext";
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

const GAMES_ROUTE = "/";

/* ========================= Theme-driven chart colors ========================= */
const cssVar = (name) =>
  typeof window !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    : "";

const palette = () =>
  Array.from({ length: 12 }, (_, i) => cssVar(`--chart-${i + 1}`) || "#888");

const colorAt = (i) => {
  const p = palette();
  return p[i % p.length];
};

const AXIS_TICK = () => cssVar("--axis-tick") || "#9ca3af";
const GRID_STROKE = () => cssVar("--grid-stroke") || "rgba(156,163,175,.25)";
const TOOLTIP_BG = () => cssVar("--tooltip-bg") || "#1f2937";
const TOOLTIP_BORDER = () => cssVar("--tooltip-border") || "#374151";

/* ========================= Small helpers ========================= */
const fmtInt = (n) => (Number.isFinite(n) ? n.toLocaleString() : "0");
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
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

/* ===== simple media query hook ===== */
function useMedia(query, initial = false) {
  const get = () =>
    typeof window === "undefined" ? initial : window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);
    onChange();
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}

/* ===== debounce hook (for weekly hours) ===== */
function useDebounced(value, delay = 400) {
  const [deb, setDeb] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDeb(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return deb;
}

/* ===== Tick renderers ===== */
function EllipsisTick({ x, y, payload, angle = -18, maxChars = 22 }) {
  const full = String(payload?.value ?? "");
  const text =
    full.length > maxChars ? `${full.slice(0, maxChars - 1)}…` : full;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        dy={8}
        textAnchor="end"
        transform={`rotate(${angle})`}
        fill={AXIS_TICK()}
        fontSize={12}
        title={full}
      >
        {text}
      </text>
    </g>
  );
}

/* ========================= UI atoms ========================= */
function Tile({ label, value }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5 flex flex-col gap-1">
      <div className="text-xs uppercase tracking-wide text-content-muted">
        {label}
      </div>
      <div className="text-lg md:text-xl font-semibold text-content-primary">
        {value}
      </div>
    </div>
  );
}
function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg border border-surface-border bg-surface-card overflow-hidden">
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              "px-2.5 py-1 text-xs transition-colors",
              active
                ? "bg-primary text-black"
                : "text-content-secondary hover:bg-surface-elevated",
              i > 0 ? "border-l border-surface-border" : "",
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
function Skeleton({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-lg bg-white/10 ${className}`} />
  );
}
function KPISkeleton() {
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5"
        >
          <Skeleton className="h-3 w-20 mb-3" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </section>
  );
}
function ChartSkeleton() {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5 space-y-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-64 w-full" />
    </section>
  );
}

/* ========================= Component ========================= */
export default function InsightsTab() {
  const nav = useNavigate();
  const { ready, statusGroupOf, toGroup, groupKeys } = useStatusGroups();
  const { user } = useAuth();
  const displayName = useMemo(
    () => user?.name || user?.username || user?.email || "You",
    [user]
  );

  const isSmall = useMedia("(max-width: 1024px)");
  const isPhone = useMedia("(max-width: 640px)");

  // URL-backed UI state
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

  // initial load
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounce weeklyHours, auto-fetch
  const debWH = useDebounced(weeklyHours, 450);
  const didInitWH = useRef(false);
  useEffect(() => {
    if (!didInitWH.current) {
      didInitWH.current = true;
      return;
    }
    load({ weeklyHours: debWH });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debWH]);

  // includeMissing toggles re-fetch immediately
  const didInitMissing = useRef(false);
  useEffect(() => {
    if (!didInitMissing.current) {
      didInitMissing.current = true;
      return;
    }
    load({ includeMissing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeMissing]);

  const totals = data?.totals || {};
  const byStatus = data?.byStatus || [];
  const eta = data?.eta || {};
  const missing = data?.meta?.missing_names || [];

  /* ---------- Status data uses FULL names for all devices ---------- */
  const statusData = useMemo(
    () =>
      (byStatus || []).map((s) => ({
        name: s.status, // full string used everywhere (tooltip, routing)
        display: s.status, // tick shows full name w/ ellipsis via custom tick
        value: Number(s.hours || 0),
        count: Number(s.count || 0),
      })),
    [byStatus]
  );

  // spacing & size
  const bottomForTicks = isPhone ? 44 : isSmall ? 32 : 36;
  const topForPlot = 16;

  // exclude "done" from ETA composition
  const etaPieData = useMemo(
    () => statusData.filter((row) => toGroup(row.name) !== "done"),
    [statusData, toGroup]
  );

  const filteredGames = useMemo(() => {
    if (genreStatus === "all") return games;
    return games.filter((g) => statusGroupOf(g.status) === genreStatus);
  }, [games, genreStatus, statusGroupOf]);

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

  const allHoursFallback = useMemo(
    () =>
      Array.isArray(byStatus)
        ? byStatus.reduce((a, s) => a + (s.hours || 0), 0)
        : 0,
    [byStatus]
  );

  const showSkeletons = !ready || loading;

  return (
    <div className="min-h-screen bg-surface-bg text-content-primary p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl md:text-2xl font-semibold">
          Insights{" "}
          <span className="font-normal text-content-secondary">
            — {displayName}
          </span>
        </h1>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <label className="flex items-center gap-3 text-sm">
            <span className="text-content-muted whitespace-nowrap">
              Weekly hours
            </span>
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
              className="w-20 border border-surface-border rounded px-2 py-1 text-sm bg-surface-card text-content-primary"
              aria-label="Weekly hours value"
            />
          </label>

          <button
            type="button"
            onClick={() => setIncludeMissing((v) => !v)}
            className={[
              "px-3 py-1.5 rounded border text-sm transition-colors",
              includeMissing
                ? "bg-surface-elevated border-surface-border text-content-primary"
                : "bg-surface-card border-surface-border text-content-primary hover:bg-surface-elevated",
            ].join(" ")}
          >
            {includeMissing ? "Hide missing games" : "Show missing games"}
          </button>

          <button
            onClick={() => nav(GAMES_ROUTE)}
            className="px-3 py-1.5 rounded border border-surface-border bg-surface-card text-content-primary hover:bg-surface-elevated transition-colors text-sm"
            aria-label="Back to main"
          >
            Back to Games
          </button>
        </div>
      </div>

      {err ? (
        <div className="p-3 rounded bg-red-500/10 text-red-300 text-sm border border-red-500/30">
          {err}
        </div>
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
              label="Total games hours"
              value={`${fmtInt(totals.total_hours ?? allHoursFallback)} h`}
            />
            <Tile label="Avg hours" value={`${fmtInt(totals.avg_hours)} h`} />
          </section>

          {/* Hours by status + ETA */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Hours by status — full labels everywhere, ellipsis + angle, phone scrolls */}
            <section className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-semibold text-content-primary">
                  Hours by status
                </h2>
              </div>

              {statusData.length === 0 ? (
                <div className="text-sm text-content-muted">No data.</div>
              ) : isPhone ? (
                <div className="overflow-x-auto">
                  <div
                    className="h-64"
                    style={{ minWidth: Math.max(statusData.length * 120, 640) }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={statusData}
                        margin={{
                          top: topForPlot,
                          right: 8,
                          left: 0,
                          bottom: bottomForTicks,
                        }}
                        barCategoryGap={16}
                        barGap={4}
                      >
                        <CartesianGrid
                          stroke={GRID_STROKE()}
                          vertical={false}
                        />
                        <XAxis
                          dataKey="display"
                          interval={0}
                          tick={<EllipsisTick angle={-18} maxChars={18} />}
                          tickLine={false}
                          height={bottomForTicks}
                        />
                        <YAxis tick={{ fontSize: 12, fill: AXIS_TICK() }} />
                        <RTooltip
                          cursor={{ fill: "transparent" }}
                          wrapperStyle={{ outline: "none" }}
                          contentStyle={{
                            background: TOOLTIP_BG(),
                            border: `1px solid ${TOOLTIP_BORDER()}`,
                            borderRadius: 8,
                          }}
                          labelStyle={{ color: "#fff" }}
                          itemStyle={{ color: "#fff" }}
                          labelFormatter={() => ""}
                          formatter={(value, _name, { payload }) => [
                            `${fmtInt(value)} h`,
                            `${payload.name} (${fmtInt(payload.count)} games)`,
                          ]}
                        />
                        <Bar dataKey="value" barSize={22} radius={[6, 6, 0, 0]}>
                          {statusData.map((row, i) => (
                            <Cell
                              key={i}
                              fill={colorAt(i)}
                              cursor="pointer"
                              onClick={() =>
                                nav(
                                  `${GAMES_ROUTE}${toQP({ status: row.name })}`
                                )
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={statusData}
                      margin={{
                        top: topForPlot,
                        right: 8,
                        left: 0,
                        bottom: bottomForTicks,
                      }}
                      barCategoryGap={16}
                      barGap={4}
                    >
                      <CartesianGrid stroke={GRID_STROKE()} vertical={false} />
                      <XAxis
                        dataKey="display"
                        interval={0}
                        tick={<EllipsisTick angle={-18} maxChars={22} />}
                        tickLine={false}
                        height={bottomForTicks}
                      />
                      <YAxis tick={{ fontSize: 12, fill: AXIS_TICK() }} />
                      <RTooltip
                        cursor={{ fill: "transparent" }}
                        wrapperStyle={{ outline: "none" }}
                        contentStyle={{
                          background: TOOLTIP_BG(),
                          border: `1px solid ${TOOLTIP_BORDER()}`,
                          borderRadius: 8,
                        }}
                        labelStyle={{ color: "#fff" }}
                        itemStyle={{ color: "#fff" }}
                        labelFormatter={() => ""}
                        formatter={(value, _name, { payload }) => [
                          `${fmtInt(value)} h`,
                          `${payload.name} (${fmtInt(payload.count)} games)`,
                        ]}
                      />
                      <Bar dataKey="value" barSize={28} radius={[6, 6, 0, 0]}>
                        {statusData.map((row, i) => (
                          <Cell
                            key={i}
                            fill={colorAt(i)}
                            cursor="pointer"
                            onClick={() =>
                              nav(`${GAMES_ROUTE}${toQP({ status: row.name })}`)
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {/* ETA */}
            <section className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-semibold text-content-primary">ETA</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-center">
                <div className="h-64">
                  {etaPieData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-content-muted">
                      No hours to visualize.
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
                              onClick={() =>
                                nav(
                                  `${GAMES_ROUTE}${toQP({ status: row.name })}`
                                )
                              }
                            />
                          ))}
                        </Pie>
                        <RTooltip
                          wrapperStyle={{ outline: "none" }}
                          contentStyle={{
                            background: TOOLTIP_BG(),
                            border: `1px solid ${TOOLTIP_BORDER()}`,
                            borderRadius: 8,
                          }}
                          labelStyle={{ color: "#fff" }}
                          itemStyle={{ color: "#fff" }}
                          labelFormatter={() => ""}
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
                    <span className="text-content-muted">Remaining</span>
                    <span className="font-medium">
                      {fmtInt(eta?.remaining_hours)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-content-muted">Weekly pace</span>
                    <span className="font-medium">
                      {fmtInt(eta?.weekly_hours)} h/wk
                    </span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-content-muted">ETA (weeks)</span>
                    <span className="font-medium">{eta?.weeks ?? "—"}</span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-content-muted">Finish date</span>
                    <span className="font-medium">
                      {eta?.finish_date || "—"}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Genres */}
          <section className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold text-content-primary">
                Genres ({genreType === "my" ? "My Genre" : "RAWG Genre"})
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
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
                    (groupKeys || []).map((g) => ({
                      value: g,
                      label: g[0].toUpperCase() + g.slice(1),
                    }))
                  )}
                />
              </div>
            </div>

            {(() => {
              const gd = genreData;
              if (!gd.length)
                return (
                  <div className="text-sm text-content-muted">
                    No data. Tag some games with{" "}
                    <span className="font-medium">My Genre</span> to populate
                    this chart.
                  </div>
                );

              return (
                <div className="overflow-x-auto">
                  <div
                    className="h-[22rem] w-full"
                    style={{
                      minWidth: isSmall
                        ? Math.max(gd.length * 64, 720)
                        : undefined,
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={gd}
                        margin={{ top: 8, right: 8, left: 0, bottom: 32 }}
                      >
                        <CartesianGrid
                          stroke={GRID_STROKE()}
                          vertical={false}
                        />
                        <XAxis
                          dataKey="key"
                          angle={-25}
                          textAnchor="end"
                          interval={0}
                          height={60}
                          tick={{ fontSize: 12, fill: AXIS_TICK() }}
                        />
                        <YAxis tick={{ fontSize: 12, fill: AXIS_TICK() }} />
                        <RTooltip
                          cursor={{ fill: "transparent" }}
                          wrapperStyle={{ outline: "none" }}
                          contentStyle={{
                            background: TOOLTIP_BG(),
                            border: `1px solid ${TOOLTIP_BORDER()}`,
                            borderRadius: 8,
                          }}
                          labelStyle={{ color: "#fff" }}
                          itemStyle={{ color: "#fff" }}
                          labelFormatter={() => ""}
                          formatter={(value, _name, { payload }) => [
                            genreMetric === "hours"
                              ? `${fmtInt(value)} h`
                              : `${fmtInt(value)} games`,
                            payload.key,
                          ]}
                        />
                        <Bar dataKey={genreAccessor} radius={[6, 6, 0, 0]}>
                          {gd.map((row, i) => (
                            <Cell
                              key={i}
                              fill={colorAt(i)}
                              cursor="pointer"
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
                </div>
              );
            })()}
          </section>

          {includeMissing && missing?.length ? (
            <section className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5">
              <h2 className="font-semibold mb-2">Missing hours (excluded)</h2>
              <ul className="list-disc pl-5 text-sm text-content-secondary space-y-1">
                {missing.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <div className="text-sm text-content-muted">No insights available.</div>
      )}
    </div>
  );
}
