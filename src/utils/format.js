// src/utils/format.js

// Cache formatters
const NF_INT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** Format integer-like values; fallback to "0". */
export function fmtInt(n, fallback = "0") {
  return Number.isFinite(n) ? NF_INT.format(Math.round(n)) : fallback;
}

/** Safe integer parse with default. */
export function parseIntSafe(v, d = 0) {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : d;
}

/** Lenient boolean parse with default. */
export function parseBool(v, d = false) {
  if (v == null) return d;
  if (v === true || v === false) return v;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

/** Clamp numeric-ish value into [min, max]. Non-numeric -> min. */
export function clamp(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Split a comma-separated list into trimmed tokens (no empties). */
export function splitCSV(s) {
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Build a ?query=string from an object, skipping null/undefined. */
export function toQP(obj) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v != null) sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}
