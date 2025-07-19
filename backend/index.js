import dotenv from 'dotenv';
dotenv.config(); 
import express from 'express';
import cors from 'cors';
import path from 'path';
import gamesRouter, { initCache } from './routes/games.js';

const app = express();
app.use(cors());
app.use(express.json());
console.log(`starting`);

// Load RAWG cache from disk
await initCache(app); // <-- This loads the cache and sets app.locals.rawgCache
app.use('/api/games', gamesRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
