import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Copy,
  Gamepad2,
  LibraryBig,
  LockKeyhole,
} from "lucide-react";
import GameGrid from "../components/GameGrid";
import GameModal from "../components/GameModal";
import ProfileSnapshot from "../components/ProfileSnapshot";
import BacklogToolbar from "./Backlog/BacklogToolbar";
import {
  AppPage,
  PageError,
  PageHeader,
  PageSection,
} from "../components/layout";
import { Button, EmptyState, useToast } from "../components/ui";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useFilters } from "../hooks/useFilters";
import { useStatuses } from "../hooks/useStatuses";
import { useStatusGroups } from "../contexts/StatusGroupsContext";
import { getPublicProfile, listPublicGames } from "../services/publicService";
import { buildDisplayGames } from "../utils/gameList";

export default function PublicProfile() {
  const { username } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [viewMode, setViewMode] = useState("grid");
  const isGamesView = searchParams.get("view") === "games";
  const { rawStatusesForGroup } = useStatusGroups();
  const completedStatuses = useMemo(
    () => rawStatusesForGroup("done"),
    [rawStatusesForGroup],
  );

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setError("");
        setIsPrivate(false);
        const [profileData, gameData] = await Promise.all([
          getPublicProfile(username, { signal: ac.signal, auth: false }),
          listPublicGames(username, { signal: ac.signal, auth: false }),
        ]);

        setProfile(profileData || null);
        const list = (
          Array.isArray(gameData)
            ? gameData
            : Array.isArray(gameData?.games)
              ? gameData.games
              : []
        ).map((game) => ({
          ...game,
          rawgRating: game.rating ?? game.rawgRating ?? 0,
        }));
        setGames(list);
      } catch (err) {
        if (err.name !== "AbortError") {
          if (err.status === 403) setIsPrivate(true);
          else setError(err.message || "Failed to load");
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [retryKey, username]);

  const { statuses: apiStatuses } = useStatuses();
  const derivedStatuses = useMemo(() => {
    if (!games?.length) return [];
    const set = new Set(
      games.map((game) => String(game.status)).filter(Boolean),
    );
    return Array.from(set).sort();
  }, [games]);
  const allStatuses = apiStatuses?.length ? apiStatuses : derivedStatuses;

  const {
    searchQuery,
    setSearchQuery,
    selectedStatuses,
    setSelectedStatuses,
    selectedGenres,
    setSelectedGenres,
    selectedMyGenres,
    setSelectedMyGenres,
    dateFilter,
    setDateFilter,
    sortKey,
    setSortKey,
    isReversed,
    setIsReversed,
    toggleStatus,
    toggleGenre,
    toggleMyGenre,
    clearFilters,
    allGenres,
    allMyGenres,
    hoursBounds,
    hoursRange,
    setHoursRange,
  } = useFilters(games, { statuses: allStatuses });
  const debouncedQuery = useDebouncedValue(searchQuery, 120);
  const displayGames = buildDisplayGames({
    games,
    searchQuery: debouncedQuery,
    selectedStatuses,
    selectedGenres,
    selectedMyGenres,
    hoursRange,
    hoursBounds,
    dateFilter,
    sortKey,
    isReversed,
  });
  const hasHoursFilter = Boolean(
    hoursBounds?.max > hoursBounds?.min &&
      hoursRange &&
      (hoursRange.min > hoursBounds.min || hoursRange.max < hoursBounds.max),
  );
  const activeFilterCount =
    selectedStatuses.length +
    selectedGenres.length +
    selectedMyGenres.length +
    (dateFilter ? 1 : 0) +
    (hasHoursFilter ? 1 : 0);
  const hasActiveView = Boolean(searchQuery || activeFilterCount);
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/u/${profile?.username || username}`
      : `/u/${profile?.username || username}`;

  const copyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Public profile link copied.");
    } catch {
      toast.info(publicUrl, {
        title: "Copy this public profile link",
        duration: 7000,
      });
    }
  };
  const joinedAt = profile?.joined_at
    ? new Date(profile.joined_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  const completedActive = useMemo(() => {
    const set = new Set(
      (selectedStatuses || []).map((status) => String(status).toLowerCase()),
    );
    return (
      set.size === completedStatuses.length &&
      completedStatuses.every((status) => set.has(status))
    );
  }, [completedStatuses, selectedStatuses]);
  const toggleCompleted = () => {
    setSelectedStatuses(completedActive ? [] : completedStatuses);
  };
  const openGamesView = () => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set("view", "games");
      return params;
    });
  };
  const openProfileView = () => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete("view");
      return params;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-bg p-6 text-content-primary">
        <div className="mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center">
          <div className="w-full max-w-xl rounded-2xl border border-surface-border bg-surface-card p-6 shadow-panel">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 animate-pulse rounded-2xl bg-surface-elevated" />
              <div className="flex-1 space-y-3">
                <div className="h-5 w-44 animate-pulse rounded bg-surface-elevated" />
                <div className="h-3 w-64 animate-pulse rounded bg-surface-elevated/70" />
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="h-24 animate-pulse rounded-xl bg-surface-elevated/70" />
              <div className="h-24 animate-pulse rounded-xl bg-surface-elevated/70" />
              <div className="h-24 animate-pulse rounded-xl bg-surface-elevated/70" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isPrivate || (!error && profile && !profile.is_public)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-bg p-6 text-content-primary">
        <EmptyState
          icon={LockKeyhole}
          title="This profile is private."
          description="The owner has not made this backlog public."
          action={
            <Button as={Link} to="/" variant="secondary">
              Back to app
            </Button>
          }
          className="w-full max-w-lg"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-bg p-6 text-content-primary">
        <PageError
          title="Could not load this profile."
          description={error}
          onRetry={() => setRetryKey((value) => value + 1)}
          className="w-full max-w-lg"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-bg text-content-primary">
      <AppPage width="full" className="max-w-[100vw]">
        {isGamesView ? (
          <PublicGamesView
            profile={profile}
            games={games}
            displayGames={displayGames}
            joinedAt={joinedAt}
            copyPublicUrl={copyPublicUrl}
            onBackToProfile={openProfileView}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            sortKey={sortKey}
            setSortKey={setSortKey}
            isReversed={isReversed}
            setIsReversed={setIsReversed}
            activeFilterCount={activeFilterCount}
            allStatuses={allStatuses}
            allGenres={allGenres}
            allMyGenres={allMyGenres}
            selectedStatuses={selectedStatuses}
            selectedGenres={selectedGenres}
            selectedMyGenres={selectedMyGenres}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
            setSelectedStatuses={setSelectedStatuses}
            setSelectedGenres={setSelectedGenres}
            setSelectedMyGenres={setSelectedMyGenres}
            toggleStatus={toggleStatus}
            toggleGenre={toggleGenre}
            toggleMyGenre={toggleMyGenre}
            hoursBounds={hoursBounds}
            hoursRange={hoursRange}
            setHoursRange={setHoursRange}
            clearFilters={clearFilters}
            setSortKeyForClear={setSortKey}
            setIsReversedForClear={setIsReversed}
            completedActive={completedActive}
            toggleCompleted={toggleCompleted}
            viewMode={viewMode}
            setViewMode={setViewMode}
            hasActiveView={hasActiveView}
            onSelectGame={setSelectedGame}
          />
        ) : (
          <PublicProfileOverview
            profile={profile}
            games={games}
            joinedAt={joinedAt}
            publicUrl={publicUrl}
            onCopy={copyPublicUrl}
            onOpenGames={openGamesView}
            onSelectGame={setSelectedGame}
          />
        )}

        {selectedGame && (
          <GameModal
            game={selectedGame}
            onClose={() => setSelectedGame(null)}
            readOnly
          />
        )}
      </AppPage>
    </div>
  );
}

function PublicProfileOverview({
  profile,
  games,
  joinedAt,
  publicUrl,
  onCopy,
  onOpenGames,
  onSelectGame,
}) {
  return (
    <section className="mx-auto max-w-7xl px-2 sm:px-0">
      <ProfileSnapshot
        profile={profile}
        games={games}
        joinedAt={joinedAt}
        publicUrl={publicUrl}
        onCopy={onCopy}
        onOpenGames={onOpenGames}
        onSelectGame={onSelectGame}
      />
    </section>
  );
}

function PublicGamesView({
  profile,
  games,
  displayGames,
  joinedAt,
  copyPublicUrl,
  onBackToProfile,
  searchQuery,
  setSearchQuery,
  sortKey,
  setSortKey,
  isReversed,
  setIsReversed,
  activeFilterCount,
  allStatuses,
  allGenres,
  allMyGenres,
  selectedStatuses,
  selectedGenres,
  selectedMyGenres,
  dateFilter,
  setDateFilter,
  setSelectedStatuses,
  setSelectedGenres,
  setSelectedMyGenres,
  toggleStatus,
  toggleGenre,
  toggleMyGenre,
  hoursBounds,
  hoursRange,
  setHoursRange,
  clearFilters,
  setSortKeyForClear,
  setIsReversedForClear,
  completedActive,
  toggleCompleted,
  viewMode,
  setViewMode,
  hasActiveView,
  onSelectGame,
}) {
  return (
    <>
      <BacklogToolbar
        identity={{
          title: `@${profile.username}`,
          subtitle: `${profile.game_count} public games${
            joinedAt ? ` - joined ${joinedAt}` : ""
          }`,
          icon: LibraryBig,
          action: (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={copyPublicUrl}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Share
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="shrink-0"
                onClick={onBackToProfile}
              >
                Profile
              </Button>
              <Button as={Link} to="/" variant="ghost" className="shrink-0">
                Back to app
              </Button>
            </div>
          ),
        }}
        search={{
          query: searchQuery,
          setQuery: setSearchQuery,
          clear: () => setSearchQuery(""),
          placeholder: "Search this public backlog...",
        }}
        sort={{
          key: sortKey,
          setKey: setSortKey,
          isReversed,
          setIsReversed,
        }}
        filters={{
          count: activeFilterCount,
          allStatuses,
          allGenres,
          allMyGenres,
          selectedStatuses,
          selectedGenres,
          selectedMyGenres,
          dateFilter,
          setDateFilter,
          setSelectedStatuses,
          setSelectedGenres,
          setSelectedMyGenres,
          toggleStatus,
          toggleGenre,
          toggleMyGenre,
          hoursBounds,
          hoursRange,
          setHoursRange,
          clear: () => {
            setSearchQuery("");
            clearFilters();
            setSortKeyForClear("");
            setIsReversedForClear(false);
          },
        }}
        actions={{
          completedActive,
          toggleCompleted,
        }}
        viewMode={viewMode}
        setViewMode={setViewMode}
        resultCount={displayGames.length}
        totalCount={games.length}
        games={games}
        onSelectGame={onSelectGame}
      />

      <GameGrid
        games={displayGames}
        onSelectGame={onSelectGame}
        onReorder={null}
        viewMode={viewMode}
        emptyState={{
          icon: Gamepad2,
          title: hasActiveView
            ? "No public games match this view."
            : "No public games yet.",
          description: hasActiveView
            ? "Try changing the public filters or clearing the search."
            : "When this player shares games publicly, they will appear here.",
        }}
      />
    </>
  );
}
