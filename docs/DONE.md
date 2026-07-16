# Completed Milestones

Last updated: 2026-07-16

This is a compact archive of completed product and engineering milestones. It
exists so current planning files can contain only remaining work. For exact
current behavior and architecture, use [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md)
and the code.

## Product Baseline

- Private per-user backlog CRUD with statuses, manual ordering, genre, score,
  notes, dates, covers, and estimated hours.
- Shared search, filtering, sorting, hours ranges, date filters, multiple view
  modes, and duplicate-title detection.
- Guest/demo sessions and conversion into permanent accounts.
- Public read-only profiles with stats, favorites, currently playing, recently
  finished, and a full-library view.
- Signed-in owner profile at `/me`.
- Settings V1 with profile basics, generated avatars, public-profile controls,
  favorite selection, account-backed view/sort/landing preferences, CSV export,
  and integration shortcuts.
- Private manual ranked lists and smart rule-based lists.
- Timeline V1 generated from start and finish dates.
- Insights V1 for hours, ETA, statuses, genres, date summaries, and missing-hour
  data.

## Catalog And Metadata

- RAWG search picker in add/edit flows.
- Provider-neutral catalog identity with external IDs.
- Cached RAWG search/detail metadata and stale/failure fallback.
- Discover V1 with curated cached shelves, search, detail, refresh, load more,
  and add-to-backlog.
- Catalog metadata reuse across private, public, and Insights flows.
- Manual catalog refresh cooldown and optional catalog shelf seeding.
- Initial hours-source preference and lock behavior.

## Steam V1/V1.2

- Steam OpenID account linking and private manual library sync.
- Persisted import-review candidates with match correction, ignore/import
  decisions, and status selection.
- Duplicate attachment and repair tools.
- Dedicated Steam Library with search, sort, filters, detail/repair tools, and
  durable hidden state.
- Private ownership, actual playtime, last played, and achievement summaries.
- Steam Sync Review for newly observed activity.
- Separation of Steam actual playtime from estimated completion hours.

## Engineering Foundation

- React route/page extraction with Backlog code under `src/pages/Backlog/`.
- Shared UI primitives, toast, confirmation, service, permission, and game-list
  utility patterns.
- Central API client and auth service usage.
- Central backend error shape and request IDs.
- Celebrate/Joi validation baseline and scoped user-owned game queries.
- Catalog and Steam service layers.
- PostgreSQL migration runner with transactions, migration records, advisory
  locking, and a production GitHub Actions job.
- Local database safety guard, environment summary, development port handling,
  and documented local/production workflows.
- Unit and mocked route/browser test baselines.

## July 2026 Audit Remediation

- Corrected authentication expiry ownership so permission `403` responses do
  not erase valid sessions; authenticated `401` responses notify
  `AuthContext` to clear memory and storage together.
- Bound Steam OpenID linking to a one-use browser nonce and stopped ordinary
  user match decisions from rewriting global Steam/catalog identities.
- Removed the invalid Steam write to `games.updated_at` and moved large Steam
  library syncs into durable, bounded jobs.
- Added atomic game writes, duplicate/position protection, database constraints,
  cross-owner relationship guards, and transactional Steam review/import paths.
- Added provider deadlines and typed outage handling, concurrency-safe catalog
  identity work, Insights cache/write protections, and stricter API validation.
- Hardened CSV exports, environment diagnostics, request IDs, PostgreSQL TLS,
  and password byte-length validation.
- Fixed derived-view reorder behavior, demo persistence, Insights request races,
  silent-refresh deletion reconciliation, private-profile states, modal focus,
  keyboard controls, and unknown/read-only route fallbacks.
- Added disposable real-Postgres schema, migration, ownership-constraint, and
  1,000-app Steam sync contracts. Repaired the real Playwright suite and added
  it to CI alongside route code splitting and a bundle budget.
- Added a real-Express/real-Postgres, two-user authorization contract for core
  game listing, update, deletion, reorder, and favorite ownership boundaries.
- Added the equivalent two-user contract for private Lists, covering list CRUD,
  manual membership, reorder, and cross-owner game/list boundaries.

The source audit remains in `docs/reviews/` as a historical snapshot. Commit
`34fb7c1` contains the broad remediation; later commits refined the affected
flows.

## Durable Metadata Repair And Rendering

- Added migrations `020` through `023` to reconcile historical game schema and
  establish durable metadata snapshots, repair jobs, and owner-scoped review
  candidates.
- Added canonical exact-RAWG ingestion, guarded historical cache import,
  resumable repair/audit tooling, reviewed ambiguous-match decisions, batch
  review, alternative search, and responsive Settings UX.
- Made normal backlog, Lists, public-profile, and Insights metadata rendering
  PostgreSQL-only and retired the process-local RAWG JSON runtime cache.
- Added controlled catalog refresh scheduling, release/audit runbooks, schema
  contracts, focused service coverage, and browser coverage for metadata review.

## Documentation And Workflow

- Durable repository rules in `AGENTS.md`.
- Current architecture handoff in `SYSTEM_CONTEXT.md`.
- Human AI-workflow guidance, templates, local skill drafts, and hook drafts.
- Manual smoke checklist and release/database safety guidance.

Completed milestones are summarized rather than recorded as a full changelog.
Use Git history when exact implementation dates or diffs are needed.
