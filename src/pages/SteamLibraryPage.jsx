import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
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
import {
  formatAchievementBatchSyncMessage,
  formatAchievementGameSyncMessage,
  formatSteamLibrarySyncMessage,
} from "../utils/steamSync";

const PAGE_LIMIT = 100;

const viewOptions = [
  { value: "all", label: "All synced apps", status: "all", group: "all" },
  { value: "open", label: "Open review", status: "active", group: "all" },
  { value: "linked", label: "In backlog", status: "done", group: "all" },
  { value: "needs_match", label: "Needs match", status: "active", group: "needs_match" },
  { value: "duplicates", label: "Already in backlog", status: "active", group: "duplicates" },
  { value: "non_games", label: "Likely non-games", status: "all", group: "filtered" },
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
  { value: "name", label: "Name A-Z" },
  { value: "playtime_desc", label: "Most playtime" },
  { value: "playtime_asc", label: "Least playtime" },
  { value: "last_played_desc", label: "Last played: recent" },
  { value: "last_played_asc", label: "Last played: oldest" },
  { value: "achievement_desc", label: "Achievement % high" },
  { value: "achievement_asc", label: "Achievement % low" },
  { value: "achievement_synced", label: "Achievements synced" },
  { value: "backlog_state", label: "Backlog state" },
];

function hoursFromMinutes(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "0h";
  return `${Math.round((value / 60) * 10) / 10}h`;
}

function shortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function steamImageUrl(app) {
  if (app?.steamAppId) {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${app.steamAppId}/capsule_184x69.jpg`;
  }
  if (app?.steamIconUrl) return app.steamIconUrl;
  return "";
}

function libraryState(app) {
  if (app.importStatus === "ignored") {
    return { label: "Hidden until restored", variant: "warning" };
  }
  if (app.importStatus === "attached" || app.importStatus === "imported") {
    return { label: "In backlog", variant: "success" };
  }
  if (app.duplicateGameName) {
    return { label: "Can link", variant: "primary" };
  }
  if (app.filteredReason) {
    return { label: "Likely non-game", variant: "warning" };
  }
  if (app.proposedCatalogGameId) {
    return { label: "Ready to add", variant: "primary" };
  }
  return { label: "Needs match", variant: "default" };
}

function currentView(value) {
  return viewOptions.find((option) => option.value === value) || viewOptions[0];
}

function emptyLibraryCopy({ account, query, view, achievementFilter }) {
  if (!account) {
    return {
      title: "Steam is not linked yet.",
      description: "Link Steam from the import page, then sync your owned library.",
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
      description: "Try All achievements, sync achievements, or switch to another view.",
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
  const [syncingAchievementGameId, setSyncingAchievementGameId] = useState(null);
  const [view, setView] = useState("all");
  const [achievementFilter, setAchievementFilter] = useState("all");
  const [sort, setSort] = useState("name");
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
        append ? [...current, ...(payload?.candidates || [])] : payload?.candidates || []
      );
      setSummary(payload?.summary || null);
      setPage(payload?.page || {
        offset,
        limit: PAGE_LIMIT,
        total: payload?.candidates?.length || 0,
        hasMore: false,
      });
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
  }, [isAuthenticated, isGuest, selectedView.status, selectedView.group, achievementFilter, sort, query]);

  const sync = async () => {
    setSyncing(true);
    try {
      const payload = await syncSteamLibrary();
      if (payload?.skipped) {
        toast.info(formatSteamLibrarySyncMessage(payload));
      } else if (payload?.private) {
        toast.warning(formatSteamLibrarySyncMessage(payload));
      } else {
        toast.success(formatSteamLibrarySyncMessage(payload));
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
        toast.success(imported ? "Game added to backlog." : "Steam linked to an existing backlog game.");
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
    setLinkQuery(app?.duplicateGameName || app?.proposedCatalogName || app?.steamName || "");
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
          .filter((game) => String(game.name || "").toLowerCase().includes(needle))
          .slice(0, 25)
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
      <main className="min-h-screen bg-surface-bg px-4 py-6 text-content-primary">
        <EmptyState
          icon={Gamepad2}
          title="Sign in to view Steam library."
          description="Steam library data is private and only available for saved accounts."
          action={
            <Button type="button" onClick={() => navigate("/")}>
              Back to backlog
            </Button>
          }
        />
      </main>
    );
  }

  const total = page.total || 0;
  const allSummary = summary || {};
  const groups = allSummary.groups || {};
  const hasActiveTools = query.trim() || view !== "all" || achievementFilter !== "all" || sort !== "name";
  const emptyCopy = emptyLibraryCopy({ account, query: query.trim(), view, achievementFilter });
  const resetTools = () => {
    setQuery("");
    setView("all");
    setAchievementFilter("all");
    setSort("name");
  };

  return (
    <main className="min-h-screen bg-surface-bg text-content-primary">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-surface-border pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="mb-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Backlog
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Library className="h-5 w-5 text-content-muted" aria-hidden="true" />
              <h1 className="text-base font-semibold">Steam Library</h1>
              {account?.steamId ? (
                <Badge variant="success">Steam linked</Badge>
              ) : (
                <Badge variant="default">Not linked</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-content-muted">
              Browse synced Steam apps, spot unlinked games, and jump into import when something needs action.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
              {syncing ? "Syncing..." : "Sync library"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={syncAllAchievements}
              disabled={syncingAchievements || syncing || accountLoading || !account?.steamId}
            >
              <Trophy className="h-4 w-4" aria-hidden="true" />
              {syncingAchievements ? "Syncing achievements..." : "Sync achievements"}
            </Button>
          </div>
        </header>

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Synced apps" value={allSummary.total || 0} />
          <Metric label="In backlog" value={(allSummary.imported || 0) + (allSummary.attached || 0)} />
          <Metric label="Needs match" value={groups.needs_match || 0} />
          <Metric label="Likely non-games" value={groups.filtered || 0} />
          <Metric label="Hidden" value={allSummary.ignored || 0} />
        </section>

        <section className="border-b border-surface-border pb-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.1fr)_minmax(190px,240px)_minmax(190px,240px)_minmax(210px,260px)_auto] xl:items-end">
            <Field id="steam-library-search" label="Search synced apps" className="min-w-0 flex-1">
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
                options={viewOptions.map(({ value, label }) => ({ value, label }))}
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
            <Field id="steam-library-achievements" label="Achievements" className="min-w-0">
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
        </section>

        {loading ? (
          <div className="rounded-lg border border-surface-border bg-surface-card p-6 text-sm text-content-muted">
            Loading Steam library...
          </div>
        ) : apps.length ? (
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-content-muted">
              <span>
                Showing {apps.length} of {total} synced app{total === 1 ? "" : "s"}
              </span>
              {account?.lastLibrarySyncAt ? (
                <span>Last sync {formatAchievementSyncDate(account.lastLibrarySyncAt)}</span>
              ) : null}
            </div>
            <div className="overflow-hidden rounded-lg border border-surface-border bg-surface-card">
              <div className="hidden grid-cols-[minmax(0,1.35fr)_110px_125px_175px_minmax(0,0.9fr)_170px] gap-3 border-b border-surface-border px-4 py-2 text-xs font-medium uppercase tracking-normal text-content-muted lg:grid">
                <span>Steam app</span>
                <span>Playtime</span>
                <span>Last played</span>
                <span>Achievements</span>
                <span>Backlog state</span>
                <span className="text-right">Action</span>
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
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => loadApps({ append: true, offset: page.offset + apps.length })}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            ) : null}
          </section>
        ) : (
          <EmptyState
            icon={Library}
            title={emptyCopy.title}
            description={emptyCopy.description}
            action={
              <Button type="button" onClick={() => navigate("/steam/import")}>
                Review import
              </Button>
            }
          />
        )}
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
          onReview={() => navigate(`/steam/import?q=${encodeURIComponent(selectedApp.steamName || "")}`)}
        />
      ) : null}
      {matchApp ? (
        <Modal
          title="Change catalog match"
          description={`Choose the catalog game for ${matchApp.steamName}.`}
          onClose={() => setMatchApp(null)}
          maxWidth="max-w-3xl"
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
          maxWidth="max-w-3xl"
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
                    <img src={game.cover} alt="" className="h-16 w-12 rounded object-cover" />
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
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-card px-4 py-3">
      <div className="text-xs text-content-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold text-content-primary">{value}</div>
    </div>
  );
}

function SteamLibraryRow({
  app,
  navigate,
  onSyncAchievements,
  syncingAchievementGameId,
  onDetails,
  onRestore,
}) {
  const state = libraryState(app);
  const imageUrl = steamImageUrl(app);
  const achievements = formatAchievementSummary(app.achievements);
  const achievementSyncedAt = formatAchievementSyncDate(app.achievements?.lastSyncedAt);
  const linkedGameId = app.linkedGameId;
  const canSyncAchievements = !!linkedGameId && (
    app.importStatus === "attached" || app.importStatus === "imported"
  );
  const syncingAchievements = linkedGameId && syncingAchievementGameId === linkedGameId;
  const storeUrl = `https://store.steampowered.com/app/${app.steamAppId}`;
  const hasReviewAction = app.importStatus !== "attached" && app.importStatus !== "imported";
  const achievementPercentLabel =
    achievements.percent == null ? "" : `${achievements.percent}%`;
  const achievementSubtext =
    achievements.status === "synced"
      ? achievementSyncedAt
        ? `Synced ${achievementSyncedAt}`
        : ""
      : achievements.status === "unknown"
        ? ""
        : achievements.detail;
  return (
    <article className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.35fr)_110px_125px_175px_minmax(0,0.9fr)_170px] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-12 w-20 rounded object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-12 w-20 items-center justify-center rounded bg-surface-elevated text-content-muted">
            {String(app.steamName || "?").charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-content-primary">
            {app.steamName}
          </h2>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-content-muted">
            <span>App {app.steamAppId}</span>
            {app.proposedCatalogName ? <span>{app.proposedCatalogName}</span> : null}
          </div>
        </div>
      </div>
      <div className="text-sm text-content-primary">
        <span className="text-xs text-content-muted lg:hidden">Playtime </span>
        {hoursFromMinutes(app.playtimeMinutes)}
      </div>
      <div className="text-sm text-content-muted">
        <span className="text-xs lg:hidden">Last played </span>
        {shortDate(app.lastPlayedAt) || "Never"}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant={achievements.tone === "success" ? "success" : achievements.tone === "warning" ? "warning" : "default"}>
            {achievements.label}
          </Badge>
          {achievementPercentLabel ? (
            <span className="text-sm font-medium text-content-primary">
              {achievementPercentLabel}
            </span>
          ) : null}
          {canSyncAchievements ? (
            <IconButton
              icon={Trophy}
              size="sm"
              variant="ghost"
              label={syncingAchievements ? "Syncing achievements" : "Sync achievements"}
              title={syncingAchievements ? "Syncing achievements" : "Sync achievements"}
              onClick={() => onSyncAchievements(app)}
              disabled={syncingAchievements}
              className={syncingAchievements ? "animate-pulse" : ""}
            />
          ) : null}
        </div>
        {achievementSubtext ? (
          <div className="mt-1 truncate text-xs text-content-muted">
            {achievementSubtext}
          </div>
        ) : null}
      </div>
      <div className="min-w-0">
        <Badge variant={state.variant}>{state.label}</Badge>
        {app.duplicateGameName ? (
          <div className="mt-1 truncate text-xs text-content-muted">
            Linked candidate: {app.duplicateGameName}
          </div>
        ) : app.filteredReason ? (
          <div className="mt-1 text-xs text-content-muted">Filtered from normal import piles</div>
        ) : null}
      </div>
      <div className="flex justify-start gap-2 lg:justify-end">
        {app.importStatus === "ignored" ? (
          <Button type="button" size="sm" variant="secondary" onClick={onRestore}>
            Restore
          </Button>
        ) : hasReviewAction ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/steam/import?q=${encodeURIComponent(app.steamName || "")}`)}
          >
            Review
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="secondary" onClick={onDetails}>
          Details
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => window.open(storeUrl, "_blank", "noopener,noreferrer")}
          className="ml-auto lg:ml-0"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Store
        </Button>
      </div>
    </article>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-bg/35 px-3 py-2">
      <div className="text-xs text-content-muted">{label}</div>
      <div className="mt-1 text-sm font-medium text-content-primary">{value || "None"}</div>
    </div>
  );
}

function SteamLibraryDrawer({
  app,
  onClose,
  onSyncAchievements,
  syncingAchievementGameId,
  onHide,
  onRestore,
  onAccept,
  onImport,
  onChangeMatch,
  onLinkExisting,
  onReview,
}) {
  const state = libraryState(app);
  const imageUrl = steamImageUrl(app);
  const achievements = formatAchievementSummary(app.achievements);
  const suggestion = achievementStatusSuggestion({
    status: app.selectedStatus || app.suggestedStatus,
    playtimeMinutes: app.playtimeMinutes,
    lastPlayedAt: app.lastPlayedAt,
    achievements: app.achievements,
  });
  const linkedGameId = app.linkedGameId;
  const syncingAchievements = linkedGameId && syncingAchievementGameId === linkedGameId;
  const canSyncAchievements = !!linkedGameId && (
    app.importStatus === "attached" || app.importStatus === "imported"
  );
  const canImport = !!app.proposedCatalogGameId || !!app.duplicateGameId;
  const storeUrl = `https://store.steampowered.com/app/${app.steamAppId}`;

  return (
    <Modal
      title={app.steamName || "Steam app"}
      description="Steam library details, import state, match repair, and sync actions."
      onClose={onClose}
      maxWidth="max-w-4xl"
    >
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-auto w-full rounded-lg object-cover" />
          ) : (
            <div className="flex aspect-[184/69] w-full items-center justify-center rounded-lg bg-surface-elevated text-content-muted">
              {String(app.steamName || "?").charAt(0)}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Badge variant={state.variant}>{state.label}</Badge>
            {app.filteredReason ? <Badge variant="warning">Likely non-game</Badge> : null}
            {suggestion ? <Badge variant="primary">{suggestion.label}</Badge> : null}
          </div>
          {app.importStatus === "ignored" ? (
            <div className="rounded-lg border border-state-warning/40 bg-state-warning/10 px-3 py-2 text-sm text-state-warning">
              Hidden apps stay hidden on every Steam sync until you restore them.
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <DetailItem label="Steam app" value={app.steamAppId} />
            <DetailItem label="Playtime" value={hoursFromMinutes(app.playtimeMinutes)} />
            <DetailItem label="Last played" value={shortDate(app.lastPlayedAt) || "Never"} />
            <DetailItem label="Achievements" value={achievements.detail || achievements.label} />
          </section>

          <section className="rounded-lg border border-surface-border bg-surface-bg/35 p-3">
            <h3 className="text-sm font-semibold text-content-primary">Match and backlog</h3>
            <div className="mt-2 grid gap-2 text-sm text-content-muted">
              <div>
                Catalog match:{" "}
                <span className="text-content-primary">
                  {app.proposedCatalogName || "No catalog match selected"}
                </span>
              </div>
              <div>
                Backlog link:{" "}
                <span className="text-content-primary">
                  {app.duplicateGameName || (linkedGameId ? `Game #${linkedGameId}` : "Not linked")}
                </span>
              </div>
              {app.matchReason ? (
                <div>
                  Match reason:{" "}
                  <span className="text-content-primary">
                    {app.matchConfidence ? `${app.matchConfidence}: ` : ""}
                    {app.matchReason}
                  </span>
                </div>
              ) : null}
              {app.suggestedStatusReason ? (
                <div>
                  Status suggestion:{" "}
                  <span className="text-content-primary">{app.suggestedStatusReason}</span>
                </div>
              ) : null}
              {suggestion?.reason ? (
                <div>
                  Completion signal:{" "}
                  <span className="text-content-primary">{suggestion.reason}</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-surface-border bg-surface-bg/35 p-3">
            <h3 className="text-sm font-semibold text-content-primary">Achievement summary</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-content-muted">
              <Badge variant={achievements.tone === "success" ? "success" : achievements.tone === "warning" ? "warning" : "default"}>
                {achievements.label}
              </Badge>
              <span>{achievements.detail}</span>
              {app.achievements?.lastSyncedAt ? (
                <span>Synced {formatAchievementSyncDate(app.achievements.lastSyncedAt)}</span>
              ) : null}
            </div>
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => window.open(storeUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Store
            </Button>
            {canSyncAchievements ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onSyncAchievements}
                disabled={syncingAchievements}
              >
                <Trophy className="h-4 w-4" aria-hidden="true" />
                {syncingAchievements ? "Syncing..." : "Sync achievements"}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={onChangeMatch}>
              Change match
            </Button>
            {app.importStatus !== "ignored" ? (
              <Button type="button" variant="secondary" onClick={onLinkExisting}>
                Link existing
              </Button>
            ) : null}
            {app.importStatus === "ignored" ? (
              <Button type="button" variant="primary" onClick={onRestore}>
                Restore
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={onHide}>
                Hide
              </Button>
            )}
            {!app.duplicateGameId && app.proposedCatalogGameId && app.importStatus !== "accepted" ? (
              <Button type="button" variant="secondary" onClick={onAccept}>
                Approve match
              </Button>
            ) : null}
            {app.importStatus !== "attached" && app.importStatus !== "imported" ? (
              <Button type="button" variant="primary" onClick={canImport ? onImport : onReview}>
                {canImport ? (app.duplicateGameId ? "Link to backlog" : "Add to backlog") : "Review"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
