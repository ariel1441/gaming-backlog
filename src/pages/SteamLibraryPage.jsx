import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ExternalLink,
  Gamepad2,
  Library,
  Link as LinkIcon,
  RefreshCw,
  Search,
  Trophy,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  AppPage,
  PageHeader,
  PageLoading,
  PageSection,
  PageToolbar,
} from "../components/layout";
import {
  attachSteamCandidate,
  getSteamAccount,
  importSteamCandidates,
  listSteamImportCandidates,
  syncSteamAchievements,
  syncSteamGameAchievements,
  syncSteamLibrary,
  updateSteamImportCandidate,
} from "../services/steamService";
import { searchCatalog } from "../services/catalogService";
import { listGames } from "../services/gameService";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Modal,
  SelectMenu,
  TextInput,
  useToast,
} from "../components/ui";
import {
  achievementStatusSuggestion,
  formatAchievementSummary,
  formatAchievementSyncDate,
} from "../utils/steamAchievements";
import { filteredReasonLabel } from "../utils/steamImport";
import {
  formatAchievementBatchSyncMessage,
  formatAchievementGameSyncMessage,
  formatSteamLibrarySyncMessage,
  loadLastSteamSyncReview,
  saveLastSteamSyncReview,
} from "../utils/steamSync";
import {
  formatSteamDate,
  formatSteamPlaytime,
  steamCapsuleUrl,
} from "../utils/steamDisplay";
import {
  Metric,
  SteamLibraryDrawer,
  SteamLibraryRow,
} from "./SteamLibrary/SteamLibraryView";

const PAGE_LIMIT = 100;

const viewOptions = [
  { value: "all", label: "All synced apps", status: "all", group: "all" },
  { value: "open", label: "Open review", status: "active", group: "all" },
  { value: "linked", label: "In backlog", status: "done", group: "all" },
  {
    value: "needs_match",
    label: "Needs match",
    status: "active",
    group: "needs_match",
  },
  {
    value: "duplicates",
    label: "Already in backlog",
    status: "active",
    group: "duplicates",
  },
  {
    value: "non_games",
    label: "Likely non-games",
    status: "all",
    group: "filtered",
  },
  { value: "hidden", label: "Hidden", status: "ignored", group: "all" },
];

const achievementOptions = [
  { value: "all", label: "All achievements" },
  { value: "has", label: "Has achievements" },
  { value: "complete", label: "100% complete" },
  { value: "close", label: "Close to 100%" },
  { value: "not_synced", label: "Not synced" },
  { value: "unavailable", label: "Unavailable" },
];

const sortOptions = [
  { value: "suggested", label: "Suggested first" },
  { value: "name", label: "Name A-Z" },
  { value: "newly_synced", label: "Newly synced" },
  { value: "playtime_desc", label: "Most playtime" },
  { value: "playtime_asc", label: "Least playtime" },
  { value: "last_played_desc", label: "Last played: recent" },
  { value: "last_played_asc", label: "Last played: oldest" },
  { value: "achievement_desc", label: "Achievement % high" },
  { value: "achievement_asc", label: "Achievement % low" },
  { value: "achievement_synced", label: "Achievements synced" },
  { value: "backlog_state", label: "Backlog state" },
];

function currentView(value) {
  return viewOptions.find((option) => option.value === value) || viewOptions[0];
}

function emptyLibraryCopy({ account, query, view, achievementFilter }) {
  if (!account) {
    return {
      title: "Steam is not linked yet.",
      description:
        "Link Steam from the import page, then sync your owned library.",
    };
  }
  if (query) {
    return {
      title: "No Steam apps match this search.",
      description: "Clear search or try another library view.",
    };
  }
  if (achievementFilter !== "all") {
    return {
      title: "No apps match this achievement filter.",
      description:
        "Try All achievements, sync achievements, or switch to another view.",
    };
  }
  if (view !== "all") {
    return {
      title: "No Steam apps in this view.",
      description: "Try All synced apps or sync your Steam library again.",
    };
  }
  return {
    title: "No Steam apps here.",
    description: "Sync your Steam library to populate this page.",
  };
}

export default function SteamLibraryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated, loading: authLoading, isGuest } = useAuth();
  const [account, setAccount] = useState(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingAchievements, setSyncingAchievements] = useState(false);
  const [syncingAchievementGameId, setSyncingAchievementGameId] =
    useState(null);
  const [view, setView] = useState("all");
  const [achievementFilter, setAchievementFilter] = useState("all");
  const [sort, setSort] = useState("suggested");
  const [query, setQuery] = useState("");
  const [apps, setApps] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState({
    offset: 0,
    limit: PAGE_LIMIT,
    total: 0,
    hasMore: false,
  });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [matchApp, setMatchApp] = useState(null);
  const [matchQuery, setMatchQuery] = useState("");
  const [matchResults, setMatchResults] = useState([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [linkApp, setLinkApp] = useState(null);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [lastSyncReview, setLastSyncReview] = useState(() =>
    loadLastSteamSyncReview(),
  );

  const selectedView = useMemo(() => currentView(view), [view]);

  const loadAccount = async () => {
    setAccountLoading(true);
    try {
      const payload = await getSteamAccount();
      setAccount(payload?.account || null);
    } catch (error) {
      toast.error(error.message || "Could not load Steam account.");
    } finally {
      setAccountLoading(false);
    }
  };

  const loadApps = async ({ append = false, offset = 0 } = {}) => {
    if (!isAuthenticated || isGuest) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const payload = await listSteamImportCandidates({
        status: selectedView.status,
        group: selectedView.group,
        achievement: achievementFilter,
        sort,
        q: query.trim(),
        limit: PAGE_LIMIT,
        offset,
      });
      setApps((current) =>
        append
          ? [...current, ...(payload?.candidates || [])]
          : payload?.candidates || [],
      );
      setSummary(payload?.summary || null);
      setPage(
        payload?.page || {
          offset,
          limit: PAGE_LIMIT,
          total: payload?.candidates?.length || 0,
          hasMore: false,
        },
      );
    } catch (error) {
      toast.error(error.message || "Could not load Steam library.");
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated && !isGuest) {
      loadAccount();
    }
  }, [authLoading, isAuthenticated, isGuest]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      loadApps({ append: false, offset: 0 });
    }, 180);
    return () => window.clearTimeout(handle);
  }, [
    isAuthenticated,
    isGuest,
    selectedView.status,
    selectedView.group,
    achievementFilter,
    sort,
    query,
  ]);

  const sync = async () => {
    setSyncing(true);
    try {
      toast.info(
        "Steam sync started. I will show review actions when it finishes.",
      );
      const payload = await syncSteamLibrary();
      if (payload?.skipped) {
        toast.info(formatSteamLibrarySyncMessage(payload));
      } else if (payload?.private) {
        toast.warning(formatSteamLibrarySyncMessage(payload));
      } else {
        toast.success(formatSteamLibrarySyncMessage(payload));
      }
      if (payload?.syncReview?.total) {
        setLastSyncReview(saveLastSteamSyncReview(payload.syncReview));
      } else if (!payload?.skipped && !payload?.private) {
        setLastSyncReview(saveLastSteamSyncReview(null));
      }
      await loadAccount();
      await loadApps({ append: false, offset: 0 });
    } catch (error) {
      toast.error(error.message || "Could not sync Steam library.");
    } finally {
      setSyncing(false);
    }
  };

  const syncAllAchievements = async () => {
    setSyncingAchievements(true);
    try {
      const payload = await syncSteamAchievements();
      const synced = Number(payload?.synced || 0);
      const message = formatAchievementBatchSyncMessage(payload);
      if (!synced) {
        toast.info(message);
      } else {
        toast.success(message);
      }
      await loadApps({ append: false, offset: 0 });
    } catch (error) {
      toast.error(error.message || "Could not sync Steam achievements.");
    } finally {
      setSyncingAchievements(false);
    }
  };

  const syncGameAchievements = async (app) => {
    const gameId = app.duplicateGameId || app.linkedGameId;
    if (!gameId) return;
    setSyncingAchievementGameId(gameId);
    try {
      const payload = await syncSteamGameAchievements(gameId);
      const result = formatAchievementGameSyncMessage(payload);
      toast[result.tone](result.message);
      await loadApps({ append: false, offset: 0 });
    } catch (error) {
      toast.error(error.message || "Could not sync Steam achievements.");
    } finally {
      setSyncingAchievementGameId(null);
    }
  };

  const updateCandidate = async (app, action, payload = {}) => {
    try {
      await updateSteamImportCandidate(app.id, { action, ...payload });
      const actionCopy = {
        ignore: "Steam app hidden. It will stay hidden until you restore it.",
        restore: "Steam app restored to review.",
        select_catalog: "Catalog match updated.",
        accept: "Match approved.",
      };
      toast.success(actionCopy[action] || "Steam app updated.");
      await loadApps({ append: false, offset: 0 });
      setSelectedApp(null);
    } catch (error) {
      toast.error(error.message || "Could not update this Steam app.");
    }
  };

  const importCandidate = async (app) => {
    try {
      const payload = await importSteamCandidates([app.id]);
      const imported = payload?.imported?.length || 0;
      const attached = payload?.attached?.length || 0;
      if (imported || attached) {
        toast.success(
          imported
            ? "Game added to backlog."
            : "Steam linked to an existing backlog game.",
        );
      } else {
        toast.warning("Choose a catalog match before adding this Steam app.");
      }
      await loadApps({ append: false, offset: 0 });
      setSelectedApp(null);
    } catch (error) {
      toast.error(error.message || "Could not add or link this Steam app.");
    }
  };

  const openMatch = (app) => {
    setMatchApp(app);
    setMatchQuery(app?.steamName || "");
    setMatchResults([]);
  };

  const searchMatches = async () => {
    if (matchQuery.trim().length < 3) return;
    setMatchLoading(true);
    try {
      const payload = await searchCatalog(matchQuery);
      setMatchResults(payload?.results || []);
    } catch (error) {
      toast.error(error.message || "Could not search catalog matches.");
    } finally {
      setMatchLoading(false);
    }
  };

  const chooseMatch = async (game) => {
    if (!matchApp) return;
    await updateCandidate(matchApp, "select_catalog", {
      catalog_game_id: game.id,
    });
    setMatchApp(null);
    setMatchQuery("");
    setMatchResults([]);
  };

  const openLinkExisting = (app) => {
    setLinkApp(app);
    setLinkQuery(
      app?.duplicateGameName ||
        app?.proposedCatalogName ||
        app?.steamName ||
        "",
    );
    setLinkResults([]);
  };

  const searchBacklogMatches = async () => {
    if (linkQuery.trim().length < 2) return;
    setLinkLoading(true);
    try {
      const payload = await listGames();
      const needle = linkQuery.trim().toLowerCase();
      const rows = Array.isArray(payload) ? payload : payload?.games || [];
      setLinkResults(
        rows
          .filter((game) =>
            String(game.name || "")
              .toLowerCase()
              .includes(needle),
          )
          .slice(0, 25),
      );
    } catch (error) {
      toast.error(error.message || "Could not search backlog games.");
    } finally {
      setLinkLoading(false);
    }
  };

  const chooseBacklogGame = async (game) => {
    if (!linkApp || !game?.id) return;
    try {
      await attachSteamCandidate(linkApp.id, game.id);
      toast.success("Steam app linked to existing backlog game.");
      await loadApps({ append: false, offset: 0 });
      setSelectedApp(null);
      setLinkApp(null);
      setLinkQuery("");
      setLinkResults([]);
    } catch (error) {
      toast.error(error.message || "Could not link this Steam app.");
    }
  };

  if (!authLoading && (!isAuthenticated || isGuest)) {
    return (
      <AppPage width="wide">
        <PageHeader
          title="Steam Library"
          description="Browse the games detected in your connected Steam account."
          icon={Library}
        />
        <div className="pt-6">
          <EmptyState
            icon={Gamepad2}
            title="Sign in to view Steam library."
            description="Steam library data is private and only available for saved accounts."
            action={
              <Button
                type="button"
                variant="primary"
                onClick={() => navigate("/")}
              >
                Go to backlog
              </Button>
            }
          />
        </div>
      </AppPage>
    );
  }

  const total = page.total || 0;
  const allSummary = summary || {};
  const groups = allSummary.groups || {};
  const hasActiveTools =
    query.trim() ||
    view !== "all" ||
    achievementFilter !== "all" ||
    sort !== "suggested";
  const emptyCopy = emptyLibraryCopy({
    account,
    query: query.trim(),
    view,
    achievementFilter,
  });
  const resetTools = () => {
    setQuery("");
    setView("all");
    setAchievementFilter("all");
    setSort("suggested");
  };

  const openLastSyncReview = () => {
    const stored = loadLastSteamSyncReview();
    setLastSyncReview(stored);
    if (stored?.total) {
      navigate("/steam/import?review=last");
    } else {
      toast.info("No Steam sync review is waiting.");
    }
  };

  return (
    <AppPage width="wide">
      <PageHeader
        title="Steam Library"
        description="Browse synced Steam apps, find games that need attention, and keep playtime and achievements up to date."
        icon={Library}
        meta={
          accountLoading ? undefined : `${allSummary.total || 0} synced apps`
        }
        badge={
          account?.steamId ? (
            <Badge variant="success">Steam linked</Badge>
          ) : (
            <Badge variant="default">Not linked</Badge>
          )
        }
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate("/steam/import")}
            >
              <LinkIcon className="h-4 w-4" aria-hidden="true" />
              Review import
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={sync}
              disabled={syncing || accountLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {syncing ? "Syncing..." : "Sync library"}
            </Button>
          </>
        }
      />

      <div className="space-y-7 pt-7">
        <PageSection title="Library overview">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Metric label="Synced apps" value={allSummary.total || 0} />
            <Metric
              label="In backlog"
              value={(allSummary.imported || 0) + (allSummary.attached || 0)}
            />
            <Metric label="Newly played" value={groups.newly_played || 0} />
            <Metric label="Needs match" value={groups.needs_match || 0} />
            <Metric label="Likely non-games" value={groups.filtered || 0} />
            <Metric label="Hidden" value={allSummary.ignored || 0} />
          </div>
        </PageSection>

        <PageToolbar>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.1fr)_minmax(190px,240px)_minmax(190px,240px)_minmax(210px,260px)_auto] xl:items-end">
            <Field
              id="steam-library-search"
              label="Search synced apps"
              className="min-w-0 flex-1"
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
                <TextInput
                  id="steam-library-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a Steam app..."
                  className="pl-9"
                />
              </div>
            </Field>
            <Field id="steam-library-view" label="View" className="min-w-0">
              <SelectMenu
                id="steam-library-view"
                value={view}
                onChange={setView}
                options={viewOptions.map(({ value, label }) => ({
                  value,
                  label,
                }))}
              />
            </Field>
            <Field id="steam-library-sort" label="Sort" className="min-w-0">
              <SelectMenu
                id="steam-library-sort"
                value={sort}
                onChange={setSort}
                options={sortOptions}
              />
            </Field>
            <Field
              id="steam-library-achievements"
              label="Achievements"
              className="min-w-0"
            >
              <SelectMenu
                id="steam-library-achievements"
                value={achievementFilter}
                onChange={setAchievementFilter}
                options={achievementOptions}
              />
            </Field>
            {hasActiveTools ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetTools}
                className="justify-self-start xl:justify-self-end"
              >
                Reset filters
              </Button>
            ) : null}
          </div>
        </PageToolbar>

        <PageSection
          title="All synced apps"
          description={
            loading
              ? "Loading your Steam library..."
              : `${total} synced app${total === 1 ? "" : "s"} ֲ· ${apps.length} shown`
          }
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {lastSyncReview?.total ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={openLastSyncReview}
                >
                  Review last sync
                  <span className="text-xs opacity-75">
                    {lastSyncReview.total}
                  </span>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={syncAllAchievements}
                disabled={
                  syncingAchievements ||
                  syncing ||
                  accountLoading ||
                  !account?.steamId
                }
              >
                <Trophy className="h-4 w-4" aria-hidden="true" />
                {syncingAchievements
                  ? "Syncing achievements..."
                  : "Sync achievements"}
              </Button>
            </div>
          }
        >
          {account?.lastLibrarySyncAt && !loading ? (
            <div className="-mt-2 mb-3 text-xs text-content-muted">
              Last synced {formatAchievementSyncDate(account.lastLibrarySyncAt)}
            </div>
          ) : null}

          {loading ? (
            <PageLoading rows={6} />
          ) : apps.length ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
                <div className="grid grid-cols-[minmax(220px,2fr)_72px_106px_minmax(120px,0.9fr)_minmax(145px,1fr)_108px] items-center gap-2 border-b border-surface-border bg-surface-bg/25 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-content-muted">
                  <span>Game</span>
                  <span>Playtime</span>
                  <span>Last played</span>
                  <span>Achievements</span>
                  <span>Connection</span>
                  <span className="text-right">Actions</span>
                </div>
                <div className="divide-y divide-surface-border">
                  {apps.map((app) => (
                    <SteamLibraryRow
                      key={app.id}
                      app={app}
                      navigate={navigate}
                      onSyncAchievements={syncGameAchievements}
                      syncingAchievementGameId={syncingAchievementGameId}
                      onDetails={() => setSelectedApp(app)}
                      onRestore={() => updateCandidate(app, "restore")}
                    />
                  ))}
                </div>
              </div>
              {page.hasMore ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      loadApps({
                        append: true,
                        offset: page.offset + apps.length,
                      })
                    }
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={Library}
              title={emptyCopy.title}
              description={emptyCopy.description}
              action={
                hasActiveTools ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={resetTools}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => navigate("/steam/import")}
                  >
                    Review import
                  </Button>
                )
              }
            />
          )}
        </PageSection>
      </div>
      {selectedApp ? (
        <SteamLibraryDrawer
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onSyncAchievements={() => syncGameAchievements(selectedApp)}
          syncingAchievementGameId={syncingAchievementGameId}
          onHide={() => updateCandidate(selectedApp, "ignore")}
          onRestore={() => updateCandidate(selectedApp, "restore")}
          onAccept={() => updateCandidate(selectedApp, "accept")}
          onImport={() => importCandidate(selectedApp)}
          onChangeMatch={() => openMatch(selectedApp)}
          onLinkExisting={() => openLinkExisting(selectedApp)}
          onReview={() =>
            navigate(
              `/steam/import?status=all&group=all&q=${encodeURIComponent(selectedApp.steamName || "")}`,
            )
          }
        />
      ) : null}
      {matchApp ? (
        <Modal
          title="Change catalog match"
          description={`Choose the catalog game for ${matchApp.steamName}.`}
          onClose={() => setMatchApp(null)}
          size="xl"
        >
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
                <TextInput
                  value={matchQuery}
                  onChange={(event) => setMatchQuery(event.target.value)}
                  placeholder="Search catalog..."
                  className="pl-9"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") searchMatches();
                  }}
                />
              </div>
              <Button
                type="button"
                variant="primary"
                onClick={searchMatches}
                disabled={matchLoading || matchQuery.trim().length < 3}
              >
                {matchLoading ? "Searching..." : "Search"}
              </Button>
            </div>
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {matchResults.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => chooseMatch(game)}
                  className="flex w-full items-center gap-3 rounded-lg border border-surface-border bg-surface-bg/35 p-2 text-left transition hover:border-primary/35 hover:bg-surface-elevated/60"
                >
                  {game.cover ? (
                    <img
                      src={game.cover}
                      alt=""
                      className="h-16 w-12 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-12 items-center justify-center rounded bg-surface-elevated text-content-muted">
                      {String(game.name || "?").charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-content-primary">
                      {game.name}
                    </div>
                    <div className="mt-1 text-xs text-content-muted">
                      {game.released || game.releaseDate || "Unknown release"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}
      {linkApp ? (
        <Modal
          title="Link to existing backlog game"
          description={`Choose the backlog row that should own ${linkApp.steamName}.`}
          onClose={() => setLinkApp(null)}
          size="xl"
        >
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
                <TextInput
                  value={linkQuery}
                  onChange={(event) => setLinkQuery(event.target.value)}
                  placeholder="Search your backlog..."
                  className="pl-9"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") searchBacklogMatches();
                  }}
                />
              </div>
              <Button
                type="button"
                variant="primary"
                onClick={searchBacklogMatches}
                disabled={linkLoading || linkQuery.trim().length < 2}
              >
                {linkLoading ? "Searching..." : "Search"}
              </Button>
            </div>
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {linkResults.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => chooseBacklogGame(game)}
                  className="flex w-full items-center gap-3 rounded-lg border border-surface-border bg-surface-bg/35 p-2 text-left transition hover:border-primary/35 hover:bg-surface-elevated/60"
                >
                  {game.cover ? (
                    <img
                      src={game.cover}
                      alt=""
                      className="h-16 w-12 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-12 items-center justify-center rounded bg-surface-elevated text-content-muted">
                      {String(game.name || "?").charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-content-primary">
                      {game.name}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-content-muted">
                      {game.status ? <span>{game.status}</span> : null}
                      {game.my_genre ? <span>{game.my_genre}</span> : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}
    </AppPage>
  );
}
