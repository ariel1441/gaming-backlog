import { badRequest, conflict, notFound } from "../utils/httpError.js";
import { selectOwnedGameDetailsQuery } from "../utils/gameAccess.js";
import {
  listPersonalGenres,
  PERSONAL_GENRES_PER_GAME_MAX,
  replaceGamePersonalGenres,
} from "./personalGenreService.js";
import { buildPersonalGenreSuggestions } from "./personalGenreSuggestionService.js";

function asGenres(value) {
  return Array.isArray(value) ? value : [];
}

function catalogFromGame(game) {
  return {
    name: game.catalog_name || game.name,
    metadata_quality: game.catalog_metadata_quality,
    rawg_playtime_hours: game.catalog_rawg_playtime_hours,
    genres_json: game.catalog_genres_json,
    tags_json: game.catalog_tags_json,
  };
}

function missingSuggestions(game, personalGenres) {
  const currentPersonalGenres = asGenres(game.personal_genres);
  const currentIds = new Set(currentPersonalGenres.map((genre) => Number(genre.id)));
  const suggestions = buildPersonalGenreSuggestions({
    catalog: catalogFromGame(game),
    personalGenres,
    currentPersonalGenres,
  }).filter((genre) => !currentIds.has(Number(genre.id)));

  return { currentPersonalGenres, suggestions };
}

export async function getPersonalGenreSuggestionReview(db, userId, gameId) {
  const query = selectOwnedGameDetailsQuery(gameId, userId);
  const result = await db.query(query.text, query.values);
  const game = result.rows[0];
  if (!game) throw notFound("Game not found.");

  const personalGenres = await listPersonalGenres(db, userId);
  const { currentPersonalGenres, suggestions } = missingSuggestions(game, personalGenres);

  return {
    game: {
      id: game.id,
      name: game.name,
      cover: game.catalog_cover_url || game.cover || null,
    },
    metadataReady: game.catalog_metadata_quality === "full",
    currentPersonalGenres,
    suggestions,
    availablePersonalGenres: personalGenres,
  };
}

export async function listPersonalGenreSuggestionReviews(
  db,
  userId,
  { limit = 50, offset = 0, onlyWithoutPersonalGenres = false } = {},
) {
  const personalGenres = await listPersonalGenres(db, userId);
  if (!personalGenres.length) {
    return { reviews: [], page: { nextOffset: null, hasMore: false } };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const chunkSize = Math.min(Math.max(safeLimit * 4, 50), 300);
  let nextOffset = Math.max(Number(offset) || 0, 0);
  const reviews = [];

  // Scan bounded pages until this response is full or the library is exhausted.
  // Returning the scan cursor prevents newer no-match games from hiding older
  // valid suggestions without loading an entire large library at once.
  while (reviews.length < safeLimit) {
    const result = await db.query(
      `SELECT g.id,
            g.name,
            g.cover,
            cg.name AS catalog_name,
            cg.cover_url AS catalog_cover_url,
            cg.metadata_quality AS catalog_metadata_quality,
            cg.rawg_playtime_hours AS catalog_rawg_playtime_hours,
            cg.genres_json AS catalog_genres_json,
            cg.tags_json AS catalog_tags_json,
            personal.personal_genres
       FROM games g
       JOIN catalog_games cg ON cg.id = g.catalog_game_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(
           json_agg(json_build_object('id', genre.id, 'name', genre.name)
             ORDER BY membership.position),
           '[]'::json
         ) AS personal_genres
         FROM game_personal_genres membership
         JOIN user_personal_genres genre
           ON genre.id = membership.personal_genre_id
          AND genre.user_id = membership.user_id
         WHERE membership.game_id = g.id AND membership.user_id = g.user_id
       ) personal ON TRUE
      WHERE g.user_id = $1
        AND LOWER(TRIM(g.status)) <> 'wishlist'
        AND cg.metadata_quality = 'full'
        AND (
          NOT $3::boolean
          OR NOT EXISTS (
            SELECT 1
            FROM game_personal_genres membership
            WHERE membership.game_id = g.id
              AND membership.user_id = g.user_id
          )
        )
      ORDER BY g.id DESC
      LIMIT $2 OFFSET $4`,
      [userId, chunkSize, Boolean(onlyWithoutPersonalGenres), nextOffset],
    );

    for (const game of result.rows) {
      nextOffset += 1;
      const { currentPersonalGenres, suggestions } = missingSuggestions(game, personalGenres);
      if (!suggestions.length && !onlyWithoutPersonalGenres) continue;
      reviews.push({
        game: {
          id: game.id,
          name: game.name,
          cover: game.catalog_cover_url || game.cover || null,
        },
        metadataReady: true,
        currentPersonalGenres,
        suggestions,
      });
      if (reviews.length >= safeLimit) {
        return { reviews, page: { nextOffset, hasMore: true } };
      }
    }
    if (result.rows.length < chunkSize) {
      return { reviews, page: { nextOffset: null, hasMore: false } };
    }
  }
  return { reviews, page: { nextOffset, hasMore: true } };
}

export async function applyPersonalGenreSuggestions(
  db,
  userId,
  gameId,
  selectedGenreIds,
  expectedPersonalGenreIds = null,
) {
  const review = await getPersonalGenreSuggestionReview(db, userId, gameId);
  if (!review.metadataReady) {
    throw badRequest("Full RAWG metadata is required before finding genre suggestions.");
  }

  const allowedIds = new Set(review.availablePersonalGenres.map((genre) => Number(genre.id)));
  const selectedIds = [...new Set(selectedGenreIds.map(Number))];
  if (selectedIds.some((id) => !allowedIds.has(id))) {
    throw badRequest("Choose only personal genres owned by your account.");
  }

  if (selectedIds.length > PERSONAL_GENRES_PER_GAME_MAX) {
    throw badRequest(`A game can have at most ${PERSONAL_GENRES_PER_GAME_MAX} personal genres.`);
  }

  if (Array.isArray(expectedPersonalGenreIds)) {
    const currentIds = review.currentPersonalGenres.map((genre) => Number(genre.id)).sort((a, b) => a - b);
    const expectedIds = [...new Set(expectedPersonalGenreIds.map(Number))].sort((a, b) => a - b);
    if (JSON.stringify(currentIds) !== JSON.stringify(expectedIds)) {
      throw conflict("Personal genres changed since this review was loaded. Refresh and try again.");
    }
  }

  return replaceGamePersonalGenres(db, userId, gameId, selectedIds);
}
