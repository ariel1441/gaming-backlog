const STORE_ITEM_BASE_URL =
  "https://shared.fastly.steamstatic.com/store_item_assets/";

export function absoluteImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function steamAssetUrl(assets = {}, filename) {
  const direct = absoluteImageUrl(filename);
  if (direct) return direct;
  if (
    typeof filename !== "string" ||
    !filename.trim() ||
    /[?#\\]|\.\./.test(filename)
  )
    return null;
  const format = assets.asset_url_format;
  if (typeof format !== "string" || !format.includes("${FILENAME}"))
    return null;
  try {
    const expanded = format.replaceAll("${FILENAME}", filename.trim());
    const url = new URL(expanded, STORE_ITEM_BASE_URL);
    if (!/^(?:https?:\/\/|steam\/apps\/)/.test(expanded)) return null;
    return absoluteImageUrl(url.href);
  } catch {
    return null;
  }
}

export function steamCoverUrl(assets = {}, fallback = null) {
  for (const asset of [
    assets.library_capsule,
    assets.header,
    assets.main_capsule,
    fallback,
  ]) {
    const url = steamAssetUrl(assets, asset);
    if (url) return url;
  }
  return null;
}
