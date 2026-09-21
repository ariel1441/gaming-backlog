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
  PopoverPanel,
  SelectMenu,
  StatusBadge,
  TextInput,
} from "../../components/ui";
import { resolveGameHours } from "../../utils/hours";
import { statusOption } from "../../utils/statusDisplay";
import { backlogSortOptions } from "../../utils/userPreferences";
import { NotificationBell } from '../../features/notifications/Notifications';
import { useDismissibleLayer } from "../../hooks/useDismissibleLayer";
import {
  NO_PERSONAL_GENRE_FILTER,
  NO_RAWG_GENRE_FILTER,
  RAWG_STATUS_OPTIONS,
} from "../../utils/filterOptions";
import {
  DateDropdown,
  FilterDropdown,
  HoursDropdown,
  SearchBox,
  ViewModeSwitch,
} from "./BacklogToolbarControls";

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

function MoreFilters({ filters }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = Number(!!filters.dateFilter) + Number(filters.sourceFilter && filters.sourceFilter !== "all") + Number(filters.rawgStatus && filters.rawgStatus !== "all");
  useDismissibleLayer({ open, layerRef: ref, onDismiss: () => setOpen(false) });
  return <div ref={ref} className="relative max-sm:static">
    <Button type="button" variant={active ? "filterActive" : "secondary"} onClick={() => setOpen((value) => !value)} className="h-10 shrink-0 whitespace-nowrap" aria-expanded={open}>
      More filters{active ? <span className="rounded-full bg-content-on-primary/18 px-2 py-0.5 text-xs font-semibold text-content-on-primary">{active}</span> : null}
    </Button>
    {open ? <PopoverPanel padding="lg" className="absolute left-2 right-2 top-[calc(100%+0.5rem)] z-50 space-y-3 sm:left-0 sm:right-auto sm:w-72">
      <div><div className="text-sm font-semibold text-content-primary">More filters</div><p className="mt-1 text-xs text-content-muted">Less-used library controls.</p></div>
      <DateDropdown dateFilter={filters.dateFilter} setDateFilter={filters.setDateFilter} />
      <FilterDropdown label="Steam details" options={sourceOptions.filter((option) => option.value !== "all")} selected={filters.sourceFilter && filters.sourceFilter !== "all" ? [filters.sourceFilter] : []} onToggle={(value) => filters.setSourceFilter(filters.sourceFilter === value ? "all" : value)} onClear={() => filters.setSourceFilter("all")} />
      <FilterDropdown label="RAWG status" options={RAWG_STATUS_OPTIONS} selected={filters.rawgStatus && filters.rawgStatus !== "all" ? [filters.rawgStatus] : []} onToggle={filters.toggleRawgStatus} onClear={() => filters.setRawgStatus("all")} />
    </PopoverPanel> : null}
  </div>;
}

export default function BacklogToolbar({
  identity,
  search,
  sort,
  filters,
  actions,
  showNotifications = false,
  viewMode,
  setViewMode,
  resultCount,
  totalCount,
  games,
  onSelectGame,
  collection = "backlog",
  membershipControl = null,
  collectionControl = null,
  utilityControl = null,
  sortOptions = backlogSortOptions,
  mobileControlsOpen: controlledMobileControlsOpen,
  setMobileControlsOpen: setControlledMobileControlsOpen,
}) {
  const title = identity?.title || "Backlog";
  const [internalMobileControlsOpen, setInternalMobileControlsOpen] = useState(false);
  const mobileControlsOpen = controlledMobileControlsOpen ?? internalMobileControlsOpen;
  const setMobileControlsOpen = setControlledMobileControlsOpen ?? setInternalMobileControlsOpen;
  const countLabel = `${totalCount} ${totalCount === 1 ? "game" : "games"}`;
  const filteredCountLabel =
    resultCount !== totalCount && (search.query || filters.count)
      ? `${resultCount} shown`
      : null;
  const insightYear = filters.dateFilter?.type === "touchedYear"
    ? filters.dateFilter.year
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
              <span className="hidden shrink-0 text-xs text-content-muted sm:inline">
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
              collectionLabel={collection === "wishlist" ? "Wishlist" : "Backlog"}
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
            {showNotifications ? <div><NotificationBell compact /></div> : null}
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
              {utilityControl}
              {membershipControl}
              {collectionControl}
              {collection !== "wishlist" ? <>
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
              </> : null}
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
              {collection === "wishlist" ? (
                <FilterDropdown
                  label="RAWG status"
                  options={RAWG_STATUS_OPTIONS}
                  selected={filters.rawgStatus && filters.rawgStatus !== "all" ? [filters.rawgStatus] : []}
                  onToggle={filters.toggleRawgStatus}
                  onClear={() => filters.setRawgStatus("all")}
                />
              ) : null}
              {collection !== "wishlist" ? <>
              <MoreFilters filters={filters} />
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
              </> : null}
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
                    sort.isReversed ? "descending" : "ascending"
                  }. Change to ${
                    sort.isReversed ? "ascending" : "descending"
                  }.`}
                  className="h-10 shrink-0 whitespace-nowrap px-3"
                >
                  {sort.isReversed ? (
                    <ArrowDownAZ className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ArrowUpAZ className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{sort.isReversed ? "Descending" : "Ascending"}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
        {insightYear || filters.scoreFilter != null || filters.ratedOnly ? (
          <div className="mt-2 flex flex-wrap items-center gap-2" aria-label="Insights filters">
            {insightYear ? (
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={filters.clearInsightYearFilter}
                className="h-8 px-2.5 text-xs"
                aria-label={`Remove Started or finished in ${insightYear} filter`}
              >
                Started or finished in {insightYear}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            ) : null}
            {filters.scoreFilter != null ? (
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={filters.clearScoreFilter}
                className="h-8 px-2.5 text-xs"
                aria-label={`Remove score ${filters.scoreFilter} filter`}
              >
                Score {filters.scoreFilter}/10
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            ) : null}
            {filters.ratedOnly ? (
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={filters.clearRatedFilter}
                className="h-8 px-2.5 text-xs"
                aria-label="Remove rated games filter"
              >
                Rated games
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
