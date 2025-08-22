# Gaming Backlog — Track, prioritize, and finish your games, beautifully.

[![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=222)](#tech-stack)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind-38B2AC?logo=tailwind-css&logoColor=fff)](#tech-stack)
[![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?logo=node.js&logoColor=fff)](#tech-stack)
[![Express](https://img.shields.io/badge/API-Express-000?logo=express&logoColor=fff)](#tech-stack)
[![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL-4169E1?logo=postgresql&logoColor=fff)](#tech-stack)
[![JWT](https://img.shields.io/badge/Auth-JWT-000000?logo=jsonwebtokens&logoColor=fff)](#features)
[![Vercel](https://img.shields.io/badge/Frontend%20Hosting-Vercel-000?logo=vercel&logoColor=fff)](#deployment)
[![Railway](https://img.shields.io/badge/Backend%20Hosting-Railway-0B0D0E?logo=railway&logoColor=fff)](#deployment)

## Overview
**Gaming Backlog** is a full-stack app to organize your video game backlog, prioritize what to play next, and visualize progress. It supports secure multi-user accounts, drag-and-drop manual ordering per status, a public read-only profile, and an insights tab with charts. The app enriches entries with cover art and metadata via the RAWG API.

<!-- Hero image -->
<p align="center">
  <img src="docs/images/hero-dashboard.png" alt="Main backlog grid with cards" />
</p>

## Features
- **Secure auth & isolation** — JWT authentication with strict per-user data access.
- **Admin workflows** — Add, edit, delete, and reorder games (drag-and-drop via `@dnd-kit`).
- **Manual ordering per status** — Persistent `position` values and safe reordering within the same status group.
- **Public profiles** — Share a read-only list at `/u/:username`.
- **Insights & analytics** — Charts with a lightweight caching layer for fast loads.
- **RAWG integration** — Auto-hydrate cover art, ratings, genres, and playtime hints.
- **Hardened backend** — Helmet, CORS allowlist/suffix support, rate limiting, and structured error handling.
- **PostgreSQL schema & indexes** — Normalized tables (`users`, `statuses`, `games`) with status ranking and stored positions.

## Tech Stack
**Frontend:** React, Vite, Tailwind CSS, Recharts  
**Backend:** Node.js, Express, Joi/Celebrate, Helmet, CORS, Rate Limiter  
**Database:** PostgreSQL (SQL schema + seed), `pg` client  
**Deploy:** Vercel (frontend) + Railway (backend & Postgres)

---

## Getting Started

### Prerequisites
- **Node.js 20+** and npm/pnpm/yarn
- **PostgreSQL 14+** (local or managed)

### 1. Clone & Install
```bash
git clone <your-repo-url>.git
cd <repo>
npm install
```

### 2. Environment Variables

Create a `.env` in the project root (or copy from `.env.example`) and set:

```dotenv
NODE_ENV=development
RAWG_API_KEY=your_rawg_api_key
PORT=5000
DATABASE_URL=postgres://postgres:password@localhost:5432/your_db_name
PGSSL=false
JWT_SECRET=your_jwt_secret
VITE_API_BASE_URL=http://localhost:5000
ALLOWED_ORIGINS=http://localhost:5173
MICROCACHE_TTL_MS=300000
```

### 3. Database Setup

Create your database and apply schema + seed (adjust paths to your files):

```bash
# Example with psql
createdb your_db_name
psql -d your_db_name -f backend/db/schema.sql
psql -d your_db_name -f backend/db/seed.sql
```

_The schema defines `users`, `statuses(status, rank)`, and `games` with fields like `position`, `my_genre`, `my_score`, `how_long_to_beat`, `started_at`, `finished_at`, etc._

### 4. Run Locally

Start backend and frontend (dev mode):

```bash
npm run dev
```

Other useful scripts:

- `npm run dev:back` / `npm run dev:front` — run backend or frontend only  
- `npm run build` / `npm run preview` — frontend production build & preview  
- `npm run start` — start the production server

---

## Deployment

### Frontend (Vercel)

Deploy the React app and  a SPA rewrite:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

Set `VITE_API_BASE_URL` to the public URL of your Railway backend.

### Backend & DB (Railway)

Provision a Node service for the API and a managed Postgres instance. Set:

- `DATABASE_URL`, `JWT_SECRET`, `RAWG_API_KEY`, `PGSSL`  
- Ensure the server listens on `PORT` (defaults to `5000`)

---

## Screenshots / Demo

<!-- Desktop screens as a tidy 2×2 grid -->
<table>
  <tr>
    <td width="50%">
      <a href="docs/images/modal-display.png">
        <img src="docs/images/modal-display.png" alt="Game detail modal with RAWG data" width="100%" />
      </a>
      <p align="center"><em>Game detail modal with RAWG data</em></p>
    </td>
    <td width="50%">
      <a href="docs/images/public-view.png">
        <img src="docs/images/public-view.png" alt="Public profile read-only view" width="100%" />
      </a>
      <p align="center"><em>Public profile at /u/:username</em></p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <a href="docs/images/insights.png">
        <img src="docs/images/insights.png" alt="Insights dashboard with charts" width="100%" />
      </a>
      <p align="center"><em>Insights dashboard (hours, ETA, genres)</em></p>
    </td>
    <td width="50%">
      <a href="docs/images/hero-dashboard.png">
        <img src="docs/images/hero-dashboard.png" alt="Main backlog grid" width="100%" />
      </a>
      <p align="center"><em>Main backlog grid</em></p>
    </td>
  </tr>
</table>

<!-- Motion + Mobile + Add Game: left column stacks GIF + Add form, right column is mobile -->
<table>
  <tr>
    <td width="60%">
      <a href="docs/images/reorder.gif">
        <img src="docs/images/reorder.gif" alt="Drag-and-drop reordering (@dnd-kit)" width="100%" />
      </a>
      <p align="center"><em>Drag-and-drop reordering (@dnd-kit)</em></p>
      <a href="docs/images/add_new_game.PNG">
        <img src="docs/images/add_new_game.PNG" alt="Add Game form ()" width="100%" />
      </a>
      <p align="center"><em>Add Game form </em></p>
    </td>
    <td width="40%">
      <p align="center">
        <a href="docs/images/mobile-view.png">
          <img src="docs/images/mobile-view.png" alt="Mobile responsive view" width="320" />
        </a>
        <br />
        <em>Mobile responsive view</em>
      </p>
    </td>
  </tr>
</table>

---

## Future Improvements
- Multi-select genres & normalization
- Smarter caching & invalidation
- Stricter input validation and additional hardening
- Import from Steam/CSV; richer social features (friends, reviews, chats)

---

## License
MIT — see `LICENSE`.
