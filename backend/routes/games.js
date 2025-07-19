import express from 'express';
import { google } from 'googleapis';
import { fetchGameData } from '../utils/fetchRAWG.js';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

const CACHE_PATH = path.resolve('cached_rawg_data.json');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SHEET_ID = '17i2WEv7xg6-a_KcPXHsUbgHnVxz-wnZKrZaCvTnXJ7w';
const RANGE = 'gaming_backlog!A1:Z';

const auth = new google.auth.GoogleAuth({
  keyFile: 'service-account.json',
  scopes: SCOPES,
});

const sheets = google.sheets({ version: 'v4', auth });

// Load cache from disk on server start
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
    console.log('💾 RAWG cache saved to disk');
  } catch (err) {
    console.error('❌ Failed to save RAWG cache:', err);
  }
};

const mapRowToGame = (arr) => ({
  name: arr[0],
  status: arr[1],
  hoursPlayed: arr[2],
  my_genre: arr[3],
  genres: arr[4],
  thoughts: arr[5],
  status_rank: arr[6],
  my_score: arr[7],
  cover: '',
  releaseDate: '',
  description: '',
  playtime: '',
  rating: '',
  stores: [],
  features: [],
  metacritic: '',
  userScore: '',
  metacriticUrl: null,
});

router.get('/', async (req, res) => {
  try {
    const authClient = await auth.getClient();
    const sheetRes = await sheets.spreadsheets.values.get({
      auth: authClient,
      spreadsheetId: SHEET_ID,
      range: RANGE,
    });

    const rows = sheetRes.data.values;
    if (!rows || rows.length < 2) {
      return res.status(404).json({ error: 'No data found in sheet.' });
    }

    const rawgCache = req.app.locals.rawgCache;
    const gameRows = rows.slice(1);

    const games = await Promise.all(
      gameRows.map(async (row) => {
        const game = mapRowToGame(row);
        const cacheKey = game.name.toLowerCase();

        if (!rawgCache[cacheKey]) {
          console.log(`🌐 Fetching RAWG data for: ${game.name}`);
          const data = await fetchGameData(game.name);
          rawgCache[cacheKey] = data || {};
          await saveCache(rawgCache); // Save updated cache
        }

        const rawgData = rawgCache[cacheKey];

        return {
          ...game,
          cover: rawgData?.background_image || '',
          releaseDate: rawgData?.released || '',
          description: rawgData.description,
          playtime: rawgData?.playtime || '',
          rating: rawgData?.rating || '',
          genres: rawgData?.genres?.map(g => g.name).join(', ') || game.genres || 'Unknown',
          metacritic: rawgData?.metacritic || 'N/A',
          stores: rawgData?.stores?.map(s => ({
            store_id: s.store?.id,
            store_name: s.store?.name,
            url: s.url,
          })) || [],
          features: rawgData?.tags?.map(t => t.name) || [],
          status: game.status || 'Unknown',
          my_genre: game.my_genre || 'Unknown',
          userScore: game.userScore || 'N/A',
          metacriticUrl: null,
        };
      })
    );

    res.json(games);
  } catch (err) {
    console.error('❌ Error in GET /api/games:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      name,
      status = '',
      hoursPlayed = '',
      my_genre = '',
      thoughts = '',
      status_rank = '',
      my_score = '',
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Game name is required' });
    }

    const rawgCache = req.app.locals.rawgCache;
    const cacheKey = name.toLowerCase();

    let rawgData = rawgCache[cacheKey];

    if (!rawgData) {
      console.log(`🌐 Fetching RAWG data for: ${name}`);
      rawgData = await fetchGameData(name);
      if (rawgData) {
        rawgCache[cacheKey] = rawgData;
        await saveCache(rawgCache); // Save updated cache
      } else {
        console.warn(`No search results for: ${name}`);
      }
    }

    const genres = rawgData?.genres?.map(g => g.name).join(', ') || '';

    const newRow = [
      name.trim(),
      status?.trim() || '',
      hoursPlayed !== undefined ? hoursPlayed : '',
      my_genre?.trim() || '',
      genres,
      thoughts?.trim() || '',
      status_rank?.trim() || '',
      my_score !== undefined ? my_score : '',
    ];

    // Avoid inserting completely blank rows (except name)
    const isEmpty = newRow.slice(1).every(val => val === '' || val === null);
    if (isEmpty) {
      return res.status(400).json({ error: 'All fields are empty except name' });
    }

    const authClient = await auth.getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'gaming_backlog!A1:H',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [newRow],
      },
    });

    res.status(201).json({ message: 'Game added successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add game' });
  }
});

export const initCache = loadCache;
export default router;
