import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

// services
import { fetchInsights } from "../../services/insightsService";
import { api } from "../../services/apiClient";

// context
import { useStatusGroups } from "../../contexts/StatusGroupsContext";
import { useAuth } from "../../contexts/AuthContext";

// components
import Tile from "../../components/insights/Tile";
import HoursByStatusChart from "../../components/insights/HoursByStatusChart";
import GenresChart from "../../components/insights/GenresChart";
import EtaDonut from "../../components/insights/EtaDonut";

import {
  KPISkeleton,
  ChartSkeleton,
} from "../../components/insights/Skeletons";

// hooks
import useQueryBackedState from "../../hooks/useQueryBackedState";
import useMedia from "../../hooks/useMedia";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

// utils
import { useChartTheme } from "../../utils/chartTheme";
import {
  fmtInt,
  parseBool,
  parseIntSafe,
  toQP,
  clamp,
  splitCSV,
} from "../../utils/format";

const GAMES_ROUTE = "/";

export default function InsightsPage() {
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

  const { colorAt, axisTick, gridStroke, tooltipColors } = useChartTheme();

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

      const normalizedGames = Array.isArray(gamesRes)
        ? gamesRes.map((x) => ({
            my_genre: x.my_genre ?? null,
            rawg_genres: x.genres ?? null,
            hours: Number.isFinite(x.how_long_to_beat)
              ? x.how_long_to_beat
              : null,
            status: x.status || null,
          }))
        : [];
      setGames(normalizedGames);

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
  const debWH = useDebouncedValue(weeklyHours, 450);
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

  // ---------- Status data (full names) ----------
  const statusData = useMemo(
    () =>
      (byStatus || []).map((s) => ({
        name: s.status,
        display: s.status,
        value: Number(s.hours || 0),
        count: Number(s.count || 0),
      })),
    [byStatus]
  );

  // exclude "done" from ETA donut
  const etaPieData = useMemo(
    () => statusData.filter((row) => toGroup(row.name) !== "done"),
    [statusData, toGroup]
  );

  // ---------- Genres transforms ----------
  const filteredGames = useMemo(() => {
    if (genreStatus === "all") return games;
    return games.filter((g) => statusGroupOf(g.status) === genreStatus);
  }, [games, genreStatus, statusGroupOf]);

  const { myGenreData, rawgGenreData } = useMemo(() => {
    const myMap = new Map();
    const rawgMap = new Map();
    const bump = (map, key, countInc, hoursInc) => {
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
      if (myTags.size === 0) bump(myMap, "Unknown", 1, hours);
      else for (const t of myTags) bump(myMap, t, 1, mShare);

      const rawgTags = new Set(splitCSV(g.rawg_genres));
      const rSize = rawgTags.size || 1;
      const rShare = hours / rSize;
      if (rawgTags.size === 0) bump(rawgMap, "Unknown", 1, hours);
      else for (const t of rawgTags) bump(rawgMap, t, 1, rShare);
    }

    const sort = (a, b) =>
      b.count - a.count || b.hours - a.hours || a.key.localeCompare(b.key);
    const arrMy = Array.from(myMap.values()).sort(sort);
    const arrRawg = Array.from(rawgMap.values()).sort(sort);

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

  const onStatusClick = useCallback(
    (status) => nav(`${GAMES_ROUTE}${toQP({ status })}`),
    [nav]
  );

  const onGenreClick = useCallback(
    ({ key }) =>
      nav(
        `${GAMES_ROUTE}${toQP({
          genreType,
          genre: key,
          group: genreStatus !== "all" ? genreStatus : undefined,
          metric: genreMetric,
        })}`
      ),
    [nav, genreType, genreStatus, genreMetric]
  );

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
            <HoursByStatusChart
              data={statusData}
              isSmall={isSmall}
              isPhone={isPhone}
              axisTick={axisTick}
              gridStroke={gridStroke}
              tooltipColors={tooltipColors}
              colorAt={colorAt}
              onBarClick={onStatusClick}
            />
            <EtaDonut
              data={etaPieData}
              eta={eta}
              axisTick={axisTick}
              tooltipColors={tooltipColors}
              colorAt={colorAt}
              onSliceClick={onStatusClick}
            />
          </div>

          {/* Genres */}
          <GenresChart
            data={genreData}
            accessor={genreAccessor}
            isSmall={isSmall}
            axisTick={axisTick}
            gridStroke={gridStroke}
            tooltipColors={tooltipColors}
            colorAt={colorAt}
            groupKeys={groupKeys}
            genreType={genreType}
            onGenreTypeChange={setGenreType}
            genreMetric={genreMetric}
            onGenreMetricChange={setGenreMetric}
            genreStatus={genreStatus}
            onGenreStatusChange={setGenreStatus}
            onBarClick={onGenreClick}
          />

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
