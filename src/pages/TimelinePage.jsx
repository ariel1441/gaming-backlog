import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  PlayCircle,
  Search,
  X,
} from "lucide-react";
import GameModal from "../components/GameModal";
import {
  AppPage,
  PageHeader,
  PageLoading,
  PageToolbar,
} from "../components/layout";
import {
  Button,
  EmptyState,
  SelectMenu,
  StatusBadge,
  TextInput,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGames } from "../hooks/useGames";
import {
  buildTimelineEvents,
  filterTimelineEvents,
  formatTimelineDay,
  formatTimelineGroupSummary,
  groupTimelineEvents,
  summarizeTimeline,
} from "../utils/gameTimeline";
import {
  BackdropEvent,
  PosterEvent,
  TimelineFilters,
  TimelineGroup,
  TimelineHeader,
  TimelineSkeleton,
  timelineViews,
} from "./Timeline/TimelineView";

const VIEW_MODE_KEY = "timeline_view_mode";

export default function TimelinePage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { games, loading, error, refresh } = useGames();
  const navigate = useNavigate();
  const [selectedGame, setSelectedGame] = useState(null);
  const [eventFilter, setEventFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      return timelineViews[saved] ? saved : "backdrop";
    } catch {
      return "backdrop";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {}
  }, [viewMode]);

  const events = useMemo(() => buildTimelineEvents(games), [games]);
  const summary = useMemo(
    () => summarizeTimeline(games, events),
    [games, events],
  );
  const years = useMemo(
    () => [...new Set(events.map((event) => event.year))].sort((a, b) => b - a),
    [events],
  );
  const hasActiveFilters =
    eventFilter !== "all" ||
    yearFilter !== "all" ||
    datePreset !== "all" ||
    search.trim() !== "";
  const clearFilters = () => {
    setEventFilter("all");
    setYearFilter("all");
    setDatePreset("all");
    setSearch("");
  };
  const visibleEvents = useMemo(
    () =>
      filterTimelineEvents(events, {
        eventType: eventFilter,
        year: yearFilter,
        datePreset,
        search,
      }),
    [datePreset, eventFilter, events, search, yearFilter],
  );
  const filteredSummary = useMemo(() => {
    const started = visibleEvents.filter(
      (event) => event.type === "started",
    ).length;
    const finished = visibleEvents.filter(
      (event) => event.type === "finished",
    ).length;
    const activeGameIds = new Set(
      visibleEvents
        .filter((event) =>
          String(event.game?.status || "")
            .toLowerCase()
            .includes("playing"),
        )
        .map((event) => event.game?.id)
        .filter(Boolean),
    );
    return {
      total: visibleEvents.length,
      started,
      finished,
      active: activeGameIds.size,
    };
  }, [visibleEvents]);
  const groups = useMemo(
    () => groupTimelineEvents(visibleEvents),
    [visibleEvents],
  );

  if (authLoading || loading) return <TimelineSkeleton />;

  if (!isAuthenticated) {
    return (
      <AppPage width="wide">
        <PageHeader
          title="Timeline"
          description="Your gaming activity over time."
          icon={Clock3}
        />
        <div className="pt-8">
          <EmptyState
            icon={Clock3}
            title="Sign in to view your timeline."
            description="Your timeline is built from the started and finished dates saved on your games."
            action={
              <Button
                type="button"
                variant="primary"
                onClick={() => navigate("/")}
              >
                Back to backlog
              </Button>
            }
          />
        </div>
      </AppPage>
    );
  }

  if (error) {
    return (
      <AppPage width="wide">
        <PageHeader
          title="Timeline"
          description="Your gaming activity over time."
          icon={Clock3}
        />
        <div className="pt-8">
          <EmptyState
            icon={Clock3}
            title="Could not load your timeline."
            description={String(error?.message || error)}
            action={
              <Button type="button" variant="primary" onClick={() => refresh()}>
                Try again
              </Button>
            }
          />
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage width="wide">
      <div className="space-y-5">
        <TimelineHeader
          summary={filteredSummary}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />

        <TimelineFilters
          eventFilter={eventFilter}
          setEventFilter={setEventFilter}
          yearFilter={yearFilter}
          setYearFilter={setYearFilter}
          datePreset={datePreset}
          setDatePreset={setDatePreset}
          search={search}
          setSearch={setSearch}
          years={years}
          onClear={clearFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {groups.length ? (
          <div className="space-y-8">
            {groups.map((group) => (
              <TimelineGroup
                key={group.key}
                group={group}
                viewMode={viewMode}
                onOpen={setSelectedGame}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={
              timelineViews[viewMode]?.component === BackdropEvent
                ? Clock3
                : PlayCircle
            }
            title={
              events.length
                ? "No timeline events match those filters."
                : "No timeline events yet."
            }
            description={
              events.length
                ? "Try clearing search, event type, year, or date range filters."
                : "Add started or finished dates to games and they will appear here as your backlog history."
            }
            action={
              events.length ? (
                <Button
                  type="button"
                  variant="dangerGhost"
                  onClick={clearFilters}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Clear filters
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => navigate("/")}
                >
                  Back to backlog
                </Button>
              )
            }
          />
        )}
      </div>

      <GameModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        onGameRefresh={() => refresh({ silent: true })}
        readOnly
      />
    </AppPage>
  );
}
