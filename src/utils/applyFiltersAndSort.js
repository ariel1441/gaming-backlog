// src/utils/applyFiltersAndSort.js

export function applyFiltersAndSort(
  games,
  {
    searchQuery = "",
    selectedStatuses = [],
    selectedGenres = [],
    selectedMyGenres = [],
    sortKey = "",
    isReversed = false,
  } = {}
) {
  const lowerSearch = (searchQuery || "").toLowerCase();

  const filtered = (games || []).filter((g) => {
    const nameMatch = (g.name || "").toLowerCase().includes(lowerSearch);

    const statusMatch =
      selectedStatuses.length === 0 || selectedStatuses.includes(g.status);

    const genreList = (g.genres || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    const myGenreList = (g.my_genre || "")
      .toLowerCase()
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    const genreMatch =
      selectedGenres.length === 0 ||
      selectedGenres.some((genre) => genreList.includes(genre));

    const myGenreMatch =
      selectedMyGenres.length === 0 ||
      selectedMyGenres.some((tag) => myGenreList.includes(tag.toLowerCase()));

    return nameMatch && statusMatch && genreMatch && myGenreMatch;
  });

  // Default ordering: status_rank → position → id
  filtered.sort((a, b) => {
    const statusCompare = (a.status_rank ?? 999) - (b.status_rank ?? 999);
    if (statusCompare !== 0) return statusCompare;

    const posA = a.position ?? 999999;
    const posB = b.position ?? 999999;
    const positionCompare = posA - posB;
    if (positionCompare !== 0) return positionCompare;

    return (a.id ?? 0) - (b.id ?? 0);
  });

  if (sortKey) {
    filtered.sort((a, b) => {
      let compare = 0;
      switch (sortKey) {
        case "name":
          compare = (a.name || "").localeCompare(b.name || "");
          break;
        case "hoursPlayed":
          compare =
            (Number(a.how_long_to_beat) || 0) -
            (Number(b.how_long_to_beat) || 0);
          break;
        case "rawgRating": {
          const ra = Number(a.rating ?? a.rawgRating ?? 0) || 0;
          const rb = Number(b.rating ?? b.rawgRating ?? 0) || 0;
          compare = ra - rb;
          break;
        }
        case "metacritic":
          compare = (Number(a.metacritic) || 0) - (Number(b.metacritic) || 0);
          break;
        case "releaseDate": {
          const dateA = new Date(a.releaseDate || a.released || 0).getTime();
          const dateB = new Date(b.releaseDate || b.released || 0).getTime();
          compare = dateA - dateB;
          break;
        }
        default:
          compare = 0;
      }
      return isReversed ? -compare : compare;
    });
  }

  return filtered;
}
