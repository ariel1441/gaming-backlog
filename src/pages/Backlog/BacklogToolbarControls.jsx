import { useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  Grid2X2,
  LayoutGrid,
  List,
  Search,
  X,
} from "lucide-react";
import {
  Button,
  DropdownChevron,
  GameCover,
  IconButton,
  PopoverPanel,
  SearchClearButton,
  SegmentedControl,
  StatusBadge,
  TextInput,
} from "../../components/ui";
import { resolveGameHours } from "../../utils/hours";
import { useDismissibleLayer } from "../../hooks/useDismissibleLayer";
import {
  NO_PERSONAL_GENRE_FILTER,
  NO_RAWG_GENRE_FILTER,
} from "../../utils/filterOptions";
const viewOptions = [
  { value: "grid", label: "Cards", icon: LayoutGrid },
  { value: "compact", label: "Compact cards", icon: Grid2X2 },
  { value: "list", label: "Rows", icon: List },
];

export function SearchBox({
  query,
  setQuery,
  clear,
  placeholder = "Search your backlog...",
  games = [],
  onSelectGame,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef(null);
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return games
      .filter((game) =>
        String(game.name || "")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 7);
  }, [games, query]);

  useDismissibleLayer({
    open,
    layerRef: wrapperRef,
    onDismiss: () => setOpen(false),
  });

  const selectGame = (game) => {
    if (!game) return;
    setOpen(false);
    onSelectGame?.(game);
  };

  const onKeyDown = (event) => {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      selectGame(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-content-muted"
        aria-hidden="true"
      />
      <TextInput
        type="text"
        inputMode="search"
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-10 border-surface-border/75 bg-surface-card/55 pl-11 pr-11 text-sm shadow-control-inset placeholder:text-content-muted/75 focus:border-primary/55 focus:bg-surface-card"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls="backlog-search-results"
        aria-autocomplete="list"
      />
      {query ? (
        <SearchClearButton
          onClick={clear}
          label="Clear search"
        />
      ) : null}

      {open && suggestions.length ? (
        <PopoverPanel
          id="backlog-search-results"
          role="listbox"
          padding="none"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden"
        >
          <div className="border-b border-surface-border px-3 py-2 text-xs font-medium text-content-muted">
            Backlog matches
          </div>
          {suggestions.map((game, index) => {
            const hours = resolveGameHours(game);
            return (
              <button
                type="button"
                key={game.id || game.name}
                role="option"
                aria-selected={activeIndex === index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectGame(game)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  activeIndex === index
                    ? "bg-surface-selected text-primary-light"
                    : "text-content-secondary hover:bg-surface-selected/55 hover:text-primary-light"
                }`}
              >
                <GameCover
                  src={game.cover}
                  name={game.name}
                  className="h-12 w-9 shrink-0 rounded"
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-medium text-content-primary"
                    title={game.name}
                  >
                    {game.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-muted">
                    {game.status ? <StatusBadge status={game.status} /> : null}
                    {hours.hours ? <span>{hours.label}</span> : null}
                    {game.rating ? <span>{game.rating}/5</span> : null}
                  </div>
                </div>
              </button>
            );
          })}
        </PopoverPanel>
      ) : null}
    </div>
  );
}

export function FilterDropdown({
  label,
  options = [],
  selected = [],
  onToggle,
  onClear,
  searchable = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef(null);
  const normalizedOptions = useMemo(
    () =>
      options.map((option) =>
        option && typeof option === "object"
          ? { value: option.value, label: option.label || String(option.value) }
          : { value: option, label: String(option) },
      ),
    [options],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter((option) =>
      option.label.toLowerCase().includes(q),
    );
  }, [normalizedOptions, query]);

  useDismissibleLayer({
    open,
    layerRef: wrapperRef,
    onDismiss: () => setOpen(false),
  });

  return (
    <div ref={wrapperRef} className="relative max-sm:static">
      <Button
        type="button"
        variant={selected.length ? "filterActive" : "secondary"}
        onClick={() => setOpen((value) => !value)}
        className="h-10 shrink-0 whitespace-nowrap"
        aria-expanded={open}
      >
        {label}
        {selected.length ? (
          <span className="rounded-full bg-content-on-primary/18 px-2 py-0.5 text-xs font-semibold text-content-on-primary ring-1 ring-inset ring-content-on-primary/20">
            {selected.length}
          </span>
        ) : null}
        <DropdownChevron open={open} />
      </Button>

      {open ? (
        <PopoverPanel
          padding="lg"
          className="absolute left-2 right-2 top-[calc(100%+0.5rem)] z-50 sm:left-0 sm:right-auto sm:w-[min(680px,calc(100vw-2rem))]"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-content-primary">
                {label}
              </div>
              <div className="text-xs text-content-muted">
                {selected.length
                  ? `${selected.length} selected`
                  : "No selection"}
              </div>
            </div>
            {selected.length ? (
              <Button
                type="button"
                size="sm"
                variant="dangerGhost"
                onClick={onClear}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Clear selection
              </Button>
            ) : null}
          </div>

          {searchable && options.length > 8 ? (
            <TextInput
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Find ${label.toLowerCase()}...`}
              className="mb-3 h-9"
            />
          ) : null}

          <div className="grid max-h-[360px] gap-2 overflow-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((option) => {
              const active = selected.includes(option.value);
              return (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => onToggle(option.value)}
                  aria-pressed={active}
                  className={`flex min-w-0 items-center gap-2 rounded-control border px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/60 ${
                    active
                      ? "border-primary/55 bg-surface-selected text-primary-light"
                      : "border-transparent text-content-secondary hover:border-primary/30 hover:bg-surface-selected/55 hover:text-primary-light"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      active
                        ? "border-action-primary bg-action-primary text-content-on-primary"
                        : "border-surface-border bg-surface-bg/70"
                    }`}
                    aria-hidden="true"
                  >
                    {active ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0 whitespace-normal break-words">
                    {option.label}
                  </span>
                </button>
              );
            })}
            {!filtered.length ? (
              <div className="col-span-full rounded-xl border border-surface-border bg-surface-elevated/45 px-3 py-4 text-sm text-content-muted">
                No matches.
              </div>
            ) : null}
          </div>
        </PopoverPanel>
      ) : null}
    </div>
  );
}

export function HoursDropdown({ hoursBounds, hoursRange, setHoursRange }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const min = hoursBounds?.min ?? 0;
  const max = hoursBounds?.max ?? 0;
  const value = hoursRange || hoursBounds || { min, max };
  const active = max > min && (value.min > min || value.max < max);
  const label = active ? `${value.min}-${value.max}h` : null;

  useDismissibleLayer({
    open,
    layerRef: wrapperRef,
    onDismiss: () => setOpen(false),
  });

  const update = (key, nextValue) => {
    const numeric = Number(nextValue);
    if (!Number.isFinite(numeric)) return;
    const next =
      key === "min"
        ? { min: Math.min(numeric, value.max), max: value.max }
        : { min: value.min, max: Math.max(numeric, value.min) };
    setHoursRange(next);
  };

  return (
    <div ref={wrapperRef} className="relative max-sm:static">
      <Button
        type="button"
        variant={active ? "filterActive" : "secondary"}
        onClick={() => setOpen((value) => !value)}
        className="h-10 shrink-0 whitespace-nowrap"
        disabled={max <= min}
        aria-expanded={open}
      >
        Hours
        {label ? <span className="text-xs opacity-80">{label}</span> : null}
        <DropdownChevron open={open} />
      </Button>

      {open ? (
        <PopoverPanel
          padding="lg"
          className="absolute left-2 right-2 top-[calc(100%+0.5rem)] z-50 sm:left-0 sm:right-auto sm:w-72"
        >
          <div className="mb-3 text-sm font-semibold text-content-primary">
            Hours
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-content-muted">
              Min
              <TextInput
                type="number"
                min={min}
                max={max}
                value={value.min}
                onChange={(event) => update("min", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs text-content-muted">
              Max
              <TextInput
                type="number"
                min={min}
                max={max}
                value={value.max}
                onChange={(event) => update("max", event.target.value)}
              />
            </label>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setHoursRange(hoursBounds)}
            className="mt-3"
          >
            Reset hours
          </Button>
        </PopoverPanel>
      ) : null}
    </div>
  );
}

export function DateDropdown({ dateFilter, setDateFilter }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const year = new Date().getFullYear();
  const options = [
    {
      label: `Started ${year}`,
      value: { type: "startedYear", year },
    },
    {
      label: `Finished ${year}`,
      value: { type: "finishedYear", year },
    },
    {
      label: "Active games",
      value: { type: "activeUnfinished" },
    },
    {
      label: "Active 6+ months",
      value: { type: "activeOlderThanMonths", months: 6 },
    },
  ];
  const activeLabel =
    options.find((option) => isSameDateFilter(option.value, dateFilter))
      ?.label || null;

  useDismissibleLayer({
    open,
    layerRef: wrapperRef,
    onDismiss: () => setOpen(false),
  });

  const select = (value) => {
    setDateFilter(value);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative max-sm:static">
      <Button
        type="button"
        variant={dateFilter ? "filterActive" : "secondary"}
        onClick={() => setOpen((value) => !value)}
        className="h-10 shrink-0 whitespace-nowrap"
        aria-expanded={open}
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        Dates
        {activeLabel ? (
          <span className="text-xs opacity-80">{activeLabel}</span>
        ) : null}
        <DropdownChevron open={open} />
      </Button>

      {open ? (
        <PopoverPanel className="absolute left-2 right-2 top-[calc(100%+0.5rem)] z-50 sm:left-0 sm:right-auto sm:w-64">
          <div className="mb-2 text-sm font-semibold text-content-primary">
            Dates
          </div>
          <div className="space-y-1">
            {options.map((option) => {
              const active = isSameDateFilter(option.value, dateFilter);
              return (
                <button
                  type="button"
                  key={option.label}
                  onClick={() => select(option.value)}
                  aria-pressed={active}
                  className={`flex w-full items-center justify-between rounded-control border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/60 ${
                    active
                      ? "border-primary/55 bg-surface-selected text-primary-light"
                      : "border-transparent text-content-secondary hover:border-primary/30 hover:bg-surface-selected/55 hover:text-primary-light"
                  }`}
                >
                  {option.label}
                  {active ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
          {dateFilter ? (
            <Button
              type="button"
              variant="dangerGhost"
              size="sm"
              onClick={() => select(null)}
              className="mt-2"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Clear dates
            </Button>
          ) : null}
        </PopoverPanel>
      ) : null}
    </div>
  );
}

function isSameDateFilter(a, b) {
  return (
    a?.type === b?.type &&
    Number(a?.year || 0) === Number(b?.year || 0) &&
    Number(a?.months || 0) === Number(b?.months || 0)
  );
}

export function ViewModeSwitch({ value, onChange }) {
  const options = viewOptions.map((option) => ({
    ...option,
    title: option.label,
    renderLabel: ({ value: optionValue }) => (
      <span className="hidden sm:inline">
        {optionValue === "grid"
          ? "Cards"
          : optionValue === "compact"
            ? "Compact"
            : "Rows"}
      </span>
    ),
  }));

  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      options={options}
      ariaLabel="Backlog view"
      variant="view"
      className="h-10 border-surface-border/75 bg-surface-card/45"
      itemClassName="h-8 px-2.5 text-xs sm:px-3"
    />
  );
}
