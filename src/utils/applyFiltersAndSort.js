// src/utils/applyFiltersAndSort.js

function toArray(maybe) {
  if (Array.isArray(maybe)) return maybe;
  if (!maybe) return [];
  // If someone passed a keyed object like { "12": {...}, "13": {...} }
  if (typeof maybe === "object") {
    // Common APIs also return { data: [...] }
    if (Array.isArray(maybe.data)) return maybe.data;
    return Object.values(maybe);
  }
  return [];
}

/**
 * Shared filtering + sorting used by private and public views.
 * All inputs optional; the function is defensive and returns [] on bad input.
 */
export function applyFiltersAndSort({
  games,
  searchQuery = "",
  selectedStatuses = [],
  selectedGenres = [],
  selectedMyGenres = [],
  sortKey = "",
  isReversed = false,
} = {}) {
  const list = toArray(games);

  const q = String(searchQuery || "").toLowerCase();

  // filter
  const filtered = list.filter((g) => {
    if (!g) return false;

    const name = (g.name || "").toLowerCase();
    const genresText = g.genres || "";
    const myGenresText = g.my_genre || "";

    const nameMatch = q ? name.includes(q) : true;

    const statusMatch =
      !selectedStatuses?.length || selectedStatuses.includes(g.status);

    const genreSet = new Set(
      String(genresText)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    );
    const genreMatch =
      !selectedGenres?.length ||
      selectedGenres.some((genre) => genreSet.has(genre));

    const myGenreSet = new Set(
      String(myGenresText)
        .toLowerCase()
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    );
    const myGenreMatch =
      !selectedMyGenres?.length ||
      selectedMyGenres.some((tag) => myGenreSet.has(String(tag).toLowerCase()));

    return nameMatch && statusMatch && genreMatch && myGenreMatch;
  });

  // default ordering: status rank → position → id (stable baseline)
  filtered.sort((a, b) => {
    const srA = a?.status_rank ?? 999;
    const srB = b?.status_rank ?? 999;
    if (srA !== srB) return srA - srB;

    const posA = a?.position ?? 999999;
    const posB = b?.position ?? 999999;
    if (posA !== posB) return posA - posB;

    return (a?.id ?? 0) - (b?.id ?? 0);
  });

  if (sortKey) {
    filtered.sort((a, b) => {
      const num = (v) => (v == null || v === "" ? 0 : Number(v));

      let compare = 0;
      switch (sortKey) {
        case "name":
          compare = String(a?.name || "").localeCompare(String(b?.name || ""));
          break;
        case "hoursPlayed":
          compare = num(a?.how_long_to_beat) - num(b?.how_long_to_beat);
          break;
        case "rawgRating":
          compare = num(a?.rawgRating) - num(b?.rawgRating);
          break;
        case "metacritic":
          compare = num(a?.metacritic) - num(b?.metacritic);
          break;
        case "releaseDate": {
          const da = new Date(a?.releaseDate || a?.released || 0).getTime();
          const db = new Date(b?.releaseDate || b?.released || 0).getTime();
          compare = da - db;
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

// keep default export too, so both import styles work
export default applyFiltersAndSort;
