// Scores are insertion hints; preserve every existing peer's manual order.
export function finishedInsertionIndex(peers, score) {
  const rated = peers.flatMap((game, index) => {
    if (game.my_score == null || game.my_score === "") return [];
    const value = Number(game.my_score);
    return Number.isFinite(value) ? [{ index, score: value }] : [];
  });
  if (!rated.length) return peers.length;
  // Integer tenths avoid floating-point errors when comparing equal distances.
  const target = Math.round(score * 10);
  const nearest = rated.reduce((best, game) => {
    const distance = Math.abs(Math.round(game.score * 10) - target);
    const bestDistance = Math.abs(Math.round(best.score * 10) - target);
    return distance < bestDistance || (distance === bestDistance && game.score > best.score)
      ? game : best;
  });
  const matches = rated.filter((game) => game.score === nearest.score);
  return nearest.score >= score ? matches.at(-1).index + 1 : matches[0].index;
}
