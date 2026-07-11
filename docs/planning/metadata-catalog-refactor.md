# Catalog And Metadata: Remaining Decisions

Last updated: 2026-07-11

Catalog/Discover V1 and the Steam-compatible catalog foundation are complete.
Their completed scope is summarized in [`../DONE.md`](../DONE.md); current
architecture lives in [`../SYSTEM_CONTEXT.md`](../SYSTEM_CONTEXT.md). This file
contains only unresolved catalog and metadata work.

## Reliability First

- Add deadlines to RAWG and Steam provider calls.
- Distinguish provider outage from a legitimate empty search result.
- Do not cache failed provider responses as successful empty results.
- Fix catalog collection pagination gaps.
- Bound public metadata hydration and cache growth.
- Make catalog identity upserts concurrency-safe.
- Recheck cache invalidation for metadata and hour-source changes.

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

1. Fix audit reliability and concurrency findings.
2. Add focused real-database and provider-failure tests.
3. Implement catalog-match repair.
4. Choose the wishlist/ownership relationship model before a Unified Library.
5. Expand sources or automation only when the preceding contracts are stable.
