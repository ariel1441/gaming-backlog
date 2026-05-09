function moveItem(array, fromIndex, toIndex) {
  const next = [...array];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
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
