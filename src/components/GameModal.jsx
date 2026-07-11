import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Gamepad2,
  Layers3,
  Pencil,
  RefreshCw,
  Sparkles,
  Star,
  Tag,
  Trophy,
  X,
} from "lucide-react";
import { Button, IconButton, StatusBadge, useToast } from "./ui";
import { syncSteamGameAchievements } from "../services/steamService";
import { resolveGameHours } from "../utils/hours";
import {
  formatAchievementSummary,
  formatAchievementSyncDate,
} from "../utils/steamAchievements";
import { formatAchievementGameSyncMessage } from "../utils/steamSync";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";

function fmtDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Metric({ icon: Icon, label, value, tone = "default" }) {
  const toneClass =
    tone === "success"
      ? "text-state-success"
      : tone === "warning"
        ? "text-state-warning"
        : tone === "primary"
          ? "text-primary-light"
          : value === "—"
            ? "text-content-muted"
            : "text-content-primary";

  return (
    <div className="min-w-0 border-r border-surface-border/55 pr-4 last:border-r-0 last:pr-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1.5 truncate text-sm font-semibold ${toneClass}`}>
        {value || "—"}
      </div>
    </div>
  );
}

function DetailRow({ label, value, icon: Icon }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5">
      {Icon ? (
        <Icon
          className="mt-0.5 h-4 w-4 shrink-0 text-content-muted"
          aria-hidden="true"
        />
      ) : null}
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
          {label}
        </div>
        <div className="mt-1 break-words text-sm text-content-secondary">
          {value}
        </div>
      </div>
    </div>
  );
}

const tabs = [
  { value: "overview", label: "Overview", icon: Layers3 },
  { value: "achievements", label: "Achievements", icon: Trophy },
  { value: "notes", label: "Notes", icon: Sparkles },
  { value: "activity", label: "Activity", icon: CalendarDays },
];

export default function GameModal({
  game,
  onClose,
  onRefresh,
  onGameRefresh,
  onEdit,
  readOnly = false,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [syncingAchievements, setSyncingAchievements] = useState(false);
  const [localAchievements, setLocalAchievements] = useState(null);
  const modalRef = useRef(null);
  const toast = useToast();

  useDismissibleLayer({
    open: !!game,
    layerRef: modalRef,
    onDismiss: onClose,
    trapFocus: true,
    lockScroll: true,
    restoreFocus: true,
  });

  useEffect(() => {
    setLocalAchievements(null);
    setActiveTab("overview");
  }, [game?.id]);

  const achievements = useMemo(
    () =>
      formatAchievementSummary(localAchievements || game?.steamAchievements),
    [game?.steamAchievements, localAchievements],
  );

  if (!game) return null;

  const cover = game.cover || null;
  const releaseDate = fmtDate(game.releaseDate);
  const startedAt = fmtDate(game.started_at);
  const finishedAt = fmtDate(game.finished_at);
  const steamLastPlayed = fmtDate(game.steamLastPlayedAt);
  const steamFirstObserved = fmtDate(game.steamFirstPlayObservedAt);
  const hours = resolveGameHours(game);
  const rating = Number(game.rating) > 0 ? `${game.rating}/5` : "—";
  const metacritic =
    Number(game.metacritic) > 0 ? String(game.metacritic) : "—";
  const myScore = Number(game.my_score) > 0 ? `${game.my_score}/10` : "—";
  const thoughts = game.thoughts?.trim() || null;
  const description = game.description || null;
  const achievementSyncedAt = formatAchievementSyncDate(
    (localAchievements || game.steamAchievements)?.lastSyncedAt,
  );

  const syncAchievements = async () => {
    setSyncingAchievements(true);
    try {
      const payload = await syncSteamGameAchievements(game.id);
      const result = formatAchievementGameSyncMessage(payload);
      toast[result.tone](result.message);
      if (payload?.achievements) setLocalAchievements(payload.achievements);
      await onGameRefresh?.();
    } catch (error) {
      toast.error(error.message || "Could not sync Steam achievements.");
    } finally {
      setSyncingAchievements(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal overflow-y-auto bg-backdrop/78 p-2 backdrop-blur-md sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-modal-title"
    >
      <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center">
        <div
          ref={modalRef}
          tabIndex={-1}
          className="relative flex max-h-[calc(100vh-1rem)] w-full flex-col overflow-hidden rounded-dialog border border-surface-border/80 bg-surface-bg shadow-dialog sm:max-h-[calc(100vh-2.5rem)]"
        >
          <IconButton
            icon={X}
            onClick={onClose}
            variant="ghost"
            className="absolute right-4 top-4 z-30 h-9 w-9 border border-media-border/10 bg-media-overlay/35 text-media-text backdrop-blur hover:bg-media-overlay/60"
            label="Close game details"
            title="Close"
          />

          <div className="relative min-h-[290px] shrink-0 overflow-hidden sm:min-h-[360px]">
            {cover ? (
              <img
                src={cover}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-surface-elevated to-surface-bg" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-surface-bg via-surface-bg/48 to-media-overlay/15" />
            <div className="absolute inset-0 bg-gradient-to-r from-surface-bg/35 via-transparent to-surface-bg/20" />

            <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 px-5 pb-5 sm:gap-6 sm:px-7 sm:pb-6">
              <div className="hidden h-36 w-28 shrink-0 overflow-hidden rounded-2xl border border-media-border/15 bg-surface-card shadow-2xl sm:block">
                {cover ? (
                  <img
                    src={cover}
                    alt={game.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl font-semibold text-content-muted">
                    {String(game.name || "?").charAt(0)}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <h2
                  id="game-modal-title"
                  className="line-clamp-2 pr-10 text-2xl font-semibold tracking-tight text-media-text drop-shadow sm:text-4xl"
                >
                  {game.name}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <StatusBadge status={game.status || "Unknown"} />
                  {game.steamOwned ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-media-border/15 bg-media-overlay/30 px-2.5 py-1 text-xs font-medium text-media-text/75 backdrop-blur">
                      <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Steam owned
                    </span>
                  ) : null}
                  {releaseDate ? (
                    <span className="text-xs font-medium text-media-text/65">
                      Released {releaseDate}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-4 border-b border-surface-border/65 bg-surface-card/38 px-5 py-4 sm:grid-cols-4 sm:px-7">
            <Metric
              icon={Clock3}
              label={hours.sourceLabel}
              value={hours.label || "—"}
              tone={hours.hours ? "primary" : "default"}
            />
            <Metric
              icon={Star}
              label="RAWG"
              value={rating}
              tone={rating !== "—" ? "warning" : "default"}
            />
            <Metric icon={Trophy} label="Metacritic" value={metacritic} />
            <Metric
              icon={Sparkles}
              label="My score"
              value={myScore}
              tone={myScore !== "—" ? "primary" : "default"}
            />
          </div>

          <div className="shrink-0 overflow-x-auto border-b border-surface-border/65 bg-surface-card/22 px-4 sm:px-7">
            <div className="flex min-w-max items-center gap-1">
              {tabs.map(({ value, label, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setActiveTab(value)}
                  className={[
                    "relative inline-flex h-12 items-center gap-2 px-3 text-sm font-medium transition-colors",
                    activeTab === value
                      ? "text-primary-light"
                      : "text-content-muted hover:text-content-primary",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                  <span
                    className={[
                      "absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary transition-opacity",
                      activeTab === value ? "opacity-100" : "opacity-0",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            {activeTab === "overview" ? (
              <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_250px]">
                <section className="min-w-0">
                  <h3 className="text-sm font-semibold text-content-primary">
                    About
                  </h3>
                  {description ? (
                    <div
                      className="prose prose-invert mt-3 max-w-none text-sm leading-7 text-content-secondary prose-p:my-2"
                      dangerouslySetInnerHTML={{ __html: description }}
                    />
                  ) : (
                    <p className="mt-3 text-sm leading-7 text-content-muted">
                      No game description is available yet.
                    </p>
                  )}
                </section>

                <aside className="divide-y divide-surface-border/55 rounded-xl border border-surface-border/65 bg-surface-card/35 px-4">
                  <DetailRow
                    icon={Tag}
                    label="My genre"
                    value={game.my_genre}
                  />
                  <DetailRow
                    icon={Layers3}
                    label="RAWG genres"
                    value={game.genres}
                  />
                  <DetailRow
                    icon={CalendarDays}
                    label="Release date"
                    value={releaseDate}
                  />
                  <DetailRow
                    icon={Gamepad2}
                    label="Source"
                    value={game.steamOwned ? "Steam" : "Backlog"}
                  />
                </aside>
              </div>
            ) : null}

            {activeTab === "achievements" ? (
              <section className="max-w-2xl">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-content-primary">
                      {game.steamOwned
                        ? achievements.label
                        : "Steam not linked"}
                    </h3>
                    <p className="mt-1 text-sm text-content-muted">
                      {game.steamOwned
                        ? achievements.detail
                        : "Link this backlog entry to Steam to track achievements."}
                    </p>
                  </div>
                  {game.steamOwned && !readOnly ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={syncAchievements}
                      disabled={syncingAchievements}
                    >
                      <RefreshCw
                        className={
                          syncingAchievements
                            ? "h-4 w-4 animate-spin"
                            : "h-4 w-4"
                        }
                        aria-hidden="true"
                      />
                      {syncingAchievements ? "Syncing" : "Sync achievements"}
                    </Button>
                  ) : null}
                </div>

                {game.steamOwned && achievements.percent != null ? (
                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between text-xs text-content-muted">
                      <span>
                        {achievements.remainingLabel || "Achievement progress"}
                      </span>
                      <span>{achievements.percent}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
                      <div
                        className="h-full rounded-full bg-primary shadow-pulse"
                        style={{
                          width: `${Math.min(Math.max(achievements.percent, 0), 100)}%`,
                        }}
                      />
                    </div>
                    {achievementSyncedAt ? (
                      <div className="mt-3 text-xs text-content-muted">
                        Last synced {achievementSyncedAt}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {activeTab === "notes" ? (
              <section className="max-w-3xl">
                <h3 className="text-sm font-semibold text-content-primary">
                  Your thoughts
                </h3>
                {thoughts ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-content-secondary">
                    {thoughts}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-content-muted">
                    You have not added personal notes for this game.
                  </p>
                )}
              </section>
            ) : null}

            {activeTab === "activity" ? (
              <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                <DetailRow
                  icon={CalendarDays}
                  label="Started"
                  value={startedAt}
                />
                <DetailRow
                  icon={CalendarDays}
                  label="Finished"
                  value={finishedAt}
                />
                <DetailRow
                  icon={Gamepad2}
                  label="Steam last played"
                  value={steamLastPlayed}
                />
                <DetailRow
                  icon={Gamepad2}
                  label="Steam activity first observed"
                  value={steamFirstObserved}
                />
                {!startedAt &&
                !finishedAt &&
                !steamLastPlayed &&
                !steamFirstObserved ? (
                  <p className="col-span-full text-sm text-content-muted">
                    No play activity has been recorded yet.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {onEdit || onRefresh ? (
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-surface-border/65 bg-surface-card/38 px-5 py-4 sm:px-7">
              <div>
                {onRefresh ? (
                  <Button type="button" variant="ghost" onClick={onRefresh}>
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Surprise me again
                  </Button>
                ) : null}
              </div>
              {onEdit ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onEdit(game)}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit game
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
