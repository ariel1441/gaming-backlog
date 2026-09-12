import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { AppPage, PageError, PageLoading } from "../components/layout";
import { EmptyState } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { listSteamPlayHistory } from "../services/activityService";

const emptyHistory = {
  days: [],
  summary: {},
  loading: true,
  error: "",
  timezone: "Asia/Jerusalem",
};

export default function ActivityPage() {
  const { isAuthenticated, isGuest } = useAuth();
  const enabled = isAuthenticated && !isGuest;
  const [history, setHistory] = useState(emptyHistory);
  const loadHistory = useCallback(async () => {
    if (!enabled) return;
    setHistory((value) => ({ ...value, loading: true, error: "" }));
    try {
      const payload = await listSteamPlayHistory({ days: 35 });
      setHistory({ ...payload, loading: false, error: "" });
    } catch (error) {
      setHistory((value) => ({
        ...value,
        loading: false,
        error: error.message || "Could not load play history.",
      }));
    }
  }, [enabled]);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (!enabled)
    return (
      <AppPage>
        <EmptyState
          icon={CalendarDays}
          title="Gaming activity is private"
          description="Sign in with a saved account to see Steam play history."
        />
      </AppPage>
    );

  return (
    <AppPage width="wide">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Gaming activity</h1>
        <p className="mt-1 text-sm text-content-muted">
          Your private Steam play history. Playtime is measured between successful checks.
        </p>
      </div>
      <PlayHistory history={history} onRetry={loadHistory} />
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
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatInterval(start, end) {
  if (!start || !end) return null;
  const format = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${format.format(new Date(start))} – ${format.format(new Date(end))}`;
}

function PlayHistory({ history, onRetry }) {
  if (history.loading) return <PageLoading rows={3} />;
  if (history.error)
    return <PageError title="Could not load play history" description={history.error} onRetry={onRetry} />;
  if (!history.days?.length)
    return (
      <EmptyState
        icon={CalendarDays}
        title="Play history starts with your next sync"
        description="The first successful Steam library check saves a private baseline. Later checks show the time and achievement changes since that baseline."
      />
    );
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <HistoryStat label="Played" value={formatMinutes(history.summary?.playtimeMinutes)} />
        <HistoryStat label="Active days" value={history.summary?.activeDays || 0} />
        <HistoryStat label="Achievements" value={`+${history.summary?.achievementsUnlocked || 0}`} />
      </div>
      {history.days.map((day) => (
        <section key={day.date} className="rounded-xl border border-surface-border bg-surface-card p-4 shadow-panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{formatDay(day.date)}</h2>
            <p className="text-sm text-content-secondary">
              {formatMinutes(day.playtimeMinutes)}
              {day.achievementsUnlocked ? ` · +${day.achievementsUnlocked} achievements` : ""}
            </p>
          </div>
          {day.hasGap ? (
            <p className="mt-1 text-xs text-warning">
              This activity spans a missed check; it is not split into invented daily totals.
            </p>
          ) : null}
          <div className="mt-3 space-y-2">
            {day.games.map((game) => (
              <div key={game.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-elevated/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{game.name}</p>
                  <p className="text-xs text-content-muted">
                    {game.isBacklogGame ? "Backlog game" : "Steam game · not in Backlog"}
                    {game.hasGap ? ` · ${formatInterval(game.intervalStartedAt, game.observedAt)}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm text-content-secondary">
                  {game.playtimeMinutes ? <p>{formatMinutes(game.playtimeMinutes)}</p> : null}
                  {game.achievementsUnlocked ? <p>+{game.achievementsUnlocked} achievements</p> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function HistoryStat({ label, value }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card px-4 py-3">
      <p className="text-xs text-content-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
