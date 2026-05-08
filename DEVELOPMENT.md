# Development Workflow

This project is deployed to:

- Frontend: Vercel
- Backend + Postgres: Railway

For day-to-day development, run the app locally against a local Postgres
database. Production data should only be touched intentionally.

## Current repo model

- `main`: production deploy branch candidate.
- `Dev`: integration branch for tested work before production.
- `feature/...` or `fix/...`: short-lived branches for actual changes.

At the moment `main` and `Dev` point at the same commit. Keep production
platforms connected to `main` where possible, then merge `Dev` into `main` only
after checks pass.

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

## Recommended local `.env`

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
```

## Local setup

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

4. Start the app:

```bash
npm run dev
```

## Daily workflow

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

It runs on pushes to `main` and `Dev`, and on pull requests:

- `npm ci`
- `npm run lint`
- `npm test`
- `npm run build`

Vercel and Railway are still expected to handle deployment from GitHub. Check
their dashboards and make sure production deploys are connected to `main`, not a
feature branch.

## Local vs production database

Use three mental buckets:

- Local DB: disposable development database on your machine.
- Dev/staging DB: optional Railway/Postgres clone for realistic testing.
- Production DB: real user data.

Your normal `.env` should point to the local DB. If you want a dev/staging DB
with a copy of production data, create a separate Railway/Postgres database and
copy production into it once. Do not use that clone for routine destructive
tests unless you are comfortable resetting it.

Recommended data-copy flow:

1. Export production with `pg_dump` from Railway.
2. Restore into local or staging with `pg_restore` or `psql`.
3. Change passwords/API secrets if needed.
4. Keep production credentials out of committed files.

Because this project stores account data, treat production exports as sensitive.
Avoid committing dumps, screenshots of secrets, or `.env` files.

## Database changes

Use this order for schema work:

1. Add a SQL file under `backend/migrations/`.
2. Update `backend/schema.sql` so fresh installs match the latest shape.
3. Test locally with `npm run db:reset:local`.
4. Apply the migration intentionally to staging/production.

`backend/schema.sql` currently drops and recreates tables, so it is for local
fresh installs only.

## Feature workflow

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

## AI-friendly work habits

- Keep each branch focused on one feature or bug.
- Write down the exact user flow to test before editing.
- Ask AI tools for implementation plus tests/checks, not only code snippets.
- Before merging, ask for a review against the diff and run `npm run check`.
- Never paste live secrets into chat; use redacted env summaries instead.
