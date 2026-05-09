import React, { memo, useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import HoursRangeFilter from "./HoursRangeFilter";
import { Button, IconButton, TextInput } from "./ui";

const FilterPanel = ({
  allStatuses = [],
  allGenres = [],
  allMyGenres = [],
  selectedStatuses = [],
  selectedGenres = [],
  selectedMyGenres = [],
  handleCheckboxToggle,
  setSelectedStatuses,
  setSelectedGenres,
  setSelectedMyGenres,
  resetFilters,
  filterRef,
  onClose,
  // hours props
  hoursBounds,
  hoursRange,
  setHoursRange,
}) => {
  const activeItems = useMemo(
    () => [
      ...selectedStatuses.map((value) => ({
        value,
        onRemove: () =>
          setSelectedStatuses(selectedStatuses.filter((item) => item !== value)),
      })),
      ...selectedMyGenres.map((value) => ({
        value,
        onRemove: () =>
          setSelectedMyGenres(selectedMyGenres.filter((item) => item !== value)),
      })),
      ...selectedGenres.map((value) => ({
        value,
        onRemove: () =>
          setSelectedGenres(selectedGenres.filter((item) => item !== value)),
      })),
    ],
    [
      selectedGenres,
      selectedMyGenres,
      selectedStatuses,
      setSelectedGenres,
      setSelectedMyGenres,
      setSelectedStatuses,
    ]
  );

  return (
    <div
      className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        ref={filterRef}
        className="ml-auto flex h-full w-full max-w-[440px] flex-col border-l border-surface-border bg-surface-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        aria-label="Filters"
      >
        <header className="border-b border-surface-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-content-primary">
                Filters
              </h2>
              <p className="mt-1 text-sm text-content-muted">
                Narrow the backlog without crowding the grid.
              </p>
            </div>
            <IconButton
              icon={X}
              onClick={onClose}
              label="Close filters"
              title="Close filters"
              variant="ghost"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {activeItems.length ? (
              activeItems.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  onClick={item.onRemove}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-medium text-primary-light"
                  title={`Remove ${item.value}`}
                >
                  <span className="truncate">{item.value}</span>
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              ))
            ) : (
              <span className="rounded-full border border-surface-border bg-surface-elevated/60 px-3 py-1 text-xs text-content-muted">
                No filters selected
              </span>
            )}
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <FilterGroup
            title="Status"
            options={allStatuses}
            selected={selectedStatuses}
            onToggle={(status) =>
              handleCheckboxToggle(status, selectedStatuses, setSelectedStatuses)
            }
          />

          <FilterGroup
            title="My Genre"
            options={allMyGenres}
            selected={selectedMyGenres}
            searchable
            onToggle={(genre) =>
              handleCheckboxToggle(genre, selectedMyGenres, setSelectedMyGenres)
            }
          />

          <FilterGroup
            title="RAWG Genre"
            options={allGenres}
            selected={selectedGenres}
            searchable
            onToggle={(genre) =>
              handleCheckboxToggle(genre, selectedGenres, setSelectedGenres)
            }
          />

          <section className="rounded-2xl border border-surface-border bg-surface-bg/35 p-4">
            <h3 className="mb-3 text-sm font-semibold text-content-primary">
              Hours
            </h3>
            <HoursRangeFilter
              min={hoursBounds?.min ?? 0}
              max={hoursBounds?.max ?? 0}
              step={1}
              value={hoursRange || hoursBounds}
              onChange={setHoursRange}
              disabled={!hoursBounds || hoursBounds.max <= hoursBounds.min}
            />
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-surface-border p-5">
          <Button type="button" variant="secondary" onClick={resetFilters}>
            Reset
          </Button>
          <Button type="button" variant="primary" onClick={onClose}>
            Show games
          </Button>
        </footer>
      </aside>
    </div>
  );
};

function FilterGroup({
  title,
  options = [],
  selected = [],
  onToggle,
  searchable = false,
}) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      String(option).toLowerCase().includes(normalized)
    );
  }, [options, query]);
  const visible = expanded ? filtered : filtered.slice(0, 10);

  return (
    <section className="rounded-2xl border border-surface-border bg-surface-bg/35">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-content-primary">{title}</span>
        <span className="inline-flex items-center gap-2 text-xs text-content-muted">
          {selected.length ? `${selected.length} selected` : `${options.length}`}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-surface-border px-4 py-4">
          {searchable && options.length > 8 ? (
            <TextInput
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Find ${title.toLowerCase()}...`}
              className="h-9"
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            {visible.map((option) => (
              <FilterTag
                key={option}
                label={option}
                selected={selected.includes(option)}
                onToggle={() => onToggle(option)}
              />
            ))}
          </div>

          {filtered.length > 10 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Show less" : `Show ${filtered.length - 10} more`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const FilterTag = memo(function FilterTag({ label, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        selected
          ? "border-primary/70 bg-primary/15 text-primary-light"
          : "border-surface-border bg-surface-elevated/55 text-content-muted hover:border-secondary/50 hover:text-content-secondary"
      }`}
    >
      {label}
    </button>
  );
});

export default memo(FilterPanel);
