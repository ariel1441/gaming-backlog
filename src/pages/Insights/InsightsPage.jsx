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
import { listGames } from "../../services/gameService";

// context
import { useStatusGroups } from "../../contexts/StatusGroupsContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  AppPage,
  PageError,
  PageHeader,
  PageSection,
  PageToolbar,
} from "../../components/layout";

// components
import Tile from "../../components/insights/Tile";
import HoursByStatusChart from "../../components/insights/HoursByStatusChart";
import GenresChart from "../../components/insights/GenresChart";
import EtaDonut from "../../components/insights/EtaDonut";
import DateTimelineChart from "../../components/insights/DateTimelineChart";

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
import { computeGameDateInsights } from "../../utils/gameDateInsights";
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
    [user],
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
  const loadSequence = useRef(0);
  const loadController = useRef(null);

  const { colorAt, axisTick, gridStroke, tooltipColors } = useChartTheme();

  const load = async (opts) => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setErr("");
    try {
      const [insights, gamesRes] = await Promise.all([
        fetchInsights({
          weeklyHours: opts?.weeklyHours ?? weeklyHours,
          includeMissingNames: opts?.includeMissing ?? includeMissing,
        }, { signal: controller.signal }),
        listGames({ signal: controller.signal }),
      ]);

      if (sequence !== loadSequence.current || controller.signal.aborted) return;

      setData(insights);

      const normalizedGames = Array.isArray(gamesRes)
        ? gamesRes.map((x) => ({
            my_genre: x.my_genre ?? null,
            rawg_genres: x.genres ?? null,
            hours: Number.isFinite(x.how_long_to_beat)
              ? x.how_long_to_beat
              : null,
            status: x.status || null,
            name: x.name || null,
            started_at: x.started_at || null,
            finished_at: x.finished_at || null,
          }))
        : [];
      setGames(normalizedGames);

    } catch (e) {
      if (e?.name === "AbortError" || sequence !== loadSequence.current) return;
      setErr(e?.message || "Failed to load insights");
    } finally {
      if (sequence === loadSequence.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(
    () => () => {
      loadSequence.current += 1;
      loadController.current?.abort();
    },
    [],
  );

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
    [byStatus],
  );

  // exclude "done" from ETA donut
  const etaPieData = useMemo(
    () => statusData.filter((row) => toGroup(row.name) !== "done"),
    [statusData, toGroup],
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
    [myGenreData],
  );
  const rawgGenreDisplay = useMemo(
    () =>
      rawgGenreData.map((d) => ({ ...d, hoursRounded: Math.ceil(d.hours) })),
    [rawgGenreData],
  );

  const genreAccessor = genreMetric === "hours" ? "hoursRounded" : "count";
  const genreData = genreType === "my" ? myGenreDisplay : rawgGenreDisplay;

  const dateInsights = useMemo(() => computeGameDateInsights(games), [games]);

  const onStatusClick = useCallback(
    (status) => nav(`${GAMES_ROUTE}${toQP({ status })}`),
    [nav],
  );

  const onGenreClick = useCallback(
    ({ key }) =>
      nav(
        `${GAMES_ROUTE}${toQP({
          genreType,
          genre: key,
          group: genreStatus !== "all" ? genreStatus : undefined,
          metric: genreMetric,
        })}`,
      ),
    [nav, genreType, genreStatus, genreMetric],
  );

  const onDateYearClick = useCallback(
    (dateType, year) => {
      if (!dateType || !year) return;
      nav(`${GAMES_ROUTE}${toQP({ dateType, year })}`);
    },
    [nav],
  );

  const onActiveClick = useCallback(
    (active) => nav(`${GAMES_ROUTE}${toQP({ active })}`),
    [nav],
  );

  const allHoursFallback = useMemo(
    () =>
      Array.isArray(byStatus)
        ? byStatus.reduce((a, s) => a + (s.hours || 0), 0)
        : 0,
    [byStatus],
  );

  const showSkeletons = !ready || loading;

  return (
    <AppPage width="full">
      <div className="space-y-6">
        <PageHeader
          title="Insights"
          description="Patterns across your gaming history and backlog."
          meta={displayName}
        />

        {err ? (
          <PageError
            title="Could not load insights."
            description={err}
            onRetry={() => load()}
            className="min-h-[160px]"
          />
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
              <Tile
                label="Done hours"
                value={`${fmtInt(totals.hours_done)} h`}
              />
              <Tile
                label="Total games hours"
                value={`${fmtInt(totals.total_hours ?? allHoursFallback)} h`}
              />
              <Tile label="Avg hours" value={`${fmtInt(totals.avg_hours)} h`} />
            </section>

            <section className="rounded-2xl border border-surface-border bg-surface-card p-4 md:p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-semibold text-content-primary">
                    Started and finished over time
                  </h2>
                  <p className="mt-1 text-sm text-content-muted">
                    Yearly progress from the dates saved on your games.
                  </p>
                </div>
              </div>

              <DateTimelineChart
                data={dateInsights.yearly}
                axisTick={axisTick}
                gridStroke={gridStroke}
                tooltipColors={tooltipColors}
                onBarClick={onDateYearClick}
              />

              <div className="grid gap-3 border-t border-surface-border pt-4 sm:grid-cols-2 lg:grid-cols-5">
                <InsightStat
                  label="Started this year"
                  value={fmtInt(dateInsights.startedThisYear)}
                />
                <InsightStat
                  label="Finished this year"
                  value={fmtInt(dateInsights.finishedThisYear)}
                />
                <InsightStat
                  label="Currently active"
                  value={fmtInt(dateInsights.activeCount)}
                  onClick={() => onActiveClick("unfinished")}
                />
                <InsightStat
                  label="Avg start to finish"
                  value={
                    dateInsights.averageCompletionDays == null
                      ? "N/A"
                      : `${fmtInt(dateInsights.averageCompletionDays)} days`
                  }
                />
                <InsightStat
                  label="Oldest active"
                  value={
                    dateInsights.oldestActive
                      ? dateInsights.oldestActive.name
                      : "N/A"
                  }
                  detail={dateInsights.oldestActive?.started_at}
                  onClick={() => onActiveClick("unfinished")}
                />
              </div>
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
          <div className="text-sm text-content-muted">
            No insights available.
          </div>
        )}
      </div>
    </AppPage>
  );
}

function InsightStat({ label, value, detail, onClick }) {
  const Element = onClick ? "button" : "div";
  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`min-w-0 text-left ${
        onClick
          ? "rounded-xl p-2 -m-2 transition-colors hover:bg-surface-elevated/60"
          : ""
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-content-muted">
        {label}
      </div>
      <div className="mt-1 truncate text-lg font-semibold text-content-primary">
        {value}
      </div>
      {detail ? (
        <div className="mt-1 text-xs text-content-muted">{detail}</div>
      ) : null}
    </Element>
  );
}
