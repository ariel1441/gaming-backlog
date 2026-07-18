import React from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Gamepad2,
  Heart,
  LibraryBig,
  List,
  PlayCircle,
  Share2,
} from "lucide-react";
import ProfileAvatar from "./ProfileAvatar";
import { Button, GameCover, StatusBadge } from "./ui";
import { parseGameDate } from "../utils/gameDateInsights";
import { profileDisplayName, profileHandle } from "../utils/userProfile";
import { useStatusGroups } from "../contexts/StatusGroupsContext";
import { defaultStatusSemantics } from "../utils/statusSemantics";

export function isCompletedGame(game, statusGroupOf = defaultStatusSemantics.statusGroupOf) {
  return statusGroupOf(game?.status) === "done";
}

export function isPlayingGame(game, statusGroupOf = defaultStatusSemantics.statusGroupOf) {
  return statusGroupOf(game?.status) === "playing";
}

export function isPlannedGame(game, statusGroupOf = defaultStatusSemantics.statusGroupOf) {
  return statusGroupOf(game?.status) === "planned";
}

function scoreOf(game) {
  const value = Number(game?.my_score);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function finishedTime(game) {
  return parseGameDate(game?.finished_at)?.timestamp || 0;
}

function queueSortValue(game) {
  const rank = Number(game?.status_rank);
  const position = Number(game?.position);
  const id = Number(game?.id);

  return [
    Number.isFinite(rank) ? rank : Number.MAX_SAFE_INTEGER,
    Number.isFinite(position) ? position : Number.MAX_SAFE_INTEGER,
    Number.isFinite(id) ? id : Number.MAX_SAFE_INTEGER,
  ];
}

export function buildProfileSnapshot(
  games = [],
  { statusGroupOf = defaultStatusSemantics.statusGroupOf } = {},
) {
  const list = Array.isArray(games) ? games : [];
  const currentYear = new Date().getFullYear();

  const playing = list.filter((game) => isPlayingGame(game, statusGroupOf));
  const planned = list
    .filter((game) => isPlannedGame(game, statusGroupOf))
    .sort((a, b) => {
      const aValues = queueSortValue(a);
      const bValues = queueSortValue(b);
      return (
        aValues[0] - bValues[0] ||
        aValues[1] - bValues[1] ||
        aValues[2] - bValues[2]
      );
    });
  const favorites = list
    .filter((game) => {
      const rank = Number(game?.favorite_rank);
      return Number.isInteger(rank) && rank >= 1 && rank <= 5;
    })
    .sort((a, b) => Number(a.favorite_rank) - Number(b.favorite_rank));
  const completed = list.filter((game) => isCompletedGame(game, statusGroupOf));
  const recentlyFinished = list
    .filter((game) => finishedTime(game) > 0)
    .sort((a, b) => finishedTime(b) - finishedTime(a));
  const finishedThisYear = recentlyFinished.filter(
    (game) => parseGameDate(game?.finished_at)?.year === currentYear
  );

  return {
    stats: {
      total: list.length,
      playing: playing.length,
      finished: completed.length,
      backlog: planned.length,
      finishedThisYear: finishedThisYear.length,
    },
    favorites,
    playing,
    planned,
    completed,
    recentlyFinished,
  };
}

export default function ProfileSnapshot({
  profile,
  games = [],
  publicUrl,
  joinedAt,
  variant = "public",
  isPublic = true,
  onCopy,
  onShare,
  onOpenPublic,
  onOpenGames,
  onSelectGame,
}) {
  const { statusGroupOf } = useStatusGroups();
  const snapshot = buildProfileSnapshot(games, { statusGroupOf });
  const displayName = profileDisplayName(profile);
  const handle = profileHandle(profile);
  const bio = String(profile?.bio || "").trim();
  const compact = variant === "settingsPreview";
  const maxItems = compact ? 3 : 5;
  const title = variant === "settingsPreview" ? "Profile preview" : "Public profile";

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-panel">
        <div className="border-b border-surface-border bg-surface-bg/25 px-5 py-4 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <ProfileAvatar profile={profile} size={compact ? "md" : "lg"} />
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-content-muted">
                  {title}
                </div>
                <h1
                  className="mt-1 truncate text-3xl font-semibold leading-tight text-content-primary"
                  title={displayName}
                >
                  {displayName}
                </h1>
                <div className="mt-1 truncate text-sm text-content-muted">
                  {handle}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onCopy && publicUrl ? (
                <Button type="button" variant="secondary" onClick={onCopy}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Copy link
                </Button>
              ) : null}
              {onShare && publicUrl ? (
                <Button type="button" variant="primary" onClick={onShare}>
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  Share
                </Button>
              ) : null}
              {onOpenPublic && publicUrl ? (
                <Button type="button" variant="secondary" onClick={onOpenPublic}>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Open
                </Button>
              ) : null}
              {onOpenGames ? (
                <Button type="button" variant="primary" onClick={onOpenGames}>
                  <List className="h-4 w-4" aria-hidden="true" />
                  View all games
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="p-5 md:p-6">
            <div className="min-w-0">
              <p className="max-w-2xl text-sm leading-6 text-content-secondary">
                {bio ||
                  (joinedAt
                    ? `Tracking games since ${joinedAt}.`
                    : isPublic
                      ? "A public snapshot of this backlog."
                      : "This is how your shared profile will start when public mode is on.")}
              </p>
              {bio && joinedAt ? (
                <p className="mt-2 text-xs leading-5 text-content-muted">
                  Tracking games since {joinedAt}.
                </p>
              ) : null}

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <ProfileStat icon={LibraryBig} label="Games" value={snapshot.stats.total} />
                <ProfileStat icon={PlayCircle} label="Playing" value={snapshot.stats.playing} />
                <ProfileStat
                  icon={CheckCircle2}
                  label="Finished"
                  value={snapshot.stats.finished}
                />
                <ProfileStat icon={Gamepad2} label="Backlog" value={snapshot.stats.backlog} />
                <ProfileStat
                  icon={CalendarDays}
                  label={`Finished ${new Date().getFullYear()}`}
                  value={snapshot.stats.finishedThisYear}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-surface-border bg-surface-bg/30 p-5 xl:border-l xl:border-t-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-content-muted">
              Shared profile
            </div>
            {publicUrl ? (
              <div className="mt-3 break-all rounded-xl border border-surface-border bg-surface-bg/45 px-3 py-3 text-sm font-medium leading-6 text-content-primary">
                {publicUrl}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-surface-border bg-surface-bg/45 px-3 py-3 text-sm leading-6 text-content-muted">
                Turn on public mode to create a shareable profile link.
              </div>
            )}
            <p className="mt-3 text-xs leading-5 text-content-muted">
              Visitors can browse the shared profile but cannot change games.
            </p>
          </div>
        </div>
      </div>

      <FavoriteGamesSection
        games={snapshot.favorites.slice(0, 5)}
        placeholderCount={5}
        onSelectGame={onSelectGame}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <ShowcaseSection
          title="Currently playing"
          icon={PlayCircle}
          games={snapshot.playing.slice(0, maxItems)}
          empty="No active games shown."
          onSelectGame={onSelectGame}
        />
        <ShowcaseSection
          title="Recently finished"
          icon={CheckCircle2}
          games={snapshot.recentlyFinished.slice(0, maxItems)}
          empty="No finished dates yet."
          onSelectGame={onSelectGame}
        />
        <ShowcaseSection
          title="Up next"
          icon={List}
          games={snapshot.planned.slice(0, maxItems)}
          empty="No planned games shown."
          onSelectGame={onSelectGame}
        />
      </div>
    </section>
  );
}

function ProfileStat({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-surface-border bg-surface-bg/35 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-content-muted">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-2 truncate text-xl font-semibold text-content-primary">
        {value}
      </div>
    </div>
  );
}

function FavoriteGamesSection({ games, placeholderCount = 4, onSelectGame }) {
  const placeholderSlots = Array.from({
    length: Math.max(0, placeholderCount - games.length),
  });

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-4">
      <div className="flex items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-content-primary">
          <Heart className="h-4 w-4 text-content-muted" aria-hidden="true" />
          Favorite games
        </h2>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {games.map((game) => (
          <FavoriteGame
            key={game.id || game.name}
            game={game}
            onClick={onSelectGame ? () => onSelectGame(game) : undefined}
          />
        ))}
        {placeholderSlots.map((_, index) => (
          <div
            key={`favorite-placeholder-${index}`}
            className="group min-w-0"
          >
            <div className="relative flex aspect-[2/3] items-center justify-center overflow-hidden rounded-xl border border-dashed border-surface-border bg-gradient-to-br from-surface-elevated/70 via-surface-bg/60 to-surface-card">
              <div className="absolute inset-x-4 top-4 h-px bg-surface-border/70" />
              <div className="absolute inset-x-6 bottom-5 h-px bg-surface-border/50" />
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-surface-border bg-surface-card/80 text-sm font-semibold text-content-muted shadow-control-inset">
                {index + 1}
              </span>
            </div>
            <div className="mt-2 truncate text-sm font-medium text-content-primary">
              Favorite slot {index + 1}
            </div>
          </div>
        ))}
      </div>
      {!games.length ? (
        <p className="mt-3 text-xs leading-5 text-content-muted">
          User-picked favorites will fill these poster slots.
        </p>
      ) : null}
    </section>
  );
}

function FavoriteGame({ game, onClick }) {
  const Element = onClick ? "button" : "div";

  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={[
        "group relative aspect-[2/3] min-w-0 overflow-hidden rounded-xl border border-surface-border bg-surface-elevated text-left",
        onClick ? "transition-colors hover:border-primary/50" : "",
      ].join(" ")}
    >
      <GameCover
        src={game.cover}
        name={game.name}
        className="absolute inset-0 h-full w-full"
        imageClassName="opacity-85 transition-opacity group-hover:opacity-100"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media-overlay/90 to-transparent p-2">
        <div
          className="line-clamp-2 text-xs font-semibold text-media-text"
          title={game.name}
        >
          {game.name}
        </div>
      </div>
    </Element>
  );
}

function ShowcaseSection({ title, icon: Icon, games, empty, onSelectGame }) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-content-primary">
        <Icon className="h-4 w-4 text-content-muted" aria-hidden="true" />
        {title}
      </h2>
      <div className="mt-3 space-y-2">
        {games.length ? (
          games.map((game) => (
            <ShowcaseGame
              key={game.id || game.name}
              game={game}
              onClick={onSelectGame ? () => onSelectGame(game) : undefined}
            />
          ))
        ) : (
          <div className="rounded-xl border border-surface-border bg-surface-elevated/40 px-3 py-4 text-sm text-content-muted">
            {empty}
          </div>
        )}
      </div>
    </section>
  );
}

function ShowcaseGame({ game, onClick }) {
  const score = scoreOf(game);
  const hours = Number(game?.how_long_to_beat);
  const finished = parseGameDate(game?.finished_at)?.value;
  const Element = onClick ? "button" : "div";

  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={[
        "flex w-full min-w-0 items-center gap-3 rounded-xl border border-transparent p-2 text-left",
        onClick
          ? "transition-colors hover:border-surface-border hover:bg-surface-elevated/70"
          : "",
      ].join(" ")}
    >
      <GameCover
        src={game.cover}
        name={game.name}
        className="h-14 w-10 shrink-0 rounded"
      />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-medium text-content-primary"
          title={game.name}
        >
          {game.name}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-content-muted">
          {game.status ? <StatusBadge status={game.status} /> : null}
          {score != null ? <span>{score}/10</span> : null}
          {finished ? <span>{finished}</span> : null}
          {Number.isFinite(hours) && hours > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              {hours}h
            </span>
          ) : null}
        </div>
      </div>
    </Element>
  );
}
