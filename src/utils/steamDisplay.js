export function formatSteamPlaytime(
  minutes,
  { empty = "No Steam playtime", suffix = " played" } = {},
) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return empty;
  const hours = Math.round((value / 60) * 10) / 10;
  return `${hours}h${suffix}`;
}

export function steamCapsuleUrl(app, { preferIcon = false } = {}) {
  if (preferIcon && app?.steamIconUrl) return app.steamIconUrl;
  if (app?.steamAppId) {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${app.steamAppId}/capsule_184x69.jpg`;
  }
  return app?.steamIconUrl || "";
}

export function formatSteamDate(value, options) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(
    undefined,
    options || { month: "short", day: "numeric", year: "numeric" },
  );
}
