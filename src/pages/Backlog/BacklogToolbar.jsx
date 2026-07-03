import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Compass,
  Dice5,
  Globe,
  Gamepad2,
  Grid2X2,
  LibraryBig,
  LayoutGrid,
  List,
  LogIn,
  LogOut,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  User2,
  X,
} from "lucide-react";
import {
  Button,
  IconButton,
  SelectMenu,
  StatusBadge,
  TextInput,
} from "../../components/ui";
import { resolveGameHours } from "../../utils/hours";

const sortOptions = [
  { value: "", label: "Default order" },
  { value: "name", label: "Name" },
  { value: "hoursPlayed", label: "Hours" },
  { value: "rawgRating", label: "RAWG rating" },
  { value: "metacritic", label: "Metacritic" },
  { value: "releaseDate", label: "Release date" },
  { value: "startedDate", label: "Started date" },
  { value: "finishedDate", label: "Finished date" },
  { value: "steamLastPlayed", label: "Steam last played" },
];

const viewOptions = [
  { value: "grid", label: "Grid view", icon: LayoutGrid },
  { value: "compact", label: "Compact grid", icon: Grid2X2 },
  { value: "list", label: "List view", icon: List },
];

const sourceOptions = [
  { value: "all", label: "All sources" },
  { value: "steam_linked", label: "Linked to Steam" },
  { value: "steam_unlinked", label: "Not linked to Steam" },
  { value: "steam_playtime", label: "Has Steam playtime" },
  { value: "steam_no_playtime", label: "Steam, no playtime" },
  { value: "steam_recent", label: "Played on Steam recently" },
  { value: "steam_achievements", label: "Has Steam achievements" },
  { value: "steam_achievements_complete", label: "100% achievements" },
  { value: "steam_achievements_close", label: "Close to 100%" },
  { value: "steam_achievements_not_synced", label: "Achievements not synced" },
  { value: "steam_achievements_unavailable", label: "Achievements unavailable" },
];

export default function BacklogToolbar({
  identity,
  search,
  sort,
  filters,
  actions,
  account,
  viewMode,
  setViewMode,
  resultCount,
  totalCount,
  games,
  onSelectGame,
}) {
  const title = identity?.title || "Gaming Backlog";
  const subtitle =
    identity?.subtitle || `${resultCount} of ${totalCount} games`;
  const IdentityIcon = identity?.icon || LibraryBig;
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 -mx-2 mb-5 border-b border-surface-border bg-surface-bg/95 px-2 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="order-1 flex min-w-0 shrink-0 items-center gap-3 md:order-none">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-surface-elevated/70 text-content-secondary shadow-inner shadow-black/10">
              <IdentityIcon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 max-w-[190px]">
              <div className="truncate text-sm font-semibold text-content-primary">
                {title}
              </div>
              <div className="truncate text-xs text-content-muted">
                {subtitle}
              </div>
            </div>
          </div>

          <SearchBox
            query={search.query}
            setQuery={search.setQuery}
            clear={search.clear}
            placeholder={search.placeholder}
            games={games}
            onSelectGame={onSelectGame}
          />

          <div className="order-2 ml-auto flex min-w-0 shrink-0 items-center justify-end gap-2 md:order-none">
            {actions?.steam ? (
              <Button
                type="button"
                variant="secondary"
                onClick={actions.steam}
                className="hidden h-10 md:inline-flex"
              >
                <Gamepad2 className="h-4 w-4" aria-hidden="true" />
                Steam
              </Button>
            ) : null}
            {actions?.surprise ? (
              <Button
                type="button"
                variant="secondary"
                onClick={actions.surprise}
                className="hidden h-10 md:inline-flex"
              >
                <Dice5 className="h-4 w-4" aria-hidden="true" />
                Surprise
              </Button>
            ) : null}
            {actions?.add ? (
              <Button
                type="button"
                variant="primary"
                onClick={actions.add}
                className="hidden h-10 md:inline-flex"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add game
              </Button>
            ) : null}
            {identity?.action || null}
            {account ? <ProfileMenu account={account} /> : null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-surface-border/70 pt-3 md:hidden">
          <Button
            type="button"
            variant={mobileControlsOpen ? "primary" : "secondary"}
            onClick={() => setMobileControlsOpen((value) => !value)}
            className="h-10 flex-1 justify-center"
            aria-expanded={mobileControlsOpen}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Controls
            {filters.count ? (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
                {filters.count}
              </span>
            ) : null}
          </Button>
          {actions?.add ? (
            <IconButton
              icon={Plus}
              onClick={actions.add}
              label="Add game"
              title="Add game"
              variant="primary"
              className="h-10 w-10"
            />
          ) : null}
        </div>

        <div
          className={[
            "mt-3 gap-2 border-t border-surface-border/70 pt-3 md:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center",
            mobileControlsOpen ? "grid" : "hidden",
          ].join(" ")}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:hidden">
            {actions?.surprise ? (
              <Button
                type="button"
                variant="secondary"
                onClick={actions.surprise}
                className="h-10 flex-1 justify-center"
              >
                <Dice5 className="h-4 w-4" aria-hidden="true" />
                Surprise
              </Button>
            ) : null}
            {actions?.steam ? (
              <Button
                type="button"
                variant="secondary"
                onClick={actions.steam}
                className="h-10 flex-1 justify-center"
              >
                <Gamepad2 className="h-4 w-4" aria-hidden="true" />
                Steam
              </Button>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <FilterDropdown
              label="Status"
              options={filters.allStatuses}
              selected={filters.selectedStatuses}
              onToggle={filters.toggleStatus}
              onClear={() => filters.setSelectedStatuses([])}
            />
            <FilterDropdown
              label="My Genre"
              options={filters.allMyGenres}
              selected={filters.selectedMyGenres}
              onToggle={filters.toggleMyGenre}
              onClear={() => filters.setSelectedMyGenres([])}
              searchable
            />
            <FilterDropdown
              label="RAWG Genre"
              options={filters.allGenres}
              selected={filters.selectedGenres}
              onToggle={filters.toggleGenre}
              onClear={() => filters.setSelectedGenres([])}
              searchable
            />
            <HoursDropdown
              hoursBounds={filters.hoursBounds}
              hoursRange={filters.hoursRange}
              setHoursRange={filters.setHoursRange}
            />
            <SourceDropdown
              value={filters.sourceFilter || "all"}
              onChange={filters.setSourceFilter}
            />
            {filters.setDateFilter ? (
              <DateDropdown
                dateFilter={filters.dateFilter}
                setDateFilter={filters.setDateFilter}
              />
            ) : null}
            {actions?.toggleCompleted ? (
              <Button
                type="button"
                variant={actions.completedActive ? "primary" : "secondary"}
                onClick={actions.toggleCompleted}
                className="h-10"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Completed
              </Button>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
            <SelectMenu
              id="backlog-sort"
              value={sort.key}
              onChange={sort.setKey}
              options={sortOptions}
              className="h-10 w-full min-w-[170px] sm:w-[210px]"
              placeholder="Default order"
            />
            <IconButton
              icon={sort.isReversed ? ArrowUpAZ : ArrowDownAZ}
              onClick={() => sort.setIsReversed(!sort.isReversed)}
              label={sort.isReversed ? "Ascending order" : "Descending order"}
              title={sort.isReversed ? "Ascending order" : "Descending order"}
              className="h-10 w-10"
            />
            <ViewModeSwitch value={viewMode} onChange={setViewMode} />

            {filters.count ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={filters.clear}
                className="h-10"
              >
                Clear all
              </Button>
            ) : null}
          </div>
        </div>

        {filters.count ? (
          <div
            className={[
              "mt-3 md:block",
              mobileControlsOpen ? "block" : "hidden",
            ].join(" ")}
          >
            <ActiveFilterSummary filters={filters} />
          </div>
        ) : null}
      </div>
    </header>
  );
}

function SearchBox({
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
      .filter((game) => String(game.name || "").toLowerCase().includes(q))
      .slice(0, 7);
  }, [games, query]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

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
    <div
      ref={wrapperRef}
      className="order-3 relative w-full min-w-[280px] flex-1 basis-full md:order-none md:w-auto md:basis-[420px] lg:max-w-[760px]"
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
        aria-hidden="true"
      />
      <TextInput
        type="search"
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-10 rounded-xl bg-surface-elevated/40 pl-10 pr-10"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls="backlog-search-results"
        aria-autocomplete="list"
      />
      {query ? (
        <IconButton
          icon={X}
          onClick={clear}
          label="Clear search"
          title="Clear search"
          variant="ghost"
          className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 border-transparent"
        />
      ) : null}

      {open && suggestions.length ? (
        <div
          id="backlog-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-2xl"
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
                    ? "bg-surface-elevated text-content-primary"
                    : "text-content-secondary hover:bg-surface-elevated/70"
                }`}
              >
                {game.cover ? (
                  <img
                    src={game.cover}
                    alt=""
                    className="h-12 w-9 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-12 w-9 rounded bg-surface-elevated" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-content-primary">
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
        </div>
      ) : null}
    </div>
  );
}

function FilterDropdown({
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
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => String(option).toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={wrapperRef} className="relative max-sm:static">
      <Button
        type="button"
        variant={selected.length ? "primary" : "secondary"}
        onClick={() => setOpen((value) => !value)}
        className="h-10 rounded-xl"
        aria-expanded={open}
      >
        {label}
        {selected.length ? (
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
            {selected.length}
          </span>
        ) : null}
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </Button>

      {open ? (
        <div className="absolute left-2 right-2 top-[calc(100%+0.5rem)] z-50 rounded-2xl border border-surface-border bg-surface-card p-4 shadow-2xl shadow-black/45 sm:left-0 sm:right-auto sm:w-[min(680px,calc(100vw-2rem))]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-content-primary">
                {label}
              </div>
              <div className="text-xs text-content-muted">
                {selected.length ? `${selected.length} selected` : "No selection"}
              </div>
            </div>
            {selected.length ? (
              <Button type="button" size="sm" variant="ghost" onClick={onClear}>
                Clear
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
              const active = selected.includes(option);
              return (
                <button
                  type="button"
                  key={option}
                  onClick={() => onToggle(option)}
                  className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition-colors ${
                    active
                      ? "border-primary/40 bg-primary/10 text-content-primary"
                      : "border-transparent text-content-secondary hover:border-surface-border hover:bg-surface-elevated/70 hover:text-content-primary"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      active
                        ? "border-primary bg-primary text-white"
                        : "border-surface-border bg-surface-bg/70"
                    }`}
                    aria-hidden="true"
                  >
                    {active ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="truncate">{option}</span>
                </button>
              );
            })}
            {!filtered.length ? (
              <div className="col-span-full rounded-xl border border-surface-border bg-surface-elevated/45 px-3 py-4 text-sm text-content-muted">
                No matches.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HoursDropdown({ hoursBounds, hoursRange, setHoursRange }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const min = hoursBounds?.min ?? 0;
  const max = hoursBounds?.max ?? 0;
  const value = hoursRange || hoursBounds || { min, max };
  const active = max > min && (value.min > min || value.max < max);
  const label = active ? `${value.min}-${value.max}h` : "Any length";

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

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
        variant={active ? "primary" : "secondary"}
        onClick={() => setOpen((value) => !value)}
        className="h-10 rounded-xl"
        disabled={max <= min}
      >
        Hours
        <span className="text-xs opacity-80">{label}</span>
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </Button>

      {open ? (
        <div className="absolute left-2 right-2 top-[calc(100%+0.5rem)] z-50 rounded-2xl border border-surface-border bg-surface-card p-4 shadow-2xl shadow-black/45 sm:left-0 sm:right-auto sm:w-72">
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
        </div>
      ) : null}
    </div>
  );
}

function DateDropdown({ dateFilter, setDateFilter }) {
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
      ?.label || "Any date";

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const select = (value) => {
    setDateFilter(value);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative max-sm:static">
      <Button
        type="button"
        variant={dateFilter ? "primary" : "secondary"}
        onClick={() => setOpen((value) => !value)}
        className="h-10 rounded-xl"
        aria-expanded={open}
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        Dates
        <span className="text-xs opacity-80">{activeLabel}</span>
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </Button>

      {open ? (
        <div className="absolute left-2 right-2 top-[calc(100%+0.5rem)] z-50 rounded-2xl border border-surface-border bg-surface-card p-3 shadow-2xl shadow-black/45 sm:left-0 sm:right-auto sm:w-64">
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
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "bg-primary/10 text-content-primary"
                      : "text-content-secondary hover:bg-surface-elevated hover:text-content-primary"
                  }`}
                >
                  {option.label}
                  {active ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
          {dateFilter ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => select(null)}
              className="mt-2"
            >
              Clear dates
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SourceDropdown({ value = "all", onChange }) {
  const active = value !== "all";
  return (
    <SelectMenu
      id="backlog-source-filter"
      value={value}
      onChange={onChange}
      options={sourceOptions}
      className="h-10 min-w-[165px] rounded-xl"
      buttonClassName={
        active
          ? "border-primary/70 bg-primary text-white hover:border-primary hover:bg-primary-dark focus:border-primary focus:ring-primary/25 [&_svg]:text-white"
          : ""
      }
      placeholder="All sources"
    />
  );
}

function isSameDateFilter(a, b) {
  return (
    a?.type === b?.type &&
    Number(a?.year || 0) === Number(b?.year || 0) &&
    Number(a?.months || 0) === Number(b?.months || 0)
  );
}

function ViewModeSwitch({ value, onChange }) {
  return (
    <div className="flex h-10 items-center rounded-xl border border-surface-border bg-surface-elevated/55 p-1">
      {viewOptions.map(({ value: optionValue, label, icon: Icon }) => (
        <button
          type="button"
          key={optionValue}
          onClick={() => onChange(optionValue)}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
            value === optionValue
              ? "bg-primary text-white"
              : "text-content-muted hover:bg-surface-card hover:text-content-primary"
          }`}
          title={label}
          aria-label={label}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function ActiveFilterSummary({ filters }) {
  const sourceLabel =
    sourceOptions.find((option) => option.value === filters.sourceFilter)
      ?.label || "";
  const chips = [
    ...filters.selectedStatuses.map((value) => ({
      value,
      onRemove: () => filters.toggleStatus(value),
    })),
    ...filters.selectedMyGenres.map((value) => ({
      value,
      onRemove: () => filters.toggleMyGenre(value),
    })),
    ...filters.selectedGenres.map((value) => ({
      value,
      onRemove: () => filters.toggleGenre(value),
    })),
    filters.sourceFilter && filters.sourceFilter !== "all"
      ? {
          value: sourceLabel,
          onRemove: () => filters.setSourceFilter("all"),
        }
      : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          type="button"
          key={`${chip.value}-${chip.onRemove}`}
          onClick={chip.onRemove}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-surface-border bg-surface-elevated/65 px-3 py-1 text-xs text-content-secondary hover:text-content-primary"
        >
          <span className="truncate">{chip.value}</span>
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function ProfileMenu({ account }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const username = account.user?.username || "Guest";
  const initials = username
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "G";

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-surface-border bg-surface-elevated text-sm font-semibold text-content-primary transition-colors hover:border-primary/50 hover:bg-surface-card"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {account.isAuthenticated ? initials : <User2 className="h-5 w-5" aria-hidden="true" />}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-2xl">
          <div className="border-b border-surface-border px-4 py-3">
            <div className="text-sm font-medium text-content-primary">
              {account.user?.username || "Guest"}
            </div>
            <div className="text-xs text-content-muted">
              {account.isAuthenticated ? "Signed in" : "Not signed in"}
            </div>
          </div>
          <MenuItem icon={BarChart3} label="Insights" onClick={account.goInsights} />
          {account.isAuthenticated ? (
            <MenuItem icon={Compass} label="Discover" onClick={account.goDiscover} />
          ) : null}
          {account.isAuthenticated && !account.isGuest ? (
            <MenuItem icon={Gamepad2} label="Steam import" onClick={account.goSteam} />
          ) : null}
          {account.isAuthenticated ? (
            <MenuItem
              icon={Globe}
              label="Public profile"
              onClick={account.showPublicSettings}
            />
          ) : null}
          <MenuItem icon={Sparkles} label="Try live demo" onClick={account.startDemo} />
          <div className="border-t border-surface-border">
            {account.isAuthenticated ? (
              <MenuItem icon={LogOut} label="Log out" onClick={account.logout} />
            ) : (
              <MenuItem icon={LogIn} label="Log in" onClick={account.showLogin} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-content-secondary transition-colors hover:bg-surface-elevated hover:text-content-primary"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
