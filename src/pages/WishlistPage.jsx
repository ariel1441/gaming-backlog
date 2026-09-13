import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, Percent } from "lucide-react";
import { priceSyncMessage } from '../utils/steamPrice';
import { Link, useSearchParams } from "react-router-dom";
import GameGrid from "../components/GameGrid";
import GameModal from "../components/GameModal";
import SteamSyncStatus from "../features/steam/SteamSyncStatus";
import { useSteamExperience } from "../features/steam/SteamExperienceContext";
import { AppPage, PageError, PageLoading } from "../components/layout";
import {
  Button,
  EmptyState,
  SelectMenu,
  useConfirm,
  useToast,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useStatuses } from "../hooks/useStatuses";
import { useGames } from "../hooks/useGames";
import { useFilters } from "../hooks/useFilters";
import useMedia from "../hooks/useMedia";
import { buildDisplayGames, isHoursFilterActive } from "../utils/gameList";
import {
  moveWishlistToBacklog,
  refreshWishlistMetadata,
  refreshWishlistMetadataItem,
  syncWishlist,
} from "../services/wishlistService";
import { normalizeUserPreferences } from "../utils/userPreferences";
import BacklogToolbar from "./Backlog/BacklogToolbar";
import BacklogTable from "./Backlog/BacklogTable";
import WishlistCardFooter from "./Wishlist/WishlistCardFooter";
import useWishlist from "./Wishlist/useWishlist";
import {
  wishlistItemsToGames,
  wishlistSortOptions,
} from "./Wishlist/wishlistPresentation";

function metadataOutcomeMessage(outcome) {
  if (outcome?.status === "completed") return "RAWG data is available.";
  if (outcome?.status === "review") {
    return "Multiple RAWG matches need review after moving it to Backlog > Edit game > Metadata.";
  }
  if (outcome?.status === "failed") {
    return "RAWG refresh failed; try again later.";
  }
  if (outcome?.issue === "rawg_metadata_incomplete") {
    return "The RAWG match was found, but its metadata is still incomplete.";
  }
  return "No safe RAWG match was found. Move it to Backlog to choose a RAWG identity.";
}

const PAGE_SIZE = 50;
const membershipOptions = [
  { value: "active", label: "Active wishlist" },
  { value: "removed", label: "Removed from Steam" },
  { value: "all", label: "All history" },
];

export default function WishlistPage() {
  const { user, isAuthenticated, isGuest } = useAuth();
  const { statuses } = useStatuses();
  const { refresh: refreshGames } = useGames();
  const toast = useToast();
  const experience = useSteamExperience();
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const confirm = useConfirm();
  const [membership, setMembership] = useState("active");
  const state = useWishlist({
    userId: user?.id,
    enabled: isAuthenticated && !isGuest,
    membership,
  });
  const games = useMemo(() => wishlistItemsToGames(state.items), [state.items]);
  const filters = useFilters(games, { initialSortKey: "providerOrder" });
  const [viewMode, setViewMode] = useState(
    normalizeUserPreferences(user?.preferences).default_backlog_view,
  );
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedItem = searchParams.get('item');
  useEffect(() => {
    if (requestedItem && /^\d+$/.test(requestedItem)) {
      setMembership('all');
      setSelectedId(`wishlist-${requestedItem}`);
    }
  }, [requestedItem]);
  const closeDetails = () => {
    setSelectedId(null);
    if (requestedItem) setSearchParams({}, { replace: true });
  };
  const [syncing, setSyncing] = useState(false);
  const [metadataRefreshing, setMetadataRefreshing] = useState(false);
  const [metadataBulkRefreshing, setMetadataBulkRefreshing] = useState(false);
  const [metadataItemRefreshing, setMetadataItemRefreshing] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [moveStatus, setMoveStatus] = useState("plan to play");
  const syncRequest = useRef(null);
  useEffect(() => () => syncRequest.current?.abort(), []);
  const isDesktop = useMedia("(min-width: 1024px)");
  const displayGames = useMemo(
    () => buildDisplayGames({ games, ...filters, onSaleOnly }),
    [games, filters, onSaleOnly],
  );
  const pageCount = Math.max(1, Math.ceil(displayGames.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = displayGames.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const selected = games.find((game) => game.id === selectedId);
  const filterCount =
    Number(onSaleOnly) + filters.selectedGenres.length +
    (isHoursFilterActive(filters.hoursRange, filters.hoursBounds) ? 1 : 0);
  const statusOptions = (statuses || [])
    .filter((status) => status.toLowerCase().trim() !== "wishlist")
    .map((status) => ({ value: status, label: status }));
  const setQuery = (value) => {
    setPage(0);
    filters.setSearchQuery(value);
  };
  const setSort = (value) => {
    setPage(0);
    filters.setSortKey(value);
  };
  const setReverse = (value) => {
    setPage(0);
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
        toast.error(error.message || "Wishlist sync failed.");
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
      await Promise.all([state.refresh(), refreshGames({ silent: true })]);
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
      if (result.drain?.processed) {
        toast.success(`Metadata checked for ${result.drain.processed} Wishlist item${result.drain.processed === 1 ? "" : "s"}. ${result.pending || 0} still queued.`);
      } else {
        toast.success(`No due metadata items were processed. ${result.pending || 0} remain queued or awaiting retry.`);
      }
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
    try {
      while (pending > 0 || processed === 0) {
        const result = await refreshWishlistMetadata({ maxItems: 10 });
        const batch = Number(result.drain?.processed || 0);
        processed += batch;
        pending = Number(result.pending || 0);
        if (!batch) break;
      }
      toast.success(
        `Metadata checked for ${processed} Wishlist item${processed === 1 ? "" : "s"}. ${pending} remain queued for a later retry.`,
      );
      await state.refresh();
    } catch (error) {
      toast.error(error.message || "Wishlist metadata refresh failed.");
    } finally {
      setMetadataBulkRefreshing(false);
    }
  };
  const runItemMetadataRefresh = async (game) => {
    if (metadataItemRefreshing || syncing || !game?.wishlistItemId) return;
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

  return (
    <main className="min-h-screen overflow-x-clip bg-surface-bg px-3 pb-8 text-content-primary sm:px-6 lg:h-screen lg:min-h-0 lg:overflow-y-auto lg:px-5 lg:pb-8">
      <div className="sticky top-[var(--mobile-header-h,3.5rem)] z-30 bg-surface-bg lg:top-0">
      <BacklogToolbar
        showNotifications
        collection="wishlist"
        identity={{
          title: "Wishlist",
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
        filters={{
          ...filters,
          count: filterCount,
          clear: () => {
            filters.clearFilters();
            setOnSaleOnly(false);
            setPage(0);
          },
          toggleGenre: (value) => {
            filters.toggleGenre(value);
            setPage(0);
          },
        }}
        collectionControl={<Button variant={onSaleOnly ? 'filterActive' : 'secondary'} aria-pressed={onSaleOnly} onClick={() => { setOnSaleOnly(value => !value); setPage(0); }}><Percent className="h-4 w-4" aria-hidden="true" />On sale</Button>}
        membershipControl={
          <SelectMenu
            value={membership}
            onChange={(value) => {
              setMembership(value);
              setPage(0);
            }}
            options={membershipOptions}
            aria-label="Wishlist membership"
          />
        }
        viewMode={viewMode}
        setViewMode={setViewMode}
        resultCount={displayGames.length}
        totalCount={games.length}
        games={games}
        onSelectGame={(game) => setSelectedId(game.id)}
      />
      </div>
      <div className="mx-auto w-full max-w-[1760px]">
        <SteamSyncStatus savedAccount={state.account} priceHealth={state.priceHealth}
          onMembershipRefresh={() => runSync()} onPriceRefresh={() => runSync(false, true)} busy={syncing || metadataRefreshing || metadataBulkRefreshing}
          confirmEmpty={confirmEmpty} metadata={state.metadata}
          onMetadataRefresh={runMetadataRefresh} onMetadataBulkRefresh={runAllMetadataRefresh}
          hasMissingMetadata={games.some(game => game.metadataComplete === false)} />
        {state.loading && !games.length ? <PageLoading rows={5} /> : null}
        {state.error && state.saved ? <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-content-muted" role="status"><span>Saved Wishlist shown; could not check for updates</span><Button size="sm" variant="ghost" onClick={state.refresh}>Retry saved data</Button></div> : state.error ? (
          <PageError
            title={state.saved ? "Saved Wishlist shown; could not check for updates" : "Could not load wishlist"}
            description={state.error}
            onRetry={state.refresh}
          />
        ) : null}
        {!state.loading && !state.error && !shown.length ? (
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
        {shown.length ? (
          viewMode === "table" && isDesktop ? (
            <BacklogTable
              games={shown}
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
            />
          ) : (
            <GameGrid
              games={shown}
              viewMode={viewMode === "table" ? "list" : viewMode}
              onSelectGame={(game) => setSelectedId(game.id)}
            />
          )
        ) : null}
        {displayGames.length > PAGE_SIZE ? (
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-content-muted">
              {currentPage * PAGE_SIZE + 1}
              {" - "}
              {Math.min(
                (currentPage + 1) * PAGE_SIZE,
                displayGames.length,
              )} of {displayGames.length}
            </span>
            <Button
              variant="secondary"
              disabled={currentPage + 1 >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
      {selected ? (
         <GameModal game={selected} onClose={closeDetails} readOnly hidePrivateFields
           footer={<WishlistCardFooter game={selected} statusOptions={statusOptions} moveStatus={moveStatus}
            onMoveStatusChange={setMoveStatus} onMove={move} moving={movingId === selected.wishlistItemId}
            onRefreshMetadata={() => runItemMetadataRefresh(selected)}
            metadataRefreshing={metadataItemRefreshing === selected.wishlistItemId} />} />
      ) : null}
    </main>
  );
}
