# Durable Metadata Release Runbook

Status: prepared locally; no production action performed

This runbook releases the durable metadata architecture without treating a Git
push as proof that the database, Railway backend, and frontend are synchronized.
Never paste database URLs, tokens, usernames, private notes, or audit row data
into tickets or chat. Aggregate audit output is safe to retain.

## Hard gates

Do not begin production writes until all are true:

1. A recoverable production PostgreSQL backup is confirmed in the hosting
   provider, including its timestamp and restoration procedure.
2. The feature branch has passed `npm run check` and `npm run check:full` where
   Playwright/browser infrastructure is available.
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
npm run check
npm run check:full
```

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

1. Push the feature branch and open a reviewed pull request against `Dev`.
2. Record the backend/frontend rollback commit.
3. Confirm the production backup again immediately before database writes.
4. Apply tracked production migrations:

   ```powershell
   npm run db:migrate:prod
   ```

5. Deploy the backward-compatible backend and verify `/healthz` plus protected
   route authentication behavior before deploying the frontend.
6. Import the historical RAWG file only if the production audit shows the
   snapshots are still needed. First validate locally without database access:

   ```powershell
   npm run metadata:import-cache
   ```

   Production apply requires an ignored source file, a verified backup,
   `--production`, `--confirm-production`, and
   `CONFIRM_PROD_METADATA_IMPORT=true`.
7. Re-run `npm run metadata:audit:prod` and review aggregate changes.
8. Run exact-link repair only if the audit reports safe repairs and zero
   conflicts. Production apply additionally requires
   `CONFIRM_PROD_EXACT_LINK_REPAIR=true` and the script's production confirmation
   flags.
9. Deploy the frontend and verify Settings repair, backlog, Lists, public
   profiles, Insights, Discover, demo, and Steam surfaces independently.
10. Restart the Railway backend and prove metadata remains visible with no RAWG
    JSON cache on the application filesystem.

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
