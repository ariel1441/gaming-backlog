// backend/routes/games.js
import express from 'express';
import { pool } from '../db.js';
import { fetchGameData } from '../utils/fetchRAWG.js';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();
const CACHE_PATH = path.resolve('cached_rawg_data.json');

// Load cache from disk
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

// Save cache to disk
const saveCache = async (cache) => {
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
    console.log('RAWG cache saved to disk');
  } catch (err) {
    console.error('Failed to save RAWG cache:', err);
  }
};

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
    SELECT g.*, s.rank AS status_rank
    FROM games g
    LEFT JOIN statuses s ON g.status = s.status
    ORDER BY s.rank ASC, g.id ASC;
    `);

    const rawgCache = req.app.locals.rawgCache;

    const games = await Promise.all(
      result.rows.map(async (game) => {
        const cacheKey = game.name.toLowerCase();

        if (!rawgCache[cacheKey]) {
          console.log(`Fetching RAWG data for: ${game.name}`);
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
          how_long_to_beat:(typeof game.how_long_to_beat === 'number' && game.how_long_to_beat > 0)
            ? game.how_long_to_beat: (typeof rawgData?.playtime === 'number' && rawgData.playtime > 0)? rawgData.playtime: null,

          rating: rawgData?.rating || '',
          genres: rawgData?.genres?.map((g) => g.name).join(', ')  || 'Unknown',
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
    console.error('Error in GET /games:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, status, how_long_to_beat, my_genre = '', thoughts = '', my_score } = req.body;

    if (!name || !status) {
      return res.status(400).json({ error: 'Name and status are required' });
    }

    const rawgCache = req.app.locals.rawgCache;
    const cacheKey = name.toLowerCase();

    let rawgData = rawgCache[cacheKey];

    if (!rawgData) {
      console.log(`Fetching RAWG data for: ${name}`);
      rawgData = await fetchGameData(name);
      if (rawgData) {
        rawgCache[cacheKey] = rawgData;
        await saveCache(rawgCache);
      } else {
        console.warn(`No search results for: ${name}`);
      }
    }

    const result = await pool.query(`
      INSERT INTO games (name, status, how_long_to_beat, my_genre, thoughts, my_score)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `, [
      name.trim(), 
      status, 
      how_long_to_beat || null,
      my_genre.trim(), 
      thoughts.trim(), 
      my_score || null
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error in POST /games:', err);
    res.status(500).json({ error: 'Failed to add game' });
  }
});
export const initCache = loadCache;
export default router;
