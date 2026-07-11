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
import {
  AppPage,
  PageHeader,
  PageLoading,
  PageToolbar,
} from "../../components/layout";
import {
  Button,
  SegmentedControl,
  SelectMenu,
  StatusBadge,
  TextInput,
} from "../../components/ui";
import {
  formatTimelineDay,
  formatTimelineGroupSummary,
} from "../../utils/gameTimeline";
const eventCopy = {
  started: {
    label: "Started playing",
    shortLabel: "Started",
    icon: PlayCircle,
    badge: "warning",
    text: "text-state-warning",
    border: "border-state-warning/35",
    bg: "bg-state-warning/10",
    dot: "bg-state-warning",
    accent: "bg-state-warning",
  },
  finished: {
    label: "Finished",
    shortLabel: "Finished",
    icon: CheckCircle2,
    badge: "success",
    text: "text-state-success",
    border: "border-state-success/35",
    bg: "bg-state-success/10",
    dot: "bg-state-success",
    accent: "bg-state-success",
  },
};

const viewOptions = [
  { value: "backdrop", label: "Showcase" },
  { value: "poster", label: "Poster" },
];

export const timelineViews = {
  backdrop: {
    label: "Showcase",
    component: BackdropEvent,
  },
  poster: {
    label: "Poster",
    component: PosterEvent,
  },
};

const eventFilterOptions = [
  { value: "all", label: "All events" },
  { value: "started", label: "Started" },
  { value: "finished", label: "Finished" },
];

const datePresetOptions = [
  { value: "all", label: "All time" },
  { value: "thisYear", label: "This year" },
  { value: "lastYear", label: "Last year" },
  { value: "last90", label: "Last 90 days" },
];

function coverUrl(game) {
  return typeof game?.cover === "string" && game.cover.trim()
    ? game.cover
    : null;
}

function gameInitials(title = "") {
  const words = String(title || "Game")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function NoCoverBackdrop({ title }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-surface-card">
      <div className="absolute inset-0 media-placeholder-pattern opacity-20" />
      <div className="absolute -right-8 top-1/2 flex h-40 w-40 -translate-y-1/2 rotate-6 items-center justify-center rounded-2xl border border-surface-border bg-surface-elevated/35 text-5xl font-semibold text-content-muted/25 sm:h-56 sm:w-56 sm:text-7xl">
        {gameInitials(title)}
      </div>
    </div>
  );
}

function PosterMedia({ game }) {
  const src = coverUrl(game);

  return (
    <div className="relative h-48 w-full shrink-0 overflow-hidden rounded-2xl border border-surface-border bg-surface-elevated shadow-panel sm:h-64 sm:w-[22rem] lg:h-72 lg:w-[30rem]">
      {src ? (
        <>
          <img
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full scale-105 object-cover opacity-35 blur-md"
            loading="lazy"
          />
          <img
            src={src}
            alt=""
            className="relative h-full w-full object-contain object-center"
            loading="lazy"
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-card text-5xl font-semibold text-content-muted/35">
          {gameInitials(game?.name)}
        </div>
      )}
    </div>
  );
}

function StatPill({ icon: Icon, label, value }) {
  return (
    <div className="inline-flex min-h-11 items-center gap-3 rounded-2xl border border-surface-border bg-surface-card/80 px-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-surface-border bg-surface-elevated/70 text-content-secondary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-base font-semibold text-content-primary">
        {value}
      </span>
      <span className="text-xs uppercase tracking-[0.18em] text-content-secondary">
        {label}
      </span>
    </div>
  );
}

function ViewModeToggle({ viewMode, setViewMode }) {
  return (
    <SegmentedControl
      value={viewMode}
      onChange={setViewMode}
      options={viewOptions}
      ariaLabel="Timeline view"
      activeClassName="bg-action-primary text-content-on-primary shadow-sm shadow-primary/15"
      inactiveClassName="text-content-secondary hover:bg-surface-border hover:text-content-primary"
    />
  );
}

export function TimelineHeader({ summary, viewMode, setViewMode }) {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Timeline"
        description="Started and finished dates from your backlog, grouped over time."
        icon={Clock3}
        actions={
          <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
        }
      />
      <div className="flex flex-wrap gap-3">
        <StatPill icon={Clock3} label="Events" value={summary.total} />
        <StatPill icon={PlayCircle} label="Started" value={summary.started} />
        <StatPill
          icon={CheckCircle2}
          label="Finished"
          value={summary.finished}
        />
        <StatPill icon={CalendarDays} label="Active" value={summary.active} />
      </div>
    </div>
  );
}

export function TimelineFilters({
  eventFilter,
  setEventFilter,
  yearFilter,
  setYearFilter,
  datePreset,
  setDatePreset,
  search,
  setSearch,
  years,
  onClear,
  hasActiveFilters,
}) {
  return (
    <PageToolbar className="border-t-0">
      <div className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_auto] lg:items-center">
        <label className="relative block min-w-0">
          <span className="sr-only">Search timeline by game title</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
            aria-hidden="true"
          />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search games in timeline"
            className="pl-9 pr-9"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-elevated hover:text-content-primary"
              aria-label="Clear timeline search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <SelectMenu
            value={datePreset}
            onChange={setDatePreset}
            className="w-full min-w-36 sm:w-40"
            options={datePresetOptions}
          />
          {years.length > 1 ? (
            <SelectMenu
              value={yearFilter}
              onChange={setYearFilter}
              className="w-full min-w-36 sm:w-40"
              options={[
                { value: "all", label: "All years" },
                ...years.map((year) => ({
                  value: String(year),
                  label: String(year),
                })),
              ]}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {eventFilterOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={eventFilter === option.value ? "primary" : "secondary"}
                onClick={() => setEventFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {hasActiveFilters ? (
            <Button type="button" size="sm" variant="ghost" onClick={onClear}>
              <X className="h-4 w-4" aria-hidden="true" />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>
    </PageToolbar>
  );
}

function DateRail({ event }) {
  const meta = eventCopy[event.type];
  const Icon = meta.icon;
  const [monthLabel, dayLabel] = formatTimelineDay(event).split(" ");

  return (
    <div className="relative flex min-h-full items-center justify-center">
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-surface-border" />
      <div className="relative z-10 flex flex-col items-center gap-2">
        <div className="rounded-2xl border border-surface-border bg-surface-bg/95 px-2 py-2 text-center shadow-panel sm:px-2.5">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-content-secondary">
            {monthLabel}
          </div>
          <div className="text-2xl font-semibold leading-none text-content-primary sm:text-4xl">
            {dayLabel}
          </div>
          <div className="mt-1 text-xs text-content-muted">{event.year}</div>
        </div>
        <div
          className={[
            "flex h-10 w-10 items-center justify-center rounded-full border bg-surface-bg shadow-panel sm:h-12 sm:w-12",
            meta.border,
          ].join(" ")}
        >
          <Icon
            className={["h-5 w-5 sm:h-6 sm:w-6", meta.text].join(" ")}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}

function EventTypeBadge({ event, compact = false }) {
  const meta = eventCopy[event.type];
  const Icon = meta.icon;

  return (
    <div
      className={[
        "inline-flex max-w-full items-center gap-2 rounded-full border font-semibold backdrop-blur-md",
        compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        meta.border,
        meta.bg,
        meta.text,
      ].join(" ")}
    >
      <Icon
        className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
        aria-hidden="true"
      />
      <span className="min-w-0 truncate">{meta.label}</span>
    </div>
  );
}

function CurrentStatusBadge({ status }) {
  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-media-border/15 bg-media-overlay/30 px-2 py-1 backdrop-blur-md">
      <span className="shrink-0 pl-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-content-secondary">
        Now
      </span>
      <StatusBadge
        status={status || "Unknown"}
        className="min-w-0 max-w-36 border-transparent bg-transparent px-1.5 py-0 text-[10px] sm:max-w-64"
      />
    </div>
  );
}

export function PosterEvent({ event, onOpen }) {
  const meta = eventCopy[event.type];
  const Icon = meta.icon;

  return (
    <article className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-3">
      <DateRail event={event} />
      <button
        type="button"
        onClick={() => onOpen(event.game)}
        className={[
          "group min-w-0 rounded-2xl border border-surface-border bg-surface-card/80 p-3 text-left shadow-sm transition",
          "hover:border-primary/45 hover:bg-surface-card hover:shadow-glow-primary",
        ].join(" ")}
      >
        <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row">
          <PosterMedia game={event.game} />
          <div className="flex min-w-0 flex-1 flex-col justify-center py-1">
            <div
              className={[
                "flex items-center gap-2 text-base font-semibold",
                meta.text,
              ].join(" ")}
            >
              <span
                className={["h-2.5 w-2.5 rounded-full", meta.dot].join(" ")}
              />
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{meta.label}</span>
            </div>
            <h2 className="mt-3 line-clamp-2 text-2xl font-semibold leading-snug text-content-primary sm:text-3xl">
              {event.title}
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CurrentStatusBadge status={event.game?.status} />
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}

export function BackdropEvent({ event, onOpen }) {
  const meta = eventCopy[event.type];
  const src = coverUrl(event.game);

  return (
    <article className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-3">
      <DateRail event={event} />
      <button
        type="button"
        onClick={() => onOpen(event.game)}
        className={[
          "group relative min-h-48 min-w-0 overflow-hidden rounded-2xl border border-surface-border text-left shadow-sm transition sm:min-h-60 lg:min-h-64",
          "hover:border-primary/45 hover:shadow-glow-primary",
        ].join(" ")}
      >
        {src ? (
          <>
            <img
              src={src}
              alt=""
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-md transition duration-500 group-hover:scale-[1.13]"
              loading="lazy"
            />
            <img
              src={src}
              alt=""
              className="absolute inset-y-0 right-0 h-full w-full object-cover object-center opacity-45 transition duration-500 group-hover:scale-[1.02] sm:w-[64%] sm:object-contain sm:opacity-90"
              loading="lazy"
            />
          </>
        ) : (
          <NoCoverBackdrop title={event.title} />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-surface-bg/95 via-surface-bg/72 to-surface-bg/34" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-bg/82 via-transparent to-surface-bg/12" />
        <div
          className={["absolute inset-y-0 left-0 w-1.5", meta.accent].join(" ")}
        />

        <div className="relative flex min-h-48 flex-col justify-between gap-8 p-5 sm:min-h-60 sm:gap-12 sm:p-7 lg:min-h-64">
          <div className="mb-auto flex items-start">
            <EventTypeBadge event={event} compact />
          </div>

          <div className="max-w-3xl pb-2 sm:pb-4">
            <h2 className="line-clamp-2 pb-2 text-2xl font-semibold leading-[1.18] text-media-text drop-shadow-lg sm:text-4xl lg:text-5xl">
              {event.title}
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CurrentStatusBadge status={event.game?.status} />
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}

export function TimelineGroup({ group, viewMode, onOpen }) {
  const EventComponent = timelineViews[viewMode]?.component || BackdropEvent;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-3">
        <div className="flex justify-center">
          <span className="h-4 w-4 rounded-full border border-primary/35 bg-primary/20" />
        </div>
        <div className="flex items-center gap-4">
          <h2 className="shrink-0 text-base font-semibold text-content-primary">
            {group.label}
          </h2>
          <div className="h-px flex-1 bg-surface-border" />
          <span className="text-xs text-content-secondary">
            {formatTimelineGroupSummary(group)}
          </span>
        </div>
      </div>

      <div className="space-y-5">
        {group.events.map((event) => (
          <EventComponent key={event.id} event={event} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export function TimelineSkeleton() {
  return (
    <AppPage width="wide">
      <PageHeader
        title="Timeline"
        description="Your gaming activity over time."
        icon={Clock3}
      />
      <PageLoading rows={4} className="pt-6" />
    </AppPage>
  );
}
