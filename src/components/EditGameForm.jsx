import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Field,
  Modal,
  MultiSelectMenu,
  SelectMenu,
  Textarea,
  TextInput,
} from "./ui";
import { splitCsv } from "../utils/gameList";
import { searchGames } from "../services/gameService";

const emptyForm = {
  id: "",
  name: "",
  status: "",
  how_long_to_beat: "",
  my_genre: "",
  thoughts: "",
  my_score: "",
  started_at: "",
  finished_at: "",
  rawg_id: null,
  rawg_slug: "",
  rawg_cover: "",
  rawg_released: "",
};

function GameSearchResult({ result, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className={[
        "flex w-full min-w-0 items-center gap-3 rounded-xl border p-2 text-left transition-colors",
        selected
          ? "border-primary/45 bg-primary/10"
          : "border-surface-border/70 bg-surface-bg/35 hover:border-primary/30 hover:bg-surface-elevated/55",
      ].join(" ")}
    >
      {result.cover ? (
        <img
          src={result.cover}
          alt=""
          className="h-14 w-11 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-14 w-11 shrink-0 rounded-lg bg-surface-elevated" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-content-primary">
          {result.name}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-muted">
          {result.released ? <span>{result.released}</span> : null}
          {result.rating ? <span>{result.rating}/5</span> : null}
          {result.metacritic ? <span>MC {result.metacritic}</span> : null}
        </div>
      </div>
    </button>
  );
}

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
}) {
  const [formData, setFormData] = useState(emptyForm);
  const [metadataQuery, setMetadataQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showMetadataSearch, setShowMetadataSearch] = useState(false);

  useEffect(() => {
    if (!game) return;

    setFormData({
      id: game.id,
      name: game.name || "",
      status: game.status || "",
      how_long_to_beat: game.how_long_to_beat ?? "",
      my_genre: game.my_genre || "",
      thoughts: game.thoughts || "",
      my_score: game.my_score ?? "",
      started_at: toDateStr(game.started_at),
      finished_at: toDateStr(game.finished_at),
      rawg_id: game.rawg_id ?? null,
      rawg_slug: game.rawg_slug || "",
      rawg_cover: game.cover || "",
      rawg_released: game.releaseDate || "",
    });
    setMetadataQuery(game.name || "");
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
    if (query.length < 2) {
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
          setSearchResults(Array.isArray(payload?.results) ? payload.results : []);
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
    }));
  };

  if (!game) return null;

  return (
    <Modal
      title="Edit Game"
      description="Update your notes, score, status, and dates."
      onClose={onCancel}
      maxWidth="max-w-5xl"
      bodyClassName="p-0"
    >
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,0.82fr)_1fr]">
          <aside className="border-b border-surface-border bg-surface-bg/35 p-5 lg:border-b-0 lg:border-r lg:p-6">
            <div className="flex h-full flex-col justify-between gap-6">
              <div>
                {formData.rawg_cover ? (
                  <img
                    src={formData.rawg_cover}
                    alt={game.name || "Game cover"}
                    className="mb-4 h-44 w-full rounded-2xl border border-surface-border object-cover shadow-panel"
                    loading="lazy"
                  />
                ) : (
                  <div className="mb-4 flex h-44 items-end rounded-2xl border border-surface-border bg-gradient-to-br from-surface-elevated via-surface-card to-surface-bg p-4 text-sm text-content-muted">
                    No cover available
                  </div>
                )}

                <h3 className="break-words text-2xl font-semibold leading-tight text-content-primary">
                  {formData.name || game.name}
                </h3>
                <div className="mt-3">
                  <Badge variant="primary">
                    {formData.status || game.status || "No status"}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-content-muted">
                  {formData.rawg_id ? <span>Matched to RAWG</span> : <span>No RAWG match selected</span>}
                  {formData.rawg_released ? <span>{formData.rawg_released}</span> : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowMetadataSearch((value) => !value)}
                  >
                    {showMetadataSearch ? "Hide search" : "Change metadata"}
                  </Button>
                </div>
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
                        {metadataQuery.trim().length >= 2
                          ? "No matches found."
                          : "Search to choose another RAWG match."}
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

              <p className="text-sm leading-6 text-content-muted">
                Update the fields on the right; the summary here keeps the game
                context visible while editing.
              </p>
            </div>
          </aside>

          <div className="space-y-6 p-5 md:p-6">
            {formError?.message ? (
              <div
                className="rounded-xl border border-state-error/35 bg-state-error/10 px-4 py-3 text-sm text-state-error"
                role="alert"
              >
                {formError.message}
              </div>
            ) : null}

            <section>
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

            <section>
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

            <section>
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

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-surface-border bg-surface-card/95 p-4 backdrop-blur">
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
