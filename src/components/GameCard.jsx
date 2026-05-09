import React, { useState } from "react";
import {
  CalendarDays,
  Clock3,
  Flag,
  ImageOff,
  Pencil,
  Star,
  Trash2,
  Trophy,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { canDeleteGame, canEditGame } from "../utils/permissions";
import { splitCsv } from "../utils/gameList";
import { IconButton, StatusBadge, useToast } from "./ui";

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

function MiniStat({ icon: Icon, label, value, tone = "default" }) {
  const toneClass =
    tone === "warning"
      ? "text-state-warning"
      : tone === "success"
        ? "text-state-success"
        : tone === "primary"
          ? "text-primary"
          : tone === "muted"
            ? "text-content-muted"
            : "text-content-primary";

  return (
    <div
      className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-surface-border/70 bg-surface-elevated/55 px-2.5 py-1.5"
      title={label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-content-muted" aria-hidden="true" />
      <span className={`truncate text-xs font-semibold ${toneClass}`}>{value}</span>
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
        <Flag className="h-3.5 w-3.5 shrink-0 text-content-muted" aria-hidden="true" />
      ) : (
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-content-muted" aria-hidden="true" />
      )}
      <span className="truncate text-xs font-semibold text-content-primary">
        {value}
      </span>
    </div>
  );
}

function ReleaseBadge({ value }) {
  if (!value) return null;

  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-xs font-semibold text-white shadow-md backdrop-blur">
      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-white/75" aria-hidden="true" />
      <span className="truncate">Released {value}</span>
    </div>
  );
}

function CoverFallback({ title, className = "", compact = false }) {
  const initial = String(title || "?").trim().charAt(0).toUpperCase() || "?";
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
        <ImageOff className="h-5 w-5 shrink-0 text-content-muted/70" aria-hidden="true" />
      </div>
    </div>
  );
}

function CoverImage({ src, alt, className, fallbackClassName, compact = false }) {
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
  const toast = useToast();
  const canEdit = canEditGame({ user, game, isAuthenticated, readOnly });
  const canDelete = canDeleteGame({ user, game, isAuthenticated, readOnly });

  const handleCardClick = (event) => {
    if (event.target.closest(".action-button")) return;
    onClick?.();
  };

  const handleEdit = (event) => {
    event.stopPropagation();
    if (!canEdit) {
      toast.warning("Admin access required to edit games.");
      return;
    }
    onEdit?.();
  };

  const handleDelete = (event) => {
    event.stopPropagation();
    if (!canDelete) {
      toast.warning("Admin access required to delete games.");
      return;
    }
    onDelete?.();
  };

  const releaseDate = fmtDate(game.releaseDate);
  const startedAt = fmtShortDate(game.started_at);
  const finishedAt = fmtShortDate(game.finished_at);
  const myGenres = splitCsv(game.my_genre);
  const cardStats = [
    {
      icon: Clock3,
      label: "HLTB",
      value: game.how_long_to_beat ? `${game.how_long_to_beat}h` : "TBD",
      tone: game.how_long_to_beat ? "default" : "muted",
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
  const isCompact = variant === "compact";
  const isList = variant === "list";
  const genreLimit = isCompact ? 2 : 3;
  const visibleMyGenres = myGenres.slice(0, genreLimit);
  const hiddenMyGenres = Math.max(0, myGenres.length - visibleMyGenres.length);
  const imageHeight = isCompact ? "h-44" : "h-64";
  const titleClass = isCompact
    ? "line-clamp-2 max-w-full text-base font-semibold leading-tight text-white"
    : "line-clamp-2 max-w-full text-xl font-semibold leading-tight text-white";

  const actionButtons =
    canEdit || canDelete ? (
      <div className="absolute right-3 top-3 z-20 flex gap-2 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
        {canEdit && (
          <IconButton
            icon={Pencil}
            onClick={handleEdit}
            className="action-button h-9 w-9 shadow-md hover:border-secondary hover:bg-secondary hover:text-white"
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

  if (isList) {
    return (
      <article
        className="group relative flex min-h-32 overflow-hidden rounded-2xl border border-surface-border bg-surface-card/95 shadow-sm transition-all duration-300 hover:border-primary/30 hover:bg-surface-card hover:shadow-glow-primary"
        onClick={handleCardClick}
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        {actionButtons}
        <CoverImage
          src={game.cover}
          alt={game.name}
          className="h-32 w-24 shrink-0 object-cover sm:h-36 sm:w-28"
          fallbackClassName="h-32 w-24 shrink-0 sm:h-36 sm:w-28"
          compact
        />
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 p-4 pr-14 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="min-w-0 self-center">
            <h3 className="line-clamp-2 text-lg font-semibold text-content-primary">
              {game.name}
            </h3>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
              {game.status ? <StatusBadge status={game.status} /> : null}
              {releaseDate ? <ReleaseBadge value={releaseDate} /> : null}
              {visibleMyGenres.map((genre) => (
                <span
                  key={genre}
                  className="max-w-full truncate rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-content-secondary"
                  title={genre}
                >
                  {genre}
                </span>
              ))}
              {hiddenMyGenres ? (
                <span className="rounded-full border border-surface-border bg-surface-elevated/60 px-2.5 py-1 text-xs font-medium text-content-muted">
                  +{hiddenMyGenres}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            {cardStats.map((stat) => (
              <MiniStat
                key={stat.label}
                icon={stat.icon}
                label={stat.label}
                value={stat.value}
                tone={stat.tone}
              />
            ))}
            <TimelineRow startedAt={startedAt} finishedAt={finishedAt} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className="group relative overflow-hidden rounded-2xl border border-surface-border bg-surface-card/95 shadow-sm transition-all duration-300 hover:border-primary/30 hover:bg-surface-card hover:shadow-glow-primary hover:-translate-y-0.5"
      onClick={handleCardClick}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
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
          <CoverFallback title={game.name} className={`flex ${imageHeight} w-full`} />
        )}

        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="flex min-w-0 flex-col items-start gap-2">
            <h3 className={titleClass}>
              {game.name}
            </h3>
            <div className="flex max-w-full flex-wrap items-center gap-2">
              {game.status ? <StatusBadge status={game.status} /> : null}
              {releaseDate ? <ReleaseBadge value={releaseDate} /> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {cardStats.map((stat) => (
            <MiniStat
              key={stat.label}
              icon={stat.icon}
              label={stat.label}
              value={stat.value}
              tone={stat.tone}
            />
          ))}
          <TimelineRow startedAt={startedAt} finishedAt={finishedAt} />
        </div>

        {visibleMyGenres.length ? (
          <div
            className={`flex min-h-[30px] items-center gap-2 border-t border-surface-border/70 pt-4 ${
              isCompact ? "flex-nowrap overflow-hidden" : "flex-wrap"
            }`}
          >
            {visibleMyGenres.map((genre) => (
              <span
                key={genre}
                className="max-w-full shrink-0 truncate rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-content-primary"
                title={genre}
              >
                {genre}
              </span>
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
