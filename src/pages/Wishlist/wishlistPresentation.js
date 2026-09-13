import { resolveGameArtwork as wishlistArtwork } from "../../utils/gameArtwork.js";
export { wishlistArtwork };

export function wishlistItemToGame(item = {}) {
  const hours = item.displayHLTB ?? item.howLongToBeat ?? null;
  return {
    ...item,
    id: `wishlist-${item.id}`,
    wishlistItemId: item.id,
    name: item.name || (item.steamAppId ? `Steam App ${item.steamAppId}` : "Unknown Steam app"),
    cover: item.cover || null,
    ...wishlistArtwork(item.cover),
    status: "wishlist",
    personal_genres: [],
    entryKind: "wishlist",
    readOnly: true,
    position: item.providerOrder ?? null,
    how_long_to_beat: hours,
    displayHLTB: hours,
    releaseDate: item.releaseDate || null,
    rating: item.rating ?? null,
    metacritic: item.metacritic ?? null,
    isWishlistOnly: !item.inBacklog,
  };
}

export function wishlistItemsToGames(items = []) {
  return (Array.isArray(items) ? items : []).map(wishlistItemToGame);
}

export function isWishlistRawgMatchUnavailable(result, game = {}) {
  if (!result?.alreadyInWishlist && !result?.already_in_wishlist) return false;
  const candidateRawgId = Number(result.rawg_id ?? result.rawgId);
  const currentRawgId = Number(game.rawg_id ?? game.rawgId);
  return !Number.isInteger(currentRawgId) || candidateRawgId !== currentRawgId;
}

export function summarizeWishlistMetadataResults(results = []) {
  const counts = { completed: 0, review: 0, unmatched: 0, failed: 0 };
  for (const result of Array.isArray(results) ? results : []) {
    if (Object.prototype.hasOwnProperty.call(counts, result?.status)) {
      counts[result.status] += 1;
    }
  }
  return counts;
}

export function wishlistMetadataBatchMessage({ processed = 0, pending = 0, results = [] } = {}) {
  const total = Number(processed) || 0;
  if (!total) {
    return `No due metadata items were processed. ${Number(pending) || 0} remain queued or awaiting retry.`;
  }

  const counts = summarizeWishlistMetadataResults(results);
  const details = [
    [counts.completed, "linked"],
    [counts.review, "need review"],
    [counts.unmatched, "need a match"],
    [counts.failed, "failed/retry scheduled"],
  ]
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`);
  const detailText = details.length ? `: ${details.join(", ")}` : "";
  return `Metadata checked for ${total} Wishlist item${total === 1 ? "" : "s"}${detailText}. ${Number(pending) || 0} remain pending or awaiting retry.`;
}

// Only the presentation collection contains projections. GamesProvider continues
// to own ordinary games and all lifecycle mutations.
export function composeBacklogWishlist(games = [], items = []) {
  const byGame = new Map(games.map((game) => [String(game.id), game]));
  const byCatalog = new Map(games.filter((game) => game.catalogGameId || game.catalog_game_id)
    .map((game) => [String(game.catalogGameId || game.catalog_game_id), game]));
  const memberships = new Map();
  const projections = [];
  for (const item of items) {
    if (!item.active) continue;
    const game = byGame.get(String(item.gameId)) || (item.catalogGameId && byCatalog.get(String(item.catalogGameId)));
    if (game) memberships.set(String(game.id), item);
    else projections.push(wishlistItemToGame(item));
  }
  return [...games.map((game) => memberships.has(String(game.id))
    ? { ...game, wishlist: memberships.get(String(game.id)) } : game), ...projections];
}

export const wishlistSortOptions = [
  { value: "price", label: "Price (ILS)" },
  { value: "discount", label: "Discount %" },
  { value: "providerOrder", label: "Steam order" },
  { value: "name", label: "Name" },
  { value: "dateAdded", label: "Date added" },
  { value: "changedAt", label: "Last changed" },
  { value: "estimatedHours", label: "HLTB hours" },
  { value: "rawgRating", label: "Rating" },
  { value: "metacritic", label: "Metacritic" },
  { value: "releaseDate", label: "Release date" },
];
