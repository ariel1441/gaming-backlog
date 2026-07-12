# Development Workflow

This project is deployed to:

- Frontend: Vercel
- Backend + Postgres: Railway

For day-to-day development, run the app locally against a local Postgres
database. Production data should only be touched intentionally.

## Branch model

- `main`: production deploy branch candidate.
- `Dev`: integration branch for tested work before production.
- `feature/...` or `fix/...`: short-lived branches for actual changes.

Keep production platforms connected to `main` where possible, then merge `Dev`
into `main` only after checks pass.

## Environments

### Local development

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`
- Database: local Postgres

Recommended local behavior:

- local frontend talks to local backend
- local backend talks to local Postgres
- production Railway DB is not used for normal feature work
- the backend refuses to start in development if `DATABASE_URL` is remote,
  unless `ALLOW_REMOTE_DB_IN_DEV=true` is explicitly set

### Production

- Frontend: Vercel domain
- Backend: Railway domain
- Database: Railway Postgres

## Recommended Local `.env`

Use the project root `.env` for local development:

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
STEAM_WEB_API_KEY=your_steam_web_api_key
STEAM_OPENID_REALM=http://localhost:5000
STEAM_OPENID_RETURN_URL=http://localhost:5000/api/steam/auth/callback
STEAM_DEV_SYNC_SAMPLE=false
```

For local Steam UI testing, `STEAM_WEB_API_KEY` is optional. You can either set
`STEAM_MOCK_OWNED_GAMES_JSON` to a mock Steam payload, or set
`STEAM_DEV_SYNC_SAMPLE=true` to use the built-in sample library after using the
Dev link button. Mock/sample sync is ignored in production.

For real local Steam testing:

- Register a Steam Web API key at `https://steamcommunity.com/dev/apikey`.
- For local-only testing, the registered domain can be `localhost`.
- Put the key only in local `.env` as `STEAM_WEB_API_KEY`; never commit it.
- Keep `STEAM_OPENID_REALM=http://localhost:5000`.
- Keep
  `STEAM_OPENID_RETURN_URL=http://localhost:5000/api/steam/auth/callback`.
- Log in through the app's Steam link flow. Steam OpenID shares the SteamID64
  and public profile data according to Steam privacy settings; it does not share
  the user's Steam password with this app.
- Owned-library sync works only when Steam profile/game details are public
  enough for the Steam Web API to return owned games.
- Achievement summary sync uses the same backend-only `STEAM_WEB_API_KEY`.
  Per-game achievement data can legitimately come back as no achievements,
  private, unavailable, or failed; those states should be recorded without
  breaking normal library or backlog reads.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local Postgres database:

```bash
createdb gaming_backlog_local
npm run db:reset:local
```

3. Confirm the app is pointed at the right places:

```bash
npm run env:check
```

4. If you are using an existing local database, apply non-destructive local
   migrations:

```bash
npm run db:migrate:local
npm run db:migrate:status
```

5. Optional: seed the cached Discover shelves from RAWG:

```bash
npm run catalog:seed -- --limit=24
```

6. Start the app:

```bash
npm run dev
```

`npm run dev` uses `scripts/dev.js` to run the backend and frontend together.
The runner frees the usual dev ports (`5000` and `5173`) if they are already
held by stale Node dev processes, refuses to stop non-Node processes
automatically, and stops the sibling process if either backend or frontend
exits. This avoids a half-running local app where Vite stays alive after the
API process fully exits. Backend restarts are handled by nodemon without
`--exitcrash` so a transient Windows `EADDRINUSE` during restart does not tear
down the whole dev session. To inspect ports without stopping anything, run
`npm run dev:ports:dry`.

Useful port helpers:

```bash
npm run dev:ports:dry
npm run dev:ports:back:dry
npm run dev:ports:front:dry
npm run dev:ports:back
npm run dev:ports:front
```

Use the `:dry` commands when you want to see what would be stopped without
stopping it. The non-dry commands stop stale Node dev processes on the selected
port.

## Daily Workflow

1. Update `Dev` from GitHub.
2. Create a feature/fix branch from `Dev`.
3. Run the app locally.
4. Make changes.
5. Test the changed flow locally.
6. Run `npm run check` before pushing.
7. Commit in small chunks.
8. Open a PR into `Dev`.
9. Merge `Dev` into `main` only when ready to deploy.

Example:

```bash
git switch Dev
git pull
git switch -c feature/some-small-change
npm run dev
npm run check
```

## CI/CD

This repo has GitHub Actions at `.github/workflows/ci.yml`.

The check job runs on pushes to `main` and `Dev`, and on pull requests:

- `npm ci`
- `npm run lint`
- `npm test` (Node unit, route, and real-Postgres schema contracts)
- `npm run build`
- `npm run test:e2e` (desktop plus focused mobile/keyboard Chromium coverage)

The production migration job runs only on pushes to `main`, after checks pass.
It applies SQL files from `backend/migrations/`. The protected job fails when
`PROD_DATABASE_URL` is missing so production cannot silently skip schema work.

Catalog/Discover data is cached in Postgres. For production Discover shelves,
either:

- set `CATALOG_AUTO_SEED=true` on Railway so the backend refreshes
  missing/expired catalog collections after startup and then once per day, or
- run `npm run catalog:seed -- --limit=24` intentionally against the production
  backend environment when you want a manual refresh.

`CATALOG_SEED_LIMIT` defaults to `24` and controls how many games are seeded per
collection. Keep it modest to protect the RAWG quota.

Vercel and Railway are still expected to handle deployment from GitHub. Check
their dashboards and make sure production deploys are connected to `main`, not a
feature branch.

## Local vs Production Database

Use three mental buckets:

- Local DB: disposable development database on your machine.
- Dev/staging DB: optional Railway/Postgres clone for realistic testing.
- Production DB: real user data.

Your normal `.env` should point to the local DB. If you want a dev/staging DB
with a copy of production data, create a separate Railway/Postgres database and
copy production into it once. Do not use that clone for routine destructive
tests unless you are comfortable resetting it.

Recommended data-copy flow:

1. Make sure `.env` points to your local database.
2. Make sure `.env.production.local` points to your Railway database.
3. Stop the dev server.
4. Run:

```bash
npm run db:copy-prod-to-local
```

This overwrites only a localhost database. The script refuses to run unless the
target is local and the source is remote.

After the copy, run:

```bash
npm run db:migrate:local
```

That records/applies any migrations that are newer than the production dump.

Because this project stores account data, treat production exports as sensitive.
Avoid committing dumps, screenshots of secrets, or `.env` files.

## Database Changes

Use this order for schema work:

1. Add a SQL file under `backend/migrations/`.
2. Update `backend/schema.sql` so fresh installs match the latest shape.
3. Test locally with `npm run db:migrate:local` for existing DBs, or
   `npm run db:reset:local` for fresh disposable DBs.
4. Run `npm run check`.
5. Merge through `Dev`.
6. Merge to `main` when ready; GitHub Actions applies production migrations if
   `PROD_DATABASE_URL` is configured.

`backend/schema.sql` currently drops and recreates tables, so it is for local
fresh installs only.

Production migrations must be backward-compatible and safe to run once:

- Good: `CREATE TABLE`, `ALTER TABLE ADD COLUMN`, indexes, constraints added
  after data is valid.
- Risky: dropping columns, renaming columns, changing meanings of existing data.
- Minimal deterministic schema-coupled reference values or bounded backfills
  may be included when required by the schema and explicitly reviewed.
- Never put production copies, demo content, or user-specific seed data in a
  migration.

Because Vercel/Railway deployment can happen near the same time as GitHub
Actions, prefer backward-compatible migrations: old code should keep working
briefly after the migration, and new code should tolerate the migration already
being applied.

For the catalog metadata release, confirm production has:

- migrations `004_add_catalog_metadata.sql` and
  `005_add_catalog_collections.sql` applied
- `RAWG_API_KEY` configured on the backend
- `CATALOG_AUTO_SEED=true` if automatic Discover shelf refresh is desired
- a modest `CATALOG_SEED_LIMIT`, usually `24`

For the Steam integration release, confirm production has:

- migration `006_add_steam_integration.sql` applied
- migration `007_improve_steam_import_review.sql` applied
- migration `008_add_steam_achievement_summaries.sql` applied
- migration `009_add_hours_source_preferences.sql` applied
- migration `010_add_steam_activity_observed.sql` applied when deploying the
  local Steam Sync Review/activity polish
- `STEAM_WEB_API_KEY` configured on the backend
- `STEAM_OPENID_REALM` set to the backend origin
- `STEAM_OPENID_RETURN_URL` set to the backend `/api/steam/auth/callback`
- `FRONTEND_BASE_URL` or `STEAM_FRONTEND_RETURN_URL` set to the frontend origin

Steam production behavior to verify:

- Steam data stays private in public profiles.
- Manual sync failure or private-library state does not break the normal
  backlog.
- Manual achievement sync records per-game unavailable/private/failure states
  without breaking backlog or Steam library reads.
- Manual library sync can surface a private Steam Sync Review when newly
  observed play activity or newly discovered Steam games need user action.
- Import candidates can be reviewed before any new backlog row is created.
- Attach/import flows do not create duplicate `games` rows for an already
  matched backlog game.
- `STEAM_DEV_SYNC_SAMPLE` and mock sync data are disabled in production.

## Feature Workflow

For each new feature or bug fix:

1. Define the scope.
2. Make the smallest schema changes needed.
3. Implement backend changes.
4. Implement frontend changes.
5. Test the full user flow locally.
6. Run `npm run check`.
7. Push and verify the deploy after merge.

Good examples of feature branches:

- `feature/steam-sync`
- `feature/ui-polish`
- `fix/sort-search-behavior`

## AI-Friendly Work Habits

- Keep each branch focused on one feature or bug.
- Write down the exact user flow to test before editing.
- Ask AI tools for implementation plus tests/checks, not only code snippets.
- Before merging, ask for a review against the diff and run `npm run check`.
- Never paste live secrets into chat; use redacted env summaries instead.

## Safety checks

Run the fast validation suite before committing:

```bash
npm run check
```

This runs ESLint, the Node test suite, and the production build. ESLint includes
undefined-variable checks, so missing component imports fail before reaching the
browser.

For route-level browser smoke coverage, install Playwright's Chromium build once
and run the full check:

```bash
npx playwright install chromium
npm run check:full
```

The smoke suite opens every routed page and fails on uncaught browser runtime
errors or the application error-boundary fallback.
