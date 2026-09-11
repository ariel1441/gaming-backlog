# Local release preparation — 2026-09-11

Branch: `fix/steam-candidate-account-isolation`. Runtime candidate: `6dd5338`,
following personal-genre isolation commit `9ed7fa1`. The following documentation
commit does not change runtime behavior. No push, remote CI, merge or deployment
was performed. Existing stashes and other branch pointers were preserved.

## Changes found by the requested full local gate

- Pricing contract helpers now use function expressions inside their `try` block,
  satisfying ESLint without changing test behavior. An intermediate missing closing
  delimiter was corrected before the successful lint/test run.
- The build initially exceeded the 512,000-byte per-chunk budget (599,823 bytes).
  Notification actions now load lazily; the shared React runtime has a separate
  cached chunk. The limit is unchanged. Final largest chunk: approximately 399 KB;
  all 68 JavaScript chunks pass.
- The mobile artwork assertion allows subpixel rounding: Chromium measured
  255.999969 pixels for a 256-pixel image. Backlog/Wishlist parity checks remain.
- Older Wishlist regressions now expect the intended landscape artwork and decode
  mocked SVG responses instead of depending on Steam CDN availability. The initial
  run retained the legacy CDN dependency; the corrected tests make no CDN request.
- Documentation now consistently accepts disposable migration-runner contracts and
  distinct focused checks. The earlier C.5 record is explicitly historical.

## Verification and limits

The user explicitly requested the full local gate before publishing. Commands ran
with installed Node 20.20.2, npm 10.8.2, Postgres 17.5 and Playwright 1.52.0 on Windows.
CI uses Node 20.20.2, npm 10.9.4 and Postgres 16 on Linux. Existing dependencies were
used; a clean `npm ci` install and GitHub workflow/deployment integration remain CI
coverage, not claims established locally.

An ignored wrapper under `logs/local-release/` supplied a uniquely named disposable
localhost database for each invocation, dummy provider keys and a guard rejecting
unmocked external Node fetches. Database contracts create additional disposable
databases or schemas and clean them up. No ordinary saved-data test or live provider
sync was run. No normal development migration was applied.

1. `npm run check:full`: after the lint correction, full lint passed and all **396
   Node tests passed**, zero failures/skips. Build then failed its bundle budget;
   browser tests had not started. The initial lint and build failures are retained
   as failed attempts, not represented as a single green gate invocation.
2. `npm run build`: passed after completing the chunk split. The passing Node suite
   was not repeated because subsequent runtime changes were confined to React lazy
   loading and Vite bundling, with browser/build verification.
3. `npm run test:e2e`: **43 passed, 3 failed, 1 skipped**. The failures were the
   mobile rounding assertion and two outdated artwork expectations.
4. After correcting those cases:

   ```text
   npm run test:e2e -- tests/e2e/steam-experience.spec.js tests/e2e/wishlist.regression.spec.js --project=chromium --grep "C.5 mobile|Wishlist parity"
   ```

   **3 passed**, exit 0. Across the full run and focused rerun, all **46 enabled
   browser cases passed**. The opt-in `STEAM_WISHLIST_LOCAL_SMOKE` saved-data test
   remains skipped; this is not coverage of an actual saved account.
5. Focused ESLint on the changed notification/Vite files: zero errors, 17 existing
   JSX unused-variable warnings. Focused ESLint on the two corrected browser files:
   zero errors/warnings. Staged whitespace checks passed; one extra blank line at
   EOF in the new artwork helper was removed without behavioral changes.

The runtime candidate contains the tested worktree content, except that final
nonbehavioral EOF cleanup. Results are checkpoint evidence, not remote CI results.
Full logs remain ignored under `logs/local-release/`.

## Next authorized phase

1. Review the three local commits. Refresh remote refs when publishing is authorized;
   do not switch to the older local `Dev` pointer to publish this work.
2. Push only `fix/steam-candidate-account-isolation` and open a PR into `Dev` when
   authorized. A feature-branch push alone does not trigger automatic full CI.
3. Require the complete `check` job for the exact candidate, including browser
   coverage, before the separately authorized integration/promotion steps.
4. Before production promotion, verify actual migration state and external delivery
   gates. The code difference from the recorded production branch includes 025–035;
   this does not prove which migrations are pending in the production database.
   Use the runner; resolve any 025 over-limit preflight explicitly without truncation.
5. On an authorized `main` promotion, verify CI, production migrations, Railway and
   Vercel independently, then protected API routes and frontend smoke. Scheduling
   enablement and live-provider verification remain separate authorization scopes.
