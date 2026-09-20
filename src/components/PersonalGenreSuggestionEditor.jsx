import { useId, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { Button, Chip, FloatingPopoverPanel, TextInput } from "./ui";

const MAX_GENRES_PER_GAME = 10;

function uniqueIds(values) {
  return [...new Set((values || []).map(Number).filter(Number.isInteger))];
}

export default function PersonalGenreSuggestionEditor({
  suggestions = [],
  currentPersonalGenres = [],
  availablePersonalGenres = [],
  selectedIds = [],
  onChange,
  disabled = false,
  compact = false,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef(null);
  const generatedId = useId();
  const listboxId = `${generatedId}-genres`;
  const suggestionIdSet = useMemo(
    () => new Set(suggestions.map((genre) => Number(genre.id))),
    [suggestions],
  );
  const currentIdSet = useMemo(
    () => new Set(currentPersonalGenres.map((genre) => Number(genre.id))),
    [currentPersonalGenres],
  );
  const selected = useMemo(
    () => uniqueIds(selectedIds),
    [selectedIds],
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const genreById = useMemo(() => {
    const entries = [...availablePersonalGenres, ...suggestions, ...currentPersonalGenres];
    return new Map(entries.map((genre) => [Number(genre.id), genre]));
  }, [availablePersonalGenres, currentPersonalGenres, suggestions]);
  const selectableGenres = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return availablePersonalGenres
      .filter((genre) => !needle || genre.name.toLocaleLowerCase().includes(needle));
  }, [availablePersonalGenres, query]);
  const manualSelected = selected
    .filter((id) => !suggestionIdSet.has(id) && !currentIdSet.has(id))
    .map((id) => genreById.get(id))
    .filter(Boolean);
  const limitReached = selected.length >= MAX_GENRES_PER_GAME;

  const toggle = (rawId) => {
    const id = Number(rawId);
    if (selectedSet.has(id)) {
      onChange?.(selected.filter((selectedId) => selectedId !== id));
      return;
    }
    if (limitReached) return;
    onChange?.([...selected, id]);
  };

  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      {currentPersonalGenres.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-content-muted">Current:</span>
          <div className="flex flex-wrap gap-1.5">
            {currentPersonalGenres.map((genre) => {
              const active = selectedSet.has(Number(genre.id));
              return (
                <Chip
                  key={genre.id}
                  as="button"
                  type="button"
                  variant={active ? "personalGenre" : "metadata"}
                  aria-pressed={active}
                  onClick={() => toggle(genre.id)}
                  disabled={disabled}
                  className="gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span className={active ? "flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-content-inverse" : "flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current/55"}>
                    {active ? <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" /> : null}
                  </span>
                  {genre.name}
                </Chip>
              );
            })}
          </div>
        </div>
      ) : null}

      <div>
        {suggestions.length ? (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((genre) => {
              const active = selectedSet.has(Number(genre.id));
              const atLimit = !active && limitReached;
              return (
                <Chip
                  key={genre.id}
                  as="button"
                  type="button"
                  variant={active ? "personalGenre" : "metadata"}
                  aria-pressed={active}
                  onClick={() => toggle(genre.id)}
                  disabled={disabled || atLimit}
                  className="gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span className={active ? "flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-content-inverse" : "flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current/55"}>
                    {active ? <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" /> : null}
                  </span>
                  {genre.name}
                </Chip>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-content-muted">
            No automatic match—choose one of your genres.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <Button
            ref={triggerRef}
            type="button"
            size="sm"
            variant="secondary"
            aria-expanded={pickerOpen}
            aria-controls={listboxId}
            onClick={() => setPickerOpen((value) => !value)}
            disabled={disabled || !availablePersonalGenres.length}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add genre
          </Button>
          <FloatingPopoverPanel
            anchorRef={triggerRef}
            open={pickerOpen}
            onDismiss={() => setPickerOpen(false)}
          >
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" aria-hidden="true" />
                <TextInput
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search your genres"
                  className="h-9 pl-9"
                />
              </div>
              <div id={listboxId} role="listbox" aria-multiselectable="true" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {selectableGenres.map((genre) => {
                  const active = selectedSet.has(Number(genre.id));
                  const atLimit = !active && limitReached;
                  return (
                    <button
                      key={genre.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={atLimit}
                      onClick={() => toggle(genre.id)}
                      className="flex min-h-10 w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm text-content-secondary hover:bg-surface-selected hover:text-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className={active ? "flex h-4 w-4 items-center justify-center rounded border border-primary bg-primary text-content-inverse" : "h-4 w-4 rounded border border-surface-border"}>
                        {active ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 break-words">{genre.name}</span>
                    </button>
                  );
                })}
                {!selectableGenres.length ? (
                  <p className="px-3 py-4 text-center text-sm text-content-muted">No matching genres.</p>
                ) : null}
              </div>
          </FloatingPopoverPanel>
        </div>
        {manualSelected.map((genre) => (
          <Chip
            key={genre.id}
            as="button"
            type="button"
            variant="personalGenre"
            onClick={() => toggle(genre.id)}
            disabled={disabled}
            aria-label={`Remove ${genre.name}`}
            className="min-h-10 gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/70"
          >
            {genre.name}
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Chip>
        ))}
      </div>
      {limitReached ? (
        <p className="text-xs text-content-muted">Genre limit reached. Turn one off to choose another.</p>
      ) : null}
    </div>
  );
}
