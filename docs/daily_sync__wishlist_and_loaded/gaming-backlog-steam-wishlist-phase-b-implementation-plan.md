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

At the original checkpoint, closeout review still needed to assess achievement retry/cooldown eligibility,
changed-game provider request budgets, and final verification/release requirements.
No production daily scheduler was configured. The earlier unused
`WishlistBacklogSection.jsx` was preserved in the checkpoint; the live Backlog uses
`useWishlist` and `composeBacklogWishlist` instead. Removing the unused component
is a possible later cleanup, not required to preserve the current data or UI.

## Local closeout implementation, 2026-09-06

The review above is followed by a local reliability patch recorded in Git history. Migration 032
adds pending achievement work, next-attempt/last-attempt timestamps, retry counts
and source revisions. Source changes and pending work commit together; cancelled
or completed jobs cannot discard it. Unchanged Library runs select up to 250 due
sources in addition to current activity. Repeated failure backs off from six hours
to seven days; the daily trigger determines when due work is actually attempted.
Failed/private/unavailable refreshes retain successful counts and report partial
health. Revisions and account locks fence late manual and queued responses.

Disconnect or replacement retires the linked account, clears current factual source
caches and pending retries, archives active Steam memberships and resolves old open
Steam review events. Ordinary games, matching decisions, local Wishlist intentions
and saved membership history remain. Reconnection establishes a new factual baseline;
old account order/date/empty-confirmation evidence does not become the new baseline.
The daily runner carries the originally selected account ID into both domains and
skips work if that identity or opt-in changes. Manual sync remains available when
daily sync is disabled.

Existing failed/unavailable source summaries also become eligible when due. Historical
cooldown skips that left neither pending state nor an error cannot be reconstructed;
an explicit manual achievement refresh can repair such pre-patch stale summaries.

Verification completed locally on 2026-09-06:

- `npm run env:check`: localhost PostgreSQL confirmed.
- `npm run db:migrate:local`: only migration 032 applied; 030/031 stayed unchanged.
- One focused `node --test` invocation passed across the closeout, Library,
  fencing, Wishlist and Wishlist regression PostgreSQL contracts, service/provider
  unit tests, Wishlist schema tests and daily-runner tests (11 files).
- After adding the older-version disconnect/relink regression, only
  `node --test --test-reporter=spec backend/steamDailyCloseout.contract.test.js`
  was rerun: 8 passed, no failures or skips. Its provider boundary counts six
  Steam requests for 1,000 saved apps plus two changed linked games and one
  acquisition, and two requests for an unchanged snapshot. It also covers
  exhausted retries, cooldown persistence, cancellation after source persistence,
  stale manual responses, private responses, account history and scheduled opt-out.
- `git diff --check` passed. The only frontend change labels disconnected history
  as "Previous Steam connection". Browser checks were not repeated for this text
  change; full lint/build/browser CI remains the release gate.

No real Steam sync, production configuration, deployment or scheduler activation
was performed. The next phase is independent review/CI and a separately authorized
release, not further A/B product scope.
