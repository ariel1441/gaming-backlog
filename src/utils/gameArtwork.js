// Older syncs saved Steam's portrait capsule as the only cover. Use landscape
// artwork for shared cards/heroes while retaining the capsule for the poster.
export function resolveGameArtwork(cover) {
  if (typeof cover !== "string") return {};
  let url;
  try { url = new URL(cover); } catch { return {}; }
  if (!/^https?:$/.test(url.protocol) || !/(^|\.)steamstatic\.com$/.test(url.hostname)) return {};
  const match = url.pathname.match(/\/steam\/apps\/(\d+)\/(?:[^/]+\/)*(?:library_capsule|library_600x900)\.(?:jpg|png|webp)$/i);
  if (!match) return {};
  const base = `https://cdn.akamai.steamstatic.com/steam/apps/${match[1]}`;
  return {
    cover: `${base}/header.jpg`,
    coverFallbacks: [`${base}/library_hero.jpg`, cover],
    posterCover: cover,
  };
}
