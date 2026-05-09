import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Gamepad2,
  LibraryBig,
  LockKeyhole,
} from "lucide-react";
import GameGrid from "../components/GameGrid";
import GameModal from "../components/GameModal";
import BacklogToolbar from "./Backlog/BacklogToolbar";
import { Button, EmptyState } from "../components/ui";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useFilters } from "../hooks/useFilters";
import { useStatuses } from "../hooks/useStatuses";
import { getPublicProfile, listPublicGames } from "../services/publicService";
import { buildDisplayGames } from "../utils/gameList";

const COMPLETED_STATUSES = ["finished", "played alot but didnt finish"];

export default function PublicProfile() {
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedGame, setSelectedGame] = useState(null);
  const [viewMode, setViewMode] = useState("grid");

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setError("");
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
          setError(err.message || "Failed to load");
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [username]);

  const { statuses: apiStatuses } = useStatuses();
  const derivedStatuses = useMemo(() => {
    if (!games?.length) return [];
    const set = new Set(games.map((game) => String(game.status)).filter(Boolean));
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
    sortKey,
    isReversed,
  });
  const hasHoursFilter = Boolean(
    hoursBounds?.max > hoursBounds?.min &&
      hoursRange &&
      (hoursRange.min > hoursBounds.min || hoursRange.max < hoursBounds.max)
  );
  const activeFilterCount =
    selectedStatuses.length +
    selectedGenres.length +
    selectedMyGenres.length +
    (hasHoursFilter ? 1 : 0);
  const hasActiveView = Boolean(searchQuery || activeFilterCount);
  const joinedAt = profile?.joined_at
    ? new Date(profile.joined_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  const completedActive = useMemo(() => {
    const set = new Set(
      (selectedStatuses || []).map((status) => String(status).toLowerCase())
    );
    return (
      set.size === COMPLETED_STATUSES.length &&
      COMPLETED_STATUSES.every((status) => set.has(status))
    );
  }, [selectedStatuses]);
  const toggleCompleted = () => {
    setSelectedStatuses(completedActive ? [] : COMPLETED_STATUSES);
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

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-bg p-6 text-content-primary">
        <EmptyState
          icon={AlertTriangle}
          title="Could not load this profile."
          description={error}
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

  if (!profile?.is_public) {
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

  return (
    <div className="min-h-screen bg-surface-bg text-content-primary">
      <main className="h-screen max-w-[100vw] overflow-auto bg-surface-bg px-2 py-0 pb-[env(safe-area-inset-bottom)] text-content-primary sm:px-6">
        <BacklogToolbar
          identity={{
            title: `@${profile.username}`,
            subtitle: `${profile.game_count} public games${
              joinedAt ? ` - joined ${joinedAt}` : ""
            }`,
            icon: LibraryBig,
            action: (
              <Button as={Link} to="/" variant="ghost" className="shrink-0">
                Back to app
              </Button>
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
              setSortKey("");
              setIsReversed(false);
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
          onSelectGame={setSelectedGame}
        />

        <GameGrid
          games={displayGames}
          onSelectGame={setSelectedGame}
          onReorder={null}
          viewMode={viewMode}
          emptyState={{
            icon: Gamepad2,
            title:
              hasActiveView
                ? "No public games match this view."
                : "No public games yet.",
            description:
              hasActiveView
                ? "Try changing the public filters or clearing the search."
                : "When this player shares games publicly, they will appear here.",
          }}
        />

        {selectedGame && (
          <GameModal
            game={selectedGame}
            onClose={() => setSelectedGame(null)}
          />
        )}
      </main>
    </div>
  );
}
