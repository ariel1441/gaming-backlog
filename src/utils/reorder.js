function moveItem(array, fromIndex, toIndex) {
  const next = [...array];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function rankKey(game) {
  const rank = game?.status_rank;
  return rank === null || rank === undefined || rank === ""
    ? null
    : String(rank);
}

export function canReorderVisibleGames(allGames, visibleGames) {
  const fullList = Array.isArray(allGames) ? allGames : [];
  const visibleList = Array.isArray(visibleGames) ? visibleGames : [];
  if (visibleList.length < 2) return false;

  const visibleIds = new Set();
  const visibleRanks = new Set();

  for (const game of visibleList) {
    const rank = rankKey(game);
    if (rank === null || game?.id === null || game?.id === undefined) {
      return false;
    }
    visibleRanks.add(rank);
    visibleIds.add(String(game.id));
  }

  return fullList.every((game) => {
    const rank = rankKey(game);
    return !visibleRanks.has(rank) || visibleIds.has(String(game.id));
  });
}

export function buildRankReorderRequest(games, activeId, overId) {
  const current = Array.isArray(games) ? games : [];
  const activeKey = String(activeId);
  const overKey = String(overId);

  if (!activeKey || !overKey || activeKey === overKey) return null;

  const oldIndex = current.findIndex((game) => String(game.id) === activeKey);
  const newIndex = current.findIndex((game) => String(game.id) === overKey);
  if (oldIndex === -1 || newIndex === -1) return null;

  const draggedGame = current[oldIndex];
  const targetGame = current[newIndex];
  if (draggedGame?.status_rank !== targetGame?.status_rank) return null;

  const newOrder = moveItem(current, oldIndex, newIndex);
  const sameRankGames = newOrder.filter(
    (game) => game.status_rank === draggedGame.status_rank
  );
  const targetIndex = sameRankGames.findIndex(
    (game) => String(game.id) === activeKey
  );

  if (targetIndex === -1) return null;

  return {
    gameId: draggedGame.id,
    targetIndex,
    newOrder,
  };
}
