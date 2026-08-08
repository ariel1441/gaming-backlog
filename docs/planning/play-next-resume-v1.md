# Play Next & Resume V1

Last updated: 2026-07-25

Status: implemented and promoted to `main` in July 2026. This is the historical
V1 product and implementation brief; current code and `SYSTEM_CONTEXT.md` are
authoritative.
Future mood and session matching is planned separately in
[`play-next-session-matching-v2.md`](play-next-session-matching-v2.md).

This plan turns the findings in
[`../reviews/gaming-backlog-competitive-landscape-2026.md`](../reviews/gaming-backlog-competitive-landscape-2026.md)
into one bounded product track. Some final UI details differ from the original
brief where later review approved focused polish.

## Product Goal

Help an owner move through one coherent loop:

**choose a few credible options -> start deliberately -> return with context**

This is not another full-library view. Backlog remains the place to organize
the collection; Play Next is the focused place to make today's decision.

V1 succeeds when a user can:

1. Keep a small, explicitly ordered shortlist.
2. See active games and remember the next useful action.
3. Start a queued game without losing an existing date or silently changing
   other data.
4. Get a few understandable suggestions from data the app already trusts.

## Settled V1 Direction

- Add a dedicated private route at `/next-up`, labeled **Play Next**.
- Store Next Up as a separate ordered relationship. Do not reuse game status,
  backlog position, manual-list position, smart-list rank, or favorite rank.
- Derive Continue Playing from current game status/date semantics. It is not a
  second manually ordered queue.
- Store one private `resume_note` on the game. It remains available if the
  status changes, but V1 emphasizes it for active games.
- Make **Start playing** an explicit atomic action.
- Use deterministic, explained choices from existing database fields. V1 must
  not make provider calls on page load and does not need AI.
- Keep the queue and resume note private. Do not add them to public profiles,
  public APIs, or share URLs.
- Keep Surprise Me, with an explicit choice between the Next Up queue and the
  eligible backlog.
- Do not add mood, energy, installed state, goals, streaks, session history,
  persistent recommendation exclusions, or a general event model in V1.

## Information Architecture

### Navigation

- Desktop sidebar: add **Play Next** to primary navigation immediately after
  Backlog.
- Mobile: include Play Next in the More sheet for V1. The bottom bar already
  has four product destinations plus More; do not add a sixth item.
- Add Play Next to the optional default landing-page preference after the route
  is stable.
- Keep Backlog as the default for existing users.

### Page order

1. **Page header**
   - Title: Play Next.
   - Supporting copy: "Choose what to play and remember where you left off."
   - Primary action: Add games.
   - Small queue count; no gamified pressure or overdue language.
2. **Pick a game**
   - Up to three explained choices: Your priority, Quick win, and Worth
     returning to.
   - One prominent action per choice.
3. **Continue playing**
   - Active games with their private Next time note and relevant existing
     activity context.
4. **Next Up**
   - The ordered queue, optimized for a short list rather than library
     browsing.

If a section has no useful content, collapse it or replace it with one specific
next action. Do not show a stack of generic empty panels.

### Layout sketch

Desktop:

```text
+-----------------------------------------------------------------------+
| Play Next                                      [3 in queue] [Add games]|
| Choose what to play and remember where you left off.                  |
+-----------------------------------------------------------------------+
| Pick a game                                                           |
| [Your priority]          [Quick win]          [Worth returning to]     |
| Cover + reason + action  Cover + reason       Cover + Next time note  |
+-----------------------------------------------------------------------+
| Continue playing                                                      |
| [Cover] Game title    Next time: ...             [Continue] [...]     |
| [Cover] Game title    Add a Next time note       [Continue] [...]     |
+-----------------------------------------------------------------------+
| Next Up                                                               |
| [drag] 1 [Cover] Game title  Status  ~8h       [Start playing] [...]  |
| [drag] 2 [Cover] Game title  Status  --         [Start playing] [...]  |
| Later (4)                                                        [v]  |
+-----------------------------------------------------------------------+
```

Mobile keeps the same section order, turns the recommendation row into a
horizontal snap list or short stack, and changes each queue row to:

```text
+--------------------------------------+
| 1  [Cover] Long game title           |
|            Status · about 8h         |
| [Start playing]                [...] |
+--------------------------------------+
```

## Core User Flows

### Add to Next Up

Entry points:

- **Add games** on the Play Next page opens a searchable sheet.
- **Add to Next Up** appears in the owner action menu in game details.
- Backlog cards should use an overflow/action menu instead of adding another
  permanently visible icon to already dense cards.

Rules:

- Allow owner games that are not in the semantic `done` or `playing` groups.
  An explicit user choice may include an otherwise low-priority or ungrouped
  status.
- Do not allow duplicates.
- Active games belong in Continue Playing, not Next Up.
- Adding appends to the queue and confirms the resulting position.
- A successful action updates all visible instances and shows a toast.

The add sheet should search the owner's eligible games and initially suggest:

- short games with a known HLTB estimate;
- games in the current "plan to play soon" status;
- recently added games only when a trustworthy added timestamp exists.

Unknown duration must remain unknown; it must not be treated as zero.

### Reorder and remove

- Desktop supports drag reorder using the existing dnd-kit interaction pattern.
- Keyboard and mobile users receive Move up, Move down, Move to top, and Remove
  actions. Dragging must not be the only way to reorder.
- Persist the final order through one reorder request rather than one request
  per moved row.
- Use optimistic movement with rollback and an error toast if saving fails.
- Removal is reversible enough to use a normal action and toast; it does not
  require a destructive confirmation dialog.

The page presents positions 1-7 as the focused queue. Extra entries remain
ordered under a collapsed **Later** group. This is guidance, not a hard
membership limit.

### Start playing

Start playing is available on eligible queued games and explained picks.

In one backend transaction:

1. Verify that the game belongs to the authenticated user.
2. If the game is not already active, change its raw status to `playing`.
3. Set `started_at` to the current date only when it is null.
4. Never overwrite an existing start date.
5. Never change or infer a finish date in this action.
6. Remove the game from Next Up.
7. Compact the remaining queue order.
8. Return the updated game and queue state.

The confirmation sheet previews only fields that will change. It should say
when an existing start date will be kept. After success, show the game in
Continue Playing and offer **Add a Next time note**.

Steam activity can suggest that a user review a game's status, but it must
never invoke Start playing automatically.

### Add or update a resume note

- UI label: **Next time**.
- Helper copy: "Where were you, and what do you want to do next?"
- Plain text, private, optional, maximum 1,000 characters.
- Edit from a Continue Playing item and from the game details modal.
- Save explicitly in a small sheet/modal; do not save on every keystroke.
- Support Clear note without deleting or changing the game.
- Display preserved line breaks and clamp the page preview with an expand or
  edit action.

V1 has one current note, not a journal. Chapter, progress percentage, pause
reason, links, multiple playthroughs, and note history belong to later models.

### Surprise Me and explained picks

Surprise Me has an explicit pool control:

- **Next Up**: all eligible queued games.
- **Backlog**: all owner games outside semantic `done` and `playing` groups.

It must explain the chosen pool and never silently fall back from an empty queue
to the entire backlog. An empty pool links to the action that can fill it.

The Play Next page also derives no more than one result for each lane:

- **Your priority**: the first eligible item in Next Up.
- **Quick win**: the eligible planned game with the shortest known HLTB
  estimate; prefer the queue when it contains a valid candidate, then consider
  the wider eligible backlog.
- **Worth returning to**: an active game with a Next time note first; otherwise
  the least recently played active Steam game when that timestamp exists;
  otherwise the active game with the oldest start date.

Each card shows its rule in plain language, for example "First in your queue"
or "Shortest known estimate: about 6h." Missing data removes a lane rather than
inventing a reason. Ties use stable game ID ordering so results do not jump.

**Not today** dismisses a choice only for the current page session and selects
the next valid candidate in that lane. Persistent expiry/exclusion rules are
deferred.

## UI And Responsive Behavior

### Desktop

- Use the existing `AppPage` and `PageHeader`.
- Use a compact explained-pick row below the header.
- Place Continue Playing above the queue because resuming an active game is
  normally lower friction than starting another one.
- Use a single main column for the queue. Avoid recreating the Backlog cover
  grid or a dashboard of equal-weight panels.
- Queue rows use a small cover, title, status, duration when known, position,
  drag handle, one primary Start playing action, and an overflow menu.

### Mobile

- Use a single column in the same information order.
- Queue actions must meet touch-target sizing and remain usable with long game
  titles and missing covers.
- Use a bottom sheet for adding games, editing Next time, confirmation, and
  secondary row actions.
- Do not require horizontal scrolling.
- Do not use drag as the only reorder control.
- Avoid a persistent sticky action bar until browser testing proves it does not
  conflict with the existing mobile navigation.

### Shared UI

Prefer existing primitives and semantic tokens:

- `Panel`, `SectionHeader`, `GameCover`, and `StatusBadge` for presentation.
- `Button`, `IconButton`, `ActionMenu`, and `SegmentedControl` for actions.
- `Sheet`, `Modal`, `Textarea`, `EmptyState`, and skeletons for states.
- `useToast` for feedback and `useConfirm` only where the previewed Start
  playing status change warrants confirmation.

Do not add page-specific color roles. Queue position, recommendation reason,
Steam metadata, and semantic game status must remain visually distinct.

## Empty, Loading, Error, and Edge States

- **No queue, no active games:** one welcoming empty state with Add games and
  Surprise Me from Backlog.
- **No queue, active games exist:** Continue Playing stays useful; Next Up asks
  the owner to build a shortlist.
- **Queue exists, no explained Quick win:** omit that lane and retain the known
  candidates.
- **No active games:** omit Continue Playing; do not imply an error.
- **Deleted game:** cascade queue membership and remove it locally.
- **Game becomes done elsewhere:** exclude it immediately and remove stale
  queue membership through the status-update write path.
- **Game becomes active elsewhere:** move it to Continue Playing and remove it
  from Next Up through the status-update service path.
- **Missing cover or metadata:** preserve the existing fallback and show only
  facts that exist.
- **Concurrent reorder:** serialize per user and return canonical order. On a
  stale response, refetch rather than merging two orders.
- **Page request fails:** use the shared retryable page error.
- **Action request fails:** keep existing page content and use a toast.
- **Authentication pending:** show a shape-matching skeleton, not a false empty
  queue.

## Owner, Guest, and Public Boundaries

- Authenticated saved-account owners can read and mutate only their own queue
  and notes.
- Guest/demo users receive the same writable experience against their cloned
  private data. Existing demo expiration/conversion behavior remains the data
  lifecycle boundary.
- Signed-out users receive the existing sign-in/demo gate.
- Public profiles and public game payloads never include queue membership,
  position, or `resume_note`.
- Read-only/public card and modal variants never render queue or note controls.

## Data Model

Add an independent relationship table:

```sql
CREATE TABLE user_next_up_games (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id)
);

CREATE INDEX idx_user_next_up_games_user_position
  ON user_next_up_games (user_id, position, game_id);
```

Use the existing relationship-integrity pattern to enforce that `game_id`
belongs to `user_id`. A route check alone is not sufficient protection against
future write paths. Do not require positions to be globally unique; normalize
them transactionally and sort by `(position, game_id)` during recovery.

Add to `games`:

```sql
resume_note TEXT
  CHECK (resume_note IS NULL OR char_length(resume_note) <= 1000)
```

Normalize blank/whitespace-only notes to null. Update both the tracked migration
and `backend/schema.sql`. The migration must not seed queue membership or infer
notes from thoughts.

## API Shape

Keep authenticated routes under a focused `/api/next-up` router:

- `GET /api/next-up` returns canonical ordered membership plus the fields
  needed by the page.
- `POST /api/next-up/:gameId` appends one eligible owned game.
- `DELETE /api/next-up/:gameId` removes it and compacts order.
- `PUT /api/next-up/reorder` accepts the complete ordered game-ID list.
- `POST /api/next-up/:gameId/start` performs the atomic Start playing flow.

Extend the normal game update contract for `resume_note` so game details and
the page share one validation/write path. Do not create a second note endpoint
unless implementation demonstrates that the existing update payload is too
broad.

All handlers require authentication, Celebrate/Joi validation, user-scoped
queries, `httpError` helpers, and the central error response shape. Reorder and
Start playing must use database transactions.

Any existing owner write that changes a game into the semantic `playing` or
`done` groups must remove Next Up membership in the same transaction. This
keeps the relationship valid when status changes through game editing, not
only through the new Start playing endpoint.

The frontend should add a focused `nextUpService` and keep shared game state
coherent through the existing games provider rather than fetching a conflicting
second copy of each game.

## Recommended Implementation Phases

### Phase 1: Queue and note foundation

- Migration, schema, owner-integrity trigger, validators, routes, and service.
- Add/remove/reorder/start transaction behavior.
- `resume_note` in private game reads and writes, excluded from public reads.
- Authorization, transaction, validation, and schema contract tests.

### Phase 2: Focused page

- Lazy route, navigation, service integration, loading/error/empty states.
- Queue rows, add sheet, reorder controls, Start playing confirmation.
- Continue Playing and Next time note editing.
- Mobile behavior and all four themes.

### Phase 3: Explained decision support

- Pure tested selection utilities for the three lanes and Surprise Me pools.
- Page-session Not today behavior.
- Reason labels and missing-data fallbacks.
- Add Play Next to the default landing-page preference.

Keeping decision support in Phase 3 prevents recommendation polish from
blocking the trustworthy queue foundation.

## Verification Boundary

Implementation should include focused coverage for:

- cross-user queue reads and writes;
- duplicate/invalid/done/active additions;
- canonical reorder, stale IDs, rollback, and concurrent requests;
- Start playing preserving an existing start date and removing membership
  atomically;
- resume-note validation, blank normalization, and exclusion from public
  payloads;
- deterministic explained-pick selection and missing-data behavior;
- owner, guest/demo, signed-out, and public read-only rendering;
- long titles, missing covers, empty sections, mobile actions, keyboard reorder,
  and all four themes.

Schema work must run the local migration check once at the end. Full CI remains
the release gate.

## Product Decisions To Review

The plan recommends these defaults:

1. **Dedicated route:** `/next-up`, not a Backlog tab.
2. **Soft queue focus:** positions 1-7 are prominent; extra entries appear
   under Later. No hard cap.
3. **Start behavior:** always remove the started game from Next Up.
4. **Resume note:** one private 1,000-character Next time field.
5. **Recommendations:** three deterministic explained choices in V1, delivered
   after the queue page foundation.
6. **Not today:** current-page-session only.
7. **Mobile navigation:** Play Next starts in More, not as a sixth bottom item.

The main alternative worth discussing is whether Start playing should ask
"Keep in Next Up" each time. The recommended automatic removal keeps the queue
meaning clear and the page still preserves the game in Continue Playing.

## Explicitly Deferred

- Hard queue limits, due dates, overdue warnings, debt language, or streaks.
- Mood, energy, input method, multiplayer, installed state, and platform
  matching before those fields have durable ownership.
- AI ranking or chat.
- Persistent Not today expiry and Never suggest controls.
- Session logs, progress history, chapters, pause reasons, and playthroughs.
- Public queue or public resume context.
- Notifications, reminders, goals, and completion prompts.
- Automatic Start playing inferred from Steam activity.
