import { badRequest, conflict, notFound } from "../utils/httpError.js";

export const PERSONAL_GENRE_NAME_MAX = 50;
export const PERSONAL_GENRES_PER_GAME_MAX = 10;

export function cleanPersonalGenreName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizePersonalGenreName(value) {
  return cleanPersonalGenreName(value).toLocaleLowerCase("en-US");
}

export function parseLegacyPersonalGenres(value) {
  const seen = new Set();
  const names = [];
  for (const part of String(value || "").split(",")) {
    const name = cleanPersonalGenreName(part);
    const normalized = normalizePersonalGenreName(name);
    if (!name || seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(name);
  }
  return names.slice(0, PERSONAL_GENRES_PER_GAME_MAX);
}

function validateName(value) {
  const name = cleanPersonalGenreName(value);
  if (!name) throw badRequest("Personal genre name is required.");
  if (name.length > PERSONAL_GENRE_NAME_MAX) {
    throw badRequest(`Personal genre names must be ${PERSONAL_GENRE_NAME_MAX} characters or fewer.`);
  }
  if (name.includes(",")) {
    throw badRequest("Personal genre names cannot contain commas during legacy compatibility.");
  }
  return name;
}

function entryIdentity(entry) {
  if (typeof entry === "number") return { id: entry };
  if (typeof entry === "string") return { name: entry };
  if (entry && typeof entry === "object") {
    if (entry.id != null) return { id: Number(entry.id) };
    if (entry.name != null) return { name: entry.name };
  }
  throw badRequest("Each personal genre must be an owned genre id or a name.");
}

export async function listPersonalGenres(db, userId) {
  const { rows } = await db.query(
    `SELECT genre.id,
            genre.name,
            COUNT(membership.game_id)::int AS usage_count
       FROM user_personal_genres genre
       LEFT JOIN game_personal_genres membership
         ON membership.user_id = genre.user_id
        AND membership.personal_genre_id = genre.id
      WHERE genre.user_id = $1
      GROUP BY genre.id
      ORDER BY lower(genre.name), genre.id`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    usageCount: Number(row.usage_count || 0),
  }));
}

export async function createOrReusePersonalGenre(db, userId, rawName) {
  const name = validateName(rawName);
  const normalized = normalizePersonalGenreName(name);
  const { rows } = await db.query(
    `INSERT INTO user_personal_genres (user_id, name, normalized_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, normalized_name)
     DO UPDATE SET updated_at = user_personal_genres.updated_at
     RETURNING id, name`,
    [userId, name, normalized],
  );
  return rows[0];
}

export async function resolvePersonalGenres(db, userId, entries = []) {
  if (!Array.isArray(entries)) throw badRequest("personal_genres must be an array.");
  if (entries.length > PERSONAL_GENRES_PER_GAME_MAX) {
    throw badRequest(`A game can have at most ${PERSONAL_GENRES_PER_GAME_MAX} personal genres.`);
  }

  const resolved = [];
  const seen = new Set();
  for (const rawEntry of entries) {
    const entry = entryIdentity(rawEntry);
    let genre;
    if (entry.id != null) {
      if (!Number.isInteger(entry.id) || entry.id <= 0) {
        throw badRequest("Personal genre ids must be positive integers.");
      }
      const result = await db.query(
        "SELECT id, name FROM user_personal_genres WHERE id = $1 AND user_id = $2",
        [entry.id, userId],
      );
      genre = result.rows[0];
      if (!genre) throw notFound("Personal genre not found.");
    } else {
      genre = await createOrReusePersonalGenre(db, userId, entry.name);
    }
    if (seen.has(genre.id)) continue;
    seen.add(genre.id);
    resolved.push(genre);
  }
  return resolved;
}

export async function replaceGamePersonalGenres(db, userId, gameId, entries = []) {
  const genres = await resolvePersonalGenres(db, userId, entries);
  const owned = await db.query(
    "SELECT 1 FROM games WHERE id = $1 AND user_id = $2",
    [gameId, userId],
  );
  if (!owned.rows[0]) throw notFound("Game not found.");

  await db.query("DELETE FROM game_personal_genres WHERE game_id = $1", [gameId]);
  for (let position = 0; position < genres.length; position += 1) {
    await db.query(
      `INSERT INTO game_personal_genres
         (user_id, game_id, personal_genre_id, position)
       VALUES ($1, $2, $3, $4)`,
      [userId, gameId, genres[position].id, position],
    );
  }
  const legacy = genres.map((genre) => genre.name).join(", ") || null;
  await db.query(
    "UPDATE games SET my_genre = $3 WHERE id = $1 AND user_id = $2",
    [gameId, userId, legacy],
  );
  return genres;
}

export function genreEntriesFromGameBody(body = {}, { preserveWhenMissing = false } = {}) {
  const hasStructured = Object.prototype.hasOwnProperty.call(body, "personal_genres");
  const hasLegacy = Object.prototype.hasOwnProperty.call(body, "my_genre");
  if (!hasStructured && !hasLegacy) return preserveWhenMissing ? null : [];

  const structured = hasStructured ? body.personal_genres : null;
  const legacyNames = hasLegacy ? parseLegacyPersonalGenres(body.my_genre) : null;
  if (hasStructured && hasLegacy) {
    const structuredNames = structured
      .map(entryIdentity)
      .filter((entry) => entry.name != null)
      .map((entry) => normalizePersonalGenreName(entry.name));
    if (structuredNames.length === structured.length) {
      const legacyNormalized = legacyNames.map(normalizePersonalGenreName);
      if (JSON.stringify(structuredNames) !== JSON.stringify(legacyNormalized)) {
        throw badRequest("personal_genres and my_genre do not match.");
      }
    }
  }
  return hasStructured ? structured : legacyNames;
}

export function assertGenreFieldsMatch(body = {}, resolvedGenres = []) {
  if (
    !Object.prototype.hasOwnProperty.call(body, "personal_genres") ||
    !Object.prototype.hasOwnProperty.call(body, "my_genre")
  ) return;
  const structured = resolvedGenres.map((genre) => normalizePersonalGenreName(genre.name));
  const legacy = parseLegacyPersonalGenres(body.my_genre).map(normalizePersonalGenreName);
  if (JSON.stringify(structured) !== JSON.stringify(legacy)) {
    throw badRequest("personal_genres and my_genre do not match.");
  }
}

export async function renamePersonalGenre(db, userId, genreId, rawName) {
  const name = validateName(rawName);
  const normalized = normalizePersonalGenreName(name);
  const duplicate = await db.query(
    `SELECT id FROM user_personal_genres
      WHERE user_id = $1 AND normalized_name = $2 AND id <> $3`,
    [userId, normalized, genreId],
  );
  if (duplicate.rows[0]) throw conflict("That personal genre already exists. Merge into it instead.");
  const { rows } = await db.query(
    `UPDATE user_personal_genres
        SET name = $3, normalized_name = $4, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, name`,
    [genreId, userId, name, normalized],
  );
  if (!rows[0]) throw notFound("Personal genre not found.");
  await refreshLegacyMirrorsForGenre(db, userId, genreId);
  return rows[0];
}

async function refreshLegacyMirrorsForGenre(db, userId, genreId) {
  await db.query(
    `UPDATE games game
        SET my_genre = derived.names
       FROM (
         SELECT membership.game_id,
                string_agg(genre.name, ', ' ORDER BY membership.position) AS names
           FROM game_personal_genres membership
           JOIN user_personal_genres genre
             ON genre.id = membership.personal_genre_id
            AND genre.user_id = membership.user_id
          WHERE membership.user_id = $1
            AND membership.game_id IN (
              SELECT game_id FROM game_personal_genres
               WHERE user_id = $1 AND personal_genre_id = $2
            )
          GROUP BY membership.game_id
       ) derived
      WHERE game.id = derived.game_id AND game.user_id = $1`,
    [userId, genreId],
  );
}

export async function mergePersonalGenres(db, userId, sourceId, targetId) {
  if (sourceId === targetId) throw badRequest("Choose a different genre to merge into.");
  const genres = await db.query(
    "SELECT id, name FROM user_personal_genres WHERE user_id = $1 AND id = ANY($2::int[]) FOR UPDATE",
    [userId, [sourceId, targetId]],
  );
  if (genres.rows.length !== 2) throw notFound("Personal genre not found.");
  const affected = await db.query(
    "SELECT DISTINCT game_id FROM game_personal_genres WHERE user_id = $1 AND personal_genre_id = $2",
    [userId, sourceId],
  );
  for (const { game_id: gameId } of affected.rows) {
    const current = await db.query(
      `SELECT personal_genre_id
         FROM game_personal_genres
        WHERE user_id = $1 AND game_id = $2
        ORDER BY position`,
      [userId, gameId],
    );
    const ids = [];
    for (const row of current.rows) {
      const id = row.personal_genre_id === sourceId ? targetId : row.personal_genre_id;
      if (!ids.includes(id)) ids.push(id);
    }
    await replaceGamePersonalGenres(db, userId, gameId, ids);
  }
  await db.query("DELETE FROM user_personal_genres WHERE id = $1 AND user_id = $2", [sourceId, userId]);
  return genres.rows.find((genre) => genre.id === targetId);
}

export async function deleteUnusedPersonalGenre(db, userId, genreId) {
  const owned = await db.query(
    "SELECT id FROM user_personal_genres WHERE id = $1 AND user_id = $2 FOR UPDATE",
    [genreId, userId],
  );
  if (!owned.rows[0]) throw notFound("Personal genre not found.");
  const used = await db.query(
    "SELECT COUNT(*)::int AS count FROM game_personal_genres WHERE user_id = $1 AND personal_genre_id = $2",
    [userId, genreId],
  );
  if (Number(used.rows[0]?.count || 0) > 0) {
    throw conflict("This personal genre is still used by games. Remove it from those games or merge it first.");
  }
  const result = await db.query(
    "DELETE FROM user_personal_genres WHERE id = $1 AND user_id = $2 RETURNING id",
    [genreId, userId],
  );
  if (!result.rows[0]) throw notFound("Personal genre not found.");
}
