# Verification policy

One policy for agents, skills and workflow examples. User requirements take
precedence. Save unnecessary repetition, not meaningful regression coverage.

## Choose the checks before running them

Inspect existing tests and previous evidence for the changed behavior. For medium
or larger work, name the regression/risk and the smallest checks that cover it in
the short plan. Do not create a separate planning ceremony for trivial edits.

| Change | Default local verification |
| --- | --- |
| Documentation only | Proofread, verify changed links, `git diff --check`. No app checks. |
| Small/medium behavior change | Usually one focused test command at the final checkpoint, when warranted; no full suite/build by default. |
| Auth, isolation, migrations, shared refactor or major feature | Meaningful focused tests at the final checkpoint. Cover relevant rejection, replay, stale-response and failure paths; add browser coverage when the risk is in the interaction. |
| UI/layout | Exercise the affected user flow, viewport and keyboard/focus behavior. Use one targeted browser invocation when warranted, not all browser tests by default. |
| Schema | Run the migration runner once against localhost, plus focused compatibility/service coverage when warranted. Prefer a disposable upgrade/fresh-install contract. |
| Dependencies/build configuration | Inspect the lockfile and run an appropriate focused check or one build; CI supplies the full matrix. |

These are defaults, not a quota that prevents covering distinct risks. A backend
contract plus a browser regression is justified when each covers a different
failure boundary. Group related tests in an invocation where practical. Do not
run focused tests and then automatically append full lint, tests, build and browser
suites. A cheap targeted syntax/lint check can precede expensive tests when it
addresses a concrete risk such as changed imports.

## Reproduce, finish, verify

1. Reproduce the exact reported action sequence when practical. Preserve that
   failure path in the regression, including affected error/limit/viewport states.
   A helper happy path is not equivalent. State missing reproduction evidence.
2. Finish the coherent fix before final checks. Do not run tests after every edit.
3. Keep a small check record in the handoff/work record: command, tested SHA plus
   dirty-file scope (or checkpoint), result, and any remaining gap. Do not claim a
   commit's green CI covers later uncommitted changes.
4. Once a check passes, do not repeat it without an intervening relevant change.
   After failure, inspect the failing excerpt, correct its cause, then rerun only
   the affected check. An environment/permission correction also counts as a cause;
   retrying an unchanged setup does not. If the same failure repeats without new
   evidence, stop retrying and diagnose the blocker; do not escalate to larger suites.
5. After all required checks pass, stop verification. Optional polish must not
   restart the implementation/test cycle unless requested or needed for acceptance.

## Safe execution and compact results

- Tests use mocked providers and disposable localhost databases by default. Confirm
  the target before any migration/reset; do not mutate ordinary development data or
  call real Steam/other providers without explicit authorization. Never reset a
  non-disposable database. Clean up only the resources created by the test.
- A disposable contract that executes `scripts/db-migrate.js` (the implementation
  of `npm run db:migrate:local`) satisfies migration execution when it covers the
  required upgrade path. Do not repeat it against the normal DB merely to run the
  npm alias. Test idempotency/backfill preservation when relevant. Direct SQL alone
  does not establish that runner preflights work.
- Save verbose output to ignored test artifacts or a temporary file. Report totals
  and failing excerpts; retrieve more only for diagnosis. Preserve/check the process
  exit code: a successful log-reading command does not prove the tests passed.
- Poll an existing running process; do not launch another copy to get its output.
  Use the proven environment/launch path once known. On Windows use `rg -g` for
  filename globs rather than unsupported wildcard path arguments.
- Report initial failures and their corrected rerun, skipped checks and limitations.
  Count distinct tests separately from repeated executions; absence of tests or
  `--passWithNoTests` is not meaningful coverage.

## Full CI and release gate

CI is the primary full gate. The workflow runs for PRs and pushes to Dev/main;
a feature-branch push alone is not equivalent. Prefer a PR for the exact candidate.

Run `npm run check` or `npm run check:full` locally only when explicitly required
or equivalent CI cannot cover the exact candidate before release. Run the selected
gate once; `check:full` already includes `check`. Do not separately rerun its passing
lint/test/build steps or duplicate already-green equivalent CI.

No local verification authorizes commit/push/merge/deploy. Before production
promotion require the candidate's full gate, including required browser coverage.
After pushing, diagnose CI failures from the failing step; do not rerun local full
verification merely because a push occurred. Verify each requested deployment and
migration target separately; a green build is not production smoke verification.
