import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Gamepad2,
  Link as LinkIcon,
  Layers3,
  Library,
  RefreshCw,
  Search,
  ShieldAlert,
  Unlink,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  applySteamStatusSuggestion,
  autoMatchSteamImportCandidates,
  bulkUpdateSteamImportCandidates,
  devLinkSteam,
  disconnectSteam,
  getSteamAccount,
  importSteamCandidateScope,
  importSteamCandidates,
  listSteamDuplicateGames,
  listSteamImportCandidates,
  mergeSteamDuplicateGames,
  startSteamLink,
  syncSteamLibrary,
  updateSteamImportCandidate,
} from "../services/steamService";
import { searchCatalog } from "../services/catalogService";
import { useStatuses } from "../hooks/useStatuses";
import { filteredReasonLabel } from "../utils/steamImport";
import {
  formatSteamLibrarySyncMessage,
  loadLastSteamSyncReview,
  saveLastSteamSyncReview,
} from "../utils/steamSync";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Modal,
  SelectMenu,
  TextInput,
  useConfirm,
  useToast,
} from "../components/ui";

const reviewStateOptions = [
  { value: "active", label: "Open review" },
  { value: "pending", label: "Needs decision" },
  { value: "accepted", label: "Approved match" },
  { value: "done", label: "Added or linked" },
  { value: "ignored", label: "Hidden from import" },
  { value: "all", label: "All Steam apps" },
];

const groupOptions = [
  { value: "all", label: "All open" },
  { value: "needs_match", label: "Needs match" },
  { value: "matched", label: "Other ready" },
  { value: "duplicates", label: "Already in backlog" },
  { value: "newly_played", label: "Newly played" },
  { value: "unplayed", label: "0h: plan to play" },
  { value: "played_bit", label: "Under 2h: played a bit" },
  { value: "playing", label: "Recently played" },
  { value: "played_alot", label: "Played a lot" },
  { value: "likely_finished", label: "Likely finished" },
  { value: "filtered", label: "Likely non-games" },
];

const sortOptions = [
  { value: "suggested", label: "Suggested first" },
  { value: "last_played_desc", label: "Recently played" },
  { value: "newly_synced", label: "Newly synced" },
  { value: "playtime_desc", label: "Most playtime" },
  { value: "name", label: "Name A-Z" },
];

const PAGE_LIMIT = 100;

function hoursFromMinutes(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "No Steam playtime";
  const hours = Math.round((value / 60) * 10) / 10;
  return `${hours}h played`;
}

function steamImageUrl(app) {
  if (app?.steamAppId) {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${app.steamAppId}/capsule_184x69.jpg`;
  }
  if (app?.steamIconUrl) return app.steamIconUrl;
  return "";
}

function statusVariant(status) {
  if (status === "imported" || status === "attached") return "success";
  if (status === "ignored") return "warning";
  if (status === "accepted") return "primary";
  return "default";
}

function importStatusLabel(status) {
  if (status === "accepted") return "match approved";
  if (status === "attached") return "linked";
  if (status === "ignored") return "hidden";
  if (status === "imported") return "added";
  return "needs decision";
}

function groupLabel(value) {
  return groupOptions.find((option) => option.value === value)?.label || "current group";
}

function groupHelp(value) {
  const help = {
    all: "Everything still open in this review state.",
    needs_match: "These need a catalog game before they can be added.",
    matched: "Matched apps that can be added but do not fit one of the playtime suggestion piles.",
    duplicates: "These look like games already in your backlog. Link Steam to the existing row instead of creating another one.",
    newly_played: "Steam first showed playtime after a previous sync. These are strong playing candidates.",
    unplayed: "Owned games with no Steam playtime. They default to plan to play.",
    played_bit: "Games with a little Steam playtime. Check whether they belong in your backlog.",
    playing: "Recently played Steam games. These are strong candidates to add as playing.",
    played_alot: "Games with substantial playtime but no clear finish signal.",
    likely_finished: "Games whose Steam playtime is high enough to suggest they may be finished.",
    filtered: "Likely DLC, demos, tools, soundtracks, or other non-backlog apps.",
  };
  return help[value] || "Review this Steam import pile.";
}

const quickGroupValues = [
  "needs_match",
  "matched",
  "duplicates",
  "newly_played",
  "unplayed",
  "played_bit",
  "playing",
  "played_alot",
  "likely_finished",
  "filtered",
];

const importableGroupValues = new Set([
  "matched",
  "duplicates",
  "newly_played",
  "unplayed",
  "playing",
  "played_bit",
  "played_alot",
  "likely_finished",
]);

const approvableGroupValues = new Set([
  "matched",
  "duplicates",
  "newly_played",
  "unplayed",
  "played_bit",
  "playing",
  "played_alot",
  "likely_finished",
]);

export default function SteamImportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, loading: authLoading, isGuest } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { statuses } = useStatuses();
  const [account, setAccount] = useState(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState(searchParams.get("status") || "active");
  const [group, setGroup] = useState(searchParams.get("group") || "needs_match");
  const [sort, setSort] = useState("suggested");
  const [steamSearch, setSteamSearch] = useState(searchParams.get("q") || "");
  const [candidates, setCandidates] = useState([]);
  const [summary, setSummary] = useState({});
  const [page, setPage] = useState({
    offset: 0,
    limit: PAGE_LIMIT,
    total: 0,
    hasMore: false,
  });
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [autoMatching, setAutoMatching] = useState(false);
  const [devSteamId, setDevSteamId] = useState("");
  const [matchCandidate, setMatchCandidate] = useState(null);
  const [matchQuery, setMatchQuery] = useState("");
  const [matchResults, setMatchResults] = useState([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [mergingGroupKey, setMergingGroupKey] = useState("");
  const [syncReview, setSyncReview] = useState(null);
  const [lastSyncReview, setLastSyncReview] = useState(() => loadLastSteamSyncReview());
  const [applyingSuggestionId, setApplyingSuggestionId] = useState(null);

  const isDev =
    typeof import.meta !== "undefined" && !!import.meta.env?.DEV;

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

  const loadCandidates = async ({ append = false } = {}) => {
    if (append) setLoadingMore(true);
    else setCandidateLoading(true);
    try {
      const offset = append ? candidates.length : 0;
      const payload = await listSteamImportCandidates({
        status: filter,
        group,
        sort,
        q: steamSearch.trim(),
        limit: PAGE_LIMIT,
        offset,
      });
      setCandidates((current) =>
        append
          ? [...current, ...(payload?.candidates || [])]
          : payload?.candidates || []
      );
      setSummary(payload?.summary || {});
      setPage(
        payload?.page || {
          offset,
          limit: PAGE_LIMIT,
          total: 0,
          hasMore: false,
        }
      );
      if (!append) setSelectedIds(new Set());
    } catch (error) {
      toast.error(error.message || "Could not load Steam imports.");
    } finally {
      setCandidateLoading(false);
      setLoadingMore(false);
    }
  };

  const loadDuplicateGroups = async () => {
    setDuplicateLoading(true);
    try {
      const payload = await listSteamDuplicateGames();
      setDuplicateGroups(payload?.groups || []);
    } catch (error) {
      toast.error(error.message || "Could not scan duplicate backlog games.");
    } finally {
      setDuplicateLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    loadAccount();
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    loadCandidates();
  }, [authLoading, isAuthenticated, filter, group, sort, steamSearch]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !account) return;
    loadDuplicateGroups();
  }, [authLoading, isAuthenticated, account?.id]);

  useEffect(() => {
    const linked = searchParams.get("linked");
    const error = searchParams.get("error");
    if (linked) toast.success("Steam account linked.");
    if (error) toast.error(error);
    if (searchParams.get("review") === "last") {
      const stored = loadLastSteamSyncReview();
      setLastSyncReview(stored);
      if (stored?.total) setSyncReview(stored);
    }
  }, [searchParams, toast]);

  const storeLastSyncReview = (review) => {
    const stored = saveLastSteamSyncReview(review);
    setLastSyncReview(stored);
    return stored;
  };

  const visibleSelectableIds = candidates
    .filter(
      (candidate) =>
        candidate.importStatus === "pending" ||
        candidate.importStatus === "accepted" ||
        candidate.importStatus === "ignored"
    )
    .map((candidate) => candidate.id);
  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    visibleSelectableIds.length > 0 &&
    visibleSelectableIds.every((id) => selectedIds.has(id));
  const currentGroupCount =
    group === "all"
      ? summary.state?.total || page.total || 0
      : summary.state?.groups?.[group] || page.total || 0;
  const canUseWholePile = group !== "all" && currentGroupCount > 0;
  const canApprovePile = canUseWholePile && approvableGroupValues.has(group);
  const canImportPile = canUseWholePile && importableGroupValues.has(group);
  const canHidePile = canUseWholePile && filter !== "ignored";
  const hiddenCount = summary.ignored || 0;

  const linkSteam = async () => {
    try {
      const payload = await startSteamLink();
      if (payload?.url) window.location.href = payload.url;
    } catch (error) {
      toast.error(error.message || "Could not start Steam linking.");
    }
  };

  const devLink = async () => {
    try {
      await devLinkSteam(devSteamId);
      setDevSteamId("");
      toast.success("Steam account linked for local development.");
      await loadAccount();
    } catch (error) {
      toast.error(error.message || "Could not link SteamID.");
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      toast.info("Steam sync started. I will show the review when it finishes.");
      const payload = await syncSteamLibrary();
      if (payload?.skipped) {
        toast.info(formatSteamLibrarySyncMessage(payload));
      } else if (payload?.private) {
        toast.warning(formatSteamLibrarySyncMessage(payload));
      } else {
        toast.success(formatSteamLibrarySyncMessage(payload));
      }
      if (payload?.syncReview?.total) {
        const stored = storeLastSyncReview(payload.syncReview);
        setSyncReview(stored);
      } else if (!payload?.skipped && !payload?.private) {
        storeLastSyncReview(null);
      }
      setAccount(payload?.account || account);
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not sync Steam library.");
      await loadAccount();
    } finally {
      setSyncing(false);
    }
  };

  const applyStatusSuggestion = async (item, { setStartedAt = false } = {}) => {
    if (!item?.gameId) return;
    setApplyingSuggestionId(item.gameId);
    try {
      await applySteamStatusSuggestion(item.gameId, {
        status: item.suggestedStatus || "playing",
        setStartedAt,
        startedAt: item.firstPlayObservedAt || item.lastPlayedAt || null,
      });
      toast.success(`${item.gameName || item.steamName} marked as playing.`);
      setSyncReview((current) => {
        const next = removeSyncReviewItem(current, item);
        storeLastSyncReview(next);
        return next;
      });
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not apply this Steam suggestion.");
    } finally {
      setApplyingSuggestionId(null);
    }
  };

  const dismissSyncReviewItem = (item) => {
    setSyncReview((current) => {
      const next = removeSyncReviewItem(current, item);
      storeLastSyncReview(next);
      return next;
    });
  };

  const openLastSyncReview = () => {
    const stored = loadLastSteamSyncReview();
    setLastSyncReview(stored);
    if (stored?.total) {
      setSyncReview(stored);
    } else {
      toast.info("No Steam sync review is waiting.");
    }
  };

  const reviewImportPile = (nextGroup = "newly_played") => {
    setFilter("active");
    setGroup(nextGroup);
    setSort("suggested");
    setSyncReview(null);
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: "Disconnect Steam?",
      message:
        "Your backlog games stay in place, but Steam ownership and playtime links will be removed.",
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await disconnectSteam();
      setAccount(null);
      setCandidates([]);
      toast.success("Steam disconnected.");
    } catch (error) {
      toast.error(error.message || "Could not disconnect Steam.");
    }
  };

  const updateCandidate = async (candidate, action, payload = {}) => {
    try {
      await updateSteamImportCandidate(candidate.id, { action, ...payload });
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not update this import.");
    }
  };

  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleSelectableIds.forEach((id) => next.delete(id));
      } else {
        visibleSelectableIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const selectedArray = () => [...selectedIds].map(Number);

  const bulkIgnore = async () => {
    try {
      await bulkUpdateSteamImportCandidates({
        action: "ignore",
        candidateIds: selectedArray(),
      });
      toast.success("Selected Steam apps hidden from import.");
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not hide selected candidates.");
    }
  };

  const bulkRestore = async () => {
    try {
      await bulkUpdateSteamImportCandidates({
        action: "restore",
        candidateIds: selectedArray(),
      });
      toast.success("Selected Steam apps restored to review.");
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not restore selected candidates.");
    }
  };

  const bulkAccept = async () => {
    try {
      await bulkUpdateSteamImportCandidates({
        action: "accept",
        candidateIds: selectedArray(),
      });
      toast.success("Selected matches approved.");
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not approve selected matches.");
    }
  };

  const bulkSetStatus = async () => {
    if (!bulkStatus) return;
    try {
      await bulkUpdateSteamImportCandidates({
        action: "set_status",
        candidateIds: selectedArray(),
        status: bulkStatus,
      });
      toast.success("Selected import statuses updated.");
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not update selected statuses.");
    }
  };

  const bulkScopePayload = () => ({
      scope: {
        group,
        status: filter,
        query: steamSearch.trim(),
      },
    });

  const acceptCurrentGroup = async () => {
    if (group === "all") {
      toast.warning("Choose a specific group before applying this to a whole group.");
      return;
    }
    if (!canApprovePile) return;
    try {
      const payload = await bulkUpdateSteamImportCandidates({
        action: "accept",
        ...bulkScopePayload(),
      });
      toast.success(`Approved ${payload?.updated || 0} matches in ${groupLabel(group)}.`);
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not approve this group.");
    }
  };

  const ignoreCurrentGroup = async () => {
    if (group === "all") {
      toast.warning("Choose a specific group before applying this to a whole group.");
      return;
    }
    if (!canHidePile) return;
    const ok = await confirm({
      title: `Hide ${groupLabel(group)}?`,
      message: `This will hide ${currentGroupCount} Steam app${
        currentGroupCount === 1 ? "" : "s"
      } from the current pile. Hidden apps can be restored from the Hidden from import review state.`,
      confirmLabel: `Hide ${currentGroupCount}`,
      tone: "danger",
    });
    if (!ok) return;
    try {
      const payload = await bulkUpdateSteamImportCandidates({
        action: "ignore",
        ...bulkScopePayload(),
      });
      toast.success(`Hid ${payload?.updated || 0} from ${groupLabel(group)}.`);
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not hide this group.");
    }
  };

  const applyStatusToCurrentGroup = async () => {
    if (group === "all") {
      toast.warning("Choose a specific group before applying this to a whole group.");
      return;
    }
    if (!bulkStatus) return;
    try {
      const payload = await bulkUpdateSteamImportCandidates({
        action: "set_status",
        status: bulkStatus,
        ...bulkScopePayload(),
      });
      toast.success(`Updated ${payload?.updated || 0} statuses in ${groupLabel(group)}.`);
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not update this group.");
    }
  };

  const importCurrentGroup = async () => {
    if (group === "all") {
      toast.warning("Choose a specific group before importing a whole group.");
      return;
    }
    if (!canImportPile) return;
    const ok = await confirm({
      title: group === "duplicates" ? `Link ${groupLabel(group)}?` : `Add ${groupLabel(group)}?`,
      message:
        group === "duplicates"
          ? `This will link up to ${currentGroupCount} Steam app${
              currentGroupCount === 1 ? "" : "s"
            } to existing backlog games when a duplicate match is available.`
          : `This will add or link up to ${currentGroupCount} Steam app${
              currentGroupCount === 1 ? "" : "s"
            } from the current pile. Review selected rows first if you want to exclude anything.`,
      confirmLabel: group === "duplicates" ? `Link ${currentGroupCount}` : `Add ${currentGroupCount}`,
      tone: "default",
    });
    if (!ok) return;
    try {
      const payload = await importSteamCandidateScope({
        group,
        status: filter,
      });
      toast.success(
        group === "duplicates"
          ? `Linked ${payload?.attached?.length || 0}, skipped ${
              payload?.skipped?.length || 0
            }.`
          : `Added ${payload?.imported?.length || 0}, linked ${
              payload?.attached?.length || 0
            }, skipped ${payload?.skipped?.length || 0}.`
      );
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not add or link this group.");
    }
  };

  const bulkImport = async () => {
    try {
      const payload = await importSteamCandidates(selectedArray());
      toast.success(
        `Added ${payload?.imported?.length || 0}, linked ${
          payload?.attached?.length || 0
        }, skipped ${payload?.skipped?.length || 0}.`
      );
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not add or link selected candidates.");
    }
  };

  const autoMatchNext = async () => {
    setAutoMatching(true);
    try {
      const payload = await autoMatchSteamImportCandidates(250);
      toast.success(
        `Auto-matched ${payload?.matched || 0} of ${
          payload?.reviewed || 0
        } reviewed candidates.`
      );
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not auto-match right now.");
    } finally {
      setAutoMatching(false);
    }
  };

  const importCandidate = async (candidate) => {
    try {
      const payload = await importSteamCandidates([candidate.id]);
      const imported = payload?.imported?.length || 0;
      const attached = payload?.attached?.length || 0;
      if (imported || attached) {
        toast.success(
          imported ? "Game added to backlog." : "Steam linked to existing backlog game."
        );
      } else {
        toast.warning("Choose a catalog match before adding this Steam game.");
      }
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not add or link this Steam game.");
    }
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
    if (!matchCandidate) return;
    await updateCandidate(matchCandidate, "select_catalog", {
      catalog_game_id: game.id,
    });
    setMatchCandidate(null);
    setMatchQuery("");
    setMatchResults([]);
  };

  const mergeDuplicateGroup = async (groupData) => {
    const keepGameId = groupData.suggestedKeepId;
    const duplicateGameIds = groupData.games
      .map((game) => game.id)
      .filter((id) => id !== keepGameId);
    const keep = groupData.games.find((game) => game.id === keepGameId);
    const ok = await confirm({
      title: "Merge duplicate games?",
      message: `Keep "${keep?.name || "the suggested game"}" and merge ${
        duplicateGameIds.length
      } duplicate row${duplicateGameIds.length === 1 ? "" : "s"} into it.`,
      confirmLabel: "Merge",
      tone: "danger",
    });
    if (!ok) return;
    setMergingGroupKey(groupData.key);
    try {
      const payload = await mergeSteamDuplicateGames({
        keepGameId,
        duplicateGameIds,
      });
      toast.success(`Merged ${payload?.removed || 0} duplicate game rows.`);
      await loadDuplicateGroups();
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not merge duplicate games.");
    } finally {
      setMergingGroupKey("");
    }
  };

  if (!authLoading && (!isAuthenticated || isGuest)) {
    return (
      <main className="min-h-screen bg-surface-bg px-4 py-6 text-content-primary">
        <EmptyState
          icon={Gamepad2}
          title="Sign in to link Steam."
          description="Steam import is available for saved accounts so ownership data stays private."
          action={
            <Button type="button" variant="primary" onClick={() => navigate("/")}>
              Back to backlog
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-bg px-4 py-5 text-content-primary sm:px-6">
      <header className="sticky top-0 z-30 -mx-4 border-b border-surface-border bg-surface-bg/95 px-4 pb-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Backlog
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate("/steam/library")}>
            <Library className="h-4 w-4" aria-hidden="true" />
            Library
          </Button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-surface-border bg-surface-elevated/70 text-content-secondary">
            <Gamepad2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-semibold">Steam Import</h1>
            <p className="text-xs text-content-muted">
              Link Steam, sync owned games, then choose what joins your backlog.
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto mt-5 max-w-7xl space-y-5">
        <SteamAccountPanel
          account={account}
          loading={accountLoading}
          syncing={syncing}
          onLink={linkSteam}
          onSync={sync}
          onDisconnect={disconnect}
          isDev={isDev}
          devSteamId={devSteamId}
          setDevSteamId={setDevSteamId}
          onDevLink={devLink}
          lastSyncReview={lastSyncReview}
          onOpenLastSyncReview={openLastSyncReview}
        />

        <DuplicateCleanupPanel
          groups={duplicateGroups}
          loading={duplicateLoading}
          mergingKey={mergingGroupKey}
          onRefresh={loadDuplicateGroups}
          onMerge={mergeDuplicateGroup}
        />

        <section className="rounded-lg border border-surface-border bg-surface-card p-4">
          <div>
            <div>
              <h2 className="text-sm font-semibold text-content-primary">
                Review queue
              </h2>
              <p className="mt-1 text-sm text-content-muted">
                Pick a pile, then add, link, match, or hide each Steam app.
              </p>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(280px,1fr)_minmax(180px,230px)_minmax(180px,230px)_minmax(180px,230px)] lg:items-end">
              <Field id="steam-import-search" label="Search Steam library">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
                  <TextInput
                    id="steam-import-search"
                    value={steamSearch}
                    onChange={(event) => setSteamSearch(event.target.value)}
                    placeholder="Find a Steam game..."
                    className="pl-9 pr-9"
                  />
                  {steamSearch ? (
                    <button
                      type="button"
                      onClick={() => setSteamSearch("")}
                      aria-label="Clear Steam import search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-content-muted hover:bg-surface-elevated hover:text-content-primary"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </Field>
              <Field id="steam-import-group" label="Review pile">
                <SelectMenu
                  id="steam-import-group"
                  value={group}
                  onChange={setGroup}
                  options={groupOptions}
                />
              </Field>
              <Field id="steam-import-filter" label="Review state">
                <SelectMenu
                  id="steam-import-filter"
                  value={filter}
                  onChange={setFilter}
                  options={reviewStateOptions}
                />
              </Field>
              <Field id="steam-import-sort" label="Sort">
                <SelectMenu
                  id="steam-import-sort"
                  value={sort}
                  onChange={setSort}
                  options={sortOptions}
                />
              </Field>
            </div>
          </div>

          <AdvancedTools
            selectedCount={selectedCount}
            candidatesCount={candidates.length}
            pageTotal={page.total || 0}
            allVisibleSelected={allVisibleSelected}
            visibleSelectableCount={visibleSelectableIds.length}
            onToggleAllVisible={toggleAllVisible}
            bulkStatus={bulkStatus}
            setBulkStatus={setBulkStatus}
            statuses={statuses}
            onBulkSetStatus={bulkSetStatus}
            onBulkAccept={bulkAccept}
            onBulkRestore={bulkRestore}
            onBulkIgnore={bulkIgnore}
            onBulkImport={bulkImport}
            filter={filter}
            group={group}
            currentGroupCount={currentGroupCount}
            canApprovePile={canApprovePile}
            canHidePile={canHidePile}
            canImportPile={canImportPile}
            onApplyStatusToGroup={applyStatusToCurrentGroup}
            onAcceptGroup={acceptCurrentGroup}
            onIgnoreGroup={ignoreCurrentGroup}
            onImportGroup={importCurrentGroup}
            onAutoMatch={autoMatchNext}
            autoMatching={autoMatching}
            onScanDuplicates={loadDuplicateGroups}
            duplicateLoading={duplicateLoading}
          />

          <div className="mt-4 flex flex-wrap gap-2 border-b border-surface-border pb-3">
            {quickGroupValues.map((value) => {
              const count = summary.state?.groups?.[value] || 0;
              return (
                <Button
                  key={value}
                  type="button"
                  variant={group === value ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setGroup(value)}
                >
                  {groupLabel(value)}
                  <span className="ml-1 text-xs opacity-75">{count}</span>
                </Button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <span className="font-medium text-content-primary">{groupLabel(group)}</span>
              <span className="ml-2 text-content-muted">{groupHelp(group)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {filter !== "ignored" && hiddenCount ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilter("ignored")}
                >
                  View hidden {hiddenCount}
                </Button>
              ) : null}
              <span className="text-content-muted">
                Showing {candidates.length} of {page.total || summary.state?.total || 0}
              </span>
            </div>
          </div>

          <PileActions
            group={group}
            count={currentGroupCount}
            filter={filter}
            canApprove={canApprovePile}
            canHide={canHidePile}
            canImport={canImportPile}
            onAccept={acceptCurrentGroup}
            onIgnore={ignoreCurrentGroup}
            onImport={importCurrentGroup}
          />

          <div className="mt-4 space-y-3">
            {candidateLoading ? (
              <div className="rounded-lg border border-surface-border bg-surface-bg/35 px-3 py-8 text-center text-sm text-content-muted">
                Loading Steam candidates...
              </div>
            ) : candidates.length ? (
              candidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  selected={selectedIds.has(candidate.id)}
                  onToggleSelected={() => toggleSelected(candidate.id)}
                  onIgnore={() => updateCandidate(candidate, "ignore")}
                  onAccept={() => updateCandidate(candidate, "accept")}
                  onRestore={() => updateCandidate(candidate, "restore")}
                  onImport={() => importCandidate(candidate)}
                  statuses={statuses}
                  onSetStatus={(status) =>
                    updateCandidate(candidate, "set_status", { status })
                  }
                  onChangeMatch={() => {
                    setMatchCandidate(candidate);
                    setMatchQuery(candidate.steamName || "");
                    setMatchResults([]);
                  }}
                />
              ))
            ) : (
              <div className="rounded-lg border border-surface-border bg-surface-bg/35 px-3 py-8 text-center text-sm text-content-muted">
                {steamSearch
                  ? "No Steam apps match this search and review pile."
                  : group === "needs_match"
                    ? "No unmatched Steam apps here. Try Ready to add or Already in backlog."
                    : group === "filtered"
                      ? "No likely non-games in this view."
                      : "Nothing needs action in this review pile."}
              </div>
            )}
            {page.hasMore ? (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => loadCandidates({ append: true })}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            ) : null}
          </div>

        </section>
      </section>

      {matchCandidate ? (
        <Modal
          title="Change catalog match"
          description={`Choose the catalog game for ${matchCandidate.steamName}.`}
          onClose={() => setMatchCandidate(null)}
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
                  <Check className="h-4 w-4 text-content-muted" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}

      {syncReview?.total ? (
        <SteamSyncReviewModal
          review={syncReview}
          applyingGameId={applyingSuggestionId}
          onClose={() => setSyncReview(null)}
          onApplyStatus={applyStatusSuggestion}
          onDismissItem={dismissSyncReviewItem}
          onReviewImport={reviewImportPile}
        />
      ) : null}
    </main>
  );
}

function syncReviewKey(item) {
  return `${item?.steamAppId || ""}:${item?.gameId || ""}:${item?.candidateId || ""}`;
}

function removeSyncReviewItem(review, item) {
  if (!review) return null;
  const key = syncReviewKey(item);
  const next = {
    ...review,
    startedPlaying: (review.startedPlaying || []).filter(
      (entry) => syncReviewKey(entry) !== key
    ),
    statusSuggestions: (review.statusSuggestions || []).filter(
      (entry) => syncReviewKey(entry) !== key
    ),
    newSteamGames: (review.newSteamGames || []).filter(
      (entry) => syncReviewKey(entry) !== key
    ),
  };
  next.total =
    next.startedPlaying.length +
    next.statusSuggestions.length +
    next.newSteamGames.length;
  return next.total ? next : null;
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SteamSyncReviewModal({
  review,
  applyingGameId,
  onClose,
  onApplyStatus,
  onDismissItem,
  onReviewImport,
}) {
  const startedPlaying = review.startedPlaying || [];
  const statusSuggestions = review.statusSuggestions || [];
  const newSteamGames = review.newSteamGames || [];
  return (
    <Modal
      title="Steam sync review"
      description="Steam found new activity worth checking before it changes your backlog."
      onClose={onClose}
      maxWidth="max-w-5xl"
    >
      <div className="space-y-5">
        <SyncReviewSection
          title="Started playing"
          empty="No newly started games in this sync."
          items={startedPlaying}
          applyingGameId={applyingGameId}
          onApplyStatus={onApplyStatus}
          onDismissItem={onDismissItem}
          onReviewImport={onReviewImport}
        />
        <SyncReviewSection
          title="Status looks outdated"
          empty="No linked backlog statuses need attention."
          items={statusSuggestions}
          applyingGameId={applyingGameId}
          onApplyStatus={onApplyStatus}
          onDismissItem={onDismissItem}
          onReviewImport={onReviewImport}
        />
        <SyncReviewSection
          title="New Steam games"
          empty="No newly discovered unplayed Steam games in this sync."
          items={newSteamGames}
          applyingGameId={applyingGameId}
          onApplyStatus={onApplyStatus}
          onDismissItem={onDismissItem}
          onReviewImport={onReviewImport}
          importGroup="unplayed"
        />
        <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border pt-4">
          <Button type="button" variant="secondary" onClick={() => onReviewImport("newly_played")}>
            Open newly played pile
          </Button>
          <Button type="button" variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SyncReviewSection({
  title,
  empty,
  items,
  applyingGameId,
  onApplyStatus,
  onDismissItem,
  onReviewImport,
  importGroup = "newly_played",
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
        <Badge variant={items.length ? "primary" : "default"}>{items.length}</Badge>
      </div>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <SyncReviewRow
              key={syncReviewKey(item)}
              item={item}
              applying={applyingGameId === item.gameId}
              onApplyStatus={onApplyStatus}
              onDismiss={() => onDismissItem(item)}
              onReviewImport={() => onReviewImport(importGroup)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-surface-border bg-surface-bg/35 px-3 py-3 text-sm text-content-muted">
          {empty}
        </div>
      )}
    </section>
  );
}

function SyncReviewRow({ item, applying, onApplyStatus, onDismiss, onReviewImport }) {
  const imageUrl = steamImageUrl(item);
  const title = item.gameName || item.steamName;
  const observed = formatShortDate(item.firstPlayObservedAt);
  const lastPlayed = formatShortDate(item.lastPlayedAt);
  const canApply = Boolean(item.gameId);
  const canSetStartedAt = canApply && !item.startedAt && (item.firstPlayObservedAt || item.lastPlayedAt);
  return (
    <article className="grid gap-3 rounded-lg border border-surface-border bg-surface-bg/35 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-14 w-24 rounded object-cover" loading="lazy" />
        ) : (
          <div className="flex h-14 w-24 items-center justify-center rounded bg-surface-elevated text-content-muted">
            {String(title || "?").charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-content-primary">{title}</h4>
            {item.currentStatus ? <Badge>{item.currentStatus}</Badge> : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-content-muted">
            <span>{hoursFromMinutes(item.playtimeMinutes)}</span>
            {observed ? <span>first noticed {observed}</span> : null}
            {lastPlayed ? <span>last played {lastPlayed}</span> : null}
          </div>
          {item.suggestedStatusReason ? (
            <p className="mt-1 text-xs text-content-muted">{item.suggestedStatusReason}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        {canApply ? (
          <>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={applying}
              onClick={() => onApplyStatus(item, { setStartedAt: canSetStartedAt })}
            >
              {applying ? "Applying..." : "Mark playing"}
            </Button>
            {canSetStartedAt ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={applying}
                onClick={() => onApplyStatus(item, { setStartedAt: false })}
              >
                Status only
              </Button>
            ) : null}
          </>
        ) : (
          <Button type="button" variant="primary" size="sm" onClick={onReviewImport}>
            Review import
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </article>
  );
}

function SteamAccountPanel({
  account,
  loading,
  syncing,
  onLink,
  onSync,
  onDisconnect,
  isDev,
  devSteamId,
  setDevSteamId,
  onDevLink,
  lastSyncReview,
  onOpenLastSyncReview,
}) {
  const privateState = account?.syncStatus === "private";

  return (
    <section className="rounded-lg border border-surface-border bg-surface-card px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {account?.avatarUrl ? (
            <img
              src={account.avatarUrl}
              alt=""
              className="h-11 w-11 rounded-lg border border-surface-border object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-surface-border bg-surface-bg/50 text-content-muted">
              <Gamepad2 className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-content-primary">
              {loading
                ? "Loading Steam..."
                : account
                  ? account.displayName || "Steam account linked"
                  : "Steam account"}
            </h2>
            <p className="mt-1 text-sm text-content-muted">
              {account
                ? `SteamID ${account.steamId}`
                : "Connect Steam to sync your owned games into a private review queue."}
            </p>
            {account?.profileUrl ? (
              <a
                href={account.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary-light hover:text-primary"
              >
                View Steam profile
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {account ? (
            <>
              <Button
                type="button"
                variant="primary"
                onClick={onSync}
                disabled={syncing}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {syncing ? "Syncing..." : "Sync library"}
              </Button>
              {lastSyncReview?.total ? (
                <Button type="button" variant="secondary" onClick={onOpenLastSyncReview}>
                  Review last sync
                  <span className="ml-1 text-xs opacity-75">{lastSyncReview.total}</span>
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={onDisconnect}>
                <Unlink className="h-4 w-4" aria-hidden="true" />
                Disconnect
              </Button>
            </>
          ) : (
            <Button type="button" variant="primary" onClick={onLink}>
              <LinkIcon className="h-4 w-4" aria-hidden="true" />
              Link Steam
            </Button>
          )}
        </div>
      </div>

      {privateState ? (
        <div className="mt-4 flex gap-3 rounded-lg border border-state-warning/40 bg-state-warning/10 px-3 py-3 text-sm text-state-warning">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            Steam linked successfully, but Steam returned no owned games. Set Steam
            profile game details to public, then sync again.
          </div>
        </div>
      ) : account?.lastErrorMessage ? (
        <div className="mt-4 rounded-lg border border-state-error/40 bg-state-error/10 px-3 py-3 text-sm text-state-error">
          {account.lastErrorMessage}
        </div>
      ) : null}

      {isDev && !account ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-surface-border pt-4">
          <Field id="steam-dev-id" label="Local dev SteamID64" className="min-w-72">
            <TextInput
              id="steam-dev-id"
              value={devSteamId}
              onChange={(event) => setDevSteamId(event.target.value)}
              placeholder="7656119..."
            />
          </Field>
          <Button type="button" variant="secondary" onClick={onDevLink}>
            Dev link
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function DuplicateCleanupPanel({
  groups = [],
  loading,
  mergingKey,
  onRefresh,
  onMerge,
}) {
  if (!loading && !groups.length) {
    return null;
  }

  return (
    <section className="rounded-lg border border-surface-border bg-surface-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-content-primary">
            Duplicate cleanup
          </h2>
          <p className="mt-1 text-sm text-content-muted">
            Merge likely duplicate backlog rows while keeping the best row and moving Steam links to it.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>
          {loading ? "Scanning..." : "Scan again"}
        </Button>
      </div>

      {loading ? (
        <div className="mt-4 rounded-lg border border-surface-border bg-surface-bg/35 px-3 py-6 text-center text-sm text-content-muted">
          Scanning duplicate backlog rows...
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {groups.map((groupData) => {
            const keep = groupData.games.find(
              (game) => game.id === groupData.suggestedKeepId
            );
            return (
              <div
                key={groupData.key}
                className="rounded-lg border border-surface-border bg-surface-bg/35 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-content-primary">
                      {groupData.reason === "catalog"
                        ? "Same catalog game"
                        : "Same normalized title"}
                    </div>
                    <div className="mt-1 text-xs text-content-muted">
                      Suggested keep: {keep?.name || "best row"} - {groupData.games.length} rows
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => onMerge(groupData)}
                    disabled={mergingKey === groupData.key}
                  >
                    {mergingKey === groupData.key ? "Merging..." : "Merge group"}
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {groupData.games.map((game) => (
                    <div
                      key={game.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        game.id === groupData.suggestedKeepId
                          ? "border-primary/40 bg-primary/10"
                          : "border-surface-border bg-surface-card/45"
                      }`}
                    >
                      <div className="truncate font-medium text-content-primary">
                        {game.name}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-content-muted">
                        <span>#{game.id}</span>
                        <span>{game.status}</span>
                        {game.steamSourceCount ? (
                          <span>{game.steamSourceCount} Steam link{game.steamSourceCount === 1 ? "" : "s"}</span>
                        ) : null}
                        {game.hasThoughts ? <span>notes</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PileActions({
  group,
  count,
  filter,
  canApprove,
  canHide,
  canImport,
  onAccept,
  onIgnore,
  onImport,
}) {
  if (group === "all" || !count) return null;

  const label = groupLabel(group);
  const importLabel = group === "duplicates" ? `Link all ${count}` : `Add all ${count}`;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-bg/30 px-3 py-2">
      <div>
        <div className="text-sm font-medium text-content-primary">
          Actions for {label}
        </div>
        <div className="mt-0.5 text-xs text-content-muted">
          These affect the whole pile, including apps not loaded on this page.
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canApprove ? (
          <Button type="button" variant="secondary" size="sm" onClick={onAccept}>
            Approve all {count}
          </Button>
        ) : null}
        {canHide ? (
          <Button type="button" variant="ghost" size="sm" onClick={onIgnore}>
            Hide all {count}
          </Button>
        ) : null}
        {canImport ? (
          <Button type="button" variant="primary" size="sm" onClick={onImport}>
            {importLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AdvancedTools({
  selectedCount,
  candidatesCount,
  pageTotal,
  allVisibleSelected,
  visibleSelectableCount,
  onToggleAllVisible,
  bulkStatus,
  setBulkStatus,
  statuses = [],
  onBulkSetStatus,
  onBulkAccept,
  onBulkRestore,
  onBulkIgnore,
  onBulkImport,
  filter,
  group,
  currentGroupCount,
  canApprovePile,
  canHidePile,
  canImportPile,
  onApplyStatusToGroup,
  onAcceptGroup,
  onIgnoreGroup,
  onImportGroup,
  onAutoMatch,
  autoMatching,
  onScanDuplicates,
  duplicateLoading,
}) {
  const statusOptions = statuses.map((status) => ({
    value: status,
    label: status,
  }));

  return (
    <details className="mt-4 rounded-lg border border-surface-border bg-surface-bg/20 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-content-primary">
        Advanced tools
        <span className="ml-2 text-xs font-normal text-content-muted">
          bulk actions, whole-pile actions, duplicate repair
        </span>
      </summary>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-surface-border bg-surface-bg/35 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-content-primary">
                Selected apps
              </h3>
              <p className="mt-1 text-xs text-content-muted">
                {selectedCount} selected. Showing {candidatesCount} of {pageTotal}.
              </p>
            </div>
            <Button
              type="button"
              variant={allVisibleSelected ? "primary" : "secondary"}
              size="sm"
              onClick={onToggleAllVisible}
              disabled={!visibleSelectableCount}
            >
              {allVisibleSelected ? "Clear visible" : "Select visible"}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SelectMenu
              id="steam-bulk-status"
              value={bulkStatus}
              onChange={setBulkStatus}
              placeholder="Set status"
              className="h-9 min-w-56"
              options={statusOptions}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onBulkSetStatus}
              disabled={!selectedCount || !bulkStatus}
            >
              Apply status
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onBulkAccept}
              disabled={!selectedCount}
            >
              Approve
            </Button>
            {filter === "ignored" ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onBulkRestore}
                disabled={!selectedCount}
              >
                Restore
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBulkIgnore}
              disabled={!selectedCount}
            >
              Hide
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onBulkImport}
              disabled={!selectedCount}
            >
              Import selected
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-surface-border bg-surface-bg/35 p-3">
          <h3 className="text-sm font-semibold text-content-primary">
            Whole pile
          </h3>
          <p className="mt-1 text-xs text-content-muted">
            {group === "all"
              ? "Choose a specific pile before using these actions."
              : `${currentGroupCount} apps in ${groupLabel(group)}. Actions include apps not visible on this page.`}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onApplyStatusToGroup}
              disabled={group === "all" || !bulkStatus}
            >
              Apply status
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onAcceptGroup}
              disabled={!canApprovePile}
            >
              Approve matches
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onIgnoreGroup}
              disabled={!canHidePile}
            >
              Hide pile
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onImportGroup}
              disabled={!canImportPile}
            >
              {group === "duplicates" ? "Link pile" : "Add pile"}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-surface-border bg-surface-bg/35 p-3 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-content-primary">
                Matching and cleanup
              </h3>
              <p className="mt-1 text-xs text-content-muted">
                Use these when the queue looks wrong or duplicate backlog rows appear.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onAutoMatch}
                disabled={autoMatching}
              >
                <Layers3 className="h-4 w-4" aria-hidden="true" />
                {autoMatching ? "Matching..." : "Improve matches"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onScanDuplicates}
                disabled={duplicateLoading}
              >
                {duplicateLoading ? "Scanning..." : "Scan duplicates"}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </details>
  );
}

function candidateMatchHint(candidate) {
  if (!candidate.proposedCatalogName && !candidate.duplicateGameName) return "";
  if (!candidate.matchReason && !candidate.matchConfidence) return "";
  const confidence = candidate.matchConfidence
    ? `${candidate.matchConfidence} match`
    : "match";
  return candidate.matchReason
    ? `${confidence}: ${candidate.matchReason}`
    : confidence;
}

function candidatePrimaryAction(candidate) {
  if (candidate.importStatus === "ignored") {
    return { label: "Restore", kind: "restore", variant: "secondary" };
  }
  if (candidate.duplicateGameId) {
    return { label: "Link", kind: "import", variant: "primary" };
  }
  if (candidate.proposedCatalogGameId) {
    return { label: "Add", kind: "import", variant: "primary" };
  }
  return { label: "Match", kind: "match", variant: "secondary" };
}

function CandidateRow({
  candidate,
  selected,
  statuses = [],
  onToggleSelected,
  onIgnore,
  onAccept,
  onRestore,
  onImport,
  onSetStatus,
  onChangeMatch,
}) {
  const canImport = !!candidate.proposedCatalogGameId || !!candidate.duplicateGameId;
  const canSelect =
    candidate.importStatus === "pending" ||
    candidate.importStatus === "accepted" ||
    candidate.importStatus === "ignored";
  const isIgnored = candidate.importStatus === "ignored";
  const matchHint = candidateMatchHint(candidate);
  const imageUrl = steamImageUrl(candidate);
  const primaryAction = candidatePrimaryAction(candidate);
  const statusValue = candidate.selectedStatus || candidate.suggestedStatus || "";
  const statusOptions = (statuses || []).map((status) => ({
    value: status,
    label: status,
  }));
  const runPrimaryAction = () => {
    if (primaryAction.kind === "restore") onRestore();
    else if (primaryAction.kind === "match") onChangeMatch();
    else onImport();
  };
  return (
    <article className="rounded-lg border border-surface-border bg-surface-bg/35 p-3">
      <div className="grid gap-3 lg:grid-cols-[2rem_minmax(0,1.3fr)_minmax(190px,0.75fr)_minmax(180px,0.55fr)_auto] lg:items-center">
        <Checkbox
          checked={!!selected}
          disabled={!canSelect}
          onChange={onToggleSelected}
          ariaLabel={`Select ${candidate.steamName}`}
          className="self-center justify-self-start [&>span:first-of-type]:h-5 [&>span:first-of-type]:w-5"
        />
        <div className="flex min-w-0 items-center gap-3">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="h-14 w-24 rounded object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-14 w-24 items-center justify-center rounded bg-surface-elevated text-content-muted">
              {String(candidate.steamName || "?").charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-content-primary">
                {candidate.steamName}
              </h3>
              <Badge variant={statusVariant(candidate.importStatus)}>
                {importStatusLabel(candidate.importStatus)}
              </Badge>
              {candidate.filteredReason ? (
                <Badge variant="warning">{filteredReasonLabel(candidate.filteredReason)}</Badge>
              ) : null}
              {candidate.firstPlayObservedAt ? (
                <Badge variant="primary">new Steam activity</Badge>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-content-muted">
              <span>Steam app {candidate.steamAppId}</span>
              <span>{hoursFromMinutes(candidate.playtimeMinutes)}</span>
              {candidate.firstPlayObservedAt ? (
                <span>first noticed {formatShortDate(candidate.firstPlayObservedAt)}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-w-0 text-sm">
          {candidate.duplicateGameName ? (
            <div>
              <div className="text-content-primary">Link to existing backlog game</div>
              <div className="truncate text-content-muted">
                {candidate.duplicateGameName}
              </div>
            </div>
          ) : candidate.proposedCatalogName ? (
            <div>
              <div className="text-content-primary">Add as new backlog game</div>
              <div className="truncate text-content-muted">
                {candidate.proposedCatalogName}
              </div>
            </div>
          ) : (
            <div className="text-content-primary">Needs catalog match</div>
          )}
          {matchHint ? (
            <div className="mt-1 truncate text-xs text-content-muted" title={matchHint}>
              {matchHint}
            </div>
          ) : null}
        </div>

        <SelectMenu
          id={`steam-candidate-status-inline-${candidate.id}`}
          value={statusValue}
          onChange={onSetStatus}
          placeholder="No status selected"
          className="h-9"
          options={statusOptions}
        />

        <div className="flex justify-start lg:justify-end">
          <Button
            type="button"
            variant={primaryAction.variant}
            size="sm"
            onClick={runPrimaryAction}
            disabled={primaryAction.kind === "import" && !canImport}
          >
            {primaryAction.label}
          </Button>
        </div>
      </div>

      <details className="mt-3 border-t border-surface-border/70 pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-content-muted hover:text-content-primary">
          More options
        </summary>
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(180px,0.7fr)_1fr_auto] md:items-end">
          <Field id={`steam-candidate-status-${candidate.id}`} label="Status">
            <SelectMenu
              id={`steam-candidate-status-${candidate.id}`}
              value={statusValue}
              onChange={onSetStatus}
              placeholder="Set status"
              className="h-9"
              options={statusOptions}
            />
          </Field>
          <div className="text-xs text-content-muted">
            {candidate.suggestedStatusReason || matchHint || "Adjust match, status, or import visibility."}
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onChangeMatch}
              disabled={isIgnored}
            >
              Change match
            </Button>
            {!candidate.duplicateGameId && !isIgnored ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onAccept}
                disabled={!candidate.proposedCatalogGameId}
              >
                Approve
              </Button>
            ) : null}
            {isIgnored ? null : (
              <Button type="button" variant="ghost" size="sm" onClick={onIgnore}>
                Hide
              </Button>
            )}
          </div>
        </div>
      </details>
    </article>
  );
}
