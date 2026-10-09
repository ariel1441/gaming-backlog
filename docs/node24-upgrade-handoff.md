# Node 24 upgrade handoff — 2026-10-09

Goal/phase: publish the prepared Node 24 upgrade to Dev under the user's
2026-10-09 authorization, synchronize origin/main, and monitor exact-candidate
CI and Vercel. Main promotion, dashboard changes and production deployment are
not authorized. The verification below records the completed preparation.

Branch/base: `Dev`, `06611b70a7c828f5e56707aef4160e8bfb29a4c1` (already on
`origin/Dev`). The prepared candidate contains only the runtime pins, Playwright
package/lock update, Vercel installation, Railway/Railpack config, container preflight/CI, and docs.
Application dependencies, business logic, database schema, and migrations are
unchanged. These files form one runtime upgrade commit.

## Changes

- Local/CI Node pin: 24.21.0; deployment engine: 24.x; npm remains 10.9.4.
- CI already reads `.nvmrc` for checks and production migration tooling.
- Vercel uses an explicit npm 10.9.4 install command.
- Superseding the initial Nixpacks preparation, `railway.json` selects Railpack
  0.40.1 for both services without deploy/start/cron overrides. No manual dashboard
  builder switch is required once Railway deploys that file. `nixpacks.toml` was
  removed. Both services read the existing npm 10.9.4 package-manager pin.
- Added `npm run check:railway` and a Linux CI container-build job. Production
  migrations now require both the app gate and container gate to pass.
- Playwright 1.52 stalled loading its ESM configuration under Node 24; an
  inspector stack confirmed it was blocked in Node's synchronous loader while
  importing `playwright.config.js`. Replaced with Playwright 1.64.0 and its
  matching Chromium. No application dependency upgrade was needed.

## Verification

Tested the working candidate based on the SHA above with an official,
SHA-256-verified portable Node 24.21.0 and npm 10.9.4 in ignored `.cache/node24`.
The machine's global Node installation was not changed. The verification copy
contains tracked working files, fresh dependencies, and no copied `.env` or
saved database data. Playwright's copy uses port 5175 instead of 5173 to avoid
disturbing the existing development server; the repository config is unchanged.

- Clean `npm ci --include=dev --no-audit --no-fund`: passed. Repeated only after
  the necessary Playwright lock update, through the exact checked-in
  `npx --yes npm@10.9.4 ci --include=dev --no-audit --no-fund` command: passed.
- Native bcrypt hash/compare: passed with the fresh dependencies.
- `npm run check:full`: lint passed; all 590 Node tests passed (0 skipped);
  production build and 67-chunk bundle budget passed. The initial browser stage
  stalled with Playwright 1.52 and was stopped for the compatibility correction.
- `npm run test:e2e -- --reporter=list` with Playwright 1.64 and matching
  Chromium: passed, 89 tests passed, 1 skipped (the opt-in saved-data Wishlist
  inspection). Desktop/mobile, demo/public, HLTB filter, large-list reordering,
  and failure recovery coverage passed. The disposable database was removed.
- Tests use disposable localhost databases and mocked providers. The interrupted
  harness's Windows file-URL cleanup issue was corrected; its disposable database
  was removed. No ordinary saved data or production data was changed.
- Lock comparison: changes limited to root runtime metadata, Playwright's three
  packages, and removal of its obsolete optional fsevents entry.
- Vercel SPA rewrite preserved. Railway config contains only the builder/version,
  so service start commands, healthchecks and daily schedule remain dashboard-owned.
- Container script syntax and focused ESLint passed. Workflow YAML parsed; the
  container job has read-only repository permissions, no production secrets, and
  is a dependency of production migrations.
- Local container preflight remains UNVERIFIED: the initial Windows Railpack CLI
  could not extract its Mise tool, so the final check runs the official Linux
  planner/container frontend instead. The version-pinned planner image builds,
  but AVG Antivirus HTTPS scanning signs GitHub traffic with a Windows-trusted
  AVG root that Docker images do not trust. The Linux planner stops on certificate
  verification while downloading Mise, before any application image build. No TLS
  checks were weakened and no production settings changed. Exact-candidate Linux
  CI must pass after the Dev push; do not treat local Node tests as container proof.
- Railway JSON validated with the official Draft 2020 schema using an isolated
  Ajv 8 tool (the existing Ajv 6 validator did not support that schema draft).
- Docker Desktop was started for the local probe. No other running containers
  were present; the task left no test containers and stopped Docker afterward.
- Final `git diff --check`: passed.

Logs and disposable tooling are ignored under `.cache/node24`; do not commit them.

## Hosting inspection and next action

Read-only inspection confirmed:

- Vercel project `gaming-backlog` still has a Node 20 dashboard default. The
  package engine overrides it with Node 24 for new deployments. Its failed Dev
  preview rejected Node 20 before building; a fresh Node 24 preview is pending.
- Railway `gaming-backlog` backend uses Nixpacks; `gaming-backlog-daily-sync`
  uses Railpack. Both source `main`, and neither has a Node/npm runtime override.
  The scheduled job remains `0 2,3 * * *`, with a next run reported by Railway.
  No Railway configuration or schedule was changed.
- Existing Dev CI run 37914142381 passed for the base SHA under Node 20. It does
  not cover this dirty Node 24 candidate.

Preparation fetched origin on 2026-10-09: Dev has the five published product
commits; origin/main additionally has merge commit bf285ef (PR #17). That merge
commit must be synchronized into Dev before publishing this candidate for CI.
The app has scheduled a one-time readiness report for 21:15 Israel time today.

Next: commit, merge fetched origin/main, and push only Dev as authorized. Require
the new exact-SHA GitHub CI
(including Railway container build) and Vercel preview to pass. Before a release PR, fetch and merge current
`origin/main` into the source branch and require CI on that candidate. Promote
only with explicit release authorization, after 21:10 Israel time for the
current Railway Free/EU West services. No manual builder change is needed with railway.json; confirm the deployment
shows Railpack 0.40.1, Node 24, the original service start commands and cron.
Verify backend/runtime/TLS, frontend,
and the nightly scheduled job after the production deployment.
