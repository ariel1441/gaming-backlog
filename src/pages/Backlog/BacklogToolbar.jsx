import React, { useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarDays,
  Check,
  CheckCircle2,
  Dice5,
  Grid2X2,
  LayoutGrid,
  List,
  Plus,
  Search,
  SlidersHorizontal,
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
import { statusOption } from "../../utils/statusDisplay";
import { useDismissibleLayer } from "../../hooks/useDismissibleLayer";
import {
  NO_PERSONAL_GENRE_FILTER,
  NO_RAWG_GENRE_FILTER,
} from "../../utils/filterOptions";
import {
  DateDropdown,
  FilterDropdown,
  HoursDropdown,
  SearchBox,
  ViewModeSwitch,
} from "./BacklogToolbarControls";

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
  {
    value: "steam_achievements_unavailable",
    label: "Achievements unavailable",
  },
];

export default function BacklogToolbar({
  identity,
  search,
  sort,
  filters,
  actions,
  viewMode,
  setViewMode,
  resultCount,
  totalCount,
  games,
  onSelectGame,
}) {
  const title = identity?.title || "Backlog";
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const countLabel = `${totalCount} ${totalCount === 1 ? "game" : "games"}`;
  const filteredCountLabel =
    resultCount !== totalCount && (search.query || filters.count)
      ? `${resultCount} shown`
      : null;

  return (
    <header className="-mx-3 mb-6 shrink-0 border-b border-surface-border/65 bg-surface-bg px-3 sm:-mx-6 sm:px-6 lg:-mx-5 lg:px-5">
      <div className="mx-auto max-w-[1760px] py-3.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(190px,auto)_minmax(280px,1fr)_auto]">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-content-primary sm:text-[28px]">
              {title}
            </h1>
            <span className="hidden shrink-0 text-sm font-medium text-primary-light/85 sm:inline">
              {countLabel}
            </span>
            {filteredCountLabel ? (
              <span className="hidden shrink-0 text-xs text-content-muted xl:inline">
                {filteredCountLabel}
              </span>
            ) : null}
          </div>

          <div className="order-3 col-span-2 min-w-0 md:order-none md:col-span-1">
            <SearchBox
              query={search.query}
              setQuery={search.setQuery}
              clear={search.clear}
              placeholder={search.placeholder}
              games={games}
              onSelectGame={onSelectGame}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {actions?.surprise ? (
              <>
                <IconButton
                  icon={Dice5}
                  onClick={actions.surprise}
                  label="Pick a surprise game"
                  title="Surprise me"
                  variant="ghost"
                  className="hidden h-10 w-10 rounded-control sm:inline-flex xl:hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={actions.surprise}
                  className="hidden h-10 px-3.5 xl:inline-flex"
                  title="Pick a surprise game"
                >
                  <Dice5 className="h-4 w-4" aria-hidden="true" />
                  Surprise me
                </Button>
              </>
            ) : null}
            {actions?.add ? (
              <Button
                type="button"
                variant="primary"
                onClick={actions.add}
                className="h-10 px-3.5 sm:px-4"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Add game</span>
                <span className="sm:hidden">Add</span>
              </Button>
            ) : null}
            {identity?.action || null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 md:hidden">
          <Button
            type="button"
            variant={mobileControlsOpen ? "filterActive" : "secondary"}
            onClick={() => setMobileControlsOpen((value) => !value)}
            className="h-10 flex-1"
            aria-expanded={mobileControlsOpen}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filters and view
            {filters.count ? (
              <span
                className={[
                  "rounded-full border px-2 py-0.5 text-xs font-semibold",
                  mobileControlsOpen
                    ? "border-content-on-primary/20 bg-content-on-primary/18 text-content-on-primary"
                    : "border-primary/35 bg-surface-selected text-primary-light",
                ].join(" ")}
              >
                {filters.count}
              </span>
            ) : null}
          </Button>
        </div>

        <div
          className={[
            "mt-3 md:block",
            mobileControlsOpen ? "block" : "hidden",
          ].join(" ")}
        >
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:flex-nowrap 2xl:items-center">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 2xl:flex-nowrap">
              <FilterDropdown
                label="Status"
                options={filters.allStatuses.map(statusOption)}
                selected={filters.selectedStatuses}
                onToggle={filters.toggleStatus}
                onClear={() => filters.setSelectedStatuses([])}
              />
              <FilterDropdown
                label="My genres"
                options={[
                  ...filters.allMyGenres,
                  { value: NO_PERSONAL_GENRE_FILTER, label: "No genre" },
                ]}
                selected={filters.selectedMyGenres}
                onToggle={filters.toggleMyGenre}
                onClear={() => filters.setSelectedMyGenres([])}
                searchable
              />
              <HoursDropdown
                hoursBounds={filters.hoursBounds}
                hoursRange={filters.hoursRange}
                setHoursRange={filters.setHoursRange}
              />
              <FilterDropdown
                label="RAWG genres"
                options={[
                  ...filters.allGenres,
                  { value: NO_RAWG_GENRE_FILTER, label: "No RAWG genre" },
                ]}
                selected={filters.selectedGenres}
                onToggle={filters.toggleGenre}
                onClear={() => filters.setSelectedGenres([])}
                searchable
              />
              <FilterDropdown
                label="Sources"
                options={sourceOptions.filter(
                  (option) => option.value !== "all",
                )}
                selected={
                  filters.sourceFilter && filters.sourceFilter !== "all"
                    ? [filters.sourceFilter]
                    : []
                }
                onToggle={(value) =>
                  filters.setSourceFilter(
                    filters.sourceFilter === value ? "all" : value,
                  )
                }
                onClear={() => filters.setSourceFilter("all")}
              />
              <div>
                <DateDropdown
                  dateFilter={filters.dateFilter}
                  setDateFilter={filters.setDateFilter}
                />
              </div>
              <div>
                <Button
                  type="button"
                  variant={
                    actions?.completedActive ? "filterActive" : "secondary"
                  }
                  onClick={actions?.toggleCompleted}
                  className="h-10 shrink-0 whitespace-nowrap"
                  aria-pressed={actions?.completedActive}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Completed
                  {actions?.completedActive ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : null}
                </Button>
              </div>
              {filters.count ? (
                <Button
                  type="button"
                  variant="dangerGhost"
                  size="sm"
                  onClick={filters.clear}
                  className="h-10"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Clear filters
                </Button>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 2xl:ml-auto 2xl:flex-nowrap">
              <ViewModeSwitch value={viewMode} onChange={setViewMode} />
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                <SelectMenu
                  id="backlog-sort"
                  value={sort.key}
                  onChange={sort.setKey}
                  options={sortOptions}
                  className="h-10 min-w-0 flex-1 sm:w-[190px] sm:flex-none"
                  placeholder="Default order"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => sort.setIsReversed(!sort.isReversed)}
                  aria-label={`Sort direction: ${
                    sort.isReversed ? "ascending" : "descending"
                  }. Change to ${
                    sort.isReversed ? "descending" : "ascending"
                  }.`}
                  className="h-10 shrink-0 whitespace-nowrap px-3"
                >
                  {sort.isReversed ? (
                    <ArrowUpAZ className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ArrowDownAZ className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{sort.isReversed ? "Ascending" : "Descending"}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
