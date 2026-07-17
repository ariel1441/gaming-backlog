# Catalog And Metadata: Remaining Decisions

Last updated: 2026-07-11

Catalog/Discover V1 and the Steam-compatible catalog foundation are complete.
Their completed scope is summarized in [`../DONE.md`](../DONE.md); current
architecture lives in [`../SYSTEM_CONTEXT.md`](../SYSTEM_CONTEXT.md). This file
records the completed reliability baseline only to prevent old audit items from
being reopened, followed by unresolved catalog and metadata work.

## Completed Reliability Baseline

The audit-era provider deadlines, typed outage behavior, failed-response
handling, collection pagination, bounded hydration/cache behavior, and
concurrency-safe catalog identity work are complete. See [`../DONE.md`](../DONE.md).

Remaining reliability work should be evidence-driven:

- Recheck cache invalidation only for a demonstrated metadata or hour-source
  correctness gap.
- Add database-aware readiness and safe catalog/job diagnostics through the
  operational follow-up in [`../ROADMAP.md`](../ROADMAP.md).
- Keep real-library and provider-outage regression coverage focused on newly
  changed behavior.

## Catalog Identity And Matching

- Let a user repair/change the catalog match of an existing backlog item.
- Decide whether the same catalog game may appear more than once for a user.
- Define editions, remasters, DLC, bundles, and platform variants.
- Keep user match decisions separate from global provider mappings.
- Improve match memory only when a correction can be stored without affecting
  unrelated users.

## Field Ownership And Overrides

- Document which fields belong to the user and which belong to shared catalog
  metadata.
- Add editable metadata overrides only after a concrete user need is identified.
- Refine manual, HLTB, RAWG, and Steam hours labels and precedence.
- Ensure an explicit user lock cannot be overwritten by enrichment or Insights.

## Wishlist, Ownership, And Library Model

- Decide whether wishlist remains a backlog status or becomes a user/catalog
  relationship.
- Design a unified relationship model only if the product commits to a broader
  Library covering backlog, wishlist, ownership, hidden, and ignored games.
- Preserve Steam as a private user-specific source layer rather than replacing
  catalog identity.

## Future Providers And Automation

- Consider IGDB or other providers only after RAWG/Steam reliability is stable.
- Add automatic/background refresh only with bounded jobs, quota controls,
  failure visibility, and operational recovery.
- Keep public serializers free of provider-specific private ownership data until
  explicit privacy settings exist.

## Implementation Order

1. Choose the wishlist/ownership relationship model before a Unified Library.
2. Define edition, remaster, DLC, bundle, and platform-variant identity.
3. Add user metadata overrides only for demonstrated needs.
4. Expand providers or automation only when the selected product feature
   requires them and existing reliability contracts remain intact.
