// src/utils/fuzzySearch.js
// Strict, smart fuzzy search:
// - punctuation/diacritics-insensitive
// - stopwords removed
// - aliases REPLACE shorthands (gow -> "god war", etc.)
// - require >=2 name hits for multi-word queries
// - typo tolerance only for tokens >=5
// - deletion matches only at whole-word boundaries

const ALIASES = {
  gow: "god war",
  rdr2: "red dead redemption 2",
  botw: "breath of the wild",
  totk: "tears of the kingdom",
  ff7: "final fantasy vii",
  ffvii: "final fantasy vii",
  bg3: "baldur s gate 3",
};

const STOPWORDS = new Set([
  "the",
  "of",
  "and",
  "a",
  "an",
  "to",
  "for",
  "in",
  "on",
  "at",
  "by",
  "from",
  "with",
  "or",
]);

const normalize = (s = "") =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ") // drop punctuation
    .replace(/\s+/g, " ")
    .trim();

// edit distance <= 1
function levenshteinLE1(a, b) {
  if (a === b) return true;
  const la = a.length,
    lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la > lb) return levenshteinLE1(b, a);
  let i = 0,
    j = 0,
    edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++edits > 1) return false;
      if (la === lb) {
        i++;
        j++;
      } else {
        j++;
      }
    }
  }
  edits += lb - j + (la - i);
  return edits <= 1;
}

// Word-aware approx match:
// - check exact
// - check L (substitution) and L+1 (insertion in text)
// - check L-1 (deletion) ONLY if the window is a whole word (both ends at boundaries)
function approxIndexWordAware(text, q) {
  const L = q.length;
  if (!L) return -1;

  const exact = text.indexOf(q);
  if (exact !== -1) return exact;

  // substitution (L) and insertion in text (L+1)
  for (const len of [L, L + 1]) {
    if (len > 0 && len <= text.length) {
      for (let i = 0; i <= text.length - len; i++) {
        if (levenshteinLE1(text.slice(i, i + len), q)) return i;
      }
    }
  }

  // deletion (L-1) only if whole word
  const len = L - 1;
  if (len >= 1 && len <= text.length) {
    for (let i = 0; i <= text.length - len; i++) {
      const startOk = i === 0 || text[i - 1] === " ";
      const endOk = i + len === text.length || text[i + len] === " ";
      if (!(startOk && endOk)) continue; // must be a full word window
      if (levenshteinLE1(text.slice(i, i + len), q)) return i;
    }
  }

  return -1;
}

// Expand query tokens: replace aliases (do NOT keep shorthand), normalize, drop stopwords, dedupe
function expandQueryTokens(query) {
  const raw = (query || "").trim();
  if (!raw) return [];

  const base = raw.split(/\s+/).filter(Boolean);
  const expanded = [];

  for (const t of base) {
    const alias = ALIASES[t.toLowerCase()];
    if (alias) expanded.push(...alias.split(/\s+/));
    else expanded.push(t);
  }

  const norm = expanded.map(normalize).filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const w of norm) {
    if (STOPWORDS.has(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

// Score & count hits on NAME ONLY (gates inclusion)
function scoreName(text, tokens) {
  const nt = normalize(text);
  let score = 0,
    hits = 0;

  for (const tok of tokens) {
    if (!tok) continue;

    // exact substring
    let idx = nt.indexOf(tok);
    if (idx !== -1) {
      score += 120 - Math.min(idx, 100);
      hits++;
      continue;
    }

    // fuzzy only for longer tokens
    if (tok.length >= 5) {
      idx = approxIndexWordAware(nt, tok);
      if (idx !== -1) {
        score += 80 - Math.min(idx, 80);
        hits++;
        continue;
      }
    }

    // miss: tiny penalty; gating handles inclusion
    score -= 10;
  }

  return { score, hits };
}

// Tiny boost from secondary text AFTER name gating
function scoreSecondary(fieldsJoined, tokens) {
  const nt = normalize(fieldsJoined || "");
  if (!nt) return 0;
  let boost = 0;
  for (const tok of tokens) {
    if (!tok) continue;
    const idx = nt.indexOf(tok);
    if (idx !== -1) boost += 20 - Math.min(idx, 20);
  }
  return boost;
}

export function smartFuzzySearch(games = [], query = "") {
  const tokens = expandQueryTokens(query);
  if (!tokens.length) return games;

  const significant = tokens.length;
  const minNameHits = Math.min(2, significant); // require 2 hits for 2+ tokens

  const scored = [];
  for (const g of games) {
    const name = g?.name || "";
    if (!name) continue;

    const { score: nameScore, hits: nameHits } = scoreName(name, tokens);
    if (nameHits < minNameHits) continue; // GATE: must match name enough

    let total = nameScore;
    const secondary = [g.my_genre, g.genres, g.thoughts]
      .filter(Boolean)
      .join(" ");
    total += Math.floor(scoreSecondary(secondary, tokens) * 0.25);
    total += Math.max(0, 10 - name.length / 10); // small bias to shorter names

    scored.push({ game: g, score: total, nameHits });
  }

  const num = (v) => (Number.isFinite(+v) ? +v : Number.MAX_SAFE_INTEGER);
  return scored
    .sort((a, b) => {
      if (b.nameHits !== a.nameHits) return b.nameHits - a.nameHits;
      if (b.score !== a.score) return b.score - a.score;
      const A = a.game,
        B = b.game;
      const srA = num(A?.status_rank ?? 999),
        srB = num(B?.status_rank ?? 999);
      if (srA !== srB) return srA - srB;
      const pA = num(A?.position ?? Number.POSITIVE_INFINITY);
      const pB = num(B?.position ?? Number.POSITIVE_INFINITY);
      if (pA !== pB) return pA - pB;
      return num(A?.id) - num(B?.id);
    })
    .map((x) => x.game);
}
