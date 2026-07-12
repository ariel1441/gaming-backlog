import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Gamepad2, PlusCircle, SearchX } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useStatusGroups } from "../../contexts/StatusGroupsContext";
import GameGrid from "../../components/GameGrid";
import DemoBanner from "../../components/DemoBanner";
import { Button, EmptyState } from "../../components/ui";
import { AppPage, PageError, PageLoading } from "../../components/layout";
import { buildDisplayGames } from "../../utils/gameList";
import { canReorderGames } from "../../utils/permissions";
import { normalizeUserPreferences } from "../../utils/userPreferences";
import useApplyFiltersFromQuery from "../../hooks/useApplyFiltersFromQuery";
import { useGames } from "../../hooks/useGames";
import { useStatuses } from "../../hooks/useStatuses";
import { useFilters } from "../../hooks/useFilters";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import BacklogModals from "./BacklogModals";
import BacklogPanels from "./BacklogPanels";
import BacklogToolbar from "./BacklogToolbar";
import useBacklogActions from "./useBacklogActions";

function possessiveName(value) {
  const name = String(value || "").trim();
  if (!name) return "Your";
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

export default function BacklogPage() {
  const {
    user,
    isAuthenticated,
    loading: authLoading,
    isGuest,
    discardDemo,
  } = useAuth();

  const nav = useNavigate();
  const loc = useLocation();
  const { rawStatusesForGroup } = useStatusGroups();

  const {
    games,
    loading: gamesLoading,
    error: gamesError,
    addGame,
    editGame,
    removeGame,
    refresh,
    reorderGame,
  } = useGames();
  const userPreferences = React.useMemo(
    () => normalizeUserPreferences(user?.preferences),
    [user?.preferences],
  );
  const backlogTitle = React.useMemo(() => {
    if (!isAuthenticated) return "Backlog";
    if (isGuest) return "Your demo backlog";
    const ownerName = user?.display_name?.trim() || user?.username;
    return `${possessiveName(ownerName)} backlog`;
  }, [isAuthenticated, isGuest, user?.display_name, user?.username]);

  const {
    statuses: allStatuses,
    loading: statusesLoading,
    error: statusesError,
    refresh: refreshStatuses,
  } = useStatuses();

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
    sourceFilter,
    setSourceFilter,
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
  } = useFilters(games, {
    initialSortKey: userPreferences.default_backlog_sort_key,
    initialReverse: userPreferences.default_backlog_sort_reversed,
  });

  const completedStatuses = React.useMemo(
    () => rawStatusesForGroup("done"),
    [rawStatusesForGroup],
  );

  const completedActive = React.useMemo(() => {
    const set = new Set(
      (selectedStatuses || []).map((s) => String(s).toLowerCase()),
    );
    return (
      set.size === completedStatuses.length &&
      completedStatuses.every((s) => set.has(s))
    );
  }, [completedStatuses, selectedStatuses]);

  const toggleCompleted = React.useCallback(() => {
    if (completedActive) {
      setSelectedStatuses([]);
    } else {
      setSelectedStatuses(completedStatuses);
    }
  }, [completedActive, completedStatuses, setSelectedStatuses]);

  // Apply URL filters from insights/status/genre links.
  useApplyFiltersFromQuery({
    setSelectedStatuses,
    setSelectedGenres,
    setSelectedMyGenres,
    setDateFilter,
  });

  const debouncedQuery = useDebouncedValue(searchQuery, 120);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const [selectedGame, setSelectedGame] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showKeepDemo, setShowKeepDemo] = useState(false);
  const [viewMode, setViewMode] = useState(
    userPreferences.default_backlog_view,
  );

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    setViewMode(userPreferences.default_backlog_view);
    setSortKey(userPreferences.default_backlog_sort_key);
    setIsReversed(userPreferences.default_backlog_sort_reversed);
  }, [
    authLoading,
    isAuthenticated,
    setIsReversed,
    setSortKey,
    user?.id,
    userPreferences.default_backlog_sort_key,
    userPreferences.default_backlog_sort_reversed,
    userPreferences.default_backlog_view,
  ]);

  const addFormRef = useRef(null);
  const bannerRef = useRef(null);

  const {
    newGame,
    setNewGame,
    surpriseGame,
    setSurpriseGame,
    editingGame,
    setEditingGame,
    handleDeleteGame,
    handleSurpriseMe,
    handleAddGame,
    startEditing,
    handleEditGame,
    handleReorderGames,
    isAdding,
    isEditing,
    addFormError,
    editFormError,
    clearEditFormError,
  } = useBacklogActions({
    games,
    isAuthenticated,
    isGuest,
    addGame,
    editGame,
    removeGame,
    refresh,
    reorderGame,
    setShowAddForm,
  });

  useEffect(() => {
    let seen = false;
    try {
      seen = !!localStorage.getItem("seen_onboarding_v1");
    } catch {}
    setShowOnboarding(!isAuthenticated && loc.pathname === "/" && !seen);
  }, [isAuthenticated, loc.pathname]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated && loc.pathname === "/") {
      setShowAuth(true);
    }
  }, [authLoading, isAuthenticated, loc.pathname, setShowAuth]);

  useLayoutEffect(() => {
    const setVar = (px) =>
      document.documentElement.style.setProperty("--demo-banner-h", `${px}px`);
    if (!isGuest) {
      setVar(0);
      return;
    }
    if (!bannerRef.current) {
      setVar(0);
      return;
    }
    const ro = new ResizeObserver(([entry]) =>
      setVar(entry?.contentRect?.height || 0),
    );
    ro.observe(bannerRef.current);
    return () => ro.disconnect();
  }, [isGuest]);

  // Clear state and remove query params so URL-driven filters do not re-apply.
  const resetFilters = () => {
    clearFilters();
    nav(loc.pathname, { replace: true });
  };

  const clearSearch = () => setSearchQuery("");
  const clearSort = () => {
    setSortKey("");
    setIsReversed(false);
  };
  if (authLoading || gamesLoading) {
    return (
      <AppPage width="full" className="py-8">
        <PageLoading rows={5} />
      </AppPage>
    );
  }

  // NEW: treat auth errors as "guest" (no fatal screen)
  const isAuthError =
    gamesError && (gamesError.status === 401 || gamesError.status === 403);

  // Keep previous behavior for non-auth errors
  if (gamesError && !isAuthError) {
    return (
      <AppPage width="standard" className="py-8">
        <PageError
          title="Could not load your backlog"
          description={String(gamesError?.message || gamesError)}
          onRetry={() => refresh().catch(() => {})}
        />
      </AppPage>
    );
  }

  const displayGames = isAuthError
    ? []
    : buildDisplayGames({
        games,
        searchQuery: debouncedQuery,
        selectedStatuses,
        selectedGenres,
        selectedMyGenres,
        hoursRange,
        hoursBounds,
        dateFilter,
        sourceFilter,
        sortKey,
        isReversed,
      });

  const canReorder = canReorderGames({ user, isAuthenticated });
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
    (sourceFilter !== "all" ? 1 : 0) +
    (hasHoursFilter ? 1 : 0);
  const hasActiveFilters = Boolean(
    searchQuery ||
      selectedStatuses.length ||
      selectedGenres.length ||
      selectedMyGenres.length ||
      dateFilter ||
      sourceFilter !== "all" ||
      hasHoursFilter,
  );
  const reorderEnabled =
    canReorder && !hasActiveFilters && !sortKey && !isReversed;

  // removed guest-only extra top padding; wrapper handles it now
  const mainClass =
    "min-h-screen overflow-x-clip bg-surface-bg px-3 pb-8 text-content-primary sm:px-6 lg:h-[calc(100vh-var(--demo-banner-h,0px))] lg:min-h-0 lg:overflow-y-auto lg:px-5 lg:pb-8";

  return (
    <>
      {/* Fixed banner outside the flex row; measured by ResizeObserver */}
      {isGuest && (
        <div ref={bannerRef} className="fixed inset-x-0 top-0 z-[60]">
          <DemoBanner
            onSave={() => setShowKeepDemo(true)}
            onDiscard={discardDemo}
          />
        </div>
      )}

      {/* Single wrapper that applies top padding equal to the banner height */}
      <div className={isGuest ? "pt-[var(--demo-banner-h,0px)]" : ""}>
        <main className={mainClass}>
          <div className="sticky top-14 z-30 bg-surface-bg lg:top-0">
            <BacklogToolbar
              identity={{ title: backlogTitle }}
              search={{
                query: searchQuery,
                setQuery: setSearchQuery,
                clear: clearSearch,
              }}
              sort={{
                key: sortKey,
                setKey: setSortKey,
                isReversed,
                setIsReversed,
                clear: clearSort,
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
                sourceFilter,
                setSourceFilter,
                setSelectedStatuses,
                setSelectedGenres,
                setSelectedMyGenres,
                toggleStatus,
                toggleGenre,
                toggleMyGenre,
                hoursBounds,
                hoursRange,
                setHoursRange,
                clear: resetFilters,
              }}
              actions={{
                add: () =>
                  isAuthenticated
                    ? setShowAddForm(true)
                    : setShowAuth(true),
                surprise: handleSurpriseMe,
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
          </div>
          <BacklogPanels
            showAddGame={showAddForm}
            addFormRef={addFormRef}
            addGame={{
              newGame,
              setNewGame,
              handleSubmit: handleAddGame,
              isSubmitting: isAdding,
              allStatuses,
              statusesLoading,
              statusesError,
              refreshStatuses,
              allMyGenres,
              formError: addFormError,
              onClose: () => setShowAddForm(false),
            }}
          />
          {/* The page owns the full-height scrollbar while the toolbar remains sticky. */}
          <div className="mx-auto w-full max-w-[1760px]">
            {displayGames.length ? (
              <GameGrid
                games={displayGames}
                onSelectGame={setSelectedGame}
                onEditGame={startEditing}
                onDeleteGame={handleDeleteGame}
                onReorder={reorderEnabled ? handleReorderGames : null}
                canManage={canReorder}
                viewMode={viewMode}
              />
            ) : (
              <EmptyState
                icon={hasActiveFilters ? SearchX : Gamepad2}
                title={
                  hasActiveFilters
                    ? "No games match this view."
                    : "Your backlog is ready."
                }
                description={
                  hasActiveFilters
                    ? "Clear the current search and filters to bring the full library back."
                    : "Add the first game and the grid will start filling in with covers, ratings, dates, and your own notes."
                }
                action={
                  hasActiveFilters ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={resetFilters}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() =>
                        isAuthenticated
                          ? setShowAddForm(true)
                          : setShowAuth(true)
                      }
                    >
                      <PlusCircle className="h-4 w-4" aria-hidden="true" />
                      {isAuthenticated ? "Add game" : "Sign in to add games"}
                    </Button>
                  )
                }
                className="mx-auto max-w-3xl"
              />
            )}
            {canReorder && !reorderEnabled && displayGames.length > 1 ? (
              <p className="mx-auto mt-3 max-w-[1760px] px-2 text-xs text-content-muted sm:px-0">
                Manual reordering is available after clearing search, filters,
                alternate sorting, and reverse order.
              </p>
            ) : null}
          </div>

          <BacklogModals
            selectedGame={selectedGame}
            onCloseSelectedGame={() => setSelectedGame(null)}
            onSteamLinked={() => refresh({ silent: true })}
            onEditSelectedGame={(game) => {
              setSelectedGame(null);
              startEditing(game);
            }}
            surpriseGame={surpriseGame}
            onCloseSurpriseGame={() => setSurpriseGame(null)}
            onRefreshSurpriseGame={handleSurpriseMe}
            editingGame={editingGame}
            onSubmitEditGame={handleEditGame}
            onCancelEditGame={() => setEditingGame(null)}
            onEditDraftChange={clearEditFormError}
            editFormError={editFormError}
            isEditing={isEditing}
            statuses={allStatuses}
            allMyGenres={allMyGenres}
            showAuth={showAuth}
            onCloseAuth={() => setShowAuth(false)}
            showOnboarding={showOnboarding}
            onCloseOnboarding={() => setShowOnboarding(false)}
            onShowAuth={() => setShowAuth(true)}
            showKeepDemo={showKeepDemo}
            onCloseKeepDemo={() => setShowKeepDemo(false)}
          />
        </main>
      </div>
    </>
  );
}
