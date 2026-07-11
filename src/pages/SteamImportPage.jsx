import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  EyeOff,
  Gamepad2,
  Inbox,
  Library,
  Search,
  Sparkles,
} from "lucide-react";
import { AppPage, PageHeader, PageSection } from "../components/layout";
import { useAuth } from "../contexts/AuthContext";
import {
  applySteamStatusSuggestion,
  autoMatchSteamImportCandidates,
  bulkUpdateSteamImportCandidates,
  devLinkSteam,
  disconnectSteam,
  importSteamCandidateScope,
  importSteamCandidates,
  listSteamDuplicateGames,
  mergeSteamDuplicateGames,
  startSteamLink,
  updateSteamImportCandidate,
} from "../services/steamService";
import { useStatuses } from "../hooks/useStatuses";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import {
  useSteamAccount,
  useSteamCandidates,
  useSteamCatalogSearch,
  useSteamSync,
} from "../features/steam/hooks";
import { filteredReasonLabel } from "../utils/steamImport";
import {
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
import {
  formatSteamDate,
  formatSteamPlaytime,
  steamCapsuleUrl,
} from "../utils/steamDisplay";
import {
  removeSyncReviewItem,
  SteamSyncReviewModal,
} from "./SteamImport/SteamSyncReview";
import { CandidateRow } from "./SteamImport/SteamCandidateRow";
import {
  AdvancedTools,
  DuplicateCleanupPanel,
  ReviewCategoryNav,
  ReviewGroupFilters,
  SelectionActionBar,
  SteamAccountPanel,
} from "./SteamImport/SteamImportPanels";
import { groupLabel } from "./SteamImport/steamImportGroups";

const sortOptions = [
  { value: "suggested", label: "Suggested first" },
  { value: "last_played_desc", label: "Recently played" },
  { value: "newly_synced", label: "Newly synced" },
  { value: "playtime_desc", label: "Most playtime" },
  { value: "name", label: "Name A-Z" },
];

const PAGE_LIMIT = 100;

const readySuggestionGroups = [
  { value: "matched", label: "Other ready" },
  { value: "newly_played", label: "New activity" },
  { value: "unplayed", label: "Not played" },
  { value: "played_bit", label: "Played a bit" },
  { value: "playing", label: "Recently played" },
  { value: "played_alot", label: "Played a lot" },
  { value: "likely_finished", label: "Likely finished" },
];

const readyGroupValues = new Set(
  readySuggestionGroups.map((item) => item.value),
);

function reviewCategoryFor(filter, group) {
  if (filter === "ignored") return "ignored";
  if (filter === "done") return "resolved";
  if (group === "needs_match" || group === "filtered") return "attention";
  if (group === "duplicates") return "backlog";
  if (readyGroupValues.has(group)) return "ready";
  return "attention";
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, loading: authLoading, isGuest } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { statuses } = useStatuses();
  const {
    account,
    setAccount,
    loading: accountLoading,
    reload: loadAccount,
  } = useSteamAccount({
    enabled: !authLoading && isAuthenticated,
    onError: (error) =>
      toast.error(error.message || "Could not load Steam account."),
  });
  const [filter, setFilter] = useState(searchParams.get("status") || "active");
  const [group, setGroup] = useState(
    searchParams.get("group") || "needs_match",
  );
  const [sort, setSort] = useState(searchParams.get("sort") || "suggested");
  const [steamSearch, setSteamSearch] = useState(searchParams.get("q") || "");
  const debouncedSteamSearch = useDebouncedValue(steamSearch, 180);
  const {
    candidates,
    setCandidates,
    summary: candidateSummary,
    page,
    loading: candidateLoading,
    loadingMore,
    load: loadSteamCandidates,
    clear: clearCandidates,
  } = useSteamCandidates({
    limit: PAGE_LIMIT,
    onError: (error) =>
      toast.error(error.message || "Could not load Steam imports."),
  });
  const summary = candidateSummary || {};
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [autoMatching, setAutoMatching] = useState(false);
  const [devSteamId, setDevSteamId] = useState("");
  const {
    candidate: matchCandidate,
    query: matchQuery,
    setQuery: setMatchQuery,
    results: matchResults,
    loading: matchLoading,
    open: openMatch,
    close: closeMatch,
    search: searchCatalogMatches,
  } = useSteamCatalogSearch({
    onError: (error) =>
      toast.error(error.message || "Could not search catalog matches."),
  });
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [mergingGroupKey, setMergingGroupKey] = useState("");
  const [syncReview, setSyncReview] = useState(null);
  const [lastSyncReview, setLastSyncReview] = useState(() =>
    loadLastSteamSyncReview(),
  );
  const [applyingSuggestionId, setApplyingSuggestionId] = useState(null);

  const isDev = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;

  const loadCandidates = async ({ append = false } = {}) => {
    const payload = await loadSteamCandidates({
      append,
      params: {
        status: filter,
        group,
        sort,
        q: debouncedSteamSearch.trim(),
      },
    });
    if (!append && payload) setSelectedIds(new Set());
    return payload;
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
    loadCandidates();
  }, [authLoading, isAuthenticated, filter, group, sort, debouncedSteamSearch]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !account) return;
    loadDuplicateGroups();
  }, [authLoading, isAuthenticated, account?.id]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("status", filter);
    next.set("group", group);
    next.set("sort", sort);
    if (debouncedSteamSearch.trim()) next.set("q", debouncedSteamSearch.trim());
    else next.delete("q");
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [
    debouncedSteamSearch,
    filter,
    group,
    searchParams,
    setSearchParams,
    sort,
  ]);

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
        candidate.importStatus === "ignored",
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
  const activeReviewCategory = reviewCategoryFor(filter, group);
  const readyCount = readySuggestionGroups.reduce(
    (total, item) => total + (summary.groups?.[item.value] || 0),
    0,
  );
  const reviewCategories = [
    {
      value: "attention",
      label: "Needs attention",
      description: "Missing or uncertain matches",
      count:
        (summary.groups?.needs_match || 0) + (summary.groups?.filtered || 0),
      icon: AlertTriangle,
    },
    {
      value: "ready",
      label: "Ready to add",
      description: "Matched games with a suggested status",
      count: readyCount,
      icon: Sparkles,
    },
    {
      value: "backlog",
      label: "Already in backlog",
      description: "Link Steam to an existing game",
      count: summary.groups?.duplicates || 0,
      icon: Library,
    },
    {
      value: "ignored",
      label: "Ignored",
      description: "Apps hidden from review",
      count: summary.ignored || 0,
      icon: EyeOff,
    },
    {
      value: "resolved",
      label: "Resolved",
      description: "Added or linked games",
      count: (summary.imported || 0) + (summary.attached || 0),
      icon: CheckCircle2,
    },
  ];

  const changeReviewCategory = (value) => {
    setSelectedIds(new Set());
    if (value === "attention") {
      setFilter("active");
      setGroup("needs_match");
    } else if (value === "ready") {
      setFilter("active");
      setGroup("matched");
    } else if (value === "backlog") {
      setFilter("active");
      setGroup("duplicates");
    } else if (value === "ignored") {
      setFilter("ignored");
      setGroup("all");
    } else if (value === "resolved") {
      setFilter("done");
      setGroup("all");
    }
  };

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

  const { syncing, sync } = useSteamSync({
    onAccount: setAccount,
    onReview: (stored) => {
      setLastSyncReview(stored);
      if (stored?.total) setSyncReview(stored);
    },
    onComplete: async () => {
      await loadCandidates();
    },
    onError: async (error) => {
      toast.error(error.message || "Could not sync Steam library.");
      await loadAccount();
    },
  });

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
      clearCandidates();
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
      toast.warning(
        "Choose a specific group before applying this to a whole group.",
      );
      return;
    }
    if (!canApprovePile) return;
    try {
      const payload = await bulkUpdateSteamImportCandidates({
        action: "accept",
        ...bulkScopePayload(),
      });
      toast.success(
        `Approved ${payload?.updated || 0} matches in ${groupLabel(group)}.`,
      );
      await loadCandidates();
    } catch (error) {
      toast.error(error.message || "Could not approve this group.");
    }
  };

  const ignoreCurrentGroup = async () => {
    if (group === "all") {
      toast.warning(
        "Choose a specific group before applying this to a whole group.",
      );
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
      toast.warning(
        "Choose a specific group before applying this to a whole group.",
      );
      return;
    }
    if (!bulkStatus) return;
    try {
      const payload = await bulkUpdateSteamImportCandidates({
        action: "set_status",
        status: bulkStatus,
        ...bulkScopePayload(),
      });
      toast.success(
        `Updated ${payload?.updated || 0} statuses in ${groupLabel(group)}.`,
      );
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
      title:
        group === "duplicates"
          ? `Link ${groupLabel(group)}?`
          : `Add ${groupLabel(group)}?`,
      message:
        group === "duplicates"
          ? `This will link up to ${currentGroupCount} Steam app${
              currentGroupCount === 1 ? "" : "s"
            } to existing backlog games when a duplicate match is available.`
          : `This will add or link up to ${currentGroupCount} Steam app${
              currentGroupCount === 1 ? "" : "s"
            } from the current pile. Review selected rows first if you want to exclude anything.`,
      confirmLabel:
        group === "duplicates"
          ? `Link ${currentGroupCount}`
          : `Add ${currentGroupCount}`,
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
            }, skipped ${payload?.skipped?.length || 0}.`,
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
        }, skipped ${payload?.skipped?.length || 0}.`,
      );
      await loadCandidates();
    } catch (error) {
      toast.error(
        error.message || "Could not add or link selected candidates.",
      );
    }
  };

  const autoMatchNext = async () => {
    setAutoMatching(true);
    try {
      const payload = await autoMatchSteamImportCandidates(250);
      toast.success(
        `Auto-matched ${payload?.matched || 0} of ${
          payload?.reviewed || 0
        } reviewed candidates.`,
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
          imported
            ? "Game added to backlog."
            : "Steam linked to existing backlog game.",
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
    await searchCatalogMatches();
  };

  const chooseMatch = async (game) => {
    if (!matchCandidate) return;
    await updateCandidate(matchCandidate, "select_catalog", {
      catalog_game_id: game.id,
    });
    closeMatch();
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
      <AppPage width="full">
        <PageHeader
          title="Steam Review"
          description="Review Steam games before they change your backlog."
          icon={Gamepad2}
        />
        <div className="pt-8">
          <EmptyState
            icon={Gamepad2}
            title="Sign in to link Steam."
            description="Steam import is available for saved accounts so ownership data stays private."
            action={
              <Button
                type="button"
                variant="primary"
                onClick={() => navigate("/")}
              >
                Back to backlog
              </Button>
            }
          />
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage width="full">
      <PageHeader
        title="Steam Review"
        description="Review Steam games before they change your backlog."
        icon={Gamepad2}
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/steam/library")}
          >
            <Library className="h-4 w-4" aria-hidden="true" />
            Steam Library
          </Button>
        }
      />

      <PageSection className="pt-6" contentClassName="space-y-5">
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

        <section className="rounded-card border border-surface-border bg-surface-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Inbox
                  className="h-5 w-5 text-primary-light"
                  aria-hidden="true"
                />
                <h2 className="text-lg font-semibold text-content-primary">
                  Review inbox
                </h2>
              </div>
              <p className="mt-1 text-sm text-content-muted">
                Review Steam games that need a match, a backlog status, or a
                final decision.
              </p>
            </div>
            <Button
              type="button"
              variant={allVisibleSelected ? "primary" : "secondary"}
              size="sm"
              onClick={toggleAllVisible}
              disabled={!visibleSelectableIds.length}
            >
              {allVisibleSelected
                ? "Clear visible selection"
                : "Select visible"}
            </Button>
          </div>

          <div className="mt-5">
            <ReviewCategoryNav
              activeCategory={activeReviewCategory}
              categories={reviewCategories}
              onChange={changeReviewCategory}
            />
          </div>

          <ReviewGroupFilters
            activeCategory={activeReviewCategory}
            group={group}
            summary={summary}
            readyGroups={readySuggestionGroups}
            onChange={(nextGroup) => {
              setFilter("active");
              setGroup(nextGroup);
            }}
          />

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(280px,1fr)_minmax(180px,230px)] lg:items-end">
            <Field id="steam-import-search" label="Search this review">
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
                    aria-label="Clear Steam review search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-content-muted hover:bg-surface-elevated hover:text-content-primary"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
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

          <SelectionActionBar
            selectedCount={selectedCount}
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
            isIgnoredView={filter === "ignored"}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-surface-border pb-3 text-sm">
            <div>
              <span className="font-semibold text-content-primary">
                {group === "all"
                  ? reviewCategories.find(
                      (item) => item.value === activeReviewCategory,
                    )?.label
                  : groupLabel(group)}
              </span>
              <span className="ml-2 text-content-muted">
                {page.total || summary.state?.total || 0} item
                {(page.total || summary.state?.total || 0) === 1 ? "" : "s"}
              </span>
            </div>
            {filter !== "ignored" && hiddenCount ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => changeReviewCategory("ignored")}
              >
                View ignored {hiddenCount}
              </Button>
            ) : null}
          </div>

          <AdvancedTools
            group={group}
            currentGroupCount={currentGroupCount}
            canApprovePile={canApprovePile}
            canHidePile={canHidePile}
            canImportPile={canImportPile}
            bulkStatus={bulkStatus}
            setBulkStatus={setBulkStatus}
            statuses={statuses}
            onApplyStatusToGroup={applyStatusToCurrentGroup}
            onAcceptGroup={acceptCurrentGroup}
            onIgnoreGroup={ignoreCurrentGroup}
            onImportGroup={importCurrentGroup}
            onAutoMatch={autoMatchNext}
            autoMatching={autoMatching}
            onScanDuplicates={loadDuplicateGroups}
            duplicateLoading={duplicateLoading}
          />

          <div className="mt-4 space-y-3">
            {candidateLoading ? (
              <div className="rounded-lg border border-surface-border bg-surface-bg/35 px-3 py-10 text-center text-sm text-content-muted">
                Loading Steam review...
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
                  onChangeMatch={() => openMatch(candidate)}
                />
              ))
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title={
                  steamSearch
                    ? "No matching Steam games"
                    : "This review is clear"
                }
                description={
                  steamSearch
                    ? "Try a different search or review category."
                    : activeReviewCategory === "ignored"
                      ? "You have not ignored any Steam apps."
                      : activeReviewCategory === "resolved"
                        ? "No Steam games have been resolved in this view yet."
                        : "Nothing currently needs a decision in this category."
                }
              />
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
      </PageSection>

      {matchCandidate ? (
        <Modal
          title="Change catalog match"
          description={`Choose the catalog game for ${matchCandidate.steamName}.`}
          onClose={closeMatch}
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
                  <Check
                    className="h-4 w-4 text-content-muted"
                    aria-hidden="true"
                  />
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
    </AppPage>
  );
}
