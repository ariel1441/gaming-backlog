# Gaming Backlog

A full-stack app for tracking a personal video game backlog, deciding what to
play next, and sharing a read-only public profile.

## What It Does

- Track games by status, personal genre, score, thoughts, dates, and estimated
  hours.
- Search, filter, sort, and manually reorder games.
- View a private read-only timeline built from started and finished dates.
- Use authenticated private collections with public profile sharing.
- Offer guest/demo flows for trying the app without keeping an account.
- Show insight charts for backlog composition and playtime.
- Discover cached catalog games, search RAWG on demand, and add selected games
  to the backlog.
- Enrich games with cached catalog/external metadata such as cover art, ratings,
  release dates, genres, and playtime estimates.
- Link Steam, manually sync owned games, browse the synced Steam library,
  review import candidates, attach Steam apps to existing backlog games, and
  show private Steam ownership/playtime/last-played/achievement summary data.

## Tech Stack

- Frontend: React 18, Vite, Tailwind CSS, React Router, Recharts.
- Backend: Node.js, Express, PostgreSQL, JWT auth, Celebrate/Joi validation.
- Tooling: ESLint, Vitest, Vite build, GitHub Actions.
- Deployment model: Vercel frontend plus Railway backend/Postgres.

## Quick Start

Prerequisites:

- Node.js 20.x
- npm
- PostgreSQL 14+

Install dependencies:

```bash
npm install
```

Create a root `.env` from `.env.example` and point it at a local database:

```dotenv
NODE_ENV=development
RAWG_API_KEY=your_rawg_api_key
PORT=5000
DATABASE_URL=postgres://postgres:password@localhost:5432/gaming_backlog_local
PGSSL=false
JWT_SECRET=your_local_jwt_secret
VITE_API_BASE_URL=http://localhost:5000
ALLOWED_ORIGINS=http://localhost:5173
MICROCACHE_TTL_MS=300000
DEMO_ENABLED=true
DEMO_TEMPLATE_USERNAME=demo_template
DEMO_GUEST_TTL_HOURS=36
ALLOW_REMOTE_DB_IN_DEV=false
CATALOG_AUTO_SEED=false
CATALOG_SEED_LIMIT=24
STEAM_WEB_API_KEY=your_optional_steam_web_api_key
STEAM_OPENID_REALM=http://localhost:5000
STEAM_OPENID_RETURN_URL=http://localhost:5000/api/steam/auth/callback
STEAM_DEV_SYNC_SAMPLE=false
```

Create/reset the local database, check the environment, then start the app:

```bash
createdb gaming_backlog_local
npm run db:reset:local
npm run env:check
npm run dev
```

Local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`
- Health check: `http://localhost:5000/healthz`

## Common Commands

- `npm run dev` - run backend and frontend together with stale dev-port cleanup.
- `npm run dev:front` - run only Vite.
- `npm run dev:back` - run only Express with nodemon.
- `npm run check` - lint, test, and build.
- `npm run env:check` - print a redacted environment summary.
- `npm run db:migrate:local` - apply tracked migrations to localhost.
- `npm run db:reset:local` - rebuild a local database from schema and seed.
- `npm run db:copy-prod-to-local` - copy production data into a local database.
- `npm run catalog:seed -- --limit=24` - seed cached Discover shelves from
  RAWG for local/manual refresh.
- `npm run dev:ports:dry` - inspect stale local dev Node processes without
  stopping them.

## Repository Map

- `src/` - React app, components, hooks, contexts, services, and utilities.
- `backend/` - Express app, routes, middleware, validators, schema, seed data.
- `backend/migrations/` - SQL migrations for existing databases.
- `scripts/` - local environment and database helper scripts.
- `docs/` - workflow notes, templates, planning notes, and screenshots.
- `.github/` - CI workflow and pull request template.

## Database Workflow

For schema changes:

1. Add a migration under `backend/migrations/`.
2. Update `backend/schema.sql`.
3. Run `npm run db:migrate:local` against an existing local database, or
   `npm run db:reset:local` for a disposable fresh install.
4. Run `npm run check`.

Production migrations are applied by GitHub Actions on pushes to `main` when
the `PROD_DATABASE_URL` repository secret is configured.

Discover shelves are stored in Postgres. In production, set
`CATALOG_AUTO_SEED=true` if the backend should refresh missing/expired shelves
automatically after startup and then once per day. Leave it false if you prefer
manual seeding with `npm run catalog:seed`.

Steam integration uses migrations `006`, `007`, and `008`. In production,
configure `STEAM_WEB_API_KEY`, `STEAM_OPENID_REALM`,
`STEAM_OPENID_RETURN_URL`, and the frontend return origin before enabling real
Steam linking or achievement sync.

## Documentation

Start with:

- [DEVELOPMENT.md](DEVELOPMENT.md) for local workflow and deployment notes.
- [AGENTS.md](AGENTS.md) for durable AI-agent rules.
- [docs/README.md](docs/README.md) for the markdown/doc index.
- [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md) for human prompts and AI usage.

## Screenshots

The screenshots in `docs/images/` are useful visual references, but may lag
behind the current UI. Verify against the running app before treating them as
product truth.

## License

See [LICENSE](LICENSE).
