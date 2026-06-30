import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Gamepad2, PlusCircle, RefreshCw, SearchX } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import GameGrid from "../../components/GameGrid";
import DemoBanner from "../../components/DemoBanner";
import { Button, EmptyState } from "../../components/ui";
import { buildDisplayGames } from "../../utils/gameList";
import { canReorderGames } from "../../utils/permissions";
import useApplyFiltersFromQuery from "../../hooks/useApplyFiltersFromQuery";
import { useGames } from "../../hooks/useGames";
import { useStatuses } from "../../hooks/useStatuses";
import { useFilters } from "../../hooks/useFilters";
import { useUI } from "../../hooks/useUI";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import BacklogModals from "./BacklogModals";
import BacklogPanels from "./BacklogPanels";
import BacklogToolbar from "./BacklogToolbar";
import useBacklogActions from "./useBacklogActions";

export default function BacklogPage() {
  const {
    user,
    isAuthenticated,
    loading: authLoading,
    isGuest,
    discardDemo,
    logout,
    startDemo,
  } = useAuth();

  const nav = useNavigate();
  const loc = useLocation();

  const {
    games,
    loading: gamesLoading,
    error: gamesError,
    addGame,
    editGame,
    removeGame,
    updateFavorites,
    refresh,
    reorderGame,
  } = useGames();

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
    initialSortKey: "",
    initialReverse: false,
    statuses: allStatuses,
  });

  // Quick filter: Completed (finished + played alot but didnt finish)
  const COMPLETED_STATUSES = ["finished", "played alot but didnt finish"];

  const completedActive = React.useMemo(() => {
    const set = new Set(
      (selectedStatuses || []).map((s) => String(s).toLowerCase())
    );
    return (
      set.size === COMPLETED_STATUSES.length &&
      COMPLETED_STATUSES.every((s) => set.has(s))
    );
  }, [selectedStatuses]);

  const toggleCompleted = React.useCallback(() => {
    if (completedActive) {
      setSelectedStatuses([]);
    } else {
      setSelectedStatuses(COMPLETED_STATUSES);
    }
  }, [completedActive, setSelectedStatuses]);

  // Apply URL filters from insights/status/genre links.
  useApplyFiltersFromQuery({
    setSelectedStatuses,
    setSelectedGenres,
    setSelectedMyGenres,
    setDateFilter,
  });

  const debouncedQuery = useDebouncedValue(searchQuery, 120);

  const {
    showAddForm,
    setShowAddForm,
    showPublicSettings,
    setShowPublicSettings,
    showAdminLogin,
    setShowAdminLogin,
  } = useUI({ sidebarOpen: true });

  const [selectedGame, setSelectedGame] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showKeepDemo, setShowKeepDemo] = useState(false);
  const [viewMode, setViewMode] = useState("grid");

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
    updateFavorites,
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
      setShowAdminLogin(true);
    }
  }, [authLoading, isAuthenticated, loc.pathname, setShowAdminLogin]);

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
      setVar(entry?.contentRect?.height || 0)
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
  const goInsights = () => nav("/insights");
  const goDiscover = () => nav("/discover");
  const startLiveDemo = async () => {
    await startDemo();
  };

  if (authLoading || gamesLoading) {
    return (
      <div className="flex h-screen bg-surface-bg text-content-primary items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-primary"></div>
      </div>
    );
  }

  // NEW: treat auth errors as "guest" (no fatal screen)
  const isAuthError =
    gamesError && (gamesError.status === 401 || gamesError.status === 403);

  // Keep previous behavior for non-auth errors
  if (gamesError && !isAuthError) {
    return (
      <div className="flex h-screen bg-surface-bg text-content-primary items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Could not load your backlog</h1>
          <p className="mt-3 text-sm text-content-secondary">
            {String(gamesError?.message || gamesError)}
          </p>
          <Button
            className="mt-6"
            variant="primary"
            onClick={() => refresh().catch(() => {})}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Try again
          </Button>
        </div>
      </div>
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
        sortKey,
        isReversed,
      });

  const canReorder = canReorderGames({ user, isAuthenticated });
  const hasHoursFilter = Boolean(
    hoursBounds?.max > hoursBounds?.min &&
      hoursRange &&
      (hoursRange.min > hoursBounds.min || hoursRange.max < hoursBounds.max)
  );
  const activeFilterCount =
    selectedStatuses.length +
    selectedGenres.length +
    selectedMyGenres.length +
    (dateFilter ? 1 : 0) +
    (hasHoursFilter ? 1 : 0);
  const hasActiveFilters = Boolean(
    searchQuery ||
      selectedStatuses.length ||
      selectedGenres.length ||
      selectedMyGenres.length ||
      dateFilter ||
      hasHoursFilter
  );

  // removed guest-only extra top padding; wrapper handles it now
  const mainClass =
    "h-screen bg-surface-bg text-content-primary overflow-auto max-w-[100vw] px-2 py-0 sm:px-6 pb-[env(safe-area-inset-bottom)]";

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
          <BacklogToolbar
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
                  : setShowAdminLogin(true),
              surprise: handleSurpriseMe,
              completedActive,
              toggleCompleted,
            }}
            account={{
              user,
              isAuthenticated,
              showLogin: () => setShowAdminLogin(true),
              showPublicSettings: () => setShowPublicSettings(true),
              goInsights,
              goDiscover,
              startDemo: startLiveDemo,
              logout,
            }}
            viewMode={viewMode}
            setViewMode={setViewMode}
            resultCount={displayGames.length}
            totalCount={games.length}
            games={games}
            onSelectGame={setSelectedGame}
          />
          <BacklogPanels
            visibility={{
              search: false,
              sort: false,
              filters: false,
              addGame: showAddForm,
            }}
            refs={{ addFormRef }}
            search={{
              query: searchQuery,
              setQuery: setSearchQuery,
              clear: clearSearch,
              resultCount: displayGames.length,
            }}
            sort={{
              key: sortKey,
              setKey: setSortKey,
              isReversed,
              setIsReversed,
              clear: clearSort,
            }}
            filters={{
              allStatuses,
              allGenres,
              allMyGenres,
              selectedStatuses,
              selectedGenres,
              selectedMyGenres,
              dateFilter,
              setDateFilter,
              hoursBounds,
              hoursRange,
              setHoursRange,
              setSelectedStatuses,
              setSelectedGenres,
              setSelectedMyGenres,
              reset: resetFilters,
              toggleStatus,
              toggleGenre,
              toggleMyGenre,
              onClose: () => {},
            }}
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
          {/* Main content */}
          {displayGames.length ? (
            <GameGrid
              games={displayGames}
              onSelectGame={setSelectedGame}
              onEditGame={startEditing}
              onDeleteGame={handleDeleteGame}
              onReorder={canReorder ? handleReorderGames : null}
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
                  <Button type="button" variant="secondary" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() =>
                      isAuthenticated
                        ? setShowAddForm(true)
                        : setShowAdminLogin(true)
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

          <BacklogModals
            selectedGame={selectedGame}
            onCloseSelectedGame={() => setSelectedGame(null)}
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
            games={games}
            onUpdateFavorites={updateFavorites}
            showAdminLogin={showAdminLogin}
            onCloseAdminLogin={() => setShowAdminLogin(false)}
            showPublicSettings={showPublicSettings}
            onClosePublicSettings={() => setShowPublicSettings(false)}
            showOnboarding={showOnboarding}
            onCloseOnboarding={() => setShowOnboarding(false)}
            onShowAuth={() => setShowAdminLogin(true)}
            showKeepDemo={showKeepDemo}
            onCloseKeepDemo={() => setShowKeepDemo(false)}
          />
        </main>
      </div>
    </>
  );
}

