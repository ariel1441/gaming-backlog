import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, Gamepad2, Search, Trophy, Unlink } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Modal,
  MultiSelectMenu,
  SelectMenu,
  Switch,
  Textarea,
  TextInput,
  useConfirm,
  useToast,
} from "./ui";
import { splitCsv } from "../utils/gameList";
import { searchGames } from "../services/gameService";
import {
  attachSteamCandidate,
  listSteamLinkCandidates,
  syncSteamGameAchievements,
  unlinkSteamGame,
} from "../services/steamService";
import {
  formatAchievementSummary,
  formatAchievementSyncDate,
} from "../utils/steamAchievements";
import { formatAchievementGameSyncMessage } from "../utils/steamSync";
import GameSearchResult from "./GameSearchResult";
import {
  formatSteamDate,
  formatSteamPlaytime,
  steamCapsuleUrl,
} from "../utils/steamDisplay";
import EditGameSteamSection from "./EditGameSteamSection";

const emptyForm = {
  id: "",
  name: "",
  status: "",
  how_long_to_beat: "",
  hours_preferred_source: "auto",
  hours_locked: false,
  my_genre: "",
  thoughts: "",
  my_score: "",
  started_at: "",
  finished_at: "",
  rawg_id: null,
  rawg_slug: "",
  rawg_cover: "",
  rawg_released: "",
  rawg_selection_confirmed: false,
};

function PreviewMetric({ label, value }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-bg/45 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-muted">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-content-primary">
        {value || "Not set"}
      </div>
    </div>
  );
}

const hourSourceOptions = [
  { value: "auto", label: "Auto" },
  { value: "estimate", label: "Estimate" },
  { value: "steam_actual", label: "Steam actual" },
];

function hourSourceHelp(value) {
  if (value === "estimate")
    return "Use the estimate first, even when Steam actual time exists.";
  if (value === "steam_actual")
    return "Use Steam actual time first when this game is linked.";
  return "Use Steam actual time for finished-style statuses and estimates elsewhere.";
}

function toDateStr(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function EditGameForm({
  game,
  onSubmit,
  onCancel,
  statuses = [],
  allMyGenres = [],
  isSubmitting = false,
  formError = null,
  onDraftChange,
  onSteamLinked,
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [formData, setFormData] = useState(emptyForm);
  const [metadataQuery, setMetadataQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showMetadataSearch, setShowMetadataSearch] = useState(false);
  const [steamQuery, setSteamQuery] = useState("");
  const [steamResults, setSteamResults] = useState([]);
  const [steamSearching, setSteamSearching] = useState(false);
  const [steamAttachingId, setSteamAttachingId] = useState(null);
  const [linkedSteam, setLinkedSteam] = useState(null);
  const [localSteamAchievements, setLocalSteamAchievements] = useState(null);
  const [unlinkedSteamAppId, setUnlinkedSteamAppId] = useState(null);
  const [steamUnlinking, setSteamUnlinking] = useState(false);
  const [steamAchievementsSyncing, setSteamAchievementsSyncing] =
    useState(false);
  const [showSteamSearch, setShowSteamSearch] = useState(false);

  useEffect(() => {
    if (!game) return;

    setFormData({
      id: game.id,
      name: game.name || "",
      status: game.status || "",
      how_long_to_beat: game.how_long_to_beat ?? "",
      hours_preferred_source: game.hours_preferred_source || "auto",
      hours_locked: !!game.hours_locked,
      my_genre: game.my_genre || "",
      thoughts: game.thoughts || "",
      my_score: game.my_score ?? "",
      started_at: toDateStr(game.started_at),
      finished_at: toDateStr(game.finished_at),
      rawg_id: game.rawg_id ?? null,
      rawg_slug: game.rawg_slug || "",
      rawg_cover: game.cover || "",
      rawg_released: game.releaseDate || "",
      rawg_selection_confirmed: false,
    });
    setMetadataQuery(game.name || "");
    setSteamQuery(game.name || "");
    setSteamResults([]);
    setLinkedSteam(null);
    setLocalSteamAchievements(null);
    setUnlinkedSteamAppId(null);
    setShowSteamSearch(false);
    setShowMetadataSearch(false);
  }, [game]);

  const statusOptions = useMemo(() => {
    const seen = new Set();
    const out = [];

    for (const status of [game?.status, ...statuses]) {
      const value = String(status || "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }

    return out.map((status) => ({ value: status, label: status }));
  }, [game?.status, statuses]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    onDraftChange?.();
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(formData);
  };
  const selectedMyGenres = splitCsv(formData.my_genre);

  useEffect(() => {
    const query = metadataQuery.trim();
    if (query.length < 3) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    const ac = new AbortController();
    const timeout = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError("");
      searchGames(query, { signal: ac.signal })
        .then((payload) => {
          setSearchResults(
            Array.isArray(payload?.results) ? payload.results : [],
          );
        })
        .catch((error) => {
          if (error?.name === "AbortError") return;
          setSearchError("Could not search games right now.");
        })
        .finally(() => {
          if (!ac.signal.aborted) setSearchLoading(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      ac.abort();
    };
  }, [metadataQuery]);

  const selectRawgGame = (result) => {
    onDraftChange?.();
    setFormData((prev) => ({
      ...prev,
      name: result.name,
      rawg_id: result.rawg_id,
      rawg_slug: result.rawg_slug || "",
      rawg_cover: result.cover || "",
      rawg_released: result.released || "",
      rawg_selection_confirmed: true,
    }));
    setMetadataQuery(result.name);
  };

  const clearRawgSelection = () => {
    onDraftChange?.();
    setFormData((prev) => ({
      ...prev,
      rawg_id: null,
      rawg_slug: "",
      rawg_cover: "",
      rawg_released: "",
      rawg_selection_confirmed: true,
    }));
  };

  const searchSteamLinks = async () => {
    const query = (steamQuery || formData.name || game.name || "").trim();
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
      setLocalSteamAchievements(candidate.achievements || null);
      setUnlinkedSteamAppId(null);
      setSteamResults([]);
      setShowSteamSearch(false);
      toast.success("Steam app linked to this game.");
      await onSteamLinked?.();
    } catch (error) {
      toast.error(error.message || "Could not link Steam app.");
    } finally {
      setSteamAttachingId(null);
    }
  };

  const unlinkSteam = async () => {
    const appId = currentSteam?.steamAppId;
    if (!appId) return;
    const ok = await confirm({
      title: "Unlink Steam app?",
      message:
        "This keeps the Steam app in your synced library, but removes ownership and playtime from this backlog game.",
      confirmLabel: "Unlink",
      tone: "danger",
    });
    if (!ok) return;
    setSteamUnlinking(true);
    try {
      await unlinkSteamGame(game.id, appId);
      setLinkedSteam(null);
      setLocalSteamAchievements(null);
      setUnlinkedSteamAppId(appId);
      setShowSteamSearch(true);
      toast.success("Steam app unlinked from this game.");
      await onSteamLinked?.();
    } catch (error) {
      toast.error(error.message || "Could not unlink Steam app.");
    } finally {
      setSteamUnlinking(false);
    }
  };

  if (!game) return null;

  const currentSteam = linkedSteam
    ? {
        steamAppId: linkedSteam.steamAppId,
        steamName: linkedSteam.steamName,
        playtimeMinutes: linkedSteam.playtimeMinutes,
        lastPlayedAt: linkedSteam.lastPlayedAt,
        lastSyncedAt: null,
        achievements:
          localSteamAchievements || linkedSteam.achievements || null,
      }
    : game.steamOwned && game.steamAppId !== unlinkedSteamAppId
      ? {
          steamAppId: game.steamAppId,
          steamName: game.steamName,
          playtimeMinutes: game.steamPlaytimeMinutes,
          lastPlayedAt: game.steamLastPlayedAt,
          lastSyncedAt: game.steamLastSyncedAt,
          achievements:
            localSteamAchievements || game.steamAchievements || null,
        }
      : null;
  const currentAchievements = currentSteam
    ? formatAchievementSummary(currentSteam.achievements)
    : null;
  const currentAchievementsSyncedAt = currentSteam
    ? formatAchievementSyncDate(currentSteam.achievements?.lastSyncedAt)
    : "";

  const syncCurrentSteamAchievements = async () => {
    if (!currentSteam?.steamAppId) return;
    setSteamAchievementsSyncing(true);
    try {
      const payload = await syncSteamGameAchievements(game.id);
      const result = formatAchievementGameSyncMessage(payload);
      toast[result.tone](result.message);
      if (payload?.achievements)
        setLocalSteamAchievements(payload.achievements);
      await onSteamLinked?.();
    } catch (error) {
      toast.error(error.message || "Could not sync Steam achievements.");
    } finally {
      setSteamAchievementsSyncing(false);
    }
  };

  return (
    <Modal title="Edit game" onClose={onCancel} size="3xl" bodyClassName="p-0">
      <form onSubmit={handleSubmit}>
        <div className="relative h-64 overflow-hidden border-b border-surface-border bg-surface-card sm:h-72">
          {formData.rawg_cover ? (
            <img
              src={formData.rawg_cover}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-surface-elevated via-surface-card to-surface-bg" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-surface-bg/95 via-surface-bg/72 to-surface-bg/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-bg via-transparent to-media-overlay/20" />
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-5 sm:gap-6 sm:p-7">
            <div className="hidden h-36 w-28 shrink-0 overflow-hidden rounded-2xl border border-media-border/15 bg-surface-card shadow-2xl sm:block">
              {formData.rawg_cover ? (
                <img
                  src={formData.rawg_cover}
                  alt={formData.name || game.name || "Game cover"}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-3xl font-semibold text-content-muted">
                  {String(formData.name || game.name || "?").charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-media-text/60">
                Editing
              </div>
              <h3 className="mt-1 line-clamp-2 text-2xl font-semibold tracking-tight text-media-text drop-shadow sm:text-4xl">
                {formData.name || game.name}
              </h3>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <Badge variant="primary">
                  {formData.status || game.status || "No status"}
                </Badge>
                {formData.rawg_released ? (
                  <span className="text-xs font-medium text-media-text/70">
                    Released {formData.rawg_released}
                  </span>
                ) : null}
                <span className="text-xs font-medium text-media-text/60">
                  {formData.rawg_id ? "RAWG metadata linked" : "No RAWG match"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="border-b border-surface-border bg-surface-card/30 p-5 lg:border-b-0 lg:border-r lg:p-6">
            <div className="flex h-full flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-content-primary">
                    Game summary
                  </div>
                  <div className="mt-1 text-xs text-content-muted">
                    Current values update as you edit.
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowMetadataSearch((value) => !value)}
                >
                  {showMetadataSearch ? "Hide metadata" : "Change metadata"}
                </Button>
              </div>

              {showMetadataSearch ? (
                <div className="space-y-2 rounded-2xl border border-surface-border bg-surface-bg/35 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-content-muted">
                      Replace metadata
                    </div>
                    {formData.rawg_id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={clearRawgSelection}
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
                  />
                  <div className="max-h-72 space-y-2 overflow-auto pr-1">
                    {searchResults.map((result) => (
                      <GameSearchResult
                        key={result.rawg_id}
                        result={result}
                        selected={result.rawg_id === formData.rawg_id}
                        onSelect={selectRawgGame}
                      />
                    ))}
                    {searchLoading ? (
                      <p className="rounded-xl border border-surface-border bg-surface-elevated/35 px-3 py-4 text-sm text-content-muted">
                        Searching...
                      </p>
                    ) : null}
                    {!searchLoading && !searchResults.length ? (
                      <p className="rounded-xl border border-surface-border bg-surface-elevated/35 px-3 py-4 text-sm text-content-muted">
                        {metadataQuery.trim().length >= 3
                          ? "No matches found."
                          : "Type at least 3 characters to choose another RAWG match."}
                      </p>
                    ) : null}
                    {searchError ? (
                      <p className="text-sm text-state-error">{searchError}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <PreviewMetric
                  label="HLTB"
                  value={
                    formData.how_long_to_beat
                      ? `${formData.how_long_to_beat}h`
                      : ""
                  }
                />
                <PreviewMetric label="Score" value={formData.my_score} />
                <PreviewMetric label="Started" value={formData.started_at} />
                <PreviewMetric label="Finished" value={formData.finished_at} />
              </div>
            </div>
          </aside>

          <div className="space-y-5 p-5 md:p-6 lg:p-7">
            {formError?.message ? (
              <div
                className="rounded-xl border border-state-error/35 bg-state-error/10 px-4 py-3 text-sm text-state-error"
                role="alert"
              >
                {formError.message}
              </div>
            ) : null}

            <section className="rounded-2xl border border-surface-border/70 bg-surface-card/35 p-4 sm:p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-content-secondary">
                  Game details
                </h3>
                <p className="mt-1 text-sm leading-6 text-content-muted">
                  Rename the entry or move it to a different backlog status.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.25fr_0.85fr]">
                <Field
                  id="edit-name"
                  label="Name"
                  required
                  error={formError?.fields?.name}
                >
                  <TextInput
                    id="edit-name"
                    name="name"
                    type="text"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    disabled={isSubmitting}
                  />
                </Field>

                <Field
                  id="edit-status"
                  label="Status"
                  required
                  error={formError?.fields?.status}
                >
                  <SelectMenu
                    id="edit-status"
                    value={formData.status}
                    options={statusOptions}
                    placeholder="Select status"
                    onChange={(status) => {
                      onDraftChange?.();
                      setFormData((prev) => ({ ...prev, status }));
                    }}
                    disabled={isSubmitting}
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-surface-border/70 bg-surface-card/35 p-4 sm:p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-content-secondary">
                  Progress
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Field
                  id="edit-how-long-to-beat"
                  label="HLTB hours"
                  error={formError?.fields?.how_long_to_beat}
                >
                  <TextInput
                    id="edit-how-long-to-beat"
                    name="how_long_to_beat"
                    type="number"
                    min="0"
                    step="any"
                    value={formData.how_long_to_beat}
                    onChange={handleChange}
                    disabled={isSubmitting}
                  />
                </Field>

                <Field
                  id="edit-my-score"
                  label="My score"
                  error={formError?.fields?.my_score}
                >
                  <TextInput
                    id="edit-my-score"
                    name="my_score"
                    type="number"
                    min="0"
                    max="10"
                    step="any"
                    value={formData.my_score}
                    onChange={handleChange}
                    disabled={isSubmitting}
                  />
                </Field>

                <Field id="edit-hours-source" label="Hours source">
                  <SelectMenu
                    id="edit-hours-source"
                    value={formData.hours_preferred_source}
                    options={hourSourceOptions}
                    onChange={(hours_preferred_source) => {
                      onDraftChange?.();
                      setFormData((prev) => ({
                        ...prev,
                        hours_preferred_source,
                      }));
                    }}
                    disabled={isSubmitting}
                  />
                  <p className="mt-1 text-xs text-content-muted">
                    {hourSourceHelp(formData.hours_preferred_source)}
                  </p>
                </Field>

                <Switch
                  checked={!!formData.hours_locked}
                  onChange={(hours_locked) => {
                    onDraftChange?.();
                    setFormData((prev) => ({ ...prev, hours_locked }));
                  }}
                  label="Lock source"
                  description="Keep this display choice when external data changes."
                  disabled={isSubmitting}
                  className="self-end"
                />

                <Field
                  id="edit-started-at"
                  label="Started on"
                  error={formError?.fields?.started_at}
                >
                  <TextInput
                    id="edit-started-at"
                    name="started_at"
                    type="date"
                    value={formData.started_at}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="[color-scheme:dark]"
                  />
                </Field>

                <Field
                  id="edit-finished-at"
                  label="Finished on"
                  error={formError?.fields?.finished_at}
                >
                  <TextInput
                    id="edit-finished-at"
                    name="finished_at"
                    type="date"
                    value={formData.finished_at}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="[color-scheme:dark]"
                  />
                </Field>
              </div>
            </section>

            <EditGameSteamSection
              currentSteam={currentSteam}
              currentAchievements={currentAchievements}
              currentAchievementsSyncedAt={currentAchievementsSyncedAt}
              showSteamSearch={showSteamSearch}
              setShowSteamSearch={setShowSteamSearch}
              steamUnlinking={steamUnlinking}
              unlinkSteam={unlinkSteam}
              syncCurrentSteamAchievements={syncCurrentSteamAchievements}
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

            <section className="rounded-2xl border border-surface-border/70 bg-surface-card/35 p-4 sm:p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-content-secondary">
                  Personal notes
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[0.85fr_1.15fr]">
                <Field
                  id="edit-my-genre"
                  label="My genre"
                  help="Choose existing tags or add your own."
                >
                  <MultiSelectMenu
                    id="edit-my-genre"
                    values={selectedMyGenres}
                    options={allMyGenres}
                    placeholder="Choose genres"
                    customPlaceholder="Find or add a genre..."
                    allowCustom
                    onChange={(genres) => {
                      onDraftChange?.();
                      setFormData((prev) => ({
                        ...prev,
                        my_genre: genres.join(", "),
                      }));
                    }}
                    disabled={isSubmitting}
                  />
                </Field>

                <Field id="edit-thoughts" label="Thoughts">
                  <Textarea
                    id="edit-thoughts"
                    name="thoughts"
                    rows={4}
                    value={formData.thoughts}
                    onChange={handleChange}
                    disabled={isSubmitting}
                  />
                </Field>
              </div>
            </section>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-surface-border bg-surface-card/95 px-5 py-4 shadow-sticky-footer">
          <Button type="button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
