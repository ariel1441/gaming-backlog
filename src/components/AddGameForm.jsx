import React, { useCallback, useEffect, useRef, useState } from "react";
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
import GameSearchResult from "./GameSearchResult";

const AddGameForm = ({
  addFormRef,
  newGame,
  setNewGame,
  handleAddGame,
  isSubmitting = false,
  allStatuses = [],
  statusesLoading = false,
  statusesError = null,
  refreshStatuses,
  allMyGenres = [],
  formError = null,
  onClose,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const modalRef = useRef(null);
  const statusOptions = allStatuses.map((status) => ({
    value: status,
    label: status,
  }));
  const selectedMyGenres = splitCsv(newGame.my_genre);
  const selectedRawgId = newGame.rawg_id;
  const hasSelectedRawg = Boolean(selectedRawgId);

  useEffect(() => {
    const query = String(newGame.name || "").trim();
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
  }, [newGame.name]);

  const selectRawgGame = (result) => {
    setNewGame((game) => ({
      ...game,
      name: result.name,
      rawg_id: result.rawg_id,
      rawg_slug: result.rawg_slug || "",
      rawg_cover: result.cover || "",
      rawg_released: result.released || "",
    }));
  };

  const clearRawgSelection = () => {
    setNewGame((game) => ({
      ...game,
      rawg_id: null,
      rawg_slug: "",
      rawg_cover: "",
      rawg_released: "",
    }));
  };

  const doClose = useCallback(() => {
    onClose?.();
    setIsOpen(false);
  }, [onClose]);

  if (!isOpen) return null;

  const setPanelRef = (el) => {
    modalRef.current = el;
    if (typeof addFormRef === "function") addFormRef(el);
    else if (addFormRef) addFormRef.current = el;
  };

  return (
    <Modal
      title="Add game"
      onClose={doClose}
      panelRef={setPanelRef}
      size="3xl"
      bodyClassName="p-0"
    >
      <form onSubmit={handleAddGame}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.78fr)_1fr]">
          <aside className="border-b border-surface-border bg-surface-bg/35 p-5 lg:border-b-0 lg:border-r lg:p-6">
            <div className="flex h-full flex-col justify-between gap-6">
              <div>
                <div className="mb-5 rounded-2xl border border-surface-border bg-surface-bg/35 p-4">
                  {newGame.rawg_cover ? (
                    <img
                      src={newGame.rawg_cover}
                      alt=""
                      className="h-40 w-full rounded-xl border border-surface-border object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-surface-border/70 bg-surface-elevated/35 text-sm text-content-muted">
                      Type a title to search RAWG
                    </div>
                  )}
                </div>

                <h3 className="break-words text-2xl font-semibold leading-tight text-content-primary">
                  {newGame.name?.trim() || "New game"}
                </h3>
                <div className="mt-3">
                  <Badge variant={newGame.status ? "primary" : "default"}>
                    {newGame.status || "No status selected"}
                  </Badge>
                </div>
                {hasSelectedRawg ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-content-muted">
                    <span>Matched to RAWG</span>
                    {newGame.rawg_released ? (
                      <span>{newGame.rawg_released}</span>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={clearRawgSelection}
                    >
                      Clear match
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 rounded-2xl border border-surface-border bg-surface-bg/35 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-content-muted">
                  Search results
                </div>
                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                  {searchResults.map((result) => (
                    <GameSearchResult
                      key={result.rawg_id}
                      result={result}
                      selected={result.rawg_id === selectedRawgId}
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
                      {newGame.name?.trim().length >= 3
                        ? "No matches yet. You can still add manually."
                        : "Results appear after 3 characters."}
                    </p>
                  ) : null}
                  {searchError ? (
                    <p className="text-sm text-state-error">{searchError}</p>
                  ) : null}
                </div>
              </div>
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
                  Start with the essentials. You can leave optional fields
                  blank.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.25fr_0.85fr]">
                <Field
                  id="add-name"
                  label="Name"
                  required
                  error={formError?.fields?.name}
                >
                  <TextInput
                    id="add-name"
                    type="text"
                    value={newGame.name}
                    onChange={(e) =>
                      setNewGame((game) => ({
                        ...game,
                        name: e.target.value,
                        rawg_id: null,
                        rawg_slug: "",
                        rawg_cover: "",
                        rawg_released: "",
                      }))
                    }
                    placeholder="e.g., Elden Ring"
                    required
                    disabled={isSubmitting}
                  />
                </Field>

                <Field
                  id="add-status"
                  label="Status"
                  required
                  error={formError?.fields?.status}
                >
                  <SelectMenu
                    id="add-status"
                    value={newGame.status}
                    placeholder="Select status"
                    options={statusOptions}
                    onChange={(status) =>
                      setNewGame((game) => ({ ...game, status }))
                    }
                    disabled={isSubmitting}
                  />
                  {statusesError ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-state-error">
                      <span>Could not load statuses.</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => refreshStatuses?.().catch(() => {})}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : null}
                  {statusesLoading ? (
                    <p className="mt-2 text-sm text-content-muted">
                      Loading statuses...
                    </p>
                  ) : null}
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
                  id="add-how-long-to-beat"
                  label="HLTB hours"
                  error={formError?.fields?.how_long_to_beat}
                >
                  <TextInput
                    id="add-how-long-to-beat"
                    type="number"
                    min="0"
                    step="any"
                    value={newGame.how_long_to_beat}
                    disabled={isSubmitting}
                    onChange={(e) =>
                      setNewGame((game) => ({
                        ...game,
                        how_long_to_beat: e.target.value,
                      }))
                    }
                    placeholder="40"
                  />
                </Field>

                <Field
                  id="add-my-score"
                  label="My score"
                  error={formError?.fields?.my_score}
                >
                  <TextInput
                    id="add-my-score"
                    type="number"
                    min="0"
                    max="10"
                    step="any"
                    value={newGame.my_score}
                    disabled={isSubmitting}
                    onChange={(e) =>
                      setNewGame((game) => ({
                        ...game,
                        my_score: e.target.value,
                      }))
                    }
                    placeholder="0-10"
                  />
                </Field>

                <Field
                  id="add-started-at"
                  label="Started on"
                  error={formError?.fields?.started_at}
                >
                  <TextInput
                    id="add-started-at"
                    type="date"
                    value={newGame.started_at}
                    disabled={isSubmitting}
                    onChange={(e) =>
                      setNewGame((game) => ({
                        ...game,
                        started_at: e.target.value,
                      }))
                    }
                    className="[color-scheme:dark]"
                  />
                </Field>

                <Field
                  id="add-finished-at"
                  label="Finished on"
                  error={formError?.fields?.finished_at}
                >
                  <TextInput
                    id="add-finished-at"
                    type="date"
                    value={newGame.finished_at}
                    disabled={isSubmitting}
                    onChange={(e) =>
                      setNewGame((game) => ({
                        ...game,
                        finished_at: e.target.value,
                      }))
                    }
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
                  id="add-my-genre"
                  label="My genre"
                  help="Choose existing tags or add your own."
                >
                  <MultiSelectMenu
                    id="add-my-genre"
                    values={selectedMyGenres}
                    options={allMyGenres}
                    placeholder="Choose genres"
                    customPlaceholder="Find or add a genre..."
                    allowCustom
                    disabled={isSubmitting}
                    onChange={(genres) =>
                      setNewGame((game) => ({
                        ...game,
                        my_genre: genres.join(", "),
                      }))
                    }
                  />
                </Field>

                <Field id="add-thoughts" label="Thoughts">
                  <Textarea
                    id="add-thoughts"
                    value={newGame.thoughts}
                    disabled={isSubmitting}
                    onChange={(e) =>
                      setNewGame((game) => ({
                        ...game,
                        thoughts: e.target.value,
                      }))
                    }
                    placeholder="Why it is on your backlog, what you expect, notes for future you..."
                  />
                </Field>
              </div>
            </section>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-surface-border bg-surface-card/95 p-4 backdrop-blur">
          <Button type="button" onClick={doClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add Game"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddGameForm;
