# Durable Metadata Release Runbook

Status: active production runbook

This runbook releases the durable metadata architecture without treating a Git
push as proof that the database, Railway backend, and frontend are synchronized.
Never paste database URLs, tokens, usernames, private notes, or audit row data
into tickets or chat. Aggregate audit output is safe to retain.

## Hard gates

Do not begin production writes until all are true:

1. A recoverable production PostgreSQL backup is confirmed in the hosting
   provider, including its timestamp and restoration procedure.
2. The exact candidate SHA has passed the GitHub `check` job, which includes
   lint, unit/integration tests, build, and Playwright. Do not duplicate that
   green gate with both `npm run check` and `npm run check:full` locally.
3. Desktop and mobile smoke checks pass for **Settings → Game metadata**.
4. The production metadata audit and migration status are reviewed.
5. `METADATA_REFRESH_ENABLED` remains `false` for the initial release.
6. The exact commits and rollback target are recorded before deployment.

## Local readiness

Run from the repository root:

```powershell
git status --short --branch
npm run env:check
npm run db:migrate:status
npm run metadata:audit
```

Use a pull request targeting `Dev` or `main` so the exact candidate receives
CI; this workflow does not run for a push to an arbitrary feature branch by
itself. Run `npm run check:full` locally only when explicitly requested or when
the exact candidate cannot receive equivalent CI coverage. Run it at most once,
because `check:full` already includes lint, tests, and build through `check`.

`metadata:audit` uses `BEGIN READ ONLY` and reports aggregate schema,
completeness, candidate, job, snapshot, and exact-repair counts. It does not
return titles, usernames, notes, or other personal rows.

## Production read-only checks

After selecting the production environment deliberately:

```powershell
npm run db:migrate:prod:status
npm run metadata:audit:prod
```

Review:

- required tables and `games.cover` exist;
- linked full, linked search-result, exact-unlinked, and title-only counts;
- durable-cover gaps;
- broken links and duplicate external identities remain zero;
- active jobs and pending candidates are understood;
- the exact-link audit's safe-repair and conflict counts.

These commands are read-only. Stop if the database target is unexpected or if
the schema differs from migrations `020` through `023`.

## Deployment order

1. Push the feature branch and open a reviewed pull request against `Dev` (or
   the intended protected target). Wait for the exact SHA's `check` job.
2. Record the backend/frontend rollback commit and exact candidate SHA.
3. Confirm the production backup again immediately before promoting `main`.
4. Promote the exact green candidate SHA to `main` with a normal reviewed merge
   or fast-forward. Never force-push.
5. Monitor the `main` workflow. Its `check` job must pass before
   `migrate-production` shows and applies pending production migrations. Do not
   also run `npm run db:migrate:prod` manually while the workflow owns this
   release.
6. Verify the backward-compatible Railway backend via `/healthz` and protected
   route authentication behavior, then verify the Vercel frontend at the exact
   compatible commit.
7. Import the historical RAWG file only if the production audit shows the
   snapshots are still needed. First validate locally without database access:

   ```powershell
   npm run metadata:import-cache
   ```

   Production apply requires an ignored source file, a verified backup,
   `--production`, `--confirm-production`, and
   `CONFIRM_PROD_METADATA_IMPORT=true`.
8. Re-run `npm run metadata:audit:prod` and review aggregate changes.
9. Run exact-link repair only if the audit reports safe repairs and zero
   conflicts. Production apply additionally requires
   `CONFIRM_PROD_EXACT_LINK_REPAIR=true` and the script's production confirmation
   flags.
10. Verify Settings repair, backlog, Lists, public
   profiles, Insights, Discover, demo, and Steam surfaces independently.
11. Restart the Railway backend and prove metadata remains visible with no RAWG
    JSON cache on the application filesystem.

## Authentication And Monitoring

- Git transport, GitHub CLI, and the connected GitHub app authenticate
  separately. A successful `git fetch origin` establishes Git transport access;
  a failed `gh auth status` does not prove a normal push will fail.
- Require `gh auth login` only for a CLI-specific operation that cannot be
  completed through Git transport or the connected app.
- Immediately record the promoted SHA and exact GitHub run, Railway deployment,
  and Vercel deployment identifiers.
- Poll those identifiers every 30-60 seconds. Report only state changes or a
  concise update after roughly two minutes.
- Use one monitoring path per system and switch only when it fails. Do not
  repeatedly alternate between CLI, connector, public API, and HTML parsing.
- Do not rerun local tests after pushing or recheck a completed gate unless a
  downstream action could invalidate it. Stop when all required gates are
  terminal.
- If a system remains unchanged for ten minutes, report its exact safe status
  and blocker before expanding the diagnostic approach.

## Initial production behavior

- Page rendering remains PostgreSQL-only.
- Owner repair jobs may fetch RAWG within their configured per-job budget.
- Ambiguous title matches require owner review.
- Steam artwork remains an explicit last-resort private display fallback.
- Global scheduled refresh stays disabled.

After observing provider usage and job health, enable global refresh only in a
separate change with a small budget. There is no ordinary-user global-refresh
button because the app has no administrator authorization boundary.

## Rollback

- Disable background workers first by leaving
  `METADATA_REFRESH_ENABLED=false` and redeploying the prior backend if needed.
- The additive migrations should normally remain; do not drop durable catalog,
  snapshots, candidates, or job tables during an application rollback.
- Restore PostgreSQL from the verified backup only for confirmed data corruption
  and through the hosting provider's reviewed recovery procedure.
- Revert frontend and backend deployments independently; verify protected API
  routes after each change.
- Never restore the runtime JSON cache dependency as a rollback mechanism.

## Post-release evidence

Record only non-sensitive evidence:

- deployed commit identifiers for Railway and frontend hosting;
- migration ledger through `023`;
- aggregate metadata audit before and after import/repair;
- representative route status and request IDs for failures;
- desktop/mobile Settings smoke result;
- cold Railway restart result;
- RAWG request/job counts before considering scheduled refresh.
