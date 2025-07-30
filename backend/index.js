import dotenv from 'dotenv';
dotenv.config(); 
import express from 'express';
import cors from 'cors';
import path from 'path';
import gamesRouter, { initCache } from './routes/games.js';
import authRouter from './routes/auth.js';

const app = express();
app.use(cors());
app.use(express.json());
console.log(`starting`);

// Load RAWG cache from disk
await initCache(app); // <-- This loads the cache and sets app.locals.rawgCache

// Routes
app.use('/api/games', gamesRouter);
app.use('/api/auth', authRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});