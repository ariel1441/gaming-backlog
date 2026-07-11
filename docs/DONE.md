# Completed Milestones

Last updated: 2026-07-11

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

## Documentation And Workflow

- Durable repository rules in `AGENTS.md`.
- Current architecture handoff in `SYSTEM_CONTEXT.md`.
- Human AI-workflow guidance, templates, local skill drafts, and hook drafts.
- Manual smoke checklist and release/database safety guidance.

Completed milestones are summarized rather than recorded as a full changelog.
Use Git history when exact implementation dates or diffs are needed.
