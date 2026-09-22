import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Gamepad2, PlusCircle, SearchX, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useStatusGroups } from "../../contexts/StatusGroupsContext";
import GameGrid from "../../components/GameGrid";
import DemoBanner from "../../components/DemoBanner";
import { Button, EmptyState, useToast } from "../../components/ui";
import { AppPage, CollectionLoadingSkeleton, PageError } from "../../components/layout";
import { buildDisplayGames, isHoursFilterActive } from "../../utils/gameList";
import { NO_PERSONAL_GENRE_FILTER, NO_RAWG_GENRE_FILTER } from "../../utils/filterOptions";
import { canReorderGames } from "../../utils/permissions";
import { getManualReorderAvailability } from "../../utils/reorder";
import { normalizeUserPreferences } from "../../utils/userPreferences";
import useApplyFiltersFromQuery from "../../hooks/useApplyFiltersFromQuery";
import { useGames } from "../../hooks/useGames";
import { useStatuses } from "../../hooks/useStatuses";
import { useFilters } from "../../hooks/useFilters";
import { usePersonalGenres } from "../../hooks/usePersonalGenres";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import useMedia from "../../hooks/useMedia";
import BacklogModals from "./BacklogModals";
import BacklogPanels from "./BacklogPanels";
import BacklogTable from "./BacklogTable";
import BacklogToolbar from "./BacklogToolbar";
import useBacklogActions from "./useBacklogActions";
import useInfiniteGames, { invalidateFullBacklogCollection } from "./useInfiniteGames";
import { addToNextUp } from "../../services/nextUpService";
import useWishlist from "../Wishlist/useWishlist";
import { composeBacklogWishlist } from "../Wishlist/wishlistPresentation";

function possessiveName(value) {
  const name = String(value || "").trim();
  if (!name) return "Your";
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

const backlogApiSortKeys = {
  name: "name", status: "status", personalGenres: "personal_genres",
  estimatedHours: "estimated_hours", score: "score", hoursPlayed: "hours_played",
  rawgRating: "rawg_rating", metacritic: "metacritic", releaseDate: "release_date",
  addedDate: "added_date", startedDate: "started_date", finishedDate: "finished_date", steamLastPlayed: "steam_last_played",
};

export default function BacklogPage() {
  const {
    user,
    isAuthenticated,
    loading: authLoading,
    isGuest,
    discardDemo,
  } = useAuth();

  const nav = useNavigate();
  const toast = useToast();
  const loc = useLocation();
  const { rawStatusesForGroup } = useStatusGroups();

  const {
    games: legacyGames,
    loading: legacyGamesLoading,
    error: legacyGamesError,
    addGame: legacyAddGame,
    editGame: legacyEditGame,
    completeGame: legacyCompleteGame,
    removeGame: legacyRemoveGame,
    refresh: legacyRefresh,
    reorderGame: legacyReorderGame,
  } = useGames();
  const userPreferences = React.useMemo(
    () => normalizeUserPreferences(user?.preferences),
    [user?.preferences],
  );
  const wishlist = useWishlist({ userId: user?.id,
    enabled: userPreferences.show_wishlist_in_backlog && isAuthenticated && !isGuest,
  });
  const legacyPresentationGames = React.useMemo(() => composeBacklogWishlist(legacyGames,
    userPreferences.show_wishlist_in_backlog && !isGuest ? wishlist.items : []),
    [legacyGames, wishlist.items, userPreferences.show_wishlist_in_backlog, isGuest]);
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
  const { genres: reusablePersonalGenres } = usePersonalGenres(isAuthenticated);

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
    scoreFilter,
    setScoreFilter,
    ratedOnly,
    setRatedOnly,
    sourceFilter,
    setSourceFilter,
    rawgStatus,
    toggleRawgStatus,
    setRawgStatus,
    missingEstimatesOnly,
    setMissingEstimatesOnly,
    sortKey,
    setSortKey,
    isReversed,
    setIsReversed,
    toggleStatus,
    toggleGenre,
    toggleMyGenre,
    clearFilters,
    allGenres,
    allMyGenres: usedMyGenres,
    hoursBounds,
    hoursRange,
    setHoursRange,
  } = useFilters(legacyPresentationGames, {
    initialSortKey: userPreferences.default_backlog_sort_key,
    initialReverse: userPreferences.default_backlog_sort_reversed,
  });
  const debouncedQuery = useDebouncedValue(searchQuery, 120);
  const [deletedGameIds, setDeletedGameIds] = useState(() => new Set());
  useEffect(() => setDeletedGameIds(new Set()), [user?.id]);
  const requestParams = React.useMemo(() => ({
    q: debouncedQuery,
    sort: backlogApiSortKeys[sortKey] || "",
    direction: isReversed ? "desc" : "asc",
    status: selectedStatuses,
    genre: selectedGenres.filter((genre) => genre !== NO_RAWG_GENRE_FILTER),
    no_genre: selectedGenres.includes(NO_RAWG_GENRE_FILTER),
    personal_genre: selectedMyGenres.filter((genre) => genre !== NO_PERSONAL_GENRE_FILTER),
    no_personal_genre: selectedMyGenres.includes(NO_PERSONAL_GENRE_FILTER),
    min_hours: hoursRange?.min,
    max_hours: hoursRange?.max,
    date_type: dateFilter?.type,
    date_year: dateFilter?.year,
    date_months: dateFilter?.months,
    date_days: dateFilter?.days,
    score: scoreFilter,
    rated: ratedOnly,
    source: sourceFilter,
    rawg_status: rawgStatus,
    missing_estimates: missingEstimatesOnly,
  }), [debouncedQuery, sortKey, isReversed, selectedStatuses, selectedGenres,
    selectedMyGenres, hoursRange, dateFilter, scoreFilter, ratedOnly, sourceFilter,
    rawgStatus, missingEstimatesOnly]);
  const usePagedBacklog = !userPreferences.show_wishlist_in_backlog;
  const paged = useInfiniteGames({ userId: user?.id, enabled: usePagedBacklog && isAuthenticated, params: requestParams });
  const games = usePagedBacklog
    ? paged.games.filter((game) => !deletedGameIds.has(String(game.id)))
    : legacyGames;
  const presentationGames = usePagedBacklog ? games : legacyPresentationGames;
  const gamesLoading = usePagedBacklog ? paged.loading : legacyGamesLoading;
  const gamesError = usePagedBacklog ? paged.error : legacyGamesError;
  const refresh = async (options = {}) => {
    if (!usePagedBacklog) return legacyRefresh(options);
    invalidateFullBacklogCollection(user?.id);
    return paged.refresh({
      ...options,
      preserveLoaded: options.preserveLoaded ?? true,
    });
  };
  const addGame = async (payload) => {
    const created = await legacyAddGame(payload);
    if (usePagedBacklog && !isGuest) await refresh({ silent: true });
    return created;
  };
  const editGame = async (...args) => {
    const updated = await legacyEditGame(...args);
    if (usePagedBacklog) await refresh({ silent: true });
    return updated;
  };
  const completeGame = async (...args) => {
    const updated = await legacyCompleteGame(...args);
    if (usePagedBacklog) await refresh({ silent: true });
    return updated;
  };
  const removeGame = async (...args) => {
    const result = await legacyRemoveGame(...args);
    if (usePagedBacklog) {
      setDeletedGameIds((current) => {
        const next = new Set(current);
        next.add(String(args[0]));
        return next;
      });
      await refresh({ silent: true, force: true });
    }
    return result;
  };
  const reorderGame = async (...args) => {
    const result = await legacyReorderGame(...args);
    if (usePagedBacklog) await refresh({ silent: true });
    return result;
  };
  const selectGame = (game) => game.entryKind === "wishlist" ? nav(`/wishlist?item=${game.wishlistItemId}`) : setSelectedGame(game);
  const allMyGenres = React.useMemo(
    () =>
      Array.from(
        new Set([
          ...reusablePersonalGenres.map((genre) => genre.name),
          ...usedMyGenres,
        ]),
      ).sort((a, b) => a.localeCompare(b)),
    [reusablePersonalGenres, usedMyGenres],
  );
  const effectiveAllGenres = usePagedBacklog ? (paged.facets?.genres || []) : allGenres;
  const effectiveHoursBounds = usePagedBacklog
    ? (paged.facets?.hoursBounds || { min: 0, max: 0 })
    : hoursBounds;

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
    setScoreFilter,
    setRatedOnly,
    setMissingEstimatesOnly,
    allStatuses,
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const [selectedGame, setSelectedGame] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showKeepDemo, setShowKeepDemo] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
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
  const mainRef = useRef(null);
  const toolbarRef = useRef(null);
  const loadMoreRef = useRef(null);
  const isDesktopTable = useMedia("(min-width: 1024px)");

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!usePagedBacklog || !node || !paged.hasMore || paged.loading || paged.loadingMore) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void paged.loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isDesktopTable, paged.hasMore, paged.loadMore, paged.loading, paged.loadingMore, usePagedBacklog, viewMode]);

  const {
    newGame,
    setNewGame,
    surpriseGame,
    setSurpriseGame,
    editingGame,
    setEditingGame,
    finishingGame,
    setFinishingGame,
    handleDeleteGame,
    handleSurpriseMe,
    handleAddGame,
    startEditing,
    handleEditGame,
    handleRefreshMetadata,
    metadataRefreshingId,
    startFinishing,
    handleFinishGame,
    handleReorderGames,
    isAdding,
    isEditing,
    addFormError,
    editFormError,
    clearEditFormError,
  } = useBacklogActions({
    games,
    userId: user?.id,
    isAuthenticated,
    isGuest,
    addGame,
    editGame,
    completeGame,
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
    let onboardingSeen = false;
    try {
      onboardingSeen = !!localStorage.getItem("seen_onboarding_v1");
    } catch {}
    if (!authLoading && !isAuthenticated && loc.pathname === "/" && onboardingSeen) {
      setShowAuth(true);
    } else if (isAuthenticated) {
      setShowAuth(false);
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
    return () => {
      ro.disconnect();
      setVar(0);
    };
  }, [isGuest]);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    const main = mainRef.current;
    if (!toolbar || !main) return undefined;

    const updateToolbarHeight = () => {
      main.style.setProperty(
        "--backlog-toolbar-h",
        `${toolbar.getBoundingClientRect().height}px`,
      );
    };
    updateToolbarHeight();
    const observer = new ResizeObserver(updateToolbarHeight);
    observer.observe(toolbar);
    return () => {
      observer.disconnect();
      main.style.removeProperty("--backlog-toolbar-h");
    };
  }, []);

  // Clear state and remove query params so URL-driven filters do not re-apply.
  const resetFilters = () => {
    clearFilters();
    if (usePagedBacklog) setHoursRange(null);
    nav(loc.pathname, { replace: true });
  };
  const clearInsightYearFilter = React.useCallback(() => {
    setDateFilter((current) => current?.type === "touchedYear" ? null : current);
    const params = new URLSearchParams(loc.search);
    params.delete("insightsYear");
    nav({ pathname: loc.pathname, search: params.toString() }, { replace: true });
  }, [loc.pathname, loc.search, nav, setDateFilter]);
  const clearScoreFilter = React.useCallback(() => {
    setScoreFilter(null);
    const params = new URLSearchParams(loc.search);
    params.delete("score");
    nav({ pathname: loc.pathname, search: params.toString() }, { replace: true });
  }, [loc.pathname, loc.search, nav, setScoreFilter]);
  const clearRatedFilter = React.useCallback(() => {
    setRatedOnly(false);
    const params = new URLSearchParams(loc.search);
    params.delete("rated");
    nav({ pathname: loc.pathname, search: params.toString() }, { replace: true });
  }, [loc.pathname, loc.search, nav, setRatedOnly]);

  const handleAddToNextUp = async (game) => {
    try {
      const payload = await addToNextUp(game.id);
      toast.success(
        `${game.displayName || game.name} added to the shortlist at position ${payload.position + 1}.`,
      );
    } catch (error) {
      toast.error(error.message || "Could not add this game to the shortlist.");
    }
  };

  const clearSearch = () => setSearchQuery("");
  const clearSort = () => {
    setSortKey("");
    setIsReversed(false);
  };
  if (authLoading || (gamesLoading && (!usePagedBacklog || !paged.saved))) {
    return <CollectionLoadingSkeleton viewMode={viewMode} />;
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
    : usePagedBacklog
      ? presentationGames
      : buildDisplayGames({
        games: presentationGames,
        searchQuery: debouncedQuery,
        selectedStatuses,
        selectedGenres,
        selectedMyGenres,
        hoursRange,
        hoursBounds,
        dateFilter,
        scoreFilter,
        ratedOnly,
        sourceFilter,
        rawgStatus,
        missingEstimatesOnly,
        sortKey,
        isReversed,
      });

  const canReorder = canReorderGames({ user, isAuthenticated });
  const hasHoursFilter = Boolean(
    effectiveHoursBounds?.max > effectiveHoursBounds?.min &&
      hoursRange &&
      (hoursRange.min > effectiveHoursBounds.min || hoursRange.max < effectiveHoursBounds.max),
  );
  const activeFilterCount =
    selectedStatuses.length +
    selectedGenres.length +
    selectedMyGenres.length +
    (dateFilter ? 1 : 0) +
    (scoreFilter != null ? 1 : 0) +
    (ratedOnly ? 1 : 0) +
    (sourceFilter !== "all" ? 1 : 0) +
    (rawgStatus !== "all" ? 1 : 0) +
    (missingEstimatesOnly ? 1 : 0) +
    (hasHoursFilter ? 1 : 0);
  const hasActiveFilters = Boolean(
    searchQuery ||
      selectedStatuses.length ||
      selectedGenres.length ||
      selectedMyGenres.length ||
      dateFilter ||
      scoreFilter != null ||
      ratedOnly ||
      sourceFilter !== "all" ||
      rawgStatus !== "all" ||
      missingEstimatesOnly ||
      hasHoursFilter,
  );
  const hasPartialReorderFilters = Boolean(
    searchQuery ||
      selectedGenres.length ||
      selectedMyGenres.length ||
      dateFilter ||
      scoreFilter != null ||
      ratedOnly ||
      sourceFilter !== "all" ||
      rawgStatus !== "all" ||
      missingEstimatesOnly ||
      hasHoursFilter,
  );
  const manualReorder = getManualReorderAvailability({
    allGames: games,
    visibleGames: displayGames,
    canReorder,
    sortKey,
    isReversed,
    hasPartialFilters: hasPartialReorderFilters,
    hasNonBacklogEntries: displayGames.some((game) => game.entryKind === "wishlist"),
    busy: isReordering || (usePagedBacklog && (paged.loading || paged.loadingMore || paged.transitioning)),
  });
  const reorderEnabled = manualReorder.enabled;
  const reorderUnavailableMessages = {
    busy: "Manual reordering will return when the current update finishes.",
    filters: "Clear search and filters to reorder games.",
    "mixed-collection": "Manual reordering is unavailable while Wishlist items are shown in Backlog.",
    sort: "Manual reordering uses Default order with descending turned off.",
    "incomplete-ranks": "Manual reordering is unavailable because this view hides other games in the same status group.",
  };
  const reorderUnavailableMessage = reorderUnavailableMessages[manualReorder.reason];
  const performReorder = async (...args) => {
    if (isReordering) return;
    setIsReordering(true);
    try {
      await handleReorderGames(...args);
    } finally {
      setIsReordering(false);
    }
  };

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
        <main ref={mainRef} className={mainClass}>
          <div
            ref={toolbarRef}
            className="sticky top-[calc(var(--mobile-header-h,3.5rem)+var(--demo-banner-h,0px))] z-30 bg-surface-bg lg:top-0"
          >
            <BacklogToolbar
              showNotifications
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
                allStatuses: userPreferences.show_wishlist_in_backlog ? [...allStatuses, "wishlist"] : allStatuses,
                allGenres: effectiveAllGenres,
                allMyGenres,
                selectedStatuses,
                selectedGenres,
                selectedMyGenres,
                dateFilter,
                setDateFilter,
                scoreFilter,
                setScoreFilter,
                ratedOnly,
                setRatedOnly,
                sourceFilter,
                setSourceFilter,
                rawgStatus,
                toggleRawgStatus,
                setRawgStatus,
                setSelectedStatuses,
                setSelectedGenres,
                setSelectedMyGenres,
                toggleStatus,
                toggleGenre,
                toggleMyGenre,
                hoursBounds: effectiveHoursBounds,
                hoursRange,
                setHoursRange,
                missingEstimatesOnly,
                clearInsightYearFilter,
                clearScoreFilter,
                clearRatedFilter,
                clear: resetFilters,
              }}
              actions={{
                add: () =>
                  isAuthenticated ? setShowAddForm(true) : setShowAuth(true),
                surprise: handleSurpriseMe,
                completedActive,
                toggleCompleted,
              }}
              viewMode={viewMode}
              setViewMode={setViewMode}
              resultCount={usePagedBacklog ? (paged.total || 0) : displayGames.length}
              totalCount={usePagedBacklog ? (paged.facets?.collectionTotal ?? paged.total ?? 0) : presentationGames.length}
              games={presentationGames}
              onSelectGame={selectGame}
              mobileControlsOpen={mobileControlsOpen}
              setMobileControlsOpen={setMobileControlsOpen}
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
          {/* Card views use the page scrollbar; Table uses a bounded sticky-header scroller. */}
          <div
            className="mx-auto w-full max-w-[1760px]"
            aria-busy={usePagedBacklog && paged.transitioning ? "true" : undefined}
          >
            {usePagedBacklog && paged.refreshError ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-state-warning/35 bg-state-warning/10 px-3 py-2 text-sm text-state-warning" role="alert">
                <span>Could not refresh this view. Your loaded games are still available.</span>
                <Button size="sm" variant="ghost" onClick={() => refresh({ silent: true })}>Try again</Button>
              </div>
            ) : null}
            {wishlist.error ? <PageError title="Could not load wishlist" description={wishlist.error} onRetry={wishlist.refresh} /> : null}
            {displayGames.length ? (
              viewMode === "table" && isDesktopTable ? (
                <BacklogTable
                  games={displayGames}
                  onSelectGame={selectGame}
                  onEditGame={(game) => {
                    setSelectedGame(game);
                    startEditing(game);
                  }}
                  onDeleteGame={handleDeleteGame}
                  onFinishGame={startFinishing}
                  onAddToNextUp={handleAddToNextUp}
                  onReorder={reorderEnabled ? performReorder : null}
                  canManage={canReorder}
                  sortKey={sortKey}
                  setSortKey={setSortKey}
                  isReversed={isReversed}
                  setIsReversed={setIsReversed}
                  loadMore={usePagedBacklog ? {
                    hasMore: paged.hasMore,
                    loading: paged.loadingMore,
                    onLoadMore: paged.loadMore,
                    ref: loadMoreRef,
                    label: `Load more (${games.length} of ${paged.total})`,
                  } : undefined}
                />
              ) : (
                <GameGrid
                  games={displayGames}
                  onSelectGame={selectGame}
                  onEditGame={(game) => {
                    setSelectedGame(game);
                    startEditing(game);
                  }}
                  onDeleteGame={handleDeleteGame}
                  onFinishGame={startFinishing}
                  onAddToNextUp={handleAddToNextUp}
                  onReorder={reorderEnabled ? performReorder : null}
                  canManage={canReorder}
                  viewMode={viewMode === "table" ? "list" : viewMode}
                />
              )
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
                      variant="dangerGhost"
                      onClick={resetFilters}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
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
            {usePagedBacklog && paged.loadMoreError ? (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm text-state-warning" role="alert">
                <span>{paged.loadMoreError}</span>
                <Button size="sm" variant="secondary" onClick={paged.loadMore}>Retry</Button>
              </div>
            ) : null}
            {usePagedBacklog && paged.hasMore && !(viewMode === "table" && isDesktopTable) ? (
              <div ref={loadMoreRef} className="mt-6 flex min-h-16 items-center justify-center">
                <Button variant="secondary" disabled={paged.loadingMore} onClick={paged.loadMore}>
                  {paged.loadingMore ? "Loading more..." : `Load more (${games.length} of ${paged.total})`}
                </Button>
              </div>
            ) : null}
            {canReorder && !reorderEnabled && reorderUnavailableMessage && displayGames.length > 1 ? (
              <p className="mx-auto mt-3 max-w-[1760px] px-2 text-xs text-content-muted sm:px-0">
                {reorderUnavailableMessage}
              </p>
            ) : null}
          </div>


          <BacklogModals
            selectedGame={selectedGame}
            onCloseSelectedGame={() => setSelectedGame(null)}
            onSelectedGameUpdated={setSelectedGame}
            onSteamLinked={() => refresh({ silent: true })}
            onEditSelectedGame={(game) => {
              startEditing(game);
            }}
            surpriseGame={surpriseGame}
            onCloseSurpriseGame={() => setSurpriseGame(null)}
            onRefreshSurpriseGame={handleSurpriseMe}
            editingGame={editingGame}
            onSubmitEditGame={handleEditGame}
            finishingGame={finishingGame}
            onCloseFinishGame={() => setFinishingGame(null)}
            onSubmitFinishGame={handleFinishGame}
            onFinishSelectedGame={startFinishing}
            onCancelEditGame={() => setEditingGame(null)}
            onEditDraftChange={clearEditFormError}
            editFormError={editFormError}
            isEditing={isEditing}
            statuses={allStatuses}
            allMyGenres={allMyGenres}
            onAddToNextUp={handleAddToNextUp}
            onDeleteGame={handleDeleteGame}
            onRefreshMetadata={isAuthenticated && !isGuest ? handleRefreshMetadata : null}
            metadataRefreshingId={metadataRefreshingId}
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
