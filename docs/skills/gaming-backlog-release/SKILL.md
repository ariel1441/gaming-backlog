---
name: gaming-backlog-release
description: Use for release preparation and deployment verification across GitHub Actions, Vercel frontend, Railway backend, database migrations, and production smoke checks.
---

# Gaming Backlog Release

## Use When

- The user asks to release, deploy, merge to `main`, verify production, or debug
  a production-only issue after deploy.

## Required Checks

Start with:

- `git status --short --branch`
- inspect changed files and whether migrations/env changes are involved

Verify each system independently:

1. Local checks appropriate to risk, usually `npm run check`.
2. GitHub Actions status.
3. Production migration status/result if schema changed.
4. Vercel frontend deployment.
5. Railway backend deployment.
6. Direct production API smoke checks.
7. Frontend smoke only after backend route checks pass.

## Known Release Risk

GitHub, Vercel, Railway, and the production database can diverge. Do not assume
a pushed commit means the backend is live. For protected backend routes, a
production request should return an auth-shaped error such as `401`, not a
generic `404`.

## Safety

- Never paste secrets.
- Do not use localhost Steam OpenID URLs in production.
- Treat production-derived files as sensitive and ignored by default.
