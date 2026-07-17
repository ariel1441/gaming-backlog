# CI/CD And Production Delivery

Status: maintained operational guide.

This project has four independent delivery systems:

- GitHub Actions verifies code and applies production database migrations.
- Vercel builds and serves the frontend.
- Railway builds and serves the backend.
- Railway Postgres stores production data.

A successful result in one system does not prove the other three succeeded.
Record and verify the exact commit SHA in each system during a release.

## Runtime Standard

The temporary compatibility baseline is Node.js 20.20.2 with npm 10.x. CI pins
npm 10.9.4 for reproducibility. Node.js 20 is end-of-life, so this baseline
prioritizes compatibility with the currently deployed application while a
separately tested Node 24 upgrade is planned.

- `package.json` is authoritative for hosted Node selection.
- `.nvmrc` and `.node-version` align local version managers.
- GitHub Actions reads `.nvmrc`.
- Vercel and Railway should both report Node 20 for new deployments.
- npm uses `engine-strict=true`, so installs fail instead of silently using an
  unsupported Node version.

## Repository-Controlled CI

`.github/workflows/ci.yml` runs the `check` job for:

- every pull request;
- pushes to `Dev`;
- pushes to `main`;
- deliberate manual workflow dispatches.

`check` installs from the lockfile, then runs lint, Node tests, the production
build and bundle budget, and Playwright browser tests. Failed browser runs retain
the Playwright failure artifacts for seven days.

Superseded pull-request and `Dev` runs are cancelled. `main` runs are not
cancelled because they can participate in production delivery.

Push workflows publish explicit Vercel commit statuses:

- `Vercel - gaming-backlog: ci`;
- `Vercel - gaming-backlog: production-migration`.

Once imported and marked blocking in Vercel, these statuses become Deployment
Checks. The reporting action starts each status when its job begins and
completes it with the job result.

## Intended Delivery Flow

### Pull requests

1. GitHub runs `check`.
2. Vercel may build a Preview deployment.
3. No production migration or production deployment should run.
4. Merge only after the exact head SHA has a successful required `check`.

### Pushes to `Dev`

1. GitHub runs `check`.
2. Vercel may build a Preview deployment.
3. Railway production and the production database must not change.

### Pushes to `main`

The intended order is:

1. GitHub `check` succeeds.
2. GitHub `migrate-production` shows pending migrations and applies them.
3. Railway deploys the backend.
4. Vercel promotes the already-built frontend to production.
5. Production API and frontend smoke checks verify the exact SHA.

Vercel may build the candidate while CI is running, but it must not assign the
production domain until the required GitHub checks succeed.

## Required External Settings

These settings cannot be enforced by repository YAML alone.

### GitHub

- Protect `main` with pull requests and required `check` status.
- Protect `Dev` with required `check` status if direct pushes should be blocked.
- Keep the `production` Environment attached to migrations.
- Add required reviewers to the `production` Environment if migrations need
  manual approval.
- Restrict who can bypass branch and environment protections.

### Railway backend service

- Production branch: `main`.
- Wait for CI: enabled.
- Start command: `npm start`, unless Railway correctly detects it.
- Health-check path: `/healthz` until a database-aware readiness route exists.
- Node runtime: 20.x.
- Builder: migrate from deprecated Nixpacks to Railpack only after the runtime
  pin has passed CI, then verify the resulting deployment separately.

With Wait for CI enabled, a failed GitHub workflow should skip the Railway
deployment. Because the production migration is part of the same workflow,
Railway should also wait for migration completion.

### Vercel frontend project

- Production branch: `main`.
- Node runtime: 20.x for both Project Settings and Production overrides.
- Add blocking GitHub Deployment Checks for
  `Vercel - gaming-backlog: ci` and
  `Vercel - gaming-backlog: production-migration`.
- Keep automatic production-domain assignment enabled only when those checks
  are blocking promotion.
- Preview deployments may continue for pull requests and `Dev`.

## Database Migration Safety

Production migrations:

- run only for a push to `main`;
- require `check`;
- require the production database secret;
- are serialized by GitHub concurrency and a Postgres advisory lock;
- run each migration file in its own transaction;
- verify the resulting schema and migration count.

Application rollback and database rollback are different operations. Do not
automatically reverse a successful migration when application deployment fails.
Prefer expand-and-contract changes:

1. add backward-compatible schema;
2. deploy code that tolerates old and new schema;
3. backfill in a bounded operation when needed;
4. remove obsolete schema in a later release.

Before risky or destructive migrations, confirm a recent restorable backup or
point-in-time recovery window in Railway. Never store production dumps in the
repository or workflow artifacts.

Large-table indexes and constraint validation can lock production tables.
Review their expected duration and transaction requirements before adding them
to the normal per-file transactional runner.

## Release Verification

For the exact `main` SHA, verify:

1. GitHub `check`;
2. GitHub `migrate-production`;
3. Railway backend deployment and `/healthz`;
4. Vercel production deployment;
5. a protected API route returns an auth-shaped `401`, not a generic `404`;
6. representative frontend routes load against the deployed backend.

If any gate fails, stop promotion and diagnose that system directly. Do not
assume another successful platform compensates for it.
