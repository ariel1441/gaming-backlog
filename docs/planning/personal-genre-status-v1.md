# Personal Genre And Status Model V1

Status: planning draft for approval

Last updated: 2026-08-08

## Goal

Replace the two fragile library classification contracts without breaking the
current product:

- Personal genres move from one comma-separated `games.my_genre` field to
  normalized, reusable, owner-scoped genre records and ordered game membership.
- Statuses gain stable internal keys, explicit display labels, descriptions,
  ranks, and semantic groups instead of using the visible sentence as identity,
  storage value, and behavior switch at the same time.

This foundation must be stable before the backlog table, Needs Attention,
Insights V2, modular public profiles, or automatic Steam sync depend on it.

## Scope

### Included

- Additive PostgreSQL migrations and matching `backend/schema.sql` updates.
- Backfill of every existing personal genre and game status.
- Owner-scoped personal genre create, reuse, rename, merge, and safe deletion.
- Structured status metadata and stable keys.
- Backward-compatible game read and write contracts during rollout.
- Adoption by backlog forms, filtering, sorting, Lists, Insights, Play Next,
  Steam suggestions/import, CSV export, demo cloning, and public serialization.
- Focused migration, authorization, API-contract, utility, and UI coverage.

### Excluded

- Personal tags, bulk editing, saved views, archive/hide, or global search.
- User-created statuses or per-user status ordering.
- Public-profile privacy controls beyond preserving the current public output.
- Insights V2 charts, the backlog table, or automatic Steam scheduling.
- Automatic genre inference from RAWG/provider genres.

## Current-State Findings

- `statuses.status` is both the database foreign-key target and the visible
  label. `games.status` stores that text directly.
- Semantic behavior is maintained separately in hard-coded backend and frontend
  group definitions. Several flows also compare labels such as `playing` and
  `finished` directly.
- The status list API returns an array of strings, and frontend fallbacks repeat
  all twelve labels.
- `games.my_genre` is a nullable string capped at 120 characters. Forms join
  selected genres with commas, while filtering, smart Lists, Play Next, CSV,
  and Insights split the value again.
- Game creation is available through the normal game route, Discover/catalog,
  and Steam import. Demo sessions clone the legacy fields directly.
- Public game reads currently select the full game row, so the new contract must
  use an explicit public allowlist before it exposes owner-scoped genre IDs or
  management metadata.

## Recommended Product Decisions

### Personal genres

- A personal genre belongs to exactly one user and can be attached to many of
  that user's games.
- Normalize identity by trimming, collapsing internal whitespace, and comparing
  case-insensitively. Preserve the owner's chosen display casing.
- Do not automatically treat punctuation variants as equal. Users can resolve
  those through merge, which is safer than guessing.
- Default limits for approval: 50 characters per genre and 10 personal genres
  per game. Both limits are server enforced.
- Creating a custom value from a game form creates or reuses the owner's genre
  record within the same transaction as the game write.
- Rename updates the reusable genre everywhere. If the normalized target already
  exists, require the explicit merge action instead of silently combining it.
- Merge moves all memberships to the target, deduplicates them, preserves the
  lower existing membership position, and deletes the source atomically.
- Delete succeeds only for an unused genre. A used genre returns `409` and the
  UI offers merge or removal from affected games.
- Provider genres remain separate in naming, UI treatment, filtering, and API
  fields. No automatic copying occurs.

### Statuses

- Status definitions remain global in V1; users do not create or reorder them.
- `statuses.status` becomes a documented immutable legacy alias during the
  compatibility period. New code identifies a status by `statuses.key`.
- Display-label edits never change identity, foreign keys, filters, URLs, or
  semantic behavior.
- The migration preserves every existing rank and semantic-group result. Any
  regrouping is a separate product decision after the structural rollout.
- Retiring a status uses `is_active = false`; historical games keep their
  status and label. A retired status is readable but unavailable for new
  selection.
- The initial wording change should be conservative. Approve final labels and
  descriptions before the frontend-adoption slice; do not combine statuses in
  the structural migration.

## Proposed Stable Status Map

The keys and existing semantic groups below are the proposed V1 identities.
Suggested labels are review copy, not an instruction to rewrite data during the
first migration.

| Legacy alias | Stable key | Suggested label | Existing group |
| --- | --- | --- | --- |
| `playing` | `playing` | Playing | `playing` |
| `plan to play soon` | `play_soon` | Play soon | `planned` |
| `plan to play` | `planned` | Plan to play | `planned` |
| `played and should come back` | `returning` | Return to it | `returning` |
| `play when in the mood` | `when_in_mood` | Play when in the mood | `planned` |
| `maybe in the future` | `someday` | Maybe someday | `planned` |
| `recommended by someone` | `recommended` | Recommended | `other` |
| `not anytime soon` | `not_soon` | Not anytime soon | `other` |
| `played a bit` | `sampled` | Played a bit | `other` |
| `played and wont come back` | `dropped` | Dropped | `other` |
| `played alot but didnt finish` | `done_unfinished` | Played a lot, didn't finish | `done` |
| `finished` | `finished` | Finished | `done` |

The current UI already presents the legacy `played and wont come back` value as
**Dropped** without changing storage or behavior. The larger status refactor
must preserve that label while introducing stable keys and group-backed
semantics.

Before implementation, explicitly approve the `sampled`, `dropped`, and
`done_unfinished` wording and confirm whether their existing semantic groups
remain correct. Preserving those groups is the compatibility-safe default.

## Target Database Model

### Status foundation

Add to `statuses`:

- `key TEXT UNIQUE`
- `display_label TEXT`
- `description TEXT`
- `semantic_group TEXT`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`

Add `games.status_id INTEGER REFERENCES statuses(id)`. Backfill it by joining
the immutable legacy `games.status` value to `statuses.status`, then make it
`NOT NULL` after the backfill is verified.

During V1, writes populate both `games.status_id` and the legacy `games.status`
alias. Reads join by `status_id`. Keeping the legacy column synchronized allows
the previous application version to run safely during a rolling deployment.
Dropping it is explicitly outside V1 and requires production-observation data.

### Personal genre foundation

Create `user_personal_genres`:

- `id`
- `user_id REFERENCES users(id) ON DELETE CASCADE`
- `name`
- `normalized_name`
- `created_at`, `updated_at`
- unique `(user_id, normalized_name)`
- unique `(user_id, id)` to support ownership-coupled foreign keys

Create `game_personal_genres`:

- `user_id`
- `game_id`
- `personal_genre_id`
- `position`
- primary key `(game_id, personal_genre_id)`
- unique `(game_id, position)`
- foreign key `(user_id, game_id)` to an owner-coupled game key
- foreign key `(user_id, personal_genre_id)` to the owner-coupled genre key

The redundant `user_id` is intentional: it lets PostgreSQL prevent cross-owner
genre membership instead of relying only on route authorization.

Backfill `games.my_genre` with a deterministic SQL split, trim, case-insensitive
deduplication, and first-seen ordering. Keep `my_genre` during V1 as a derived,
comma-separated compatibility mirror. It must no longer be the authoritative
source after the new write path ships.

## API Compatibility Contract

### Status metadata

Add a structured authenticated metadata response, preferably
`GET /api/meta/statuses`, returning ordered objects:

```json
{
  "statuses": [
    {
      "key": "playing",
      "label": "Playing",
      "description": "Currently being played.",
      "rank": 1,
      "semanticGroup": "playing",
      "active": true
    }
  ],
  "buckets": {
    "backlog": ["planned", "playing", "returning"],
    "done": ["done"]
  }
}
```

Keep `GET /api/games/statuses-list` returning legacy strings until all deployed
clients use the structured endpoint.

### Game reads

Private game responses add:

- `status_key`
- `status_label`
- `status_group`
- `personal_genres: [{ id, name }]`

They retain `status`, `status_rank`, and derived `my_genre` during V1.

Public game responses must be explicitly serialized and expose only status key,
display label, semantic group, rank, and personal genre names. They must not
expose personal genre IDs, owner IDs, private management fields, Steam fields,
thoughts, Next Up state, or resume notes.

### Game writes

New clients send `status_key` plus `personal_genres`, where each entry is either
an owned genre ID or a new validated name. The server resolves everything
inside the game transaction.

During rollout, the backend also accepts legacy `status` and `my_genre` fields.
If both old and new fields are present, the new fields win and contradictory
values produce a validation error rather than a silent choice.

### Personal genre management

Add authenticated, owner-scoped endpoints for:

- list/create
- rename
- merge into another owned genre
- delete when unused

All validation belongs in `backend/validators/`; conflicts and not-found cases
flow through the central error handler. Merge and game assignment are
transactional. Cache invalidation must cover games, Lists, public reads where
applicable, and Insights.

## Implementation Slices

Each slice should be implemented, reviewed, verified, and released separately.

### Slice 1: Stable status identity

- Add and backfill status metadata and `games.status_id` through an additive,
  idempotent migration.
- Update `backend/schema.sql` and schema contracts.
- Add the structured status metadata endpoint.
- Make backend semantic helpers consume database-backed keys/groups where the
  request already loads status rows, with a deterministic fallback for startup
  and tests.
- Return both legacy and structured status fields from private/public APIs.
- Convert Finish Game, ordering/rank locking, catalog add, Steam suggestions,
  and import grouping away from display-label decisions.
- Do not change visible labels in this slice.

### Slice 2: Personal genre persistence and API

- Add the two owner-scoped genre tables and backfill existing `my_genre` data.
- Add a small genre service for normalization, resolution, assignment, rename,
  merge, delete, and compatibility-string derivation.
- Add validators, management routes, and explicit serializers.
- Update all game creation/edit paths, Discover add, Steam import, and demo
  cloning. Demo cloning must remap template genre IDs to the guest's own genre
  records rather than sharing owner-scoped IDs.
- Preserve old request and response fields.

### Slice 3: Frontend adoption and management UI

- Change `useStatuses` and the status service to structured definitions with a
  safe fallback containing keys, labels, ranks, and semantic groups.
- Store/filter by stable status keys and render display labels.
- Change game form state and shared list utilities to consume genre arrays;
  retain compatibility parsing at one boundary only.
- Add personal genre management to Settings with rename, merge, unused-delete,
  clear conflict feedback, keyboard access, and mobile behavior.
- Update Backlog, Game Modal, Discover, Lists, Play Next, CSV, existing
  Insights, Reviews, Steam Library, owner/demo, and public read-only flows.

### Slice 4: Compatibility hardening and wording

- Approve and apply final status labels/descriptions without changing keys.
- Verify no feature branches on display labels or comma-separated genres.
- Add production-safe mismatch diagnostics for legacy/new fields.
- Keep compatibility columns and endpoints until at least one production
  release has shown no mismatches. Their eventual removal is a later migration.

## Compatibility Checklist

- Default ordering remains rank, position, and ID.
- Drag reorder remains restricted to compatible rank groups.
- Finish Game still resolves the `finished` identity atomically and removes
  Next Up membership.
- Started/finished date automation uses semantic identity, not label text.
- Lists and Play Next preserve current membership and recommendations.
- Existing Insights totals and click-through filters remain unchanged.
- CSV keeps readable `status` and `genre` columns; optional stable-key columns
  can be added without removing the old headers.
- Steam suggestions store stable status identity while returning reviewed
  labels to the UI; sync never changes personal status automatically.
- Demo template cloning and guest conversion preserve independent ownership.
- Public profiles render approved labels and genre names without private IDs or
  fields.
- Old app and new app versions can both read and write during deployment.

## Verification

### Database

- Migration contract for all twelve status mappings, `NOT NULL` status IDs, and
  unchanged ranks/groups.
- Genre backfill cases for null/empty values, whitespace, case duplicates,
  repeated commas, ordering, and multiple users using the same display name.
- PostgreSQL rejection of cross-owner game/genre relationships.
- Rename, merge, and delete behavior under uniqueness conflicts.
- Apply `npm run db:migrate:local` once at the end of each schema slice.

### Backend

- Legacy-only, new-only, matching dual-field, and contradictory dual-field game
  mutations.
- Owner isolation for every genre-management endpoint.
- Status-key handling in create/edit, reorder, finish, catalog, Steam review,
  demo clone, Lists, public reads, and Insights invalidation.
- Explicit public serializer tests that assert private fields are absent.

### Frontend

- Add/edit with existing and newly created genres.
- Rename and merge reflected without a full-session reset.
- Status label changes leave filters, ordering, URLs, and semantic actions
  correct.
- Long genre names, ten-genre limit, empty states, mobile forms, keyboard use,
  guest/demo behavior, and public read-only behavior.
- Focused utility coverage for filtering, smart Lists, Play Next, CSV, and
  existing Insights using the structured fields.

## Release And Rollback

1. Release additive schema changes before code that requires them.
2. Release dual-read/dual-write backend compatibility.
3. Release the frontend adoption and management UI.
4. Observe mismatch diagnostics and old-client traffic before any cleanup.

Rollback means reverting application code while retaining additive tables and
columns. Because legacy fields stay synchronized, the previous application can
continue operating. Do not drop compatibility fields in the same release train.

## Approval Gates Before Slice 1

- Approve the stable key map.
- Approve the compatibility-safe semantic groups or explicitly request a
  separately reviewed regrouping.
- Approve final display labels/descriptions, with permission to defer wording
  changes until Slice 4.
- Approve the 50-character genre-name and 10-genres-per-game limits.
- Confirm that personal genres are reusable user-owned records, while personal
  tags remain a later feature.

Once these decisions are approved, implementation should start with Slice 1 in
a fresh implementation phase.
