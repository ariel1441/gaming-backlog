# AI Release Brief

Use this when preparing or verifying a deployment.

```text
Mode: RELEASE

Release goal:

Branch/source:

Expected production changes:
- frontend? yes/no
- backend? yes/no
- migrations? yes/no
- env vars? yes/no

Required checks:
1. `git status --short --branch`
2. local verification appropriate to the change
3. GitHub Actions / CI status
4. migration status or migration run result, if schema changed
5. Vercel frontend deployment
6. Railway backend deployment
7. direct production API smoke checks
8. frontend smoke check only after backend route checks pass

Safety:
- Do not paste secrets.
- Do not assume Vercel, Railway, GitHub, and DB updated together.
- For protected backend routes, unauthenticated production calls should return
  an auth error such as `401`, not a generic `404`.

Output:
- release status
- exact checks/results
- blockers
- next manual user test, if needed
```
