import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Star } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { fetchInsights } from "../../services/insightsService";
import { useAuth } from "../../contexts/AuthContext";
import { useStatusGroups } from "../../contexts/StatusGroupsContext";
import { AppPage, PageError, PageHeader, PageLoading } from "../../components/layout";
import { Button, EmptyState, Panel, SelectMenu } from "../../components/ui";
import HoursByStatusChart from "../../components/insights/HoursByStatusChart";
import GenresChart from "../../components/insights/GenresChart";
import DateTimelineChart from "../../components/insights/DateTimelineChart";
import useQueryBackedState from "../../hooks/useQueryBackedState";
import useMedia from "../../hooks/useMedia";
import { useChartTheme } from "../../utils/chartTheme";
import { fmtInt, toQP } from "../../utils/format";

const BACKLOG_ROUTE = "/";

function InsightTile({ label, value, detail, onClick }) {
  const Element = onClick ? "button" : "div";
  return (
    <Element type={onClick ? "button" : undefined} onClick={onClick}
      className={`grid min-h-[106px] grid-rows-[auto_1fr_auto] rounded-2xl border border-surface-border bg-surface-card p-4 text-left ${onClick ? "transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-content-muted">{label}</p>
      <p className="mt-1 self-start text-xl font-semibold text-content-primary">{value}</p>
      <p className="min-h-4 text-xs text-content-muted">{detail || "\u00a0"}</p>
    </Element>
  );
}

function ScoreDistribution({ scores = [], averageScore, rated, onScoreClick, axisTick, gridStroke, tooltipColors }) {
  const lowestScore = scores.find((item) => item.count > 0)?.score;
  const visibleScores = scores.filter((item) => item.score >= Math.min(5, lowestScore ?? 5));
  return (
    <Panel title="Your scores">
      {!rated ? <EmptyChart icon={Star} message="Save ratings on games to see your score distribution." /> : <>
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <span className="text-3xl font-semibold">{averageScore ?? "—"}</span>
          <span className="text-sm text-content-muted">Average across {fmtInt(rated)} rated games</span>
        </div>
        <div className="h-44" aria-label="Score distribution in half-point increments">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visibleScores} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap={12}>
              <CartesianGrid stroke={gridStroke()} vertical={false} />
              <XAxis dataKey="score" tick={{ fontSize: 12, fill: axisTick() }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: axisTick() }} />
              <RTooltip
                cursor={{ fill: "transparent" }}
                wrapperStyle={{ outline: "none" }}
                contentStyle={{ background: tooltipColors().bg, border: `1px solid ${tooltipColors().border}`, borderRadius: 8 }}
                labelStyle={{ color: tooltipColors().text }}
                itemStyle={{ color: tooltipColors().text }}
                labelFormatter={(value) => `Score ${value}/10`}
                formatter={(value) => [`${fmtInt(value)} games`, ""]}
              />
              <Bar dataKey="count" fill="rgb(var(--color-primary) / 0.75)" radius={[6, 6, 0, 0]}>
                {visibleScores.map((item) => {
                  const clickable = item.count > 0;
                  const selectScore = () => onScoreClick?.(item.score);
                  return <Cell
                    key={item.score}
                    cursor={clickable ? "pointer" : "default"}
                    onClick={clickable ? selectScore : undefined}
                    onKeyDown={clickable ? (event) => {
                      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectScore(); }
                    } : undefined}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-label={clickable ? `View ${fmtInt(item.count)} games rated ${item.score} out of 10` : undefined}
                  />;
                })}
                <LabelList dataKey="count" position="top" fill={axisTick()} fontSize={12} formatter={(value) => value || ""} aria-hidden="true" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>}
    </Panel>
  );
}

function EmptyChart({ icon: Icon, message }) {
  return <div className="flex min-h-52 flex-col items-center justify-center gap-2 text-center text-sm text-content-muted">
    <Icon className="h-6 w-6" aria-hidden="true" />
    <p>{message}</p>
  </div>;
}

export default function InsightsPage() {
  const nav = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { ready, statusGroupOf, groupKeys } = useStatusGroups();
  const [year, setYear] = useQueryBackedState({ key: "year", defaultValue: "all", parse: (value) => /^\d{4}$/.test(value || "") ? value : "all", serialize: String, storageKey: "insights.year" });
  const [genreMetric, setGenreMetric] = useQueryBackedState({ key: "genreMetric", defaultValue: "count", parse: (value) => value === "hours" ? value : "count", serialize: String, storageKey: "insights.genreMetric" });
  const [genreType, setGenreType] = useQueryBackedState({ key: "genreType", defaultValue: "my", parse: (value) => value === "rawg" ? value : "my", serialize: String, storageKey: "insights.genreType" });
  const [genreStatus, setGenreStatus] = useQueryBackedState({ key: "genreStatus", defaultValue: "all", parse: (value) => ["all", "planned", "playing", "returning", "done", "other"].includes(value || "") ? value : "all", serialize: String, storageKey: "insights.genreStatus" });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const controllerRef = useRef(null);
  const { colorAt, axisTick, gridStroke, tooltipColors } = useChartTheme();
  const isSmall = useMedia("(max-width: 1024px)");
  const isPhone = useMedia("(max-width: 640px)");

  const load = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setLoading(true); setError("");
    try { setData(await fetchInsights({ year: year === "all" ? undefined : Number(year) }, { signal: controller.signal })); }
    catch (err) { if (err?.name !== "AbortError") setError(err?.message || "Could not load insights."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [isAuthenticated, year]);
  useEffect(() => { void load(); return () => controllerRef.current?.abort(); }, [load]);

  const years = useMemo(() => [...new Set(data?.yearly?.map((item) => item.year) || [])].sort((a, b) => b - a), [data]);
  const dateData = useMemo(() => year === "all" ? (data?.yearly || []) : (data?.yearly || []).filter((item) => String(item.year) === year), [data, year]);
  const yearGames = useMemo(() => (data?.games || []).filter((game) => (
    year === "all" || String(game.startedAt || "").startsWith(`${year}-`) || String(game.finishedAt || "").startsWith(`${year}-`)
  )), [data, year]);
  const filteredGames = useMemo(() => yearGames.filter((game) => (
    genreStatus === "all" || statusGroupOf(game.status) === genreStatus
  )), [genreStatus, statusGroupOf, yearGames]);
  const genreData = useMemo(() => {
    const map = new Map();
    filteredGames.forEach((game) => {
      const labels = genreType === "my" ? game.personalGenres : game.rawgGenres;
      const values = labels?.length ? labels : ["Unclassified"];
      values.forEach((label) => {
        const entry = map.get(label) || { key: label, count: 0, hours: 0 };
        entry.count += 1; entry.hours += (game.hours || 0) / values.length; map.set(label, entry);
      });
    });
    const sorted = [...map.values()].sort((a, b) => b.count - a.count || b.hours - a.hours || a.key.localeCompare(b.key));
    const top = sorted.slice(0, 10); const rest = sorted.slice(10);
    if (rest.length) top.push({ key: "Other", count: rest.reduce((sum, item) => sum + item.count, 0), hours: rest.reduce((sum, item) => sum + item.hours, 0) });
    return top.map((item) => ({ ...item, hoursRounded: Math.round(item.hours) }));
  }, [filteredGames, genreType]);
  const statusData = useMemo(() => {
    const groups = new Map();
    yearGames.forEach((game) => {
      const group = statusGroupOf(game.status);
      const current = groups.get(group) || { name: group, display: group === "other" ? "Other" : `${group[0].toUpperCase()}${group.slice(1)}`, value: 0, count: 0 };
      current.value += 1; current.count += 1; groups.set(group, current);
    });
    return ["planned", "playing", "returning", "done", "other"].map((group) => groups.get(group)).filter(Boolean);
  }, [statusGroupOf, yearGames]);
  const onBacklog = useCallback((params) => nav(`${BACKLOG_ROUTE}${toQP(params)}`), [nav]);

  if (!isAuthenticated && !loading) return <AppPage><EmptyState icon={BarChart3} title="Sign in to view Insights" description="Insights is a private view of your backlog, dates, genres, and scores." action={<Button onClick={() => nav("/")}>Go to backlog</Button>} /></AppPage>;
  if (loading || !ready) return <AppPage width="full"><PageLoading rows={6} /></AppPage>;
  if (error) return <AppPage width="full"><PageError title="Could not load insights" description={error} onRetry={load} /></AppPage>;
  const totals = data?.totals || {}; const focused = data?.focused || {};
  const isYearView = year !== "all";
  const summary = isYearView ? focused : totals;
  const ratingSummary = focused;
  if (!data?.games?.length) return <AppPage width="full"><div className="space-y-6"><PageHeader title="Insights" description="A private view of your backlog, progress, and the data behind it." meta={user?.display_name || user?.username || "You"} /><EmptyState icon={BarChart3} title="Build your Insights" description="Add games or review your Steam library to see progress, genres, ratings, and estimate coverage." action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => nav("/")}>Add games</Button><Button variant="secondary" onClick={() => nav("/steam/import")}>Review Steam library</Button></div>} /></div></AppPage>;
  return <AppPage width="full"><div className="space-y-6">
    <PageHeader title="Insights" description="A private view of your backlog, progress, and the data behind it." meta={user?.display_name || user?.username || "You"}
      actions={years.length > 1 ? <div className="flex items-center gap-2"><span className="text-xs font-medium uppercase tracking-wide text-content-muted">Year</span><SelectMenu value={year} onChange={setYear} options={[{ value: "all", label: "All time" }, ...years.map((item) => ({ value: String(item), label: String(item) }))]} aria-label="Select year" className="w-32" buttonClassName="min-h-9 py-1.5 text-sm" /></div> : null} />
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <InsightTile label="Library games" value={fmtInt(summary.games)} detail={isYearView ? year : "All time"} onClick={() => onBacklog(isYearView ? { insightsYear: year } : {})} />
      {isYearView ? (
        <InsightTile label="Started" value={fmtInt(summary.started)} detail={year} onClick={() => onBacklog({ dateType: "started", year })} />
      ) : (
        <InsightTile label="Wishlist" value={fmtInt(totals.wishlist)} detail="Current" onClick={() => nav("/wishlist")} />
      )}
      <InsightTile label="Finished" value={fmtInt(isYearView ? summary.finished : totals.finished)} detail={isYearView ? year : "All time"} onClick={() => onBacklog(isYearView ? { dateType: "finished", year } : { group: "done" })} />
      <InsightTile label="Playing" value={fmtInt(summary.playing)} detail={isYearView ? year : "Current"} onClick={() => onBacklog({ group: "playing", insightsYear: isYearView ? year : undefined })} />
      <InsightTile label="Rated games" value={fmtInt(ratingSummary.rated)} detail={ratingSummary.averageScore != null ? `Average ${ratingSummary.averageScore}/10` : "No ratings"} onClick={() => onBacklog({ rated: "true", insightsYear: isYearView ? year : undefined })} />
      <InsightTile label="Missing estimates" value={fmtInt(summary.missingEstimates)} detail={`${fmtInt(summary.estimatedGames)} of ${fmtInt(summary.games)} covered`} onClick={() => onBacklog({ missing: "estimates", insightsYear: isYearView ? year : undefined })} />
    </section>
    <section className="grid gap-6 xl:grid-cols-2">
      <Panel title={year === "all" ? "Started and finished over time" : `Started and finished in ${year}`}>
        <DateTimelineChart data={dateData} axisTick={axisTick} gridStroke={gridStroke} tooltipColors={tooltipColors} onBarClick={(dateType, value) => onBacklog({ dateType, year: value })} />
      </Panel>
      <HoursByStatusChart title={isYearView ? `Status of ${year} games` : "Current library status"} valueLabel="games" data={statusData} isSmall={isSmall} isPhone={isPhone} axisTick={axisTick} gridStroke={gridStroke} tooltipColors={tooltipColors} colorAt={colorAt} onBarClick={(group) => onBacklog({ group, insightsYear: isYearView ? year : undefined })} />
    </section>
    <section className="grid gap-6 xl:grid-cols-2">
      <GenresChart data={genreData} accessor={genreMetric === "hours" ? "hoursRounded" : "count"} emptyMessage={genreStatus === "all" ? (isYearView ? "No games were started or finished in this year yet." : "No games have dates yet.") : `No ${genreStatus} games match this view.`} isSmall={isSmall} axisTick={axisTick} gridStroke={gridStroke} tooltipColors={tooltipColors} colorAt={colorAt} groupKeys={groupKeys} genreType={genreType} onGenreTypeChange={setGenreType} genreMetric={genreMetric} onGenreMetricChange={setGenreMetric} genreStatus={genreStatus} onGenreStatusChange={setGenreStatus} onBarClick={({ key }) => onBacklog({ genreType, genre: key, group: genreStatus === "all" ? undefined : genreStatus, insightsYear: isYearView ? year : undefined })} />
      <ScoreDistribution scores={focused.scores} averageScore={focused.averageScore} rated={focused.rated} onScoreClick={(score) => onBacklog({ score, insightsYear: isYearView ? year : undefined })} axisTick={axisTick} gridStroke={gridStroke} tooltipColors={tooltipColors} />
    </section>
  </div></AppPage>;
}
