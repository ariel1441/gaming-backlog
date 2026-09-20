# Notification Lab (local development)

The Notification Lab is a local-only developer tool for exercising the real notification inbox without buying a Steam game or calling Steam, RAWG, or other metadata providers.

It is visible in **Settings → Integrations** only when a Vite development
build explicitly sets `VITE_NOTIFICATION_LAB_ENABLED=true`. The API router is
dynamically imported only when `NODE_ENV=development` and
`NOTIFICATION_LAB_ENABLED=true`; requesting that server flag in any other
environment stops backend startup. The API also returns `404` for non-local
requests as defense in depth, so the mutation routes are not mounted in normal
or production deployments.

## Use

Set both local opt-in flags to `true`, restart both development servers, and
sign in to a normal local account (not a guest demo session). Then choose a
scenario and select **Create demo**. Reload the app once it reports success,
then open the normal notification bell.

Available scenarios:

- `all` — all of the following together
- `new-game` — matched, unplayed Steam acquisition
- `started-playing` — matched acquisition with Steam playtime
- `existing-game` — a Backlog game with an explicit Playing suggestion
- `unmatched` — acquisition that cannot be added until matched
- `price-drop` — price drop that is not a sale
- `sale-started` — grouped sale-started and price-drop facts
- `sale-ended` — legacy sale-ended and price-increase facts, retained only to verify they stay out of the notification inbox
- `wishlist-update` — informational Wishlist card with a long title
- `wishlist-removed` — standalone Wishlist removal
- `purchase-pair` — new ownership plus its paired likely-purchased removal; only the acquisition should be delivered
- `wishlist-priority` — a grouped Wishlist order-change summary

The local authenticated endpoints are also intended for developer/agent use:

- `POST /api/dev/notification-lab/seed` with `{ "scenario": "all" }` (or one scenario above)
- `POST /api/dev/notification-lab/reset`

Creating a demo first removes the previous lab fixture set. Reset removes only rows carrying the Notification Lab marker. It also removes Backlog games that were created by adding a lab fixture, but preserves a real existing game if a fixture was manually linked to it.

Fixtures use a reserved local Steam account only when the signed-in local user has no active Steam connection. An existing local Steam connection is reused and never removed by Reset.

## What it exercises

Fixtures are durable local database rows using the normal inbox path: an active Steam account, integration run, completed sync job, Steam source/candidate where needed, and activity event. The normal notification panel, candidate lookup, add/link/dismiss/status actions, grouping, price formatting, and inbox receipts therefore run as they do outside the lab. The matched new-game fixtures include full local catalog genres/tags, so they also exercise personal-genre chips when the signed-in user owns matching personal genres.

It deliberately does not test provider ingestion. Keep `STEAM_MOCK_OWNED_GAMES_JSON` contracts for source-to-sync reconciliation coverage.
