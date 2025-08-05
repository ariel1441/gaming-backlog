import express from 'express';
import { pool } from '../db.js';
import { fetchGameData } from '../utils/fetchRAWG.js';
import { verifyAdminToken, checkAdminStatus } from '../middleware/auth.js';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();
const CACHE_PATH = path.resolve('backend/data/cached_rawg_data.json');
const DEFAULT_POSITION_SPACING = 1000;

const loadCache = async (app) => {
  try {
    const data = await fs.readFile(CACHE_PATH, 'utf-8');
    app.locals.rawgCache = JSON.parse(data);
    console.log('RAWG cache loaded from disk');
  } catch {
    app.locals.rawgCache = {};
    console.log('No RAWG cache found, starting fresh');
  }
};

const saveCache = async (cache) => {
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
    console.log('RAWG cache saved to disk');
  } catch (err) {
    console.error('Failed to save RAWG cache:', err);
  }
};

// Get next position in a given status
const getNextPosition = async (status) => {
  const result = await pool.query(
    'SELECT MAX(position) as max FROM games WHERE status = $1',
    [status]
  );
  return (result.rows[0].max || 0) + DEFAULT_POSITION_SPACING;
};

// GET all games
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT g.*, s.rank AS status_rank
      FROM games g
      LEFT JOIN statuses s ON g.status = s.status
      ORDER BY s.rank ASC, g.position ASC NULLS LAST, g.id ASC;
    `);

    const rawgCache = req.app.locals.rawgCache;

    const games = await Promise.all(
      result.rows.map(async (game) => {
        const cacheKey = game.name.toLowerCase();
        if (!rawgCache[cacheKey]) {
          const data = await fetchGameData(game.name);
          rawgCache[cacheKey] = data || {};
          await saveCache(rawgCache);
        }

        const rawgData = rawgCache[cacheKey];
        return {
          ...game,
          cover: rawgData?.background_image || '',
          releaseDate: rawgData?.released || '',
          description: rawgData?.description || '',
          how_long_to_beat:
            typeof game.how_long_to_beat === 'number' && game.how_long_to_beat > 0
              ? game.how_long_to_beat
              : typeof rawgData?.playtime === 'number' && rawgData.playtime > 0
                ? rawgData.playtime
                : null,
          rating: rawgData?.rating || '',
          genres: rawgData?.genres?.map((g) => g.name).join(', ') || 'Unknown',
          metacritic: rawgData?.metacritic || 'N/A',
          stores: rawgData?.stores?.map((s) => ({
            store_id: s.store?.id,
            store_name: s.store?.name,
            url: s.url,
          })) || [],
          features: rawgData?.tags?.map((t) => t.name) || [],
        };
      })
    );

    res.json(games);
  } catch (err) {
    next(err);
  }
});

// POST new game
router.post('/', checkAdminStatus, async (req, res, next) => {
  try {
    let { name, status, how_long_to_beat, my_genre = '', thoughts = '', my_score } = req.body;

    if (!name || !status) {
      const err = new Error('Name and status are required');
      err.statusCode = 400;
      return next(err);
    }

    // If user is not admin, override status to "recommended by someone"
    if (!req.isAdmin) {
      status = 'recommended by someone';
    }

    const rawgCache = req.app.locals.rawgCache;
    const cacheKey = name.toLowerCase();
    let rawgData = rawgCache[cacheKey];

    if (!rawgData) {
      rawgData = await fetchGameData(name);
      if (rawgData) {
        rawgCache[cacheKey] = rawgData;
        await saveCache(rawgCache);
      }
    }

    const position = await getNextPosition(status);

    const result = await pool.query(
      `INSERT INTO games (name, status, how_long_to_beat, my_genre, thoughts, my_score, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *;`,
      [
        name.trim(),
        status,
        how_long_to_beat || null,
        my_genre.trim(),
        thoughts.trim(),
        my_score || null,
        position
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT update game
router.put('/:id', verifyAdminToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, status, how_long_to_beat, my_genre = '', thoughts = '', my_score } = req.body;

    if (!name || !status) {
      const err = new Error('Name and status are required');
      err.statusCode = 400;
      return next(err);
    }

    const existingGame = await pool.query('SELECT * FROM games WHERE id = $1', [id]);
    if (existingGame.rows.length === 0) {
      const err = new Error('Game not found');
      err.statusCode = 404;
      return next(err);
    }

    const oldStatus = existingGame.rows[0].status;
    let position = existingGame.rows[0].position;

    if (status !== oldStatus) {
      position = await getNextPosition(status);
    }

    const result = await pool.query(
      `UPDATE games 
       SET name = $1, status = $2, how_long_to_beat = $3, my_genre = $4, thoughts = $5, my_score = $6, position = $7
       WHERE id = $8
       RETURNING *;`,
      [
        name.trim(),
        status,
        how_long_to_beat || null,
        my_genre.trim(),
        thoughts.trim(),
        my_score || null,
        position,
        id
      ]
    );

    console.log(`Admin updated game: ${name} (ID: ${id})`);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE game
router.delete('/:id', verifyAdminToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM games WHERE id = $1 RETURNING *;', [id]);

    if (result.rows.length === 0) {
      const err = new Error('Game not found');
      err.statusCode = 404;
      return next(err);
    }

    console.log(`Admin deleted game: ${result.rows[0].name} (ID: ${id})`);
    res.json({ message: 'Game deleted successfully', game: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH reorder game
router.patch('/:id/position', verifyAdminToken, async (req, res, next) => {
  const { id } = req.params;
  const { targetIndex, status } = req.body;

  if (typeof targetIndex !== 'number' || !status) {
    const err = new Error('targetIndex and status are required');
    err.statusCode = 400;
    return next(err);
  }

  try {
    // Get all games with the SAME RANK as the provided status
    const rankGames = await pool.query(`
      SELECT g.id, g.position, g.status
      FROM games g
      JOIN statuses s ON g.status = s.status
      WHERE s.rank = (SELECT rank FROM statuses WHERE status = $1)
      ORDER BY g.position ASC NULLS LAST, g.id ASC
    `, [status]);

    if (rankGames.rows.length === 0) {
      const err = new Error('No games found in this rank');
      err.statusCode = 404;
      return next(err);
    }

    const gameIndex = rankGames.rows.findIndex(g => g.id === parseInt(id));
    if (gameIndex === -1) {
      const err = new Error('Game not found in this rank');
      err.statusCode = 404;
      return next(err);
    }

    // If target index is the same as current, no change needed
    if (gameIndex === targetIndex) {
      const game = await pool.query('SELECT * FROM games WHERE id = $1', [id]);
      return res.json(game.rows[0]);
    }

    // Reorder all games in this RANK
    const gameIds = rankGames.rows.map(g => g.id);
    
    // Remove the moving game from its current position
    gameIds.splice(gameIndex, 1);
    
    // Insert it at the new position
    gameIds.splice(targetIndex, 0, parseInt(id));

    const updates = gameIds.map((gameId, index) => {
      const newPosition = (index + 1) * DEFAULT_POSITION_SPACING;
      return pool.query('UPDATE games SET position = $1 WHERE id = $2', [newPosition, gameId]);
    });

    await Promise.all(updates);

    const result = await pool.query('SELECT * FROM games WHERE id = $1', [id]);

    console.log(`Reordered ${gameIds.length} games in rank, moved game ${id} to index ${targetIndex}`);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export const initCache = loadCache;
export default router;