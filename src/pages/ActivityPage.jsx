import { useCallback, useEffect, useState } from "react";
import {
  BarChart3, CalendarDays, CheckCircle2, Clock3, Gamepad2, Library, RotateCcw,
  Sparkles, Trophy,
} from "lucide-react";
import { AppPage, PageError, PageLoading } from "../components/layout";
import { Badge, EmptyState, GameCover, SegmentedControl } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { getSteamActivityInsights, listSteamPlayHistory } from "../services/activityService";

const ranges = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" },
];

const views = [
  { value: "activity", label: "Activity" },
  { value: "insights", label: "Insights" },
];

const insightRanges = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

const emptyHistory = { items: [], summary: {}, coverage: {}, loading: true, error: "" };

export default function ActivityPage() {
  const { isAuthenticated, isGuest, loading: authLoading } = useAuth();
  const enabled = !authLoading && isAuthenticated && !isGuest;
  const [view, setView] = useState("activity");
  const [range, setRange] = useState("7d");
  const [insightRange, setInsightRange] = useState("week");
  const [history, setHistory] = useState(emptyHistory);
  const [insights, setInsights] = useState(emptyHistory);

  const loadHistory = useCallback(async (signal) => {
    if (!enabled) return;
    setHistory((value) => ({ ...value, loading: true, error: "" }));
    try {
      const payload = await listSteamPlayHistory({ range }, signal ? { signal } : {});
      setHistory({ ...payload, loading: false, error: "" });
    } catch (error) {
      if (error?.name === "AbortError") return;
      setHistory((value) => ({
        ...value, loading: false, error: error.message || "Could not load gaming activity.",
      }));
    }
  }, [enabled, range]);

  const loadInsights = useCallback(async (signal) => {
    if (!enabled || view !== "insights") return;
    setInsights((value) => ({ ...value, loading: true, error: "" }));
    try {
      const payload = await getSteamActivityInsights(
        { range: insightRange }, signal ? { signal } : {},
      );
      setInsights({ ...payload, loading: false, error: "" });
    } catch (error) {
      if (error?.name === "AbortError") return;
      setInsights((value) => ({
        ...value, loading: false, error: error.message || "Could not load activity insights.",
      }));
    }
  }, [enabled, insightRange, view]);

  useEffect(() => {
    const controller = new AbortController();
    void loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory]);

  useEffect(() => {
    const controller = new AbortController();
    void loadInsights(controller.signal);
    return () => controller.abort();
  }, [loadInsights]);

  if (authLoading) {
    return <AppPage><PageLoading rows={5} /></AppPage>;
  }

  if (!enabled) {
    return (
      <AppPage>
        <EmptyState
          icon={CalendarDays}
          title="Gaming activity is private"
          description="Sign in with a saved account to see Steam activity. Demo sessions do not collect or display it."
        />
      </AppPage>
    );
  }

  return (
    <AppPage width="wide">
      <header className="mb-5 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Gaming activity</h1>
          <p className="mt-1 max-w-2xl text-sm text-content-muted">
            Cumulative Steam observations grouped into activity days ending at 5 AM in Jerusalem, not exact session boundaries.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            value={view}
            onChange={setView}
            options={views}
            ariaLabel="Gaming activity view"
            className="w-full sm:w-fit"
            itemClassName="flex-1 sm:flex-none"
          />
          {view === "activity" ? (
            <SegmentedControl
              value={range}
              onChange={setRange}
              options={ranges}
              ariaLabel="Activity range"
              disabled={history.loading}
              className="w-full sm:w-fit"
              itemClassName="flex-1 sm:flex-none"
            />
          ) : (
            <SegmentedControl
              value={insightRange}
              onChange={setInsightRange}
              options={insightRanges}
              ariaLabel="Insights range"
              disabled={insights.loading}
              className="w-full sm:w-fit"
              itemClassName="min-w-0 flex-1 px-2 sm:flex-none sm:px-3"
            />
          )}
        </div>
      </header>
      {view === "activity"
        ? <ActivityFeed history={history} onRetry={() => loadHistory()} />
        : <ActivityInsights insights={insights} onRetry={() => loadInsights()} />}
    </AppPage>
  );
}

function formatMinutes(value) {
  const minutes = Math.max(0, Number(value) || 0);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ""}` : `${remainder}m`;
}

function dateValue(value) {
  return new Date(`${value}T12:00:00`);
}

function formatDay(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "short", day: "numeric",
  }).format(dateValue(value));
}

function formatShortDay(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(dateValue(value));
}

function formatFreshness(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function ActivityFeed({ history, onRetry }) {
  if (history.loading) return <PageLoading rows={5} />;
  if (history.error) {
    return <PageError title="Could not load gaming activity" description={history.error} onRetry={onRetry} />;
  }
  return (
    <div className="space-y-5">
      <Summary history={history} />
      {!history.items?.length ? (
        <EmptyState
          icon={CalendarDays}
          title="No activity in this range"
          description={history.coverage?.status === "not_started"
            ? "The first successful Steam library check saves a private baseline. Activity appears after a later check finds a change."
            : "Try a wider range, or check back after the next successful Steam library sync."}
        />
      ) : history.items.map((item) => (
        item.type === "uncertain"
          ? <UncertainCard key={item.key} item={item} />
          : <DayCard key={item.key} item={item} />
      ))}
    </div>
  );
}

function Summary({ history }) {
  const summary = history.summary || {};
  const coverage = history.coverage || {};
  const freshness = formatFreshness(coverage.latestSnapshotAt);
  const coverageValue = coverage.status === "not_started" ? "Not started"
    : coverage.status === "complete" ? `${coverage.reliableDays} reliable day${coverage.reliableDays === 1 ? "" : "s"}`
      : `${coverage.reliableDays} of ${coverage.expectedCloseouts} reliable`;
  return (
    <section aria-label="Activity summary" className="rounded-panel border border-surface-border bg-surface-card/90 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryStat icon={Clock3} label="Observed playtime" value={formatMinutes(summary.playtimeMinutes)} />
        <SummaryStat icon={Gamepad2} label="Games played" value={summary.gamesPlayed || 0} />
        <SummaryStat icon={Trophy} label="Achievements" value={summary.achievementsUnlocked || 0} />
        <SummaryStat icon={CheckCircle2} label="Coverage" value={coverageValue} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
        {coverage.trailingMissingCloseouts ? (
          <span className="text-state-warning">
            {coverage.trailingMissingCloseouts} expected closeout{coverage.trailingMissingCloseouts === 1 ? " is" : "s are"} still missing; missing checks are not treated as zero play.
          </span>
        ) : null}
        {coverage.uncertainIntervals ? (
          <span className="text-state-warning">{coverage.uncertainIntervals} uncertain interval{coverage.uncertainIntervals === 1 ? "" : "s"}</span>
        ) : null}
        {summary.overlappingPlaytimeMinutes ? (
          <span>{formatMinutes(summary.overlappingPlaytimeMinutes)} overlaps this range and is shown separately.</span>
        ) : null}
        {freshness ? <span>Activity checked through {freshness}.</span> : null}
      </div>
    </section>
  );
}

function SummaryStat({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0 rounded-card border border-surface-border bg-surface-elevated/45 p-3">
      <div className="flex items-center gap-2 text-xs text-content-muted">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="mt-2 break-words text-lg font-semibold text-content-primary sm:text-xl">{value}</p>
    </div>
  );
}

function ActivityInsights({ insights, onRetry }) {
  if (insights.loading) return <PageLoading rows={5} />;
  if (insights.error) {
    return <PageError title="Could not load activity insights" description={insights.error} onRetry={onRetry} />;
  }
  const summary = insights.summary || {};
  const hasActivity = summary.playtimeMinutes || summary.achievementsUnlocked ||
    insights.firstObservedPlays?.length || insights.reliableReturns?.length;
  if (!hasActivity) {
    return (
      <div className="space-y-5">
        <InsightsContext insights={insights} />
        <EmptyState
          icon={BarChart3}
          title="No insights in this range"
          description={insights.coverage?.status === "not_started"
            ? "Insights begin after a baseline and a later successful Steam check records activity."
            : "Try a wider range, or check back after the next successful Steam library sync."}
        />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <InsightsContext insights={insights} />
      <section aria-label="Insights summary" className="rounded-panel border border-surface-border bg-surface-card/90 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryStat icon={Clock3} label="Observed playtime" value={formatMinutes(summary.playtimeMinutes)} />
          <SummaryStat icon={Gamepad2} label="Games played" value={summary.gamesPlayed || 0} />
          <SummaryStat icon={Trophy} label="Achievements" value={summary.achievementsUnlocked || 0} />
          <SummaryStat icon={CalendarDays} label="Precise active days" value={summary.preciseActiveDays || 0} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
          {summary.uncertainPlaytimeMinutes ? (
            <span className="text-state-warning">
              Includes {formatMinutes(summary.uncertainPlaytimeMinutes)} from contained uncertain intervals.
            </span>
          ) : null}
          {summary.preciseDailyAverageMinutes != null ? (
            <span>{formatMinutes(summary.preciseDailyAverageMinutes)} per precise active day; uncertain playtime is excluded.</span>
          ) : null}
        </div>
      </section>
      {summary.unallocatedPlaytimeMinutes ? <UnallocatedOverlap insights={insights} /> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
        <DailyActivityBars bars={insights.dailyBars || []} />
        <MostPlayed games={insights.mostPlayed || []} />
      </div>
      <RecapHighlights insights={insights} />
    </div>
  );
}

function InsightsContext({ insights }) {
  const period = insights.period || {};
  const coverage = insights.coverage || {};
  const freshness = formatFreshness(coverage.latestSnapshotAt);
  return (
    <section className="flex flex-col gap-2 rounded-panel border border-surface-border bg-surface-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-content-primary">{period.label || "Activity insights"}</h2>
          {period.isIncomplete ? <Badge variant="warning">In progress</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-content-muted">
          {coverage.status === "not_started"
            ? "Reliable coverage has not started."
            : `${coverage.reliableDays || 0} reliable activity day${coverage.reliableDays === 1 ? "" : "s"}${coverage.uncertainIntervals ? ` and ${coverage.uncertainIntervals} uncertain interval${coverage.uncertainIntervals === 1 ? "" : "s"}` : ""}${coverage.trailingMissingCloseouts ? `; ${coverage.trailingMissingCloseouts} expected closeout${coverage.trailingMissingCloseouts === 1 ? " is" : "s are"} still missing and not treated as zero play` : ""}.`}
        </p>
      </div>
      <div className="text-xs text-content-muted sm:text-right">
        {freshness ? <p>Checked through {freshness}</p> : null}
        {!coverage.patternClaimsAvailable && coverage.status !== "not_started" ? (
          <p>No trend, streak, or weekday claims with current coverage.</p>
        ) : null}
      </div>
    </section>
  );
}

function UnallocatedOverlap({ insights }) {
  const overlap = insights.unallocatedOverlap || {};
  return (
    <section className="rounded-panel border border-state-warning/45 bg-state-warning/5 px-4 py-3 sm:px-5" aria-label="Unallocated overlapping activity">
      <h2 className="font-semibold text-content-primary">Unallocated overlap</h2>
      <p className="mt-1 text-sm leading-6 text-content-secondary">
        {formatMinutes(overlap.playtimeMinutes)} was observed across a missed-check interval that crosses this range boundary.
        It is kept separate from the period total, daily bars, averages, and active-day count.
      </p>
    </section>
  );
}

function DailyActivityBars({ bars }) {
  const maximum = Math.max(1, ...bars.map((bar) => bar.playtimeMinutes || 0));
  return (
    <section className="min-w-0 rounded-panel border border-surface-border bg-surface-card p-4 shadow-panel sm:p-5">
      <div className="mb-4">
        <h2 className="font-semibold">Daily activity</h2>
        <p className="mt-1 text-xs text-content-muted">Reliable playtime only; exact achievements stay on their provider-derived activity day.</p>
      </div>
      {!bars.length ? (
        <p className="rounded-card bg-surface-elevated/45 px-3 py-4 text-sm text-content-muted">No precisely dated activity in this range.</p>
      ) : (
        <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {bars.map((bar) => (
            <div key={bar.day} className="grid min-w-0 grid-cols-[4.75rem_minmax(0,1fr)_auto] items-center gap-2 text-xs sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
              <span className="truncate text-content-muted">{formatShortDay(bar.day)}</span>
              <div className="h-5 overflow-hidden rounded-full bg-surface-elevated" aria-hidden="true">
                <div
                  className="h-full min-w-0 rounded-full bg-primary/75"
                  style={{ width: bar.playtimeMinutes ? `${Math.max(3, (bar.playtimeMinutes / maximum) * 100)}%` : "0%" }}
                />
              </div>
              <span className="whitespace-nowrap text-right text-content-secondary">
                {bar.playtimeMinutes ? formatMinutes(bar.playtimeMinutes) : "No playtime"}
                {bar.achievementsUnlocked ? ` · ${bar.achievementsUnlocked} 🏆` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MostPlayed({ games }) {
  return (
    <section className="rounded-panel border border-surface-border bg-surface-card p-4 shadow-panel sm:p-5">
      <h2 className="font-semibold">Most played</h2>
      <p className="mt-1 text-xs text-content-muted">Includes contained uncertain intervals in each game total.</p>
      {!games.length ? <p className="mt-4 text-sm text-content-muted">No observed playtime in this range.</p> : (
        <ol className="mt-4 space-y-3">
          {games.map((game, index) => (
            <li key={game.steamAppId} className="flex min-w-0 items-center gap-3">
              <span className="w-5 shrink-0 text-center text-sm font-semibold text-content-muted">{index + 1}</span>
              <GameCover
                src={game.cover} name={game.name} alt={`${game.name} cover`} variant="poster"
                className="h-12 w-9 shrink-0 rounded-md border border-surface-border"
              />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-content-primary">{game.name}</p>
                <p className="text-xs text-content-muted">
                  {formatMinutes(game.playtimeMinutes)}
                  {game.uncertainPlaytimeMinutes ? ` · ${formatMinutes(game.uncertainPlaytimeMinutes)} uncertain` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RecapHighlights({ insights }) {
  const firstPlays = insights.firstObservedPlays || [];
  const returns = insights.reliableReturns || [];
  const top = insights.mostPlayed?.[0];
  const title = insights.range === "week" ? "Weekly recap" : "Recap highlights";
  return (
    <section className="rounded-panel border border-surface-border bg-surface-card p-4 shadow-panel sm:p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <RecapCard
          label="Top game"
          value={top ? top.name : "No observed playtime"}
          detail={top ? formatMinutes(top.playtimeMinutes) : null}
        />
        <RecapCard
          label="First observed plays"
          value={String(firstPlays.length)}
          detail={firstPlays.length ? firstPlays.slice(0, 3).map((game) => game.name).join(", ") : "No reliable first plays"}
        />
        <RecapCard
          label="Reliable returns"
          value={String(returns.length)}
          detail={returns.length
            ? returns.slice(0, 3).map((game) => `${game.name} after ${game.daysSincePrevious} days`).join(", ")
            : "No reliable returns"}
        />
      </div>
    </section>
  );
}

function RecapCard({ label, value, detail }) {
  return (
    <div className="min-w-0 rounded-card border border-surface-border bg-surface-elevated/45 p-3">
      <p className="text-xs text-content-muted">{label}</p>
      <p className="mt-1 break-words font-semibold text-content-primary">{value}</p>
      {detail ? <p className="mt-1 break-words text-xs leading-5 text-content-secondary">{detail}</p> : null}
    </div>
  );
}

function DayCard({ item }) {
  return (
    <section className="overflow-hidden rounded-panel border border-surface-border bg-surface-card shadow-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-surface-border bg-surface-bg/25 px-4 py-3 sm:px-5">
        <h2 className="font-semibold">{formatDay(item.date)}</h2>
        <p className="text-sm text-content-secondary">
          {formatMinutes(item.playtimeMinutes)} · {item.gameCount} game{item.gameCount === 1 ? "" : "s"}
        </p>
      </div>
      <GameRows games={item.games} />
    </section>
  );
}

function UncertainCard({ item }) {
  return (
    <section className="overflow-hidden rounded-panel border border-state-warning/45 bg-surface-card shadow-panel">
      <div className="border-b border-state-warning/30 bg-state-warning/5 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{formatShortDay(item.startDay)}–{formatShortDay(item.endDay)}</h2>
          <p className="text-sm text-content-secondary">
            {formatMinutes(item.playtimeMinutes)} observed · {item.gameCount} game{item.gameCount === 1 ? "" : "s"}
          </p>
        </div>
        <p className="mt-1 text-xs leading-5 text-state-warning">
          This interval spans missed checks, so its playtime was not divided into invented daily values.
        </p>
      </div>
      <GameRows games={item.games} />
    </section>
  );
}

function GameRows({ games }) {
  return (
    <div className="divide-y divide-surface-border">
      {games.map((game) => <GameRow key={game.steamAppId} game={game} />)}
    </div>
  );
}

function GameRow({ game }) {
  return (
    <div className="flex min-w-0 gap-3 px-4 py-3 sm:gap-4 sm:px-5">
      <GameCover
        src={game.cover}
        name={game.name}
        alt={`${game.name} cover`}
        variant="poster"
        className="h-16 w-12 shrink-0 rounded-lg border border-surface-border sm:h-20 sm:w-14"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h3 className="min-w-0 break-words text-sm font-medium leading-5 text-content-primary">{game.name}</h3>
          {game.playtimeMinutes ? (
            <span className="shrink-0 text-sm font-medium text-content-secondary">{formatMinutes(game.playtimeMinutes)}</span>
          ) : null}
        </div>
        {game.highlights?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {game.highlights.map((highlight) => <Highlight key={highlight.type} highlight={highlight} />)}
          </div>
        ) : null}
        {game.achievements?.length ? <Achievements achievements={game.achievements} /> : null}
      </div>
    </div>
  );
}

function Highlight({ highlight }) {
  const config = highlight.type === "first_played"
    ? { icon: Gamepad2, label: "First played", variant: "primary" }
    : highlight.type === "added_to_library"
      ? { icon: Library, label: "Added to Steam library", variant: "integration" }
      : { icon: RotateCcw, label: `Returned after ${highlight.daysSincePrevious} days`, variant: "success" };
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1.5 px-2 py-0.5">
      <Icon className="h-3 w-3" aria-hidden="true" />{config.label}
    </Badge>
  );
}

function Achievements({ achievements }) {
  const preview = achievements.slice(0, 3);
  const rest = achievements.slice(3);
  return (
    <div className="mt-2 text-xs leading-5 text-content-muted">
      <div className="flex items-start gap-1.5">
        <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-warning" aria-hidden="true" />
        <span>{achievements.length === 1 ? "Achievement" : `${achievements.length} achievements`}: {preview.map((item) => item.name).join(", ")}</span>
      </div>
      {rest.length ? (
        <details className="ml-5 mt-1">
          <summary className="cursor-pointer text-content-secondary hover:text-content-primary">Show {rest.length} more</summary>
          <ul className="mt-1 list-disc pl-4">
            {rest.map((item) => <li key={item.id}>{item.name}</li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
