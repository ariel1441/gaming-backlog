import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity as ActivityIcon, BarChart3, CalendarClock, CalendarDays, CheckCircle2, Clock3,
  Gamepad2, Library, RotateCcw, Sparkles, Trophy,
} from "lucide-react";
import { AppPage, ListLoadingSkeleton, PageError, PageHeader, PageLoading } from "../components/layout";
import {
  Badge, Button, EmptyState, GameCover, MetricCard, Modal, SegmentedControl,
  TextInput, useConfirm, useToast,
} from "../components/ui";
import GameArtworkRow from "../components/GameArtworkRow";
import GameModal from "../components/GameModal";
import { useAuth } from "../contexts/AuthContext";
import { useGames } from "../hooks/useGames";
import {
  getSteamActivityInsights, listSteamPlayHistory, resetSteamActivityAllocation,
  saveSteamActivityAllocation,
} from "../services/activityService";
import { formatActivityDay, formatDisplayDate, formatMonthDay } from "../utils/dateFormat";

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
  const { games, refresh } = useGames();
  const enabled = !authLoading && isAuthenticated && !isGuest;
  const [view, setView] = useState("activity");
  const [range, setRange] = useState("7d");
  const [insightRange, setInsightRange] = useState("week");
  const [history, setHistory] = useState(emptyHistory);
  const [insights, setInsights] = useState(emptyHistory);
  const [selectedGame, setSelectedGame] = useState(null);
  const [allocationTarget, setAllocationTarget] = useState(null);
  const toast = useToast();
  const gamesById = useMemo(
    () => new Map(games.map((game) => [String(game.id), game])),
    [games],
  );
  const canOpenGame = useCallback(
    (game) => game?.gameId != null && gamesById.has(String(game.gameId)),
    [gamesById],
  );
  const openGame = useCallback((game) => {
    const details = game?.gameId == null ? null : gamesById.get(String(game.gameId));
    if (details) setSelectedGame(details);
  }, [gamesById]);
  const chooseDates = useCallback((game, source) => {
    setAllocationTarget({ ...source, gameName: game.name });
  }, []);

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
      <div className="mb-5">
        <PageHeader
          title="Gaming activity"
          description="Cumulative Steam observations grouped into activity days ending at 5 AM in Jerusalem, not exact session boundaries."
          icon={ActivityIcon}
        />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
      </div>
      {view === "activity"
        ? (
          <ActivityFeed
            history={history}
            onRetry={() => loadHistory()}
            onOpenGame={openGame}
            canOpenGame={canOpenGame}
            onChooseDates={chooseDates}
          />
        )
        : (
          <ActivityInsights
            insights={insights}
            onRetry={() => loadInsights()}
            onOpenGame={openGame}
            canOpenGame={canOpenGame}
          />
        )}
      <GameModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        onGameRefresh={() => refresh({ silent: true })}
        readOnly
      />
      <ActivityAllocationModal
        target={allocationTarget}
        onClose={() => setAllocationTarget(null)}
        onSaved={async (message) => {
          setAllocationTarget(null);
          await loadHistory();
          toast.success(message);
        }}
      />
    </AppPage>
  );
}

function formatMinutes(value) {
  const minutes = Math.max(0, Number(value) || 0);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ""}` : `${remainder}m`;
}

function formatDay(value) {
  return formatActivityDay(value);
}

function formatShortDay(value) {
  return formatMonthDay(value, { dateOnly: true });
}

function formatFreshness(value) {
  return formatDisplayDate(value, { month: "short", day: "numeric", year: undefined });
}

function ActivityFeed({ history, onRetry, onOpenGame, canOpenGame, onChooseDates }) {
  if (history.loading) return <ListLoadingSkeleton rows={4} label="Loading gaming activity" />;
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
          ? <UncertainCard key={item.key} item={item} onOpenGame={onOpenGame} canOpenGame={canOpenGame} onChooseDates={onChooseDates} />
          : <DayCard key={item.key} item={item} onOpenGame={onOpenGame} canOpenGame={canOpenGame} onChooseDates={onChooseDates} />
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
        {summary.overlappingPlaytimeMinutes ? (
          <span className="text-state-warning">Some activity has uncertain timing.</span>
        ) : null}
        {freshness ? <span>Activity checked through {freshness}.</span> : null}
      </div>
    </section>
  );
}

function SummaryStat({ icon: Icon, label, value }) {
  return <MetricCard icon={Icon} label={label} value={value} />;
}

function ActivityInsights({ insights, onRetry, onOpenGame, canOpenGame }) {
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
          <SummaryStat icon={CalendarDays} label="Active days" value={summary.activeDays ?? summary.preciseActiveDays ?? 0} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
          {summary.uncertainPlaytimeMinutes ? (
            <span className="text-state-warning">
              {formatMinutes(summary.uncertainPlaytimeMinutes)} has uncertain timing.
            </span>
          ) : null}
          {summary.allocatedPlaytimeMinutes ? (
            <span>{formatMinutes(summary.allocatedPlaytimeMinutes)} assigned to dates by you.</span>
          ) : null}
          {(summary.activeDailyAverageMinutes ?? summary.preciseDailyAverageMinutes) != null ? (
            <span>{formatMinutes(summary.activeDailyAverageMinutes ?? summary.preciseDailyAverageMinutes)} average on active days.</span>
          ) : null}
        </div>
      </section>
      {summary.unallocatedPlaytimeMinutes ? <UnallocatedOverlap insights={insights} /> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
        <DailyActivityBars
          bars={insights.dailyBars || []}
          onOpenGame={onOpenGame}
          canOpenGame={canOpenGame}
        />
        <MostPlayed games={insights.mostPlayed || []} onOpenGame={onOpenGame} canOpenGame={canOpenGame} />
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
        {coverage.status === "not_started" ? <p className="mt-1 text-xs text-content-muted">Activity tracking has not started yet.</p> : null}
        {coverage.trailingMissingCloseouts ? <p className="mt-1 text-xs text-state-warning">The latest activity check is still pending.</p> : null}
      </div>
      <div className="text-xs text-content-muted sm:text-right">
        {freshness ? <p>Checked through {freshness}</p> : null}
      </div>
    </section>
  );
}

function UnallocatedOverlap({ insights }) {
  const overlap = insights.unallocatedOverlap || {};
  return (
    <section className="rounded-panel border border-state-warning/45 bg-state-warning/5 px-4 py-3 sm:px-5" aria-label="Unallocated overlapping activity">
      <h2 className="font-semibold text-content-primary">Outside this range</h2>
      <p className="mt-1 text-sm leading-6 text-content-secondary">
        {formatMinutes(overlap.playtimeMinutes)} spans the edge of this range, so it is not included in the totals above.
      </p>
    </section>
  );
}

function DailyActivityBars({ bars, onOpenGame, canOpenGame }) {
  const maximum = Math.max(1, ...bars.map((bar) => bar.playtimeMinutes || 0));
  const [selectedDay, setSelectedDay] = useState(null);
  const selected = bars.find((bar) => bar.day === selectedDay) || bars.at(-1) || null;
  return (
    <section className="min-w-0 rounded-panel border border-surface-border bg-surface-card p-4 shadow-panel sm:p-5">
      <div className="mb-4">
        <h2 className="font-semibold">Daily activity</h2>
        <p className="mt-1 text-xs text-content-muted">Choose a day to see what you played.</p>
      </div>
      {!bars.length ? (
        <p className="rounded-card bg-surface-elevated/45 px-3 py-4 text-sm text-content-muted">No precisely dated activity in this range.</p>
      ) : (
        <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {bars.map((bar) => (
            <button
              type="button"
              key={bar.day}
              className={`grid min-w-0 w-full grid-cols-[4.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition-colors sm:grid-cols-[6rem_minmax(0,1fr)_auto] ${selected?.day === bar.day ? "bg-surface-elevated/65" : "hover:bg-surface-elevated/40"}`}
              onMouseEnter={() => setSelectedDay(bar.day)}
              onFocus={() => setSelectedDay(bar.day)}
              onClick={() => setSelectedDay(bar.day)}
              aria-pressed={selected?.day === bar.day}
              aria-label={`${formatDay(bar.day)}: ${bar.playtimeMinutes ? formatMinutes(bar.playtimeMinutes) : "no playtime"}${bar.achievementsUnlocked ? `, ${bar.achievementsUnlocked} achievements` : ""}`}
            >
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
            </button>
          ))}
        </div>
      )}
      {selected ? (
        <div className="mt-4 border-t border-surface-border/70 pt-4" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-medium text-content-primary">{formatDay(selected.day)}</h3>
            <span className="text-sm font-semibold text-content-primary">
              {selected.playtimeMinutes ? formatMinutes(selected.playtimeMinutes) : "Achievements only"}
            </span>
          </div>
          {selected.games?.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {selected.games.map((game) => {
                const openable = canOpenGame?.(game);
                return (
                  <button
                    type="button"
                    key={game.steamAppId}
                    disabled={!openable}
                    onClick={() => openable && onOpenGame?.(game)}
                    className={`flex min-w-0 items-center gap-3 rounded-card border border-surface-border bg-surface-elevated/40 p-2 text-left ${openable ? "transition-colors hover:border-primary/40 hover:bg-surface-elevated/70" : "cursor-default"}`}
                    aria-label={openable ? `Open details for ${game.name}` : undefined}
                  >
                    <GameCover src={game.cover} name={game.name} alt={`${game.name} cover`} variant="poster" className="h-12 w-9 shrink-0 rounded-md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-content-primary">{game.name}</span>
                      <span className="block text-xs text-content-muted">
                        {game.playtimeMinutes ? formatMinutes(game.playtimeMinutes) : "No playtime"}
                        {game.achievementsUnlocked ? ` · ${game.achievementsUnlocked} achievement${game.achievementsUnlocked === 1 ? "" : "s"}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MostPlayed({ games, onOpenGame, canOpenGame }) {
  return (
    <section className="rounded-panel border border-surface-border bg-surface-card p-4 shadow-panel sm:p-5">
      <h2 className="font-semibold">Most played</h2>
      {!games.length ? <p className="mt-4 text-sm text-content-muted">No observed playtime in this range.</p> : (
        <ol className="mt-4 space-y-2">
          {games.map((game, index) => {
            const openable = canOpenGame?.(game);
            return (
            <li key={game.steamAppId}>
              <button
                type="button"
                disabled={!openable}
                onClick={() => openable && onOpenGame?.(game)}
                className={`group flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-card border border-surface-border bg-surface-elevated/35 p-2 text-left ${openable ? "transition-all hover:border-primary/40 hover:bg-surface-elevated/65" : "cursor-default"}`}
                aria-label={openable ? `Open details for ${game.name}` : undefined}
              >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-bg/80 text-xs font-bold text-content-secondary">{index + 1}</span>
              <GameCover
                src={game.cover} name={game.name} alt={`${game.name} cover`} artwork
                className="h-14 w-24 shrink-0 rounded-lg border border-media-border/10 shadow-sm"
              />
              <span className="min-w-0 flex-1">
                <span className="block line-clamp-2 text-sm font-semibold text-content-primary">{game.name}</span>
                <span className="mt-1 block text-sm font-medium text-content-secondary">
                  {formatMinutes(game.playtimeMinutes)}
                </span>
                {game.uncertainPlaytimeMinutes ? <span className="mt-0.5 block text-xs text-state-warning">Timing uncertain</span> : null}
              </span>
              </button>
            </li>
            );
          })}
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
          label="Newly played"
          value={String(firstPlays.length)}
          detail={firstPlays.length ? firstPlays.slice(0, 3).map((game) => game.name).join(", ") : "No new games"}
        />
        <RecapCard
          label="Returned to"
          value={String(returns.length)}
          detail={returns.length
            ? returns.slice(0, 3).map((game) => `${game.name} after ${game.daysSincePrevious} days`).join(", ")
            : "No returns yet"}
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

function DayCard({ item, onOpenGame, canOpenGame, onChooseDates }) {
  return (
    <section className="overflow-hidden rounded-panel border border-surface-border bg-surface-card shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface-bg/25 px-4 py-3.5 sm:px-5">
        <h2 className="text-lg font-semibold">{formatDay(item.date)}</h2>
        <PeriodTotal item={item} />
      </div>
      <GameRows games={item.games} onOpenGame={onOpenGame} canOpenGame={canOpenGame} onChooseDates={onChooseDates} />
    </section>
  );
}

function UncertainCard({ item, onOpenGame, canOpenGame, onChooseDates }) {
  return (
    <section className="overflow-hidden rounded-panel border border-state-warning/45 bg-surface-card shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-state-warning/30 bg-state-warning/5 px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-lg font-semibold">{formatShortDay(item.startDay)}–{formatShortDay(item.endDay)}</h2>
          <Badge variant="warning" className="px-2.5 py-1">Timing uncertain</Badge>
        </div>
        <PeriodTotal item={item} />
      </div>
      <GameRows games={item.games} onOpenGame={onOpenGame} canOpenGame={canOpenGame} onChooseDates={onChooseDates} />
    </section>
  );
}

function PeriodTotal({ item }) {
  return (
    <div className="flex shrink-0 items-baseline gap-2 text-right">
      <span className="text-lg font-semibold text-content-primary">
        {formatMinutes(item.playtimeMinutes)} played
      </span>
      <span className="text-xs text-content-muted">
        {item.gameCount} game{item.gameCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function GameRows({ games, onOpenGame, canOpenGame, onChooseDates }) {
  return (
    <div className="divide-y divide-surface-border">
      {games.map((game) => (
        <GameRow
          key={game.steamAppId}
          game={game}
          onOpenGame={onOpenGame}
          canOpen={canOpenGame(game)}
          showPlaytime={games.length > 1}
          onChooseDates={onChooseDates}
        />
      ))}
    </div>
  );
}

function GameRow({ game, onOpenGame, canOpen, showPlaytime, onChooseDates }) {
  return (
    <GameArtworkRow
      cover={game.cover}
      name={game.name}
      embedded
      onClick={canOpen ? () => onOpenGame(game) : undefined}
    >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h3 className={`min-w-0 break-words text-lg font-semibold leading-6 text-content-primary ${canOpen ? "transition-colors group-hover:text-primary-light" : ""}`}>
            {game.name}
          </h3>
          {showPlaytime && game.playtimeMinutes ? (
            <Badge className="shrink-0 px-2.5 py-1 text-sm text-content-primary">
              <Clock3 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {formatMinutes(game.playtimeMinutes)}
            </Badge>
          ) : null}
        </div>
        {game.highlights?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {game.highlights.map((highlight) => <Highlight key={highlight.type} highlight={highlight} />)}
          </div>
        ) : null}
        {game.allocatedPlaytimeMinutes ? (
          <p className="mt-2 text-xs text-primary-light">Dates chosen by you</p>
        ) : null}
        {game.achievements?.length ? <Achievements achievements={game.achievements} interactiveRow={canOpen} /> : null}
        {game.allocationSources?.length ? (
          <div className="relative z-20 mt-3 flex flex-wrap gap-2">
            {game.allocationSources.map((source) => (
              <Button
                key={source.observationId}
                size="sm"
                variant="soft"
                onClick={(event) => {
                  event.stopPropagation();
                  onChooseDates?.(game, source);
                }}
              >
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                {source.allocations?.length ? "Edit dates" : "Choose dates"}
              </Button>
            ))}
          </div>
        ) : null}
    </GameArtworkRow>
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

function Achievements({ achievements, interactiveRow = false }) {
  const preview = achievements.slice(0, 3);
  const rest = achievements.slice(3);
  return (
    <div className="mt-2 text-xs leading-5 text-content-muted">
      <div className="flex items-start gap-1.5">
        <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-warning" aria-hidden="true" />
        <span>{achievements.length === 1 ? "Achievement" : `${achievements.length} achievements`}: {preview.map((item) => item.name).join(", ")}</span>
      </div>
      {rest.length ? (
        <details className={`ml-5 mt-1 ${interactiveRow ? "relative z-20" : ""}`}>
          <summary className="cursor-pointer text-content-secondary hover:text-content-primary">Show {rest.length} more</summary>
          <ul className="mt-1 list-disc pl-4">
            {rest.map((item) => <li key={item.id}>{item.name}</li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ActivityAllocationModal({ target, onClose, onSaved }) {
  const [minutesByDay, setMinutesByDay] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const confirm = useConfirm();

  useEffect(() => {
    if (!target) return;
    setMinutesByDay(Object.fromEntries(
      (target.eligibleDays || []).map((day) => [
        day,
        target.allocations?.find((item) => item.activityDay === day)?.minutes || 0,
      ]),
    ));
    setError("");
  }, [target]);

  if (!target) return null;
  const assigned = Object.values(minutesByDay).reduce(
    (sum, value) => sum + Math.max(0, Math.trunc(Number(value) || 0)),
    0,
  );
  const remaining = target.totalMinutes - assigned;
  const setDayMinutes = (day, value) => {
    const minutes = Math.max(0, Math.min(target.totalMinutes, Math.trunc(Number(value) || 0)));
    setMinutesByDay((current) => ({ ...current, [day]: minutes }));
    setError("");
  };
  const assignAll = (day) => {
    setMinutesByDay(Object.fromEntries((target.eligibleDays || []).map((value) => [
      value, value === day ? target.totalMinutes : 0,
    ])));
    setError("");
  };
  const save = async () => {
    if (remaining !== 0) return;
    setSaving(true);
    setError("");
    try {
      await saveSteamActivityAllocation(target.observationId, {
        expectedRevision: target.revision || 0,
        allocations: Object.entries(minutesByDay)
          .map(([activityDay, minutes]) => ({
            activityDay,
            minutes: Math.max(0, Math.trunc(Number(minutes) || 0)),
          }))
          .filter((item) => item.minutes > 0),
      });
      await onSaved?.("Activity dates saved.");
    } catch (saveError) {
      setError(saveError.message || "Could not save activity dates.");
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    const accepted = await confirm({
      title: "Reset chosen dates?",
      message: "The original uncertain Steam interval will be shown again.",
      confirmLabel: "Reset dates",
    });
    if (!accepted) return;
    setSaving(true);
    setError("");
    try {
      await resetSteamActivityAllocation(target.observationId, target.revision);
      await onSaved?.("Chosen dates reset.");
    } catch (resetError) {
      setError(resetError.message || "Could not reset activity dates.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Choose activity dates"
      description={`${target.gameName} has ${formatMinutes(target.totalMinutes)} of playtime between ${formatShortDay(target.startDay)} and ${formatShortDay(target.endDay)}.`}
      onClose={saving ? undefined : onClose}
      closeDisabled={saving}
      size="sm"
      footer={(
        <>
          {target.allocations?.length ? (
            <Button variant="dangerGhost" onClick={reset} disabled={saving}>Reset</Button>
          ) : null}
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving || remaining !== 0} aria-busy={saving}>
            {saving ? "Saving…" : "Save dates"}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className={`rounded-card border px-3 py-2 text-sm ${remaining === 0 ? "border-state-success/35 bg-state-success/5 text-state-success" : "border-surface-border bg-surface-elevated/35 text-content-secondary"}`}>
          {remaining > 0
            ? `${formatMinutes(remaining)} left to assign`
            : remaining < 0
              ? `${formatMinutes(Math.abs(remaining))} over the observed total`
              : "All playtime assigned"}
        </div>
        <div className="space-y-2">
          {(target.eligibleDays || []).map((day) => (
            <div key={day} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-2 rounded-card border border-surface-border bg-surface-elevated/30 p-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
              <label htmlFor={`allocation-${target.observationId}-${day}`} className="min-w-0 text-sm font-medium text-content-primary">
                {formatDay(day)}
              </label>
              <TextInput
                id={`allocation-${target.observationId}-${day}`}
                type="number"
                inputMode="numeric"
                min="0"
                max={target.totalMinutes}
                step="1"
                value={minutesByDay[day] || ""}
                onChange={(event) => setDayMinutes(day, event.target.value)}
                aria-label={`Minutes played on ${formatDay(day)}`}
              />
              <Button
                size="sm"
                onClick={() => assignAll(day)}
                disabled={saving}
                aria-label={`Assign all playtime to ${formatDay(day)}`}
              >
                All here
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs leading-5 text-content-muted">
          Steam’s original uncertain interval is kept. This only controls how its playtime appears in your activity and insights.
        </p>
        {error ? <p role="alert" className="text-sm text-state-error">{error}</p> : null}
      </div>
    </Modal>
  );
}
