export function wishlistItemToGame(item = {}) {
  const hours = item.displayHLTB ?? item.howLongToBeat ?? null;
  return {
    ...item,
    id: `wishlist-${item.id}`,
    wishlistItemId: item.id,
    name: item.name || (item.steamAppId ? `Steam App ${item.steamAppId}` : "Unknown Steam app"),
    cover: item.cover || null,
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
  { value: "providerOrder", label: "Steam order" },
  { value: "name", label: "Name" },
  { value: "dateAdded", label: "Date added" },
  { value: "changedAt", label: "Last changed" },
  { value: "estimatedHours", label: "HLTB hours" },
  { value: "rawgRating", label: "Rating" },
  { value: "metacritic", label: "Metacritic" },
  { value: "releaseDate", label: "Release date" },
];
