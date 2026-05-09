# Gaming Backlog

A full-stack app for tracking a personal video game backlog, deciding what to
play next, and sharing a read-only public profile.

## What It Does

- Track games by status, personal genre, score, thoughts, dates, and estimated
  hours.
- Search, filter, sort, and manually reorder games.
- Use authenticated private collections with public profile sharing.
- Offer guest/demo flows for trying the app without keeping an account.
- Show insight charts for backlog composition and playtime.
- Enrich games with external metadata such as cover art and ratings.

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

- `npm run dev` - run backend and frontend together.
- `npm run dev:front` - run only Vite.
- `npm run dev:back` - run only Express with nodemon.
- `npm run check` - lint, test, and build.
- `npm run env:check` - print a redacted environment summary.
- `npm run db:migrate:local` - apply tracked migrations to localhost.
- `npm run db:reset:local` - rebuild a local database from schema and seed.
- `npm run db:copy-prod-to-local` - copy production data into a local database.

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
