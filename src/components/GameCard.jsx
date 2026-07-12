import React, { useState } from "react";
import {
  CalendarDays,
  Clock3,
  Flag,
  Gamepad2,
  ImageOff,
  Pencil,
  Star,
  Trash2,
  Trophy,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useStatusGroups } from "../contexts/StatusGroupsContext";
import { canDeleteGame, canEditGame } from "../utils/permissions";
import { splitCsv } from "../utils/gameList";
import { resolveGameHours } from "../utils/hours";
import { formatAchievementSummary } from "../utils/steamAchievements";
import { Chip, IconButton, StatusBadge, useToast } from "./ui";

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

function fmtShortDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}

function daysSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
}

function statusIsAlreadyActiveOrDone(status, statusGroupOf) {
  return ["playing", "done"].includes(statusGroupOf(status));
}

function MiniStat({ icon: Icon, label, value, tone = "default" }) {
  const toneClass =
    tone === "warning"
      ? "text-state-warning"
      : tone === "success"
        ? "text-state-success"
        : tone === "primary"
          ? "text-primary"
          : tone === "integration"
            ? "text-integration-steam"
          : tone === "muted"
            ? "text-content-muted"
            : "text-content-primary";

  return (
    <div
      className="inline-flex min-w-0 items-center gap-1 rounded-full border border-surface-border/70 bg-surface-elevated/55 px-2 py-1.5"
      title={label}
    >
      <Icon
        className="h-3.5 w-3.5 shrink-0 text-content-muted"
        aria-hidden="true"
      />
      <span className={`truncate text-xs font-semibold ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

function TimelineRow({ startedAt, finishedAt }) {
  if (!startedAt && !finishedAt) return null;
  const value =
    startedAt && finishedAt
      ? `${startedAt} -> ${finishedAt}`
      : startedAt || finishedAt;

  return (
    <div
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-surface-border/70 bg-surface-elevated/55 px-2.5 py-1.5"
      title={[
        startedAt ? `Started: ${startedAt}` : null,
        finishedAt ? `Finished: ${finishedAt}` : null,
      ]
        .filter(Boolean)
        .join(" | ")}
    >
      {finishedAt && !startedAt ? (
        <Flag
          className="h-3.5 w-3.5 shrink-0 text-content-muted"
          aria-hidden="true"
        />
      ) : (
        <CalendarDays
          className="h-3.5 w-3.5 shrink-0 text-content-muted"
          aria-hidden="true"
        />
      )}
      <span className="truncate text-xs font-semibold text-content-primary">
        {value}
      </span>
    </div>
  );
}

function TimelineSlot({ startedAt, finishedAt, reserve = false }) {
  if (!startedAt && !finishedAt) {
    return reserve ? <div className="h-[30px]" aria-hidden="true" /> : null;
  }

  return <TimelineRow startedAt={startedAt} finishedAt={finishedAt} />;
}

function ReleaseBadge({ value }) {
  if (!value) return null;

  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-media-border/15 bg-media-overlay/45 px-2.5 py-1 text-xs font-semibold text-media-text shadow-md backdrop-blur">
      <CalendarDays
        className="h-3.5 w-3.5 shrink-0 text-media-text/75"
        aria-hidden="true"
      />
      <span className="truncate">Released {value}</span>
    </div>
  );
}

function CoverFallback({ title, className = "", compact = false }) {
  const initial =
    String(title || "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?";
  return (
    <div
      className={[
        "flex items-end overflow-hidden bg-gradient-to-br from-surface-elevated via-surface-card to-surface-bg",
        className,
      ].join(" ")}
    >
      <div className="flex w-full items-end justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-surface-border bg-surface-bg/70 text-lg font-semibold text-content-secondary">
            {initial}
          </div>
          {!compact ? (
            <div className="line-clamp-2 max-w-[13rem] text-sm font-medium text-content-muted">
              Cover unavailable
            </div>
          ) : null}
        </div>
        <ImageOff
          className="h-5 w-5 shrink-0 text-content-muted/70"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function CoverImage({
  src,
  alt,
  className,
  fallbackClassName,
  compact = false,
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <CoverFallback
        title={alt}
        className={fallbackClassName || className}
        compact={compact}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

export default function GameCard({
  game,
  onClick,
  onEdit,
  onDelete,
  readOnly = false,
  variant = "grid",
}) {
  const { user, isAuthenticated } = useAuth();
  const { statusGroupOf } = useStatusGroups();
  const toast = useToast();
  const canEdit = canEditGame({ user, game, isAuthenticated, readOnly });
  const canDelete = canDeleteGame({ user, game, isAuthenticated, readOnly });

  const handleCardClick = (event) => {
    event.stopPropagation();
    onClick?.();
  };

  const handleEdit = (event) => {
    event.stopPropagation();
    if (!canEdit) {
      toast.warning("Sign in to edit games in your backlog.");
      return;
    }
    onEdit?.();
  };

  const handleDelete = (event) => {
    event.stopPropagation();
    if (!canDelete) {
      toast.warning("Sign in to delete games from your backlog.");
      return;
    }
    onDelete?.();
  };

  const releaseDate = fmtDate(game.releaseDate);
  const startedAt = fmtShortDate(game.started_at);
  const finishedAt = fmtShortDate(game.finished_at);
  const myGenres = splitCsv(game.my_genre);
  const hours = resolveGameHours(game);
  const cardStats = [
    {
      icon: Clock3,
      label: hours.sourceLabel,
      value: hours.label,
      tone: hours.hours ? (hours.isActual ? "primary" : "default") : "muted",
    },
    {
      icon: Star,
      label: "RAWG",
      value: game.rating ? `${game.rating}/5` : "N/A",
      tone: game.rating ? "default" : "muted",
    },
    {
      icon: Trophy,
      label: "Metacritic",
      value: game.metacritic ? String(game.metacritic) : "N/A",
      tone: game.metacritic ? "default" : "muted",
    },
  ];
  const steamPlaytime =
    game.steamOwned && hours.source !== "steam"
      ? hours.secondarySteamHours
        ? `Steam ${hours.secondarySteamHours}h`
        : "Owned on Steam"
      : null;
  const steamLastPlayed = game.steamOwned
    ? fmtShortDate(game.steamLastPlayedAt)
    : null;
  const steamActivityDays = daysSince(game.steamFirstPlayObservedAt);
  const steamActivityStat =
    game.steamOwned &&
    steamActivityDays != null &&
    steamActivityDays <= 30 &&
    !statusIsAlreadyActiveOrDone(game.status, statusGroupOf)
      ? {
          icon: Gamepad2,
          label: "Steam activity",
          value: "Started on Steam?",
          tone: "warning",
        }
      : null;
  const achievements = game.steamOwned
    ? formatAchievementSummary(game.steamAchievements)
    : null;
  const achievementStat =
    achievements?.isMeaningful && Number(achievements.percent) > 0
      ? {
          icon: Trophy,
          label: "Achievements",
          value: achievements.compact,
          tone: achievements.percent >= 100 ? "success" : "primary",
        }
      : null;
  const isCompact = variant === "compact";
  const isList = variant === "list";
  const genreLimit = isCompact ? 2 : 3;
  const visibleMyGenres = myGenres.slice(0, genreLimit);
  const hiddenMyGenres = Math.max(0, myGenres.length - visibleMyGenres.length);
  const imageHeight = isCompact ? "h-44" : "h-64";
  const titleClass = isCompact
    ? "line-clamp-2 max-w-full text-base font-semibold leading-tight text-media-text"
    : "line-clamp-2 max-w-full text-xl font-semibold leading-tight text-media-text";

  const actionButtons =
    canEdit || canDelete ? (
      <div className="absolute right-3 top-3 z-20 flex gap-2 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
        {canEdit && (
          <IconButton
            icon={Pencil}
            onClick={handleEdit}
            className="action-button h-9 w-9 shadow-md hover:border-secondary hover:bg-secondary hover:text-media-text"
            label="Edit game"
            title="Edit game"
          />
        )}
        {canDelete && (
          <IconButton
            icon={Trash2}
            onClick={handleDelete}
            variant="danger"
            className="action-button h-9 w-9 shadow-md"
            label="Delete game"
            title="Delete game"
          />
        )}
      </div>
    ) : null;
  const openDetailsButton = onClick ? (
    <button
      type="button"
      className="absolute inset-0 z-10 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      onClick={handleCardClick}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={`Open details for ${game.name}`}
    />
  ) : null;

  if (isList) {
    return (
      <article
        className="group relative overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-sm transition-colors hover:border-primary/35"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        {openDetailsButton}
        {actionButtons}
        <div className="relative min-h-[172px] sm:min-h-[184px]">
          {game.cover ? (
            <>
              <CoverImage
                src={game.cover}
                alt={game.name}
                className="absolute inset-0 h-full w-full object-cover opacity-35"
                fallbackClassName="absolute inset-0 h-full w-full"
                compact
              />
              <div className="absolute inset-0 bg-gradient-to-r from-surface-card via-surface-card/95 to-surface-card/72" />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-card/70 via-transparent to-transparent" />
            </>
          ) : null}

          <div className="relative flex min-h-[172px] gap-4 p-4 pr-14 sm:min-h-[184px] sm:gap-5 sm:p-5 sm:pr-16">
            <CoverImage
              src={game.cover}
              alt={game.name}
              className="h-40 w-52 shrink-0 rounded-xl border border-media-border/10 object-cover shadow-lg sm:h-44 sm:w-64 lg:w-72"
              fallbackClassName="h-40 w-52 shrink-0 rounded-xl border border-surface-border sm:h-44 sm:w-64 lg:w-72"
              compact
            />

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-lg font-semibold leading-tight text-content-primary sm:text-xl">
                  {game.name}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {game.status ? <StatusBadge status={game.status} /> : null}
                  {releaseDate ? <ReleaseBadge value={releaseDate} /> : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {cardStats.map((stat) => (
                  <MiniStat
                    key={stat.label}
                    icon={stat.icon}
                    label={stat.label}
                    value={stat.value}
                    tone={stat.tone}
                  />
                ))}
                {steamPlaytime ? (
                  <MiniStat
                    icon={Gamepad2}
                    label="Steam"
                    value={steamPlaytime}
                    tone="integration"
                  />
                ) : null}
                {steamLastPlayed ? (
                  <MiniStat
                    icon={CalendarDays}
                    label="Last played on Steam"
                    value={steamLastPlayed}
                    tone="integration"
                  />
                ) : null}
                {achievementStat ? (
                  <MiniStat
                    icon={achievementStat.icon}
                    label={achievementStat.label}
                    value={achievementStat.value}
                    tone={achievementStat.tone}
                  />
                ) : null}
                <TimelineSlot startedAt={startedAt} finishedAt={finishedAt} />
              </div>

              {visibleMyGenres.length ? (
                <div className="flex flex-wrap gap-2">
                  {visibleMyGenres.map((genre) => (
                    <Chip key={genre} variant="genre" title={genre} className="truncate">
                      {genre}
                    </Chip>
                  ))}
                  {hiddenMyGenres ? (
                    <span className="rounded-full border border-surface-border bg-surface-elevated/60 px-2.5 py-1 text-xs font-medium text-content-muted">
                      +{hiddenMyGenres}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-card/95 shadow-sm transition-all duration-300 hover:border-primary/30 hover:bg-surface-card hover:shadow-glow-primary hover:-translate-y-0.5 h-full`}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {openDetailsButton}
      {actionButtons}

      <div className="relative overflow-hidden border-b border-surface-border/70 bg-surface-card">
        {game.cover ? (
          <>
            <CoverImage
              src={game.cover}
              alt={game.name}
              className={`${imageHeight} w-full object-cover`}
              fallbackClassName={`flex ${imageHeight} w-full`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-card via-surface-card/25 to-transparent" />
          </>
        ) : (
          <CoverFallback
            title={game.name}
            className={`flex ${imageHeight} w-full`}
          />
        )}

        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="flex min-w-0 flex-col items-start gap-2">
            <h3 className={titleClass}>{game.name}</h3>
            <div className="flex max-w-full flex-wrap items-center gap-2">
              {game.status ? <StatusBadge status={game.status} /> : null}
              {releaseDate ? <ReleaseBadge value={releaseDate} /> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-3.5 py-4">
        {isCompact ? (
          <div className="grid content-start gap-2">
            <div className="flex flex-wrap gap-1.5">
              {cardStats.map((stat) => (
                <MiniStat
                  key={stat.label}
                  icon={stat.icon}
                  label={stat.label}
                  value={stat.value}
                  tone={stat.tone}
                />
              ))}
              {steamPlaytime ? (
                <MiniStat
                  icon={Gamepad2}
                  label="Steam"
                  value={steamPlaytime}
                  tone="integration"
                />
              ) : null}
              {steamLastPlayed ? (
                <MiniStat
                  icon={CalendarDays}
                  label="Last played on Steam"
                  value={steamLastPlayed}
                  tone="integration"
                />
              ) : null}
              {steamActivityStat ? (
                <MiniStat
                  icon={steamActivityStat.icon}
                  label={steamActivityStat.label}
                  value={steamActivityStat.value}
                  tone={steamActivityStat.tone}
                />
              ) : null}
              {achievementStat ? (
                <MiniStat
                  icon={achievementStat.icon}
                  label={achievementStat.label}
                  value={achievementStat.value}
                  tone={achievementStat.tone}
                />
              ) : null}
            </div>
            <TimelineSlot startedAt={startedAt} finishedAt={finishedAt} />
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {cardStats.map((stat) => (
              <MiniStat
                key={stat.label}
                icon={stat.icon}
                label={stat.label}
                value={stat.value}
                tone={stat.tone}
              />
            ))}
            {steamPlaytime ? (
              <MiniStat
                icon={Gamepad2}
                label="Steam"
                value={steamPlaytime}
                tone="integration"
              />
            ) : null}
            {steamLastPlayed ? (
              <MiniStat
                icon={CalendarDays}
                label="Last played on Steam"
                value={steamLastPlayed}
                tone="integration"
              />
            ) : null}
            {steamActivityStat ? (
              <MiniStat
                icon={steamActivityStat.icon}
                label={steamActivityStat.label}
                value={steamActivityStat.value}
                tone={steamActivityStat.tone}
              />
            ) : null}
            {achievementStat ? (
              <MiniStat
                icon={achievementStat.icon}
                label={achievementStat.label}
                value={achievementStat.value}
                tone={achievementStat.tone}
              />
            ) : null}
            <TimelineSlot startedAt={startedAt} finishedAt={finishedAt} />
          </div>
        )}

        {visibleMyGenres.length ? (
          <div
            className={`mt-auto flex items-start gap-2 border-t border-surface-border/70 pt-4 ${
              isCompact ? "flex-nowrap overflow-hidden" : "flex-wrap"
            }`}
          >
            {visibleMyGenres.map((genre) => (
              <Chip
                key={genre}
                variant="genre"
                title={genre}
                className="shrink-0 truncate px-3"
              >
                {genre}
              </Chip>
            ))}
            {hiddenMyGenres ? (
              <span className="shrink-0 rounded-full border border-surface-border bg-surface-elevated/60 px-2.5 py-1 text-xs font-medium text-content-muted">
                +{hiddenMyGenres}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
