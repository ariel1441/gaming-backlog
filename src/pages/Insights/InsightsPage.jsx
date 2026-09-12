import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Star } from "lucide-react";
import { fetchInsights } from "../../services/insightsService";
import { useAuth } from "../../contexts/AuthContext";
import { useStatusGroups } from "../../contexts/StatusGroupsContext";
import { AppPage, PageError, PageHeader, PageLoading } from "../../components/layout";
import { EmptyState, Panel, SelectMenu } from "../../components/ui";
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
      className={`rounded-2xl border border-surface-border bg-surface-card p-4 text-left ${onClick ? "transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-content-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-content-primary">{value}</p>
      {detail ? <p className="mt-1 text-xs text-content-muted">{detail}</p> : null}
    </Element>
  );
}

function ScoreDistribution({ scores = [], averageScore, rated, description }) {
  const lowestScore = scores.find((item) => item.count > 0)?.score;
  const visibleScores = scores.filter((item) => item.score >= Math.min(5, lowestScore ?? 5));
  const max = Math.max(1, ...visibleScores.map((item) => item.count));
  return (
    <Panel title="Your scores" description={description}>
      {!rated ? <EmptyChart icon={Star} message="Save ratings on games to see your score distribution." /> : <>
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <span className="text-3xl font-semibold">{averageScore ?? "—"}</span>
          <span className="text-sm text-content-muted">Average across {fmtInt(rated)} rated games</span>
        </div>
        <div className="flex h-36 items-end gap-1.5" aria-label="Score distribution in half-point increments">
          {visibleScores.map((item) => <div key={item.score} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="text-xs text-content-muted">{item.count || ""}</span>
            <div className="w-full rounded-t bg-primary/75" style={{ height: item.count ? `${Math.max(10, (item.count / max) * 88)}px` : 0 }} />
            <span className="text-xs text-content-muted">{item.score}</span>
          </div>)}
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
  const filteredGames = useMemo(() => (data?.games || []).filter((game) => {
    const inYear = year === "all" || String(game.startedAt || "").startsWith(`${year}-`) || String(game.finishedAt || "").startsWith(`${year}-`);
    return inYear && (genreStatus === "all" || statusGroupOf(game.status) === genreStatus);
  }), [data, genreStatus, statusGroupOf, year]);
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
    (data?.byStatus || []).forEach((item) => {
      const group = statusGroupOf(item.status);
      const current = groups.get(group) || { name: group, display: group === "other" ? "Other" : `${group[0].toUpperCase()}${group.slice(1)}`, value: 0, count: 0 };
      current.value += item.count; current.count += item.count; groups.set(group, current);
    });
    return ["planned", "playing", "returning", "done", "other"].map((group) => groups.get(group)).filter(Boolean);
  }, [data, statusGroupOf]);
  const onBacklog = useCallback((params) => nav(`${BACKLOG_ROUTE}${toQP(params)}`), [nav]);

  if (!isAuthenticated && !loading) return <AppPage><EmptyState icon={BarChart3} title="Sign in to view Insights" description="Insights is a private view of your backlog, dates, genres, and scores." /></AppPage>;
  if (loading || !ready) return <AppPage width="full"><PageLoading rows={6} /></AppPage>;
  if (error) return <AppPage width="full"><PageError title="Could not load insights" description={error} onRetry={load} /></AppPage>;
  const totals = data?.totals || {}; const focused = data?.focused || {};
  return <AppPage width="full"><div className="space-y-6">
    <PageHeader title="Insights" description="A private view of your backlog, progress, and the data behind it." meta={user?.display_name || user?.username || "You"}
      actions={years.length > 1 ? <SelectMenu value={year} onChange={setYear} options={[{ value: "all", label: "All years" }, ...years.map((item) => ({ value: String(item), label: String(item) }))]} aria-label="Select insights year" className="w-36" buttonClassName="min-h-9 py-1.5 text-sm" /> : null} />
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <InsightTile label="Library games" value={fmtInt(totals.games)} />
      <InsightTile label="Wishlist" value={fmtInt(totals.wishlist)} onClick={() => nav("/wishlist")} />
      <InsightTile label="Finished" value={fmtInt(totals.finished)} onClick={() => onBacklog({ group: "done" })} />
      <InsightTile label="Playing" value={fmtInt(totals.playing)} onClick={() => onBacklog({ group: "playing" })} />
      <InsightTile label={year === "all" ? "Rated games" : `Rated in ${year}`} value={fmtInt(focused.rated)} detail={focused.averageScore != null ? `Average ${focused.averageScore}/10` : "Add ratings to see an average"} />
      <InsightTile label="Missing estimates" value={fmtInt(totals.missingEstimates)} detail={`${fmtInt(totals.estimatedGames)} of ${fmtInt(totals.games)} covered`} onClick={() => onBacklog({ missing: "estimates" })} />
    </section>
    <section className="grid gap-6 xl:grid-cols-2"><Panel title={year === "all" ? "Started and finished over time" : `${year} progress`} description={year === "all" ? "Intentional dates saved on your games." : `Dates you saved on games in ${year}.`}><DateTimelineChart data={dateData} axisTick={axisTick} gridStroke={gridStroke} tooltipColors={tooltipColors} onBarClick={(dateType, value) => onBacklog({ dateType, year: value })} /></Panel><HoursByStatusChart title="Current library status" valueLabel="games" data={statusData} isSmall={isSmall} isPhone={isPhone} axisTick={axisTick} gridStroke={gridStroke} tooltipColors={tooltipColors} colorAt={colorAt} onBarClick={(group) => onBacklog({ group })} /></section>
    <section className="grid gap-6 xl:grid-cols-2"><GenresChart data={genreData} accessor={genreMetric === "hours" ? "hoursRounded" : "count"} scopeDescription={year === "all" ? "Across your library." : `Games started or finished in ${year}.`} isSmall={isSmall} axisTick={axisTick} gridStroke={gridStroke} tooltipColors={tooltipColors} colorAt={colorAt} groupKeys={groupKeys} genreType={genreType} onGenreTypeChange={setGenreType} genreMetric={genreMetric} onGenreMetricChange={setGenreMetric} genreStatus={genreStatus} onGenreStatusChange={setGenreStatus} onBarClick={({ key }) => key !== "Other" && key !== "Unclassified" && onBacklog({ genreType, genre: key, group: genreStatus === "all" ? undefined : genreStatus })} /><ScoreDistribution scores={focused.scores} averageScore={focused.averageScore} rated={focused.rated} description={year === "all" ? "Ratings you have personally saved." : `Ratings saved on games in ${year}.`} /></section>
  </div></AppPage>;
}
