# Task-specific agent conventions

Read only the section relevant to the task, as directed by `AGENTS.md`.
Verification is governed by [VERIFICATION.md](VERIFICATION.md).

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
