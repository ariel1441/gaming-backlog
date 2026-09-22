import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, Percent } from "lucide-react";
import { priceSyncMessage } from '../utils/steamPrice';
import { Link, useSearchParams } from "react-router-dom";
import GameGrid from "../components/GameGrid";
import GameModal from "../components/GameModal";
import SteamSyncStatus from "../features/steam/SteamSyncStatus";
import { useSteamExperience } from "../features/steam/SteamExperienceContext";
import { AppPage, CollectionLoadingSkeleton, PageError } from "../components/layout";
import {
  Button,
  EmptyState,
  SelectMenu,
  useConfirm,
  useToast,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useStatuses } from "../hooks/useStatuses";
import { useFilters } from "../hooks/useFilters";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import useMedia from "../hooks/useMedia";
import { isHoursFilterActive } from "../utils/gameList";
import { NO_RAWG_GENRE_FILTER } from "../utils/filterOptions";
import {
  moveWishlistToBacklog,
  matchWishlistRawg,
  refreshWishlistMetadata,
  refreshWishlistMetadataItem,
  refreshWishlistPriceItem,
  syncWishlist,
} from "../services/wishlistService";
import { normalizeUserPreferences } from "../utils/userPreferences";
import BacklogToolbar from "./Backlog/BacklogToolbar";
import BacklogTable from "./Backlog/BacklogTable";
import WishlistCardFooter from "./Wishlist/WishlistCardFooter";
import useInfiniteWishlist from "./Wishlist/useInfiniteWishlist";
import {
  wishlistApiSort,
  wishlistItemsToGames,
  wishlistMetadataBatchMessage,
  wishlistSortOptions,
} from "./Wishlist/wishlistPresentation";

function metadataOutcomeMessage(outcome) {
  if (outcome?.status === "completed") return "RAWG data is available.";
  if (outcome?.status === "review") {
    return "Multiple RAWG matches need review. Use Match RAWG to choose one.";
  }
  if (outcome?.status === "failed") {
    return "RAWG refresh failed; try again later.";
  }
  if (outcome?.issue === "rawg_metadata_incomplete") {
    return "The RAWG match was found, but its metadata is still incomplete.";
  }
  return "No safe RAWG match was found. You can choose one with Match RAWG.";
}

const membershipOptions = [
  { value: "active", label: "Active wishlist" },
  { value: "removed", label: "Removed from Steam" },
  { value: "all", label: "All history" },
];

function possessiveName(value) {
  const name = String(value || "").trim();
  if (!name) return "Your";
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

export default function WishlistPage() {
  const { user, isAuthenticated, isGuest } = useAuth();
  const { statuses } = useStatuses();
  const toast = useToast();
  const experience = useSteamExperience();
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [priceAttentionOnly, setPriceAttentionOnly] = useState(false);
  const confirm = useConfirm();
  const [membership, setMembership] = useState("active");
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const filters = useFilters([], { initialSortKey: "providerOrder" });
  const debouncedQuery = useDebouncedValue(filters.searchQuery, 250);
  const [viewMode, setViewMode] = useState(
    normalizeUserPreferences(user?.preferences).default_backlog_view,
  );
  useEffect(() => {
    if (!user?.id) return;
    setViewMode(normalizeUserPreferences(user.preferences).default_backlog_view);
  }, [user?.id, user?.preferences?.default_backlog_view]);
  const [selectedId, setSelectedId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedItem = searchParams.get('item');
  useEffect(() => {
    if (requestedItem && /^\d+$/.test(requestedItem)) {
      setMembership('all');
      setSelectedId(`wishlist-${requestedItem}`);
    }
  }, [requestedItem]);
  const requestParams = useMemo(() => ({
    q: debouncedQuery,
    sort: wishlistApiSort(filters.sortKey),
    direction: filters.isReversed ? "desc" : "asc",
    genre: filters.selectedGenres.filter((genre) => genre !== NO_RAWG_GENRE_FILTER),
    no_genre: filters.selectedGenres.includes(NO_RAWG_GENRE_FILTER),
    rawg_status: filters.rawgStatus,
    min_hours: filters.hoursRange?.min,
    max_hours: filters.hoursRange?.max,
    on_sale: onSaleOnly,
    price_attention: priceAttentionOnly,
    item_id: requestedItem && /^\d+$/.test(requestedItem) ? requestedItem : undefined,
  }), [
    debouncedQuery,
    filters.hoursRange,
    filters.isReversed,
    filters.rawgStatus,
    filters.selectedGenres,
    filters.sortKey,
    onSaleOnly,
    priceAttentionOnly,
    requestedItem,
  ]);
  const state = useInfiniteWishlist({
    userId: user?.id,
    enabled: isAuthenticated && !isGuest,
    membership,
    params: requestParams,
  });
  const games = useMemo(() => wishlistItemsToGames(state.items), [state.items]);
  const closeDetails = () => {
    setSelectedId(null);
    if (requestedItem) setSearchParams({}, { replace: true });
  };
  const [syncing, setSyncing] = useState(false);
  const [metadataRefreshing, setMetadataRefreshing] = useState(false);
  const [metadataBulkRefreshing, setMetadataBulkRefreshing] = useState(false);
  const [metadataItemRefreshing, setMetadataItemRefreshing] = useState(null);
  const [priceItemRefreshing, setPriceItemRefreshing] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [moveStatus, setMoveStatus] = useState("plan to play");
  const syncRequest = useRef(null);
  const loadMoreRef = useRef(null);
  useEffect(() => () => syncRequest.current?.abort(), []);
  const isDesktop = useMedia("(min-width: 1024px)");
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !state.hasMore || state.loading || state.loadingMore) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void state.loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isDesktop, state.hasMore, state.loading, state.loadingMore, state.loadMore, viewMode]);
  const selected = games.find((game) => game.id === selectedId);
  const filterCount =
    Number(onSaleOnly) + Number(priceAttentionOnly) + filters.selectedGenres.length +
    Number(filters.rawgStatus !== "all") +
    (isHoursFilterActive(filters.hoursRange, state.facets?.hoursBounds) ? 1 : 0);
  const statusOptions = (statuses || [])
    .filter((status) => status.toLowerCase().trim() !== "wishlist")
    .map((status) => ({ value: status, label: status }));
  const setQuery = (value) => {
    filters.setSearchQuery(value);
  };
  const setSort = (value) => {
    filters.setSortKey(value);
    if (value === "discount") filters.setIsReversed(true);
  };
  const setReverse = (value) => {
    filters.setIsReversed(value);
  };

  const runSync = async (confirmEmpty = false, prices = false) => {
    const controller = new AbortController();
    syncRequest.current = controller;
    setSyncing(true);
    try {
      const result = await syncWishlist({
        confirmEmpty,
        prices,
        signal: controller.signal,
        onJob: (job) => { if (job.status === 'queued' || job.status === 'completed') void experience.reload(); },
      });
      if (prices) {
        const message = priceSyncMessage(result.summary || result.run?.summary);
        if (['partial', 'failed'].includes(result.run?.status)) toast.warning(message);
        else toast.success(message);
      } else if (result.needsEmptyConfirmation)
        toast.warning(
          "Steam did not establish a confirmed empty wishlist. Saved membership was preserved.",
        );
      else if (result.run?.status === "partial")
        toast.warning(
          "Membership synced. Some display metadata still needs a refresh.",
        );
      else
        toast.success(
          `Steam wishlist synced: ${result.total || 0} memberships.`,
        );
    } catch (error) {
      if (error.name !== "AbortError")
        toast.error(
          prices && error.code === "steam_price_failed"
            ? "Price refresh did not complete. Saved prices are unchanged; try again later."
            : error.message || "Wishlist sync failed.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setSyncing(false);
        await Promise.all([state.refresh(), experience.reload()]);
      }
    }
  };
  const confirmEmpty = async () => {
    if (
      await confirm({
        title: "Confirm an empty Steam wishlist?",
        message:
          "Fetch Steam again and remove saved Steam membership only if the new response confirms an empty wishlist. Local intentions are preserved.",
        confirmLabel: "Check and confirm empty",
        tone: "danger",
      })
    )
      await runSync(true);
  };
  const move = async (game) => {
    setMovingId(game.wishlistItemId);
    try {
      await moveWishlistToBacklog(game.wishlistItemId, moveStatus);
      await state.refresh();
      toast.success(`${game.name} is now in your backlog.`);
    } catch (error) {
      toast.error(error.message || "Could not move the item.");
    } finally {
      setMovingId(null);
    }
  };
  const runMetadataRefresh = async () => {
    if (metadataRefreshing || metadataBulkRefreshing || syncing) return;
    setMetadataRefreshing(true);
    try {
      const result = await refreshWishlistMetadata();
      toast.success(wishlistMetadataBatchMessage({
        processed: result.drain?.processed,
        pending: result.pending,
        results: result.drain?.results,
      }));
      await state.refresh();
    } catch (error) {
      toast.error(error.message || "Wishlist metadata refresh failed.");
    } finally {
      setMetadataRefreshing(false);
    }
  };
  const runAllMetadataRefresh = async () => {
    if (metadataRefreshing || metadataBulkRefreshing || syncing) return;
    setMetadataBulkRefreshing(true);
    let processed = 0;
    let pending = Number(state.metadata?.pending || 0);
    const results = [];
    try {
      while (pending > 0 || processed === 0) {
        const result = await refreshWishlistMetadata({ maxItems: 10 });
        const batch = Number(result.drain?.processed || 0);
        processed += batch;
        results.push(...(result.drain?.results || []));
        pending = Number(result.pending || 0);
        if (!batch) break;
      }
      toast.success(wishlistMetadataBatchMessage({ processed, pending, results }));
      await state.refresh();
    } catch (error) {
      toast.error(error.message || "Wishlist metadata refresh failed.");
    } finally {
      setMetadataBulkRefreshing(false);
    }
  };
  const runItemMetadataRefresh = async (game) => {
    if (metadataItemRefreshing || metadataRefreshing || metadataBulkRefreshing || syncing || !game?.wishlistItemId) return;
    setMetadataItemRefreshing(game.wishlistItemId);
    try {
      const result = await refreshWishlistMetadataItem(game.wishlistItemId);
      const outcome = result.drain?.results?.[0];
      const message = `${game.name} metadata checked. ${metadataOutcomeMessage(outcome)}`;
      if (outcome?.status === "completed") toast.success(message);
      else toast.warning(message);
      await state.refresh();
    } catch (error) {
      toast.error(error.message || "Wishlist metadata refresh failed.");
    } finally {
      setMetadataItemRefreshing(null);
    }
  };
  const runWishlistRawgMatch = async (game, rawgId) => {
    if (!game?.wishlistItemId || !rawgId || syncing || metadataRefreshing || metadataBulkRefreshing) return;
    setMetadataItemRefreshing(game.wishlistItemId);
    try {
      await matchWishlistRawg(game.wishlistItemId, rawgId);
      toast.success(`${game.name} is now linked to RAWG.`);
      await state.refresh();
    } catch (error) {
      toast.error(error.message || "Could not save the RAWG match.");
      throw error;
    } finally {
      setMetadataItemRefreshing(null);
    }
  };
  const runItemPriceRefresh = async (game) => {
    if (!game?.wishlistItemId || priceItemRefreshing || syncing) return;
    setPriceItemRefreshing(game.wishlistItemId);
    try {
      const result = await refreshWishlistPriceItem(game.wishlistItemId, {
        onJob: (job) => {
          if (["queued", "completed"].includes(job?.status)) void experience.reload();
        },
      });
      const message = priceSyncMessage(result.summary || result.run?.summary);
      if (["partial", "failed"].includes(result.run?.status)) toast.warning(message);
      else toast.success(`${game.name}: ${message}`);
      await Promise.all([state.refresh({ preserveLoaded: true }), experience.reload()]);
    } catch (error) {
      toast.error(error.message || "Could not refresh this price.");
    } finally {
      setPriceItemRefreshing(null);
    }
  };
  if (!isAuthenticated || isGuest)
    return (
      <AppPage>
        <EmptyState
          icon={Heart}
          title="Wishlist is private"
          description="Sign in with a saved account to view your wishlist."
          action={
            <Button as={Link} to="/">
              Return to backlog
            </Button>
          }
        />
      </AppPage>
    );

  if (state.loading && !state.saved && !games.length) {
    return <CollectionLoadingSkeleton collection="wishlist" viewMode={viewMode} />;
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-surface-bg px-3 pb-8 text-content-primary sm:px-6 lg:h-screen lg:min-h-0 lg:overflow-y-auto lg:px-5 lg:pb-8">
      <div className="sticky top-[var(--mobile-header-h,3.5rem)] z-30 bg-surface-bg lg:top-0">
      <BacklogToolbar
        showNotifications
        collection="wishlist"
        identity={{
          title: `${possessiveName(user?.display_name?.trim() || user?.username)} wishlist`,
        }}
        search={{
          query: filters.searchQuery,
          setQuery,
          clear: () => setQuery(""),
          placeholder: "Search wishlist...",
        }}
        sort={{
          key: filters.sortKey,
          setKey: setSort,
          isReversed: filters.isReversed,
          setIsReversed: setReverse,
        }}
        sortOptions={wishlistSortOptions}
        utilityControl={
          <SteamSyncStatus
            compact
            savedAccount={state.account}
            priceHealth={state.priceHealth}
            onMembershipRefresh={() => runSync()}
            onPriceRefresh={() => runSync(false, true)}
            onPriceAttention={() => {
              setOnSaleOnly(false);
              setPriceAttentionOnly(true);
            }}
            busy={syncing || metadataRefreshing || metadataBulkRefreshing}
            confirmEmpty={confirmEmpty}
            metadata={state.metadata}
            onMetadataRefresh={runMetadataRefresh}
            onMetadataBulkRefresh={runAllMetadataRefresh}
          />
        }
        filters={{
          ...filters,
          allGenres: state.facets?.genres || [],
          hoursBounds: state.facets?.hoursBounds || { min: 0, max: 0 },
          count: filterCount,
          clear: () => {
            filters.clearFilters();
            filters.setHoursRange(null);
            setOnSaleOnly(false);
            setPriceAttentionOnly(false);
          },
          toggleGenre: (value) => {
            filters.toggleGenre(value);
          },
        }}
        collectionControl={<Button variant={onSaleOnly ? 'filterActive' : 'secondary'} aria-pressed={onSaleOnly} onClick={() => setOnSaleOnly(value => !value)}><Percent className="h-4 w-4" aria-hidden="true" />On sale</Button>}
        membershipControl={
          <SelectMenu
            value={membership}
            onChange={(value) => {
              setMembership(value);
            }}
            options={membershipOptions}
            aria-label="Wishlist membership"
          />
        }
        viewMode={viewMode}
        setViewMode={setViewMode}
        resultCount={state.total || 0}
        totalCount={state.facets?.collectionTotal ?? state.total ?? 0}
        games={games}
        onSelectGame={(game) => setSelectedId(game.id)}
        mobileControlsOpen={mobileControlsOpen}
        setMobileControlsOpen={setMobileControlsOpen}
      />
      </div>
      <div className="mx-auto w-full max-w-[1760px]">
        {priceAttentionOnly ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-control border border-state-warning/30 bg-state-warning/10 px-3 py-2 text-xs text-content-secondary" role="status">
            <span>Showing prices that need offer verification or a retry.</span>
            <Button size="sm" variant="ghost" onClick={() => setPriceAttentionOnly(false)}>Show all prices</Button>
          </div>
        ) : null}
        {state.refreshError ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-control border border-state-warning/30 bg-state-warning/10 px-3 py-2 text-xs text-content-secondary" role="alert">
            <span>Could not update this view. Your loaded Wishlist is still available.</span>
            <Button size="sm" variant="ghost" onClick={() => state.refresh({ preserveLoaded: true })}>Retry</Button>
          </div>
        ) : null}
        {state.error && state.saved ? <div className="mb-4 flex flex-wrap items-center gap-2 rounded-control border border-state-warning/30 bg-state-warning/10 px-3 py-2 text-xs text-content-secondary" role="alert"><span>Could not check for updates. Showing your saved Wishlist.</span><Button size="sm" variant="ghost" onClick={state.refresh}>Retry</Button></div> : state.error ? (
          <PageError
            title={state.saved ? "Saved Wishlist shown; could not check for updates" : "Could not load wishlist"}
            description={state.error}
            onRetry={state.refresh}
          />
        ) : null}
        {!state.loading && !state.error && !games.length ? (
          <EmptyState
            icon={Heart}
            title={
              filters.searchQuery || filterCount
                ? "No games match this view."
                : "No wishlist items"
            }
            description={
              membership === "removed"
                ? "Removed Steam memberships will appear here."
                : "Your local intentions and current Steam wishlist appear here after sync."
            }
          />
        ) : null}
        {games.length ? (
          viewMode === "table" && isDesktop ? (
            <BacklogTable
              games={games}
              collection="wishlist"
              sortKey={filters.sortKey}
              setSortKey={setSort}
              isReversed={filters.isReversed}
              setIsReversed={setReverse}
              onSelectGame={(game) => setSelectedId(game.id)}
              renderItemActions={(game) => (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedId(game.id)}
                >
                  Details
                </Button>
              )}
              loadMore={{
                hasMore: state.hasMore,
                loading: state.loadingMore,
                onLoadMore: state.loadMore,
                ref: loadMoreRef,
                label: `Load more (${games.length} of ${state.total})`,
              }}
            />
          ) : (
            <GameGrid
              games={games}
              viewMode={viewMode === "table" ? "list" : viewMode}
              onSelectGame={(game) => setSelectedId(game.id)}
            />
          )
        ) : null}
        {state.loadMoreError ? (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm text-state-warning" role="alert">
            <span>{state.loadMoreError}</span>
            <Button size="sm" variant="secondary" onClick={state.loadMore}>Retry</Button>
          </div>
        ) : null}
        {state.hasMore && !(viewMode === "table" && isDesktop) ? (
          <div ref={loadMoreRef} className="mt-6 flex min-h-16 items-center justify-center">
            <Button variant="secondary" disabled={state.loadingMore} onClick={state.loadMore}>
              {state.loadingMore ? "Loading more..." : `Load more (${games.length} of ${state.total})`}
            </Button>
          </div>
        ) : null}
      </div>
      {selected ? (
         <GameModal game={selected} onClose={closeDetails} readOnly hidePrivateFields compactHero hideTabs footerInBody
           footer={<WishlistCardFooter game={selected} statusOptions={statusOptions} moveStatus={moveStatus}
            onMoveStatusChange={setMoveStatus} onMove={move} moving={movingId === selected.wishlistItemId}
            onRefreshMetadata={() => runItemMetadataRefresh(selected)}
            onRefreshPrice={() => runItemPriceRefresh(selected)}
            onMatchRawg={runWishlistRawgMatch}
            priceRefreshing={priceItemRefreshing === selected.wishlistItemId}
            metadataRefreshing={metadataItemRefreshing === selected.wishlistItemId || metadataRefreshing || metadataBulkRefreshing} />} />
      ) : null}
    </main>
  );
}
