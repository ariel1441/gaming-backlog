import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gamepad2,
  Layers3,
  ListPlus,
  Pencil,
  RefreshCw,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import {
  Button,
  Chip,
  Field,
  GameCover,
  IconButton,
  MultiSelectMenu,
  SelectMenu,
  StatusBadge,
  Switch,
  Textarea,
  TextInput,
  useConfirm,
  useToast,
} from "./ui";
import {
  attachSteamCandidate,
  listSteamLinkCandidates,
  syncSteamGameAchievements,
  unlinkSteamGame,
} from "../services/steamService";
import { resolveGameHours } from "../utils/hours";
import {
  formatAchievementSummary,
  formatAchievementSyncDate,
} from "../utils/steamAchievements";
import { formatAchievementGameSyncMessage } from "../utils/steamSync";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";
import { splitCsv } from "../utils/gameList";
import { statusOption } from "../utils/statusDisplay";
import { searchGames } from "../services/gameService";
import GameSearchResult from "./GameSearchResult";
import EditGameSteamSection from "./EditGameSteamSection";
import { useStatusGroups } from "../contexts/StatusGroupsContext";

const hourSourceOptions = [
  { value: "auto", label: "Auto" },
  { value: "estimate", label: "Estimate" },
  { value: "steam_actual", label: "Steam actual" },
];

function toDateStr(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toISOString().slice(0, 10);
}

function draftFromGame(game) {
  const source = game || {};
  return {
    id: source.id || "",
    name: source.name || "",
    status: source.status || "",
    how_long_to_beat: source.how_long_to_beat ?? "",
    hours_preferred_source: source.hours_preferred_source || "auto",
    hours_locked: !!source.hours_locked,
    my_genre: source.my_genre || "",
    personal_genres: Array.isArray(source.personal_genres)
      ? source.personal_genres
      : splitCsv(source.my_genre).map((name) => ({ name })),
    thoughts: source.thoughts || "",
    resume_note: source.resume_note || "",
    my_score: source.my_score ?? "",
    started_at: toDateStr(source.started_at),
    finished_at: toDateStr(source.finished_at),
    rawg_id: source.rawg_id ?? null,
    rawg_slug: source.rawg_slug || "",
    rawg_cover: source.cover || "",
    rawg_released: source.releaseDate || "",
    rawg_selection_confirmed: false,
  };
}

function draftKey(draft) {
  return JSON.stringify(draft);
}

function fmtDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Metric({ icon: Icon, label, value, tone = "default" }) {
  const toneClass =
    tone === "success"
      ? "text-state-success"
      : tone === "warning"
        ? "text-state-warning"
        : tone === "primary"
          ? "text-primary-light"
          : value === "—"
            ? "text-content-muted"
            : "text-content-primary";

  return (
    <div className="min-w-0 border-r border-surface-border/55 pr-4 last:border-r-0 last:pr-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1.5 truncate text-sm font-semibold ${toneClass}`}>
        {value || "—"}
      </div>
    </div>
  );
}

function EditMetric({ label, children, error }) {
  return (
    <div className="min-w-0 border-r border-surface-border/55 pr-4 last:border-r-0 last:pr-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
      {error ? <div className="mt-1 text-xs text-state-error">{error}</div> : null}
    </div>
  );
}

function DetailRow({ label, value, icon: Icon }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5">
      {Icon ? (
        <Icon
          className="mt-0.5 h-4 w-4 shrink-0 text-content-muted"
          aria-hidden="true"
        />
      ) : null}
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
          {label}
        </div>
        <div className="mt-1 break-words text-sm text-content-secondary">
          {value}
        </div>
      </div>
    </div>
  );
}

function GenreDetailRow({ label, value, icon: Icon, variant }) {
  const genres = splitCsv(value);
  if (!genres.length) return null;

  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-content-muted"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
          {label}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {genres.map((genre) => (
            <Chip
              key={genre}
              variant={variant}
              title={genre}
              className="min-w-0 whitespace-normal break-words"
            >
              {genre}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

const viewTabs = [
  { value: "overview", label: "Overview", icon: Layers3 },
  { value: "achievements", label: "Achievements", icon: Trophy },
  { value: "notes", label: "Notes", icon: Sparkles },
  { value: "activity", label: "Activity", icon: CalendarDays },
];

export default function GameModal({
  game,
  onClose,
  onRefresh,
  onGameRefresh,
  onEdit,
  onSubmitEdit,
  onCancelEdit,
  onGameUpdated,
  startInEditMode = false,
  isSubmitting = false,
  formError = null,
  onDraftChange,
  statuses = [],
  allMyGenres = [],
  readOnly = false,
  hidePrivateFields = false,
  onAddToNextUp,
  onFinish,
  onDelete,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditMode, setIsEditMode] = useState(startInEditMode);
  const [draft, setDraft] = useState(() => draftFromGame(game));
  const [savedDraft, setSavedDraft] = useState(() => draftFromGame(game));
  const [syncingAchievements, setSyncingAchievements] = useState(false);
  const [localAchievements, setLocalAchievements] = useState(null);
  const [metadataQuery, setMetadataQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [steamQuery, setSteamQuery] = useState("");
  const [steamResults, setSteamResults] = useState([]);
  const [steamSearching, setSteamSearching] = useState(false);
  const [steamAttachingId, setSteamAttachingId] = useState(null);
  const [linkedSteam, setLinkedSteam] = useState(null);
  const [unlinkedSteamAppId, setUnlinkedSteamAppId] = useState(null);
  const [steamUnlinking, setSteamUnlinking] = useState(false);
  const [steamAchievementsSyncing, setSteamAchievementsSyncing] =
    useState(false);
  const [showSteamSearch, setShowSteamSearch] = useState(false);
  const modalRef = useRef(null);
  const titleId = `${useId()}-title`;
  const toast = useToast();
  const confirm = useConfirm();
  const { statusGroupOf } = useStatusGroups();
  const dirty = draftKey(draft) !== draftKey(savedDraft);
  const canEdit = !readOnly && !!onSubmitEdit;
  const normalizedStatus = String(game?.status || "").trim().toLowerCase();
  const canAddToNextUp =
    !!onAddToNextUp &&
    !["playing", "done"].includes(statusGroupOf(game?.status));
  const canFinish =
    !!onFinish && normalizedStatus !== "finished";
  const tabs = isEditMode
    ? [...viewTabs, { value: "metadata", label: "Metadata", icon: Tag }]
    : viewTabs;

  useEffect(() => {
    setLocalAchievements(null);
    setActiveTab("overview");
    const nextDraft = draftFromGame(game);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    setMetadataQuery(game?.name || "");
    setLinkedSteam(null);
    setUnlinkedSteamAppId(null);
    setSteamResults([]);
    setShowSteamSearch(false);
    setIsEditMode(startInEditMode);
  }, [game?.id, startInEditMode]);

  useEffect(() => {
    if (!isEditMode || activeTab !== "metadata") return;
    const query = metadataQuery.trim();
    if (query.length < 3) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError("");
      searchGames(query, { signal: controller.signal })
        .then((payload) =>
          setSearchResults(
            Array.isArray(payload?.results) ? payload.results : [],
          ),
        )
        .catch((error) => {
          if (error?.name !== "AbortError")
            setSearchError("Could not search games right now.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [activeTab, isEditMode, metadataQuery]);

  const achievements = useMemo(
    () =>
      formatAchievementSummary(localAchievements || game?.steamAchievements),
    [game?.steamAchievements, localAchievements],
  );

  const updateDraft = (patch) => {
    onDraftChange?.();
    setDraft((current) => ({ ...current, ...patch }));
  };

  const submitDraft = async () => {
    if (!onSubmitEdit || isSubmitting) return false;
    const result = await onSubmitEdit(draft);
    if (result?.ok === false) return false;
    const updated = result?.game || { ...game, ...draft };
    const nextDraft = draftFromGame(updated);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    setIsEditMode(false);
    setActiveTab("overview");
    onGameUpdated?.(updated);
    return true;
  };

  const promptUnsaved = () =>
    confirm({
      title: "Unsaved game changes",
      message: "Save your edits before leaving this game?",
      confirmLabel: "Save changes",
      confirmValue: "save",
      secondaryLabel: "Discard changes",
      secondaryValue: "discard",
      cancelLabel: "Keep editing",
      tone: "primary",
    });

  const leaveEditMode = async () => {
    if (isSubmitting) return false;
    if (!dirty) {
      setIsEditMode(false);
      setActiveTab("overview");
      onCancelEdit?.();
      return true;
    }
    const choice = await promptUnsaved();
    if (choice === "save") return submitDraft();
    if (choice === "discard") {
      setDraft(savedDraft);
      setIsEditMode(false);
      setActiveTab("overview");
      onCancelEdit?.();
      return true;
    }
    return false;
  };

  const requestClose = async () => {
    if (isEditMode && dirty) {
      const choice = await promptUnsaved();
      if (choice === "save" && !(await submitDraft())) return;
      if (choice !== "save" && choice !== "discard") return;
    }
    onCancelEdit?.();
    onClose?.();
  };

  useDismissibleLayer({
    open: !!game,
    layerRef: modalRef,
    onDismiss: () => {
      void requestClose();
    },
    trapFocus: true,
    lockScroll: true,
    restoreFocus: true,
  });

  useEffect(() => {
    if (!isEditMode || !dirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty, isEditMode]);

  if (!game) return null;

  const displayGame = isEditMode ? { ...game, ...draft } : game;
  const cover = (isEditMode ? draft.rawg_cover : game.cover) || null;
  const releaseDate = fmtDate(
    isEditMode ? draft.rawg_released || game.releaseDate : game.releaseDate,
  );
  const startedAt = fmtDate(displayGame.started_at);
  const finishedAt = fmtDate(displayGame.finished_at);
  const steamLastPlayed = fmtDate(game.steamLastPlayedAt);
  const steamFirstObserved = fmtDate(game.steamFirstPlayObservedAt);
  const hours = resolveGameHours(displayGame);
  const rating = Number(game.rating) > 0 ? `${game.rating}/5` : "—";
  const metacritic =
    Number(game.metacritic) > 0 ? String(game.metacritic) : "—";
  const hasMyScore =
    displayGame.my_score !== null &&
    displayGame.my_score !== undefined &&
    String(displayGame.my_score).trim() !== "" &&
    Number.isFinite(Number(displayGame.my_score));
  const myScore = hasMyScore ? `${displayGame.my_score}/10` : "—";
  const thoughts = displayGame.thoughts?.trim() || null;
  const resumeNote = displayGame.resume_note?.trim() || null;
  const description = game.description || null;
  const achievementSyncedAt = formatAchievementSyncDate(
    (localAchievements || game.steamAchievements)?.lastSyncedAt,
  );
  const statusOptions = statuses.map(statusOption);
  const selectedMyGenres = Array.isArray(draft.personal_genres)
    ? draft.personal_genres.map((genre) =>
        typeof genre === "string" ? genre : genre?.name,
      ).filter(Boolean)
    : splitCsv(draft.my_genre);
  const currentSteam = linkedSteam
    ? {
        steamAppId: linkedSteam.steamAppId,
        steamName: linkedSteam.steamName,
        playtimeMinutes: linkedSteam.playtimeMinutes,
        lastPlayedAt: linkedSteam.lastPlayedAt,
        lastSyncedAt: null,
        achievements: localAchievements || linkedSteam.achievements || null,
      }
    : game.steamOwned && game.steamAppId !== unlinkedSteamAppId
      ? {
          steamAppId: game.steamAppId,
          steamName: game.steamName,
          playtimeMinutes: game.steamPlaytimeMinutes,
          lastPlayedAt: game.steamLastPlayedAt,
          lastSyncedAt: game.steamLastSyncedAt,
          achievements: localAchievements || game.steamAchievements || null,
        }
      : null;
  const currentAchievements = currentSteam
    ? formatAchievementSummary(currentSteam.achievements)
    : null;
  const currentAchievementsSyncedAt = currentSteam
    ? formatAchievementSyncDate(currentSteam.achievements?.lastSyncedAt)
    : "";

  const syncAchievements = async () => {
    setSyncingAchievements(true);
    try {
      const payload = await syncSteamGameAchievements(game.id);
      const result = formatAchievementGameSyncMessage(payload);
      toast[result.tone](result.message);
      if (payload?.achievements) setLocalAchievements(payload.achievements);
      await onGameRefresh?.();
    } catch (error) {
      toast.error(error.message || "Could not sync Steam achievements.");
    } finally {
      setSyncingAchievements(false);
    }
  };

  const selectRawgGame = (result) => {
    updateDraft({
      name: result.name,
      rawg_id: result.rawg_id,
      rawg_slug: result.rawg_slug || "",
      rawg_cover: result.cover || "",
      rawg_released: result.released || "",
      rawg_selection_confirmed: true,
    });
    setMetadataQuery(result.name);
  };

  const clearRawgSelection = () =>
    updateDraft({
      rawg_id: null,
      rawg_slug: "",
      rawg_cover: "",
      rawg_released: "",
      rawg_selection_confirmed: true,
    });

  const searchSteamLinks = async () => {
    const query = (steamQuery || draft.name || game.name || "").trim();
    if (!query) return;
    setSteamSearching(true);
    try {
      const payload = await listSteamLinkCandidates({
        q: query,
        gameId: game.id,
        limit: 8,
      });
      setSteamResults(payload?.results || []);
    } catch (error) {
      toast.error(error.message || "Could not search Steam apps.");
    } finally {
      setSteamSearching(false);
    }
  };

  const attachSteam = async (candidate) => {
    setSteamAttachingId(candidate.id);
    try {
      await attachSteamCandidate(candidate.id, game.id);
      setLinkedSteam(candidate);
      setLocalAchievements(candidate.achievements || null);
      setUnlinkedSteamAppId(null);
      setSteamResults([]);
      setShowSteamSearch(false);
      toast.success("Steam app linked to this game.");
      await onGameRefresh?.();
    } catch (error) {
      toast.error(error.message || "Could not link Steam app.");
    } finally {
      setSteamAttachingId(null);
    }
  };

  const unlinkSteam = async () => {
    if (!currentSteam?.steamAppId) return;
    const approved = await confirm({
      title: "Unlink Steam app?",
      message:
        "This keeps the Steam app in your synced library, but removes ownership and playtime from this backlog game.",
      confirmLabel: "Unlink",
      tone: "danger",
    });
    if (!approved) return;
    setSteamUnlinking(true);
    try {
      await unlinkSteamGame(game.id, currentSteam.steamAppId);
      setLinkedSteam(null);
      setLocalAchievements(null);
      setUnlinkedSteamAppId(currentSteam.steamAppId);
      setShowSteamSearch(true);
      toast.success("Steam app unlinked from this game.");
      await onGameRefresh?.();
    } catch (error) {
      toast.error(error.message || "Could not unlink Steam app.");
    } finally {
      setSteamUnlinking(false);
    }
  };

  const syncCurrentSteamAchievements = async () => {
    if (!currentSteam?.steamAppId) return;
    setSteamAchievementsSyncing(true);
    try {
      const payload = await syncSteamGameAchievements(game.id);
      const result = formatAchievementGameSyncMessage(payload);
      toast[result.tone](result.message);
      if (payload?.achievements) setLocalAchievements(payload.achievements);
      await onGameRefresh?.();
    } catch (error) {
      toast.error(error.message || "Could not sync Steam achievements.");
    } finally {
      setSteamAchievementsSyncing(false);
    }
  };

  const dialog = (
    <div
      className="fixed inset-0 z-modal overflow-y-auto bg-backdrop/78 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-md sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center">
        <div
          ref={modalRef}
          tabIndex={-1}
          className="relative flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full flex-col overflow-hidden rounded-dialog border border-surface-border/80 bg-surface-bg shadow-dialog sm:max-h-[calc(100dvh-2.5rem)]"
        >
          <IconButton
            icon={X}
            onClick={() => void requestClose()}
            variant="ghost"
            className="absolute right-4 top-4 z-30 h-9 w-9 border border-media-border/10 bg-media-overlay/35 text-media-text backdrop-blur hover:bg-media-overlay/60"
            label="Close game details"
            title="Close"
          />

          <div className="relative h-[320px] shrink-0 overflow-hidden sm:h-[400px]">
            <GameCover
              src={cover}
              name={game.name}
              className="absolute inset-0 h-full w-full"
              imageClassName="scale-105 opacity-45 blur-xl"
              fallbackClassName="opacity-55"
              loading="eager"
            />
            <GameCover
              src={cover}
              name={game.name}
              fit="contain"
              className="absolute inset-0 h-full w-full bg-transparent"
              imageClassName="object-center opacity-90"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-bg via-surface-bg/48 to-media-overlay/15" />
            <div className="absolute inset-0 bg-gradient-to-r from-surface-bg/35 via-transparent to-surface-bg/20" />

            <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 px-5 pb-5 sm:gap-6 sm:px-7 sm:pb-6">
              <GameCover
                src={cover}
                name={game.name}
                alt={`${game.name || "Game"} cover`}
                decorative={false}
                className="hidden h-36 w-28 shrink-0 rounded-2xl border border-media-border/15 bg-surface-card shadow-2xl sm:block"
                loading="eager"
              />

              <div className="min-w-0 flex-1 pb-1">
                {isEditMode ? (
                  <>
                    <h2 id={titleId} className="sr-only">
                      Edit {draft.name || game.name}
                    </h2>
                    <TextInput
                      id="edit-name"
                      value={draft.name}
                      onChange={(event) =>
                        updateDraft({ name: event.target.value })
                      }
                      disabled={isSubmitting}
                      aria-label="Name"
                      aria-invalid={!!formError?.fields?.name}
                      className="max-w-3xl border-media-border/20 bg-media-overlay/35 pr-10 text-2xl font-semibold tracking-tight text-media-text shadow-none backdrop-blur placeholder:text-media-text/50 sm:text-4xl"
                    />
                  </>
                ) : (
                  <h2
                    id={titleId}
                    className="line-clamp-2 pr-10 text-2xl font-semibold tracking-tight text-media-text drop-shadow sm:text-4xl"
                    title={game.name}
                  >
                    {game.name}
                  </h2>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  {isEditMode ? (
                    <SelectMenu
                      id="edit-status"
                      value={draft.status}
                      onChange={(status) => updateDraft({ status })}
                      options={statusOptions}
                      placeholder="Select status"
                      disabled={isSubmitting}
                      aria-label="Status"
                      className="w-full max-w-64"
                      buttonClassName="border-media-border/20 bg-media-overlay/35 text-media-text backdrop-blur"
                    />
                  ) : (
                    <StatusBadge status={game.status || "Unknown"} />
                  )}
                  {currentSteam ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-media-border/15 bg-media-overlay/30 px-2.5 py-1 text-xs font-medium text-media-text/75 backdrop-blur">
                      <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Steam owned
                    </span>
                  ) : null}
                  {releaseDate ? (
                    <span className="text-xs font-medium text-media-text/65">
                      Released {releaseDate}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-4 border-b border-surface-border/65 bg-surface-card/38 px-5 py-4 sm:grid-cols-4 sm:px-7">
            {isEditMode ? (
              <EditMetric
                label="Estimated hours"
                error={formError?.fields?.how_long_to_beat}
              >
                <TextInput
                  id="edit-how-long-to-beat"
                  aria-label="HLTB hours"
                  type="number"
                  min="0"
                  max="1000"
                  step="any"
                  value={draft.how_long_to_beat}
                  onChange={(event) =>
                    updateDraft({ how_long_to_beat: event.target.value })
                  }
                  disabled={isSubmitting}
                  className="min-h-8 py-1"
                />
              </EditMetric>
            ) : (
              <Metric
                icon={Clock3}
                label={hours.sourceLabel}
                value={hours.label || "—"}
                tone={hours.hours ? "primary" : "default"}
              />
            )}
            <Metric
              icon={Star}
              label="RAWG"
              value={rating}
              tone={rating !== "—" ? "warning" : "default"}
            />
            <Metric icon={Trophy} label="Metacritic" value={metacritic} />
            {!hidePrivateFields
              ? isEditMode
                ? (
                    <EditMetric
                      label="My score"
                      error={formError?.fields?.my_score}
                    >
                      <TextInput
                        id="edit-my-score"
                        aria-label="My score"
                        type="number"
                        min="0"
                        max="10"
                        step="any"
                        value={draft.my_score}
                        onChange={(event) =>
                          updateDraft({ my_score: event.target.value })
                        }
                        disabled={isSubmitting}
                        className="min-h-8 py-1"
                      />
                    </EditMetric>
                  )
                : (
                    <Metric
                      icon={Sparkles}
                      label="My score"
                      value={myScore}
                      tone={myScore !== "—" ? "primary" : "default"}
                    />
                  )
              : null}
          </div>

          <div className="shrink-0 overflow-x-auto border-b border-surface-border/65 bg-surface-card/22 px-4 sm:px-7">
            <div className="flex min-w-max items-center gap-1">
              {tabs.map(({ value, label, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setActiveTab(value)}
                  aria-pressed={activeTab === value}
                  className={[
                    "relative my-1 inline-flex h-10 items-center gap-2 rounded-control border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70",
                    activeTab === value
                      ? "border-primary/55 bg-surface-selected text-primary-light shadow-sm shadow-primary/10"
                      : "border-transparent text-content-muted hover:border-primary/30 hover:bg-surface-selected/55 hover:text-primary-light",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            {formError?.message && isEditMode ? (
              <div
                className="mb-5 rounded-control border border-state-error/35 bg-state-error/10 px-4 py-3 text-sm text-state-error"
                role="alert"
              >
                {formError.message}
              </div>
            ) : null}
            {activeTab === "overview" ? (
              <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_250px]">
                <section className="min-w-0">
                  <h3 className="text-sm font-semibold text-content-primary">
                    About
                  </h3>
                  {description ? (
                    <div
                      className="prose prose-invert mt-3 max-w-none text-sm leading-7 text-content-secondary prose-p:my-2"
                      dangerouslySetInnerHTML={{ __html: description }}
                    />
                  ) : (
                    <p className="mt-3 text-sm leading-7 text-content-muted">
                      No game description is available yet.
                    </p>
                  )}
                  {isEditMode ? (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <Field id="edit-hours-source" label="Hours source">
                        <SelectMenu
                          id="edit-hours-source"
                          value={draft.hours_preferred_source}
                          onChange={(hours_preferred_source) =>
                            updateDraft({ hours_preferred_source })
                          }
                          options={hourSourceOptions}
                          disabled={isSubmitting}
                        />
                      </Field>
                      <Switch
                        checked={draft.hours_locked}
                        onChange={(hours_locked) =>
                          updateDraft({ hours_locked })
                        }
                        label="Lock hours source"
                        description="Keep this choice when external data changes."
                        disabled={isSubmitting}
                      />
                    </div>
                  ) : null}
                </section>

                <aside className="divide-y divide-surface-border/55 rounded-xl border border-surface-border/65 bg-surface-card/35 px-4 lg:sticky lg:top-0 lg:self-start">
                  {isEditMode ? (
                    <div className="py-3">
                      <Field id="edit-my-genre" label="My genres">
                        <MultiSelectMenu
                          id="edit-my-genre"
                          values={selectedMyGenres}
                          options={allMyGenres}
                          placeholder="Choose genres"
                          customPlaceholder="Find or add a genre..."
                          allowCustom
                          customMaxLength={50}
                          maxSelections={10}
                          disabled={isSubmitting}
                          onChange={(genres) =>
                            updateDraft({
                              my_genre: genres.join(", "),
                              personal_genres: genres.map((name) => ({ name })),
                            })
                          }
                        />
                      </Field>
                    </div>
                  ) : (
                    <GenreDetailRow
                      icon={Tag}
                      label="My genres"
                      value={game.my_genre}
                      variant="personalGenre"
                    />
                  )}
                  <GenreDetailRow
                    icon={Layers3}
                    label="RAWG genres"
                    value={game.genres}
                    variant="metadataGenre"
                  />
                  <DetailRow
                    icon={CalendarDays}
                    label="Release date"
                    value={releaseDate}
                  />
                  <DetailRow
                    icon={Gamepad2}
                    label="Source"
                    value={currentSteam ? "Steam" : "Backlog"}
                  />
                </aside>
              </div>
            ) : null}

            {activeTab === "achievements" ? (
              <section className="max-w-2xl">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-content-primary">
                      {currentSteam
                        ? achievements.label
                        : "Steam not linked"}
                    </h3>
                    <p className="mt-1 text-sm text-content-muted">
                      {currentSteam
                        ? achievements.detail
                        : "Link this backlog entry to Steam to track achievements."}
                    </p>
                  </div>
                  {currentSteam && !readOnly ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={syncAchievements}
                      disabled={syncingAchievements}
                    >
                      <RefreshCw
                        className={
                          syncingAchievements
                            ? "h-4 w-4 animate-spin"
                            : "h-4 w-4"
                        }
                        aria-hidden="true"
                      />
                      {syncingAchievements ? "Syncing" : "Sync achievements"}
                    </Button>
                  ) : null}
                </div>

                {currentSteam && achievements.percent != null ? (
                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between text-xs text-content-muted">
                      <span>
                        {achievements.remainingLabel || "Achievement progress"}
                      </span>
                      <span>{achievements.percent}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
                      <div
                        className="h-full rounded-full bg-primary shadow-pulse"
                        style={{
                          width: `${Math.min(Math.max(achievements.percent, 0), 100)}%`,
                        }}
                      />
                    </div>
                    {achievementSyncedAt ? (
                      <div className="mt-3 text-xs text-content-muted">
                        Last synced {achievementSyncedAt}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {activeTab === "notes" ? (
              <div className="max-w-3xl space-y-7">
                <section className="rounded-panel border border-primary/25 bg-primary/8 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-content-primary">
                        Next time
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-content-muted">
                        Where were you, and what do you want to do next? Private,
                        optional, and limited to 1,000 characters.
                      </p>
                    </div>
                    {isEditMode && draft.resume_note ? (
                      <Button
                        type="button"
                        variant="dangerGhost"
                        size="sm"
                        onClick={() => updateDraft({ resume_note: "" })}
                        disabled={isSubmitting}
                      >
                        Clear note
                      </Button>
                    ) : null}
                  </div>
                  {isEditMode ? (
                    <>
                      <Textarea
                        id="edit-resume-note"
                        aria-label="Next time"
                        value={draft.resume_note}
                        onChange={(event) =>
                          updateDraft({ resume_note: event.target.value })
                        }
                        maxLength={1000}
                        rows={6}
                        disabled={isSubmitting}
                        className="mt-3 min-h-36 whitespace-pre-wrap"
                        placeholder="Add the smallest useful reminder for your next session..."
                      />
                      <div className="mt-2 text-right text-xs text-content-muted">
                        {draft.resume_note.length}/1000
                      </div>
                    </>
                  ) : resumeNote ? (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-content-secondary">
                      {resumeNote}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-content-muted">
                      No Next time note yet.
                    </p>
                  )}
                </section>
                {!hidePrivateFields ? <section>
                  <h3 className="text-sm font-semibold text-content-primary">
                    Your thoughts
                  </h3>
                  {isEditMode ? (
                    <Textarea
                      id="edit-thoughts"
                      aria-label="Thoughts"
                      value={draft.thoughts}
                      onChange={(event) =>
                        updateDraft({ thoughts: event.target.value })
                      }
                      rows={12}
                      disabled={isSubmitting}
                      className="mt-3 min-h-64 text-base leading-7"
                      placeholder="Add your thoughts, review, or notes..."
                    />
                  ) : thoughts ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-content-secondary">
                      {thoughts}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-content-muted">
                      You have not added personal notes for this game.
                    </p>
                  )}
                </section> : null}
              </div>
            ) : null}

            {activeTab === "activity" ? (
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {isEditMode ? (
                  <>
                    <Field
                      id="edit-started-at"
                      label="Started"
                      error={formError?.fields?.started_at}
                    >
                      <TextInput
                        id="edit-started-at"
                        type="date"
                        value={draft.started_at}
                        onChange={(event) =>
                          updateDraft({ started_at: event.target.value })
                        }
                        disabled={isSubmitting}
                      />
                    </Field>
                    <Field
                      id="edit-finished-at"
                      label="Finished"
                      error={formError?.fields?.finished_at}
                    >
                      <TextInput
                        id="edit-finished-at"
                        type="date"
                        value={draft.finished_at}
                        onChange={(event) =>
                          updateDraft({ finished_at: event.target.value })
                        }
                        disabled={isSubmitting}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <DetailRow
                      icon={CalendarDays}
                      label="Started"
                      value={startedAt}
                    />
                    <DetailRow
                      icon={CalendarDays}
                      label="Finished"
                      value={finishedAt}
                    />
                  </>
                )}
                <DetailRow
                  icon={Gamepad2}
                  label="Steam last played"
                  value={steamLastPlayed}
                />
                <DetailRow
                  icon={Gamepad2}
                  label="Steam activity first observed"
                  value={steamFirstObserved}
                />
                {!startedAt &&
                !finishedAt &&
                !steamLastPlayed &&
                !steamFirstObserved ? (
                  <p className="col-span-full text-sm text-content-muted">
                    No play activity has been recorded yet.
                  </p>
                ) : null}
              </div>
            ) : null}

            {activeTab === "metadata" && isEditMode ? (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
                <section className="rounded-panel border border-surface-border bg-surface-card/35 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-content-primary">
                        RAWG metadata
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-content-muted">
                        Choose the provider identity that supplies artwork,
                        release information, description, and RAWG genres.
                      </p>
                    </div>
                    {draft.rawg_id ? (
                      <Button
                        type="button"
                        variant="dangerGhost"
                        size="sm"
                        onClick={clearRawgSelection}
                        disabled={isSubmitting}
                      >
                        Clear match
                      </Button>
                    ) : null}
                  </div>
                  <TextInput
                    type="search"
                    value={metadataQuery}
                    onChange={(event) => setMetadataQuery(event.target.value)}
                    placeholder="Search RAWG..."
                    disabled={isSubmitting}
                    className="mt-4"
                  />
                  <div className="mt-3 max-h-[50vh] space-y-2 overflow-auto pr-1">
                    {searchResults.map((result) => (
                      <GameSearchResult
                        key={result.rawg_id}
                        result={result}
                        selected={result.rawg_id === draft.rawg_id}
                        onSelect={selectRawgGame}
                      />
                    ))}
                    {searchLoading ? (
                      <p className="rounded-control border border-surface-border bg-surface-elevated/35 px-3 py-4 text-sm text-content-muted">
                        Searching...
                      </p>
                    ) : null}
                    {!searchLoading && !searchResults.length ? (
                      <p className="rounded-control border border-surface-border bg-surface-elevated/35 px-3 py-4 text-sm text-content-muted">
                        {metadataQuery.trim().length >= 3
                          ? "No matches found."
                          : "Type at least 3 characters to choose a RAWG match."}
                      </p>
                    ) : null}
                    {searchError ? (
                      <p className="text-sm text-state-error">{searchError}</p>
                    ) : null}
                  </div>
                </section>

                <div className="space-y-2">
                  <p className="text-xs leading-5 text-content-muted">
                    Steam link and achievement actions save immediately and are
                    not affected by Cancel.
                  </p>
                  <EditGameSteamSection
                    currentSteam={currentSteam}
                    currentAchievements={currentAchievements}
                    currentAchievementsSyncedAt={currentAchievementsSyncedAt}
                    showSteamSearch={showSteamSearch}
                    setShowSteamSearch={setShowSteamSearch}
                    steamUnlinking={steamUnlinking}
                    unlinkSteam={unlinkSteam}
                    syncCurrentSteamAchievements={
                      syncCurrentSteamAchievements
                    }
                    steamAchievementsSyncing={steamAchievementsSyncing}
                    steamQuery={steamQuery}
                    setSteamQuery={setSteamQuery}
                    isSubmitting={isSubmitting}
                    searchSteamLinks={searchSteamLinks}
                    steamSearching={steamSearching}
                    steamResults={steamResults}
                    game={game}
                    steamAttachingId={steamAttachingId}
                    attachSteam={attachSteam}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {isEditMode ? (
            <div className="flex shrink-0 flex-col gap-3 border-t border-surface-border/65 bg-surface-card/95 px-5 py-4 shadow-sticky-footer backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <div className="text-xs text-content-muted">
                {dirty ? "Unsaved changes" : "No changes yet"}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void leaveEditMode()}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void submitDraft()}
                  disabled={
                    isSubmitting ||
                    !dirty ||
                    !draft.name.trim() ||
                    !draft.status
                  }
                  aria-busy={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  {isSubmitting ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          ) : onEdit || onRefresh || canEdit ? (
            <div className="flex shrink-0 flex-col items-stretch justify-between gap-3 border-t border-surface-border/65 bg-surface-card/38 px-5 py-4 sm:flex-row sm:items-center sm:px-7">
              <div>
                {onRefresh ? (
                  <Button type="button" variant="ghost" onClick={onRefresh}>
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Surprise me again
                  </Button>
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDraft(draftFromGame(game));
                      setSavedDraft(draftFromGame(game));
                      setIsEditMode(true);
                      setActiveTab("overview");
                      onEdit?.(game);
                    }}
                    className="w-full sm:w-auto"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Edit game
                  </Button>
                  {canAddToNextUp ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onAddToNextUp(game)}
                      title="Add this game to Next Up"
                      className="w-full sm:w-auto"
                    >
                      <ListPlus className="h-4 w-4" aria-hidden="true" />
                      Add to Next Up
                    </Button>
                  ) : null}
                  {canFinish || onDelete ? (
                    <div className="flex flex-col gap-2 sm:ml-1 sm:flex-row">
                      {canFinish ? (
                        <Button
                          type="button"
                          variant="successSoft"
                          onClick={() => onFinish(game)}
                          className="w-full sm:w-auto"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Finish game
                        </Button>
                      ) : null}
                      {onDelete ? (
                        <Button
                          type="button"
                          variant="dangerSoft"
                          onClick={() => onDelete(game)}
                          className="w-full sm:w-auto"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete game
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? dialog
    : createPortal(dialog, document.body);
}
