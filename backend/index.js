import dotenv from 'dotenv';
dotenv.config(); 
import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import gamesRouter, { initCache } from './routes/games.js';
import authRouter from './routes/auth.js';
import corsOptions from './config/cors.js';
import compression from 'compression';

const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(compression());
console.log(`starting`);

// Load RAWG cache from disk
await initCache(app); // <-- This loads the cache and sets app.locals.rawgCache

// Routes
app.use('/api/games', gamesRouter);
app.use('/api/auth', authRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});