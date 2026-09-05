# Steam Wishlist Phase B implementation record

Status: focused fixes implemented and verified locally on 2026-09-05, then saved
in local commit `cc8d105` (`feat(steam): add wishlist sync and harden daily updates`).
Not pushed or deployed. Full application suite and CI have not run for this candidate.
The next step is an independent A/B closeout review, not additional product scope.

Wishlist intent remains in `user_wishlist_items`; Steam membership and historical
removals remain in `steam_wishlist_items`. Wishlist sync never creates ordinary
`games` rows. Legacy wishlist-status games remain preserved and can be explicitly
moved into a lifecycle status. Moving refreshes the shared Backlog game collection.

Migration 030 remains unchanged. Additive migration 031 adds provider ordinals,
order-run attribution, display-metadata provenance, incremental ownership evidence,
and captured Steam account identity for queue jobs. Both migrations are reflected
in the fresh-install schema; 031 was applied to localhost during verification.

`GetWishlist` supplies membership, validated against the count response when
present. `GetWishlistSortedFiltered` supplies the exact provider sequence with a
complete `input_json` request. It repeats the full ordered ID array on each
100-item enrichment page; only a slice has store metadata. Merge enriched fields
without allowing later sparse entries to erase them. Reject membership/order drift.
Persist `provider_order` independently of Steam priority. Failed enrichment retains
previous good metadata/order and marks the run partial.

Steam covers combine `asset_url_format`, its `${FILENAME}` placeholder and the
returned asset identifier with `https://shared.fastly.steamstatic.com/store_item_assets/`.
Unqualified filenames are not displayable covers. Successful membership metadata
requires real names, absolute cover URLs and resolved tags; live browser checks
add image decoding rather than accepting a non-empty string as proof.

Failed, malformed, private and rate-limited responses preserve membership and
baseline. An ambiguous empty response cannot be forced into success. Initial empty
membership or removal of an existing list requires fresh validated empty evidence
and explicit confirmation. Transport `x-eresult` distinguishes omitted protobuf
zero fields from unsuccessful responses. Local intentions survive an empty Steam list.

Library and Wishlist use the existing durable queue. Job/account identity and lease
checks fence persistence and library follow-up writes. Disconnect/relink invalidates
active jobs. Library source/event writes and cursor/follow-up checkpoints now commit
in the same transaction. Likely-purchased activity requires ownership first observed
in a successful incremental library run, rather than historical baseline ownership.

The private Wishlist uses the shared Backlog toolbar, cards, compact cards, rows,
table, search, genre/tag and hours filters, sorting and direction controls. The
Backlog preference merges the complete active Wishlist into the shared display
pipeline, with deduplication against linked ordinary games. Projections remain
outside GamesProvider's mutation state and cannot edit, delete, reorder or enter
Play Next. Public profile data remains isolated. Pricing remains Phase C.

Verification performed:

- Focused provider, service, schema and frontend utility tests.
- Real PostgreSQL: 1,000-app library contract; atomic checkpoint rollback and stale
  account/lease rejection; Wishlist baseline and event contracts; full 436-item
  paginated ordinal persistence, eight legacy intentions, repair in place, partial
  metadata, collisions/cancellation, event rollback, empty/failure safety and API privacy.
- Focused ESLint: no errors; repository JSX unused-variable warnings remain.
- Chromium: desktop/mobile Wishlist controls, real CDN cover decoding and complete
  444-item Backlog preference presentation without lifecycle actions.
- Opt-in local PostgreSQL/API browser inspection using read-only connections:
  actual desktop/mobile screenshots and first/last provider order checked.

The local repair observed 435 current Steam memberships, all with absolute covers,
tags and persisted ordinals, plus eight unchanged local intentions (443 active).
One formerly current membership became historical. Ordinary game count stayed 601.
First provider item: Crimson Desert Enhanced. Last: Guildrun. These are observations
at verification time, not fixed assertions about future Steam account contents.

Closeout review still needs to assess achievement retry/cooldown eligibility,
changed-game provider request budgets, and final verification/release requirements.
No production daily scheduler was configured. The earlier unused
`WishlistBacklogSection.jsx` was preserved in the checkpoint; the live Backlog uses
`useWishlist` and `composeBacklogWishlist` instead. Removing the unused component
is a possible later cleanup, not required to preserve the current data or UI.
