import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, RefreshCw } from "lucide-react";
import { priceSyncMessage } from '../utils/steamPrice';
import { Link } from "react-router-dom";
import GameGrid from "../components/GameGrid";
import GameCard from "../components/GameCard";
import { AppPage, PageError, PageLoading } from "../components/layout";
import {
  Badge,
  Button,
  EmptyState,
  Modal,
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
  cancelWishlistSync,
  moveWishlistToBacklog,
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
  const [syncing, setSyncing] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [moveStatus, setMoveStatus] = useState("plan to play");
  const syncRequest = useRef(null);
  useEffect(() => () => syncRequest.current?.abort(), []);
  const isDesktop = useMedia("(min-width: 1024px)");
  const displayGames = useMemo(
    () => buildDisplayGames({ games, ...filters }),
    [games, filters],
  );
  const pageCount = Math.max(1, Math.ceil(displayGames.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = displayGames.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const selected = games.find((game) => game.id === selectedId);
  const filterCount =
    filters.selectedGenres.length +
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
        onJob: (job) =>
          setActiveJobId(
            ["queued", "running"].includes(job?.status) ? job.id : null,
          ),
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
        setActiveJobId(null);
        await state.refresh();
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
    <AppPage width="full" className="lg:px-5">
      <BacklogToolbar
        collection="wishlist"
        identity={{
          title: "Wishlist",
          action: (
            <Button
              variant="primary"
              onClick={() => runSync()}
              disabled={syncing || !state.account}
            >
              <RefreshCw
                className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {syncing ? "Syncing..." : "Sync Steam wishlist"}
            </Button>
          ),
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
            setPage(0);
          },
          toggleGenre: (value) => {
            filters.toggleGenre(value);
            setPage(0);
          },
        }}
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
      <div className="mx-auto max-w-[1760px]">
        {state.account ? (
          <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-content-muted">
            <Badge
              variant={
                ["failed", "private"].includes(state.account.wishlistSyncStatus)
                  ? "danger"
                  : ["partial", "empty_unconfirmed"].includes(
                        state.account.wishlistSyncStatus,
                      )
                    ? "warning"
                    : "neutral"
              }
            >
              {state.account.wishlistSyncStatus}
            </Badge>
            <span>
              Last membership sync:{" "}
              {state.account.lastWishlistSyncAt
                ? new Date(state.account.lastWishlistSyncAt).toLocaleString()
                : "Never"}
            </span>
            <span>Prices: {state.account.priceSyncStatus || 'never'}</span>
            <span>Latest saved price: {state.priceHealth?.last_observation_at ? new Date(state.priceHealth.last_observation_at).toLocaleString() : 'None yet'}</span>
            <Button variant="secondary" size="sm" disabled={syncing} onClick={() => runSync(false, true)}>
              Refresh prices
            </Button>
            {activeJobId ? (
              <Button
                variant="dangerGhost"
                onClick={async () => {
                  try {
                    await cancelWishlistSync(activeJobId);
                  } catch (error) {
                    toast.error(error.message);
                  }
                }}
              >
                Cancel sync
              </Button>
            ) : null}
          </div>
        ) : !state.loading && !state.error ? (
          <div className="mb-5">
            <Button as={Link} to="/steam/import" variant="secondary">
              Link Steam to sync your wishlist
            </Button>
          </div>
        ) : null}
        {state.account?.wishlistSyncStatus === "empty_unconfirmed" ? (
          <div className="mb-5 rounded-xl border border-state-warning/40 bg-state-warning/10 p-4 text-sm">
            <p>
              Steam may be empty or inaccessible. Saved membership has been
              preserved.
            </p>
            <Button
              className="mt-3"
              variant="secondary"
              disabled={syncing}
              onClick={confirmEmpty}
            >
              Confirm genuinely empty wishlist
            </Button>
          </div>
        ) : null}
        {state.account?.wishlistLastErrorMessage ? (
          <p className="mb-4 text-sm text-state-warning">
            {state.account.wishlistLastErrorMessage}
          </p>
        ) : null}
        {state.account?.priceLastError ? <p className="mb-4 text-sm text-state-warning">{state.account.priceLastError}</p> : null}
        {state.priceHealth ? <p className="mb-4 text-sm text-content-muted">
          {state.priceHealth.observed} of {state.priceHealth.eligible} monitored games have saved observations;
          {' '}{state.priceHealth.unchecked} not checked, {state.priceHealth.failed} need a retry.
          {state.priceHealth.unresolved ? ` ${state.priceHealth.unresolved} local intentions need a Steam identity.` : ''}
        </p> : null}
        {state.account?.priceNextAttemptAt && new Date(state.account.priceNextAttemptAt) > new Date() ? (
          <p className="mb-4 text-sm text-state-warning">Steam pricing is cooling down until {new Date(state.account.priceNextAttemptAt).toLocaleString()}.
            {' '}{state.account.autoSyncEnabled ? 'Remaining work is eligible at the next scheduled run after that time.' : 'Daily sync is off. Use Refresh prices after that time to continue.'}</p>
        ) : null}
        {games.some((game) => game.metadataComplete === false) ? (
          <p className="mb-4 text-sm text-state-warning">
            Some titles, artwork or tags are unavailable. Sync again to refresh
            missing metadata.
          </p>
        ) : null}
        {state.loading && !games.length ? <PageLoading rows={5} /> : null}
        {state.error ? (
          <PageError
            title="Could not load wishlist"
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
        <Modal
          title={selected.name}
          onClose={() => setSelectedId(null)}
          size="lg"
        >
          <GameCard game={selected} readOnly variant="list" />
          <div className="mt-4">
            <WishlistCardFooter
              game={selected}
              statusOptions={statusOptions}
              moveStatus={moveStatus}
              onMoveStatusChange={setMoveStatus}
              onMove={move}
              moving={movingId === selected.wishlistItemId}
            />
          </div>
        </Modal>
      ) : null}
    </AppPage>
  );
}
