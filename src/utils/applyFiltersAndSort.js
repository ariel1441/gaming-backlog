import { buildDisplayGames } from "./gameList.js";

export function applyFiltersAndSort({
  games,
  searchQuery = "",
  selectedStatuses = [],
  selectedGenres = [],
  selectedMyGenres = [],
  sortKey = "",
  isReversed = false,
} = {}) {
  return buildDisplayGames({
    games,
    searchQuery,
    selectedStatuses,
    selectedGenres,
    selectedMyGenres,
    sortKey,
    isReversed,
  });
}

export default applyFiltersAndSort;
