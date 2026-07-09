import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Compass,
  ExternalLink,
  Gamepad2,
  Heart,
  LibraryBig,
  List,
  LockKeyhole,
  PlayCircle,
  RefreshCw,
  Sparkles,
  User2,
} from "lucide-react";
import GameModal from "../components/GameModal";
import ProfileAvatar from "../components/ProfileAvatar";
import { Button, EmptyState, StatusBadge } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGames } from "../hooks/useGames";
import {
  isCompletedGame,
  isPlannedGame,
  isPlayingGame,
} from "../components/ProfileSnapshot";
import { parseGameDate } from "../utils/gameDateInsights";
import { profileDisplayName, profileHandle } from "../utils/userProfile";

function finishedTimestamp(game) {
  return parseGameDate(game?.finished_at)?.timestamp || 0;
}

function formatHoursValue(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return "";
  const rounded = Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10;
  return `${rounded}h`;
}

function displayHours(game, mode = "estimate") {
  if (mode === "steamPreferred") {
    return (
      formatHoursValue(game?.steamPlaytimeHours) ||
      formatHoursValue(game?.how_long_to_beat)
    );
  }
  return formatHoursValue(game?.how_long_to_beat);
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

function buildOwnerProfile(games = []) {
  const list = Array.isArray(games) ? games : [];
  const currentYear = new Date().getFullYear();
  const playing = list.filter(isPlayingGame);
  const done = list.filter(isCompletedGame);
  const planned = list.filter(isPlannedGame).sort((a, b) => {
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
  const recentlyFinished = list
    .filter((game) => finishedTimestamp(game) > 0)
    .sort((a, b) => finishedTimestamp(b) - finishedTimestamp(a));
  const finishedThisYear = recentlyFinished.filter(
    (game) => parseGameDate(game?.finished_at)?.year === currentYear
  );

  return {
    favorites,
    playing,
    planned,
    recentlyFinished,
    stats: {
      total: list.length,
      playing: playing.length,
      finished: done.length,
      backlog: planned.length,
      finishedThisYear: finishedThisYear.length,
    },
  };
}

function publicProfileUrl(username) {
  if (!username) return "";
  if (typeof window === "undefined") return `/u/${username}`;
  return `${window.location.origin}/u/${username}`;
}

function formatJoinedDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function OwnerProfilePage() {
  const { user, loading: authLoading, isAuthenticated, isGuest } = useAuth();
  const { games, loading: gamesLoading, error: gamesError, refresh } = useGames();
  const [selectedGame, setSelectedGame] = useState(null);

  const profile = useMemo(() => buildOwnerProfile(games), [games]);
  const username = user?.username || "You";
  const publicUrl = !isGuest && user?.is_public ? publicProfileUrl(user?.username) : "";
  const loading = authLoading || (isAuthenticated && gamesLoading);

  if (loading) {
    return <OwnerProfileSkeleton />;
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-bg p-6 text-content-primary">
        <EmptyState
          icon={LockKeyhole}
          title="Sign in to see your profile."
          description="Your owner profile is a private home for your games, progress, favorites, and quick links."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button as={Link} to="/" variant="primary">
                <User2 className="h-4 w-4" aria-hidden="true" />
                Back to backlog
              </Button>
              <Button as={Link} to="/discover" variant="secondary">
                Browse Discover
              </Button>
            </div>
          }
          className="w-full max-w-lg"
        />
      </main>
    );
  }

  if (gamesError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-bg p-6 text-content-primary">
        <EmptyState
          icon={AlertTriangle}
          title="Could not load your profile."
          description={gamesError?.message || "Your games could not be loaded."}
          action={
            <Button type="button" variant="primary" onClick={() => refresh()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          }
          className="w-full max-w-lg"
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-bg px-3 py-4 text-content-primary sm:px-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <ProfileHeader
          user={user}
          username={username}
          isGuest={isGuest}
          isPublic={!!user?.is_public}
          publicUrl={publicUrl}
          stats={profile.stats}
          joinedAt={formatJoinedDate(user?.created_at)}
        />

        <FavoriteGames
          games={profile.favorites}
          onSelectGame={setSelectedGame}
        />

        <section className="grid gap-4 lg:grid-cols-3">
          <GameListSection
            title="Currently playing"
            icon={PlayCircle}
            games={profile.playing.slice(0, 5)}
            emptyTitle="No active games yet."
            emptyDescription="Games marked as playing, or started without a finished date, will show up here."
            hoursMode="estimate"
            onSelectGame={setSelectedGame}
          />
          <GameListSection
            title="Recently finished"
            icon={CheckCircle2}
            games={profile.recentlyFinished.slice(0, 5)}
            emptyTitle="No finished dates yet."
            emptyDescription="Add finished dates to build a recent completion shelf."
            hoursMode="steamPreferred"
            onSelectGame={setSelectedGame}
          />
          <GameListSection
            title="Up next"
            icon={List}
            games={profile.planned.slice(0, 5)}
            emptyTitle="No planned games yet."
            emptyDescription="Plan-to-play and wishlist-style games will show up here."
            hoursMode="estimate"
            onSelectGame={setSelectedGame}
          />
        </section>
      </div>

      {selectedGame ? (
        <GameModal game={selectedGame} onClose={() => setSelectedGame(null)} />
      ) : null}
    </main>
  );
}

function OwnerProfileSkeleton() {
  return (
    <main className="min-h-screen bg-surface-bg px-3 py-4 text-content-primary sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-panel">
          <div className="flex flex-wrap items-center gap-4">
            <div className="h-14 w-14 animate-pulse rounded-2xl bg-surface-elevated" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-4 w-28 animate-pulse rounded bg-surface-elevated" />
              <div className="h-8 w-56 animate-pulse rounded bg-surface-elevated" />
              <div className="h-4 w-80 max-w-full animate-pulse rounded bg-surface-elevated/70" />
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-xl border border-surface-border bg-surface-card"
            />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl border border-surface-border bg-surface-card" />
          <div className="h-72 animate-pulse rounded-2xl border border-surface-border bg-surface-card" />
        </div>
      </div>
    </main>
  );
}

function ProfileHeader({ user, username, isGuest, isPublic, publicUrl, stats, joinedAt }) {
  const statusLabel = isGuest
    ? "Demo profile"
    : isPublic
      ? "Public profile on"
      : "Public profile off";
  const displayName = profileDisplayName(user);
  const handle = profileHandle(user);
  const bio = String(user?.bio || "").trim();

  return (
    <section className="overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-panel">
      <div className="border-b border-surface-border bg-surface-bg/25 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <ProfileAvatar profile={user} size="lg" />
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-content-muted">
                Owner profile
              </div>
              <h1 className="mt-1 truncate text-3xl font-semibold leading-tight text-content-primary">
                {displayName}
              </h1>
              <div className="mt-1 truncate text-sm text-content-muted">
                {handle}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <QuickLinks isGuest={isGuest} />
            <Button as={Link} to="/" variant="secondary">
              <LibraryBig className="h-4 w-4" aria-hidden="true" />
              Backlog
            </Button>
            <Button as={Link} to="/settings?section=profile" variant="secondary">
              <User2 className="h-4 w-4" aria-hidden="true" />
              Edit profile
            </Button>
            {publicUrl ? (
              <Button as={Link} to={`/u/${username}`} variant="primary">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                View public profile
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
                  : "Tracking games in your private backlog.")}
            </p>
            {bio && joinedAt ? (
              <p className="mt-2 text-xs leading-5 text-content-muted">
                Tracking games since {joinedAt}.
              </p>
            ) : null}
            <StatsStrip stats={stats} />
          </div>
        </div>
        <aside className="border-t border-surface-border bg-surface-bg/30 p-5 xl:border-l xl:border-t-0">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-content-muted">
            Sharing status
          </div>
          <div className="mt-3 text-sm font-semibold text-content-primary">
            {statusLabel}
          </div>
          <p className="mt-3 text-xs leading-5 text-content-muted">
            {isGuest
              ? "Demo sessions stay private."
              : isPublic
                ? "Public visitors get the read-only profile view."
                : "Public sharing is off."}
          </p>
        </aside>
      </div>
    </section>
  );
}

function StatsStrip({ stats }) {
  const items = [
    { label: "Games", value: stats.total, icon: LibraryBig },
    { label: "Playing", value: stats.playing, icon: PlayCircle },
    { label: "Finished", value: stats.finished, icon: CheckCircle2 },
    { label: "Backlog", value: stats.backlog, icon: Gamepad2 },
    {
      label: `Finished ${new Date().getFullYear()}`,
      value: stats.finishedThisYear,
      icon: CalendarDays,
    },
  ];

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map(({ label, value, icon: Icon }) => (
        <div
          key={label}
          className="min-w-0 rounded-xl border border-surface-border bg-surface-bg/35 p-3"
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-content-muted">
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </div>
          <div className="mt-2 truncate text-xl font-semibold text-content-primary">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function FavoriteGames({ games, onSelectGame }) {
  const slots = Array.from({ length: Math.max(0, 5 - games.length) });

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-content-primary">
          <Heart className="h-4 w-4 text-content-muted" aria-hidden="true" />
          Favorite games
        </h2>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {games.map((game) => (
          <PosterButton
            key={game.id || game.name}
            game={game}
            onClick={() => onSelectGame(game)}
          />
        ))}
        {slots.map((_, index) => (
          <div key={index} className="min-w-0">
            <div className="flex aspect-[2/3] items-center justify-center rounded-xl border border-dashed border-surface-border bg-surface-elevated/45">
              <Heart className="h-5 w-5 text-content-muted" aria-hidden="true" />
            </div>
            <div className="mt-2 truncate text-sm font-medium text-content-primary">
              Favorite slot {games.length + index + 1}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PosterButton({ game, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-[2/3] min-w-0 overflow-hidden rounded-xl border border-surface-border bg-surface-elevated text-left transition-colors hover:border-primary/50"
    >
      {game.cover ? (
        <img
          src={game.cover}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-85 transition-opacity group-hover:opacity-100"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-bg text-3xl font-semibold text-content-muted">
          {String(game.name || "?").charAt(0)}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2">
        <div className="line-clamp-2 text-xs font-semibold text-white">
          {game.name}
        </div>
      </div>
    </button>
  );
}

function GameListSection({
  title,
  icon: Icon,
  games,
  emptyTitle,
  emptyDescription,
  hoursMode = "estimate",
  onSelectGame,
}) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface-card p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-content-primary">
        <Icon className="h-4 w-4 text-content-muted" aria-hidden="true" />
        {title}
      </h2>
      <div className="mt-3 space-y-2">
        {games.length ? (
          games.map((game) => (
            <CompactGameRow
              key={game.id || game.name}
              game={game}
              hoursMode={hoursMode}
              onClick={() => onSelectGame(game)}
            />
          ))
        ) : (
          <div className="rounded-xl border border-surface-border bg-surface-elevated/40 px-3 py-4 text-sm text-content-muted">
            {emptyTitle} {emptyDescription}
          </div>
        )}
      </div>
    </section>
  );
}

function CompactGameRow({ game, hoursMode, onClick }) {
  const finished = parseGameDate(game?.finished_at)?.value;
  const score = Number(game?.my_score);
  const hasScore = Number.isFinite(score) && score > 0;
  const hours = displayHours(game, hoursMode);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-colors hover:border-surface-border hover:bg-surface-elevated/70"
    >
      {game.cover ? (
        <img
          src={game.cover}
          alt=""
          loading="lazy"
          className="h-14 w-10 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-surface-elevated text-xs font-semibold text-content-muted">
          {String(game.name || "?").charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-content-primary">
          {game.name}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-content-muted">
          {game.status ? <StatusBadge status={game.status} /> : null}
          {finished ? <span>{finished}</span> : null}
          {hours ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              {hours}
            </span>
          ) : null}
          {hasScore ? <span>{score}/10</span> : null}
        </div>
      </div>
    </button>
  );
}

function QuickLinks({ isGuest }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const links = [
    { label: "Backlog", to: "/", icon: LibraryBig },
    { label: "Timeline", to: "/timeline", icon: CalendarDays },
    { label: "Lists", to: "/lists", icon: List },
    { label: "Insights", to: "/insights", icon: BarChart3 },
    { label: "Discover", to: "/discover", icon: Compass },
    ...(isGuest
      ? []
      : [
          { label: "Steam Library", to: "/steam/library", icon: Gamepad2 },
          { label: "Steam Import", to: "/steam/import", icon: Sparkles },
      ]),
  ];

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        Shortcuts
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </Button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 grid w-56 gap-1 rounded-2xl border border-surface-border bg-surface-card p-2 shadow-2xl">
          {links.map(({ label, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-elevated hover:text-content-primary"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
