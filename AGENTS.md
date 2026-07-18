# Agent Instructions

Durable instructions for AI agents working in this repository. Prefer the code,
scripts, and current git state over older notes in markdown files.

## Project Shape

- Full-stack JavaScript app for tracking a gaming backlog.
- Frontend: React 18, Vite, Tailwind CSS, React Router, Recharts, dnd-kit.
- Backend: Express, PostgreSQL via `pg`, JWT auth, Celebrate/Joi validation.
- Main app routes: `/`, `/discover`, `/timeline`, `/steam/import`,
  `/steam/library`, `/insights`, and public profiles at `/u/:username`.
- API routes live under `backend/routes/`; shared frontend API calls live under
  `src/services/`.

## Core Commands

- `npm run dev` starts backend and frontend locally.
- `npm run dev:back` starts only Express on `PORT` defaulting to `5000`.
- `npm run dev:front` starts only Vite on `http://localhost:5173`.
- `npm run check` runs lint, tests, and build.
- `npm run env:check` prints a redacted environment summary.
- `npm run db:migrate:local` applies tracked migrations to a localhost DB.
- `npm run db:reset:local` rebuilds a localhost DB from schema and seed.
- `npm run db:copy-prod-to-local` overwrites a localhost DB with a production
  dump. Use only when explicitly requested.

## Git And Branches

- `main` is production.
- `Dev` is the integration branch.
- Prefer short-lived `feature/...`, `fix/...`, or `chore/...` branches from
  `Dev`.
- Before editing, run `git status --short --branch`.
- Do not overwrite, revert, format, or "clean up" uncommitted changes you did
  not make.
- Keep diffs focused on the user request. Avoid unrelated refactors.
- If asked to commit only one feature while unrelated work exists, inspect and
  report mixed-file risk before staging. Do not silently stage shared files that
  also contain unrelated changes.

## Agent Workflow Modes

- Treat explicit modes as binding:
  - `PLAN ONLY`: inspect and propose; do not edit files.
  - `REVIEW ONLY`: review findings first; do not edit unless later asked.
  - `IMPLEMENT`: make the focused change and verify it.
  - `DEBUG ONLY`: reproduce/diagnose first, then make the smallest fix if asked.
  - `UI POLISH`: keep the existing visual language and verify responsive states.
  - `RELEASE`: check code, git, CI/deploy state, and production smoke targets.
- For large features, split planning, implementation, review, and release into
  separate phases instead of letting one chat absorb everything.
- If the task starts broad or product direction is unsettled, ask for or provide
  options before coding.

## Context And Phase Discipline

- Keep one conversation focused on one primary phase: planning/diagnosis,
  implementation, review, or release. When the phase changes, finish with a
  concise handoff and recommend a fresh conversation instead of carrying a
  large implementation or release history forward.
- Do not turn a local implementation request into a commit, push, merge,
  deployment, or production-verification task unless the user explicitly asks.
- Use a current user-provided handoff to choose the initial inspection scope;
  verify decision-relevant claims without rediscovering settled behavior.
- Read only the smallest relevant documentation set. Use targeted `rg` searches
  and file ranges before reading large files. Exclude `node_modules/`, `dist/`,
  generated files, caches, dumps, and `backend/data/` from broad searches unless
  the task specifically concerns them. A named skill must still be read fully.
- Keep command output compact. Filter or summarize successful logs; inspect full
  logs only when diagnosing a failure.
- For medium or larger work, make one short plan, implement the coherent change,
  verify once at the end according to the policy below, and stop. Do not churn
  the plan or report every minor edit.

## Bug Reproduction

- Reproduce the user's exact action sequence when practical before fixing a
  reported bug. A nearby helper, shortcut, or happy path is not an adequate
  substitute for the failing interaction.
- If adding a regression test, cover the reported failure path, including the
  relevant desktop/mobile or limit/error state. Do not add a proxy test merely
  because it is easier to automate.
- If the exact issue cannot be reproduced, say so and identify what evidence is
  missing instead of claiming the bug is covered.

## Repo-Local Skill Drafts

- Skill drafts under `docs/skills/*/SKILL.md` are not automatically installed as
  global Codex skills. However, within this repo, agents should proactively read
  and follow the relevant draft when the task clearly matches it, even if the
  user forgets to mention skills.
- Skill selection:
  - Review/diff/audit request -> `docs/skills/gaming-backlog-review/SKILL.md`
  - Release/deploy/production verification -> `docs/skills/gaming-backlog-release/SKILL.md`
  - React/Tailwind/UI/layout/forms -> `docs/skills/gaming-backlog-frontend-ui/SKILL.md`
  - Express/API/auth/validators/routes -> `docs/skills/gaming-backlog-backend-api/SKILL.md`
  - Migrations/schema/local or production data/export/backup -> `docs/skills/gaming-backlog-db-safety/SKILL.md`
  - Steam import/library/sync/playtime/achievements -> `docs/skills/gaming-backlog-steam/SKILL.md`
- If multiple skill drafts apply, read the smallest relevant set and say which
  ones are being used. Do not read every skill draft by default.

## Environment Rules

- Local development must use a localhost Postgres database.
- The backend is expected to reject remote `DATABASE_URL` in development unless
  `ALLOW_REMOTE_DB_IN_DEV=true` is deliberately set.
- Never commit `.env`, dumps, real secrets, tokens, or production data.
- Use `npm run env:check` when environment behavior is relevant.
- Before creating backups, exports, dumps, or production-derived files, verify
  the target path is ignored by git. Prefer generic filenames that do not expose
  usernames or private account identifiers.

## Database Rules

- Production schema changes must go through `backend/migrations/*.sql`.
- Keep `backend/schema.sql` updated so fresh local installs match the latest
  schema.
- Migrations should be backward-compatible with the currently deployed app and
  idempotent where practical. Minimal deterministic schema-coupled reference
  values or bounded backfills are allowed when required by the schema and
  explicitly reviewed.
- Do not put production copies, demo content, or user-specific seed data in
  migrations unless explicitly requested.
- Test schema work with `npm run db:migrate:local`; use
  `npm run db:reset:local` only for disposable local databases.

## Frontend Rules

- Match the existing React component/hook/service patterns before adding new
  abstractions.
- Read `docs/SYSTEM_CONTEXT.md` early in a new session for the current
  architecture handoff. Use `docs/NEXT_TASKS.md` for the active queue and
  `docs/ROADMAP.md` only when broader planning or priorities are needed.
- Preserve authenticated owner, guest/demo, and public read-only flows when changing shared
  UI.
- Check responsive behavior for desktop and mobile when touching layout.
- Long game titles, missing cover art, empty states, and auth errors should
  remain graceful.
- Use existing design tokens/classes in `src/index.css` and Tailwind config
  before inventing new styling conventions.
- Use shared UI primitives from `src/components/ui/` before creating one-off
  buttons, icon buttons, modals, fields, inputs, selects, badges, empty states,
  skeletons, toasts, or confirm dialogs.
- Use `useToast` for user feedback and `useConfirm` for destructive
  confirmation. Do not add browser `alert()` or native `confirm()`.
- Keep private backlog route code under `src/pages/Backlog/`. `src/App.jsx`
  should stay focused on app providers and routes.
- Use `src/utils/gameList.js` for game filtering, searching, sorting, CSV genre
  parsing, and hours-range display lists. Do not duplicate list logic in pages.
- Use `src/utils/permissions.js` for frontend edit/delete/reorder/read-only and
  public-toggle affordances. Backend authorization remains the security
  boundary.
- Route frontend network calls through `src/services/*` and
  `src/services/apiClient.js`. Auth, demo, `/me`, and public-toggle requests
  should go through `src/services/authService.js`.

## Backend Rules

- Keep route handlers in `backend/routes/`, validation in `backend/validators/`,
  and cross-cutting concerns in `backend/middleware/` or `backend/utils/`.
- Preserve per-user data isolation. Authenticated game data should be scoped to
  the current user.
- Keep API errors compatible with the central error handler shape:
  `{ error: { code, message, requestId } }`.
- Prefer Celebrate/Joi validators in `backend/validators/` for params and body
  validation instead of hand-rolled route checks.
- Use `backend/utils/httpError.js` helpers and `next(err)` for intentional API
  errors. Avoid direct route responses like `res.status(404).json({ error })`.
- New endpoints should follow this shape: route declaration, auth/guard,
  validation, request normalization, query/service work, response serialization,
  centralized error forwarding.
- Request IDs are assigned by `backend/middleware/requestId.js`; keep error
  responses and logs compatible with that flow.
- Be careful with cache changes in RAWG, HLTB, public, and insights flows.

## Documentation Rules

- Treat `README.md`, `DEVELOPMENT.md`, and this file as maintained docs.
- Treat `docs/planning/ideas.md` as unverified planning notes until the code is
  checked.
- Templates under `docs/templates/` are reusable prompts, not product docs.
- Skill drafts under `docs/skills/` are reusable agent workflows. They are
  repo-local reference material unless installed into the active Codex skills
  location; agents should still consult the relevant draft when working here.
- Use `docs/NEXT_TASKS.md` for the short active queue. Use `docs/ROADMAP.md`
  for broader planning, not as mandatory startup context for every small task.
- If documentation is updated, prefer clearly marking unverified or historical
  material instead of presenting it as current fact.

## Verification Policy

- CI is the primary full verification gate. Do not run lint, tests, builds, or
  Playwright after each edit.
- Documentation-only changes: proofread changed Markdown and run
  `git diff --check`. Do not run application tests or builds.
- Small changes: by default run no full local suite. At the end, run at most one
  focused command only when the user requests it or it directly reproduces a
  meaningful regression.
- Medium changes: finish the coherent implementation first, then run at most one
  focused test command when warranted. Do not run `npm run check`, a production
  build, or the complete Playwright suite by default.
- Large or high-risk changes such as auth, permissions, migrations, major shared
  refactors, or a new major feature: run focused verification once at the end.
  Run `npm run check` or `npm run check:full` once only when the task explicitly
  requires it or the exact commit cannot receive equivalent CI coverage before
  release.
- Schema changes still require `npm run db:migrate:local` once at the end against
  a localhost database. Add focused schema/service tests when the migration risk
  warrants them; do not automatically add a separate full suite.
- Dependency changes require lockfile inspection and one final build or focused
  check when appropriate; rely on CI for the complete matrix.
- Never rerun an unchanged passing command. Rerun a failed command only after a
  relevant fix, and rerun the narrowest affected command before considering a
  broader gate.
- Before production promotion, prefer a pull request so the exact SHA receives
  CI. This workflow runs CI for pull requests and pushes to `Dev`/`main`; a push
  to an arbitrary feature branch alone does not trigger it.
- If the exact candidate SHA already has green equivalent CI, do not duplicate
  the same full suite locally. Promote that exact SHA and let the `main` workflow
  perform its required production gate.
- Mention which checks were actually run. If a relevant check was skipped,
  briefly say why.
- Mention if tests are absent or only `--passWithNoTests` succeeded.
- Summarize changed files and call out any pre-existing local modifications.

## Git, Publishing, And Release Terms

- `commit` means create a local commit only.
- `push` means publish the named branch and confirm its remote SHA; it does not
  imply merging, promoting `main`, deploying, or production verification.
- `promote to main` means update production branch `main` to the approved exact
  SHA. Because this is a production trigger, monitor the required `main`
  workflow unless the user explicitly limits the task.
- `release and verify production` means promote and independently verify CI,
  migrations when applicable, Railway, Vercel, and representative production
  routes.
- Git transport, GitHub CLI, and the connected GitHub app are separate auth
  systems. A successful `git fetch origin` or `git ls-remote origin` establishes
  Git transport access; `gh auth status` failing does not prove `git push` will
  fail.
- Require `gh` authentication only for an operation that specifically needs the
  CLI and is not covered by the connected app or Git transport. Do not ask the
  user to repeat `gh auth login` merely to perform a normal Git push.
- If the user authorized a normal push and Git transport works, do not claim
  that pushing to `main` is impossible unless branch protection or the push
  itself proves it.

## Release Monitoring

- Record the exact promoted SHA and the GitHub run, Railway deployment, and
  Vercel deployment identifiers as they become available. Poll those exact
  records rather than repeatedly listing broad histories.
- Poll unchanged external state no more often than every 30-60 seconds. Give a
  user-facing update when state changes or after roughly two minutes, not after
  every poll.
- Use one primary monitoring path per system. Switch to a fallback only when the
  primary path actually fails; do not cycle through CLI, connector, public API,
  and HTML scraping for the same unchanged state.
- Once a gate succeeds, do not recheck it unless a downstream action could have
  invalidated it. Stop immediately when all requested gates are terminal.
- Do not rerun local verification after pushing. Diagnose a failing CI job from
  its failing step and safe logs, then rerun only after a relevant change.
- For release/deploy work, verify each requested system separately. Do not assume
  a pushed commit or one successful hosting deployment proves the entire release
  succeeded.

## Review Mode

When asked for a review, lead with bugs, regressions, database risks, security
risks, and missing tests. Include file and line references. Keep summaries
secondary.
