# Personal Genre Suggestions: Agreed Product Decisions

**Status:** Implemented locally for Steam notifications, the existing-game review action, and Settings batch review. Verification and user UX review remain pending.
**Last consolidated:** 2026-09-20

## Purpose

When a newly detected Steam game is reviewed from the notification panel, suggest
the owner's personal genres alongside the existing suggested status. Suggestions
must reflect the owner's taxonomy rather than copying public provider genres.

The same suggestion engine supports an explicit review action on an existing
game and a batch review in Settings.

## Product boundaries

- Suggestions are private, owner-scoped, and never appear in public views.
- A provider's genre/tag is evidence, not a personal genre.
- No genre is silently created, assigned, removed, renamed, or merged.
- Existing Backlog games keep their status and personal genres unless the owner
  explicitly applies a change.
- A user can still make any manual genre changes in the normal game editor.
- A new custom personal genre remains manual until it has a configured rule or
  enough deliberately reviewed evidence. Do not guess from a similar name.
- Provider data must not be copied into the owner's personal genre list.

## Notification experience

Keep the existing status-first Steam decision flow.

1. A new unplayed Steam game suggests **Plan to play**.
2. A new game with observed Steam hours suggests **Playing**.
3. The status remains editable with the existing status control.
4. If confident genre suggestions exist, show one compact row above the primary
   Add button. If none exist, omit the row completely.

Example:

```text
Backlog status   [ Plan to play v ]   Suggested from no Steam hours

Genres   [ check Roguelike ] [ check Action ] [ check Indie ]  +2   Why?

[ Add to Backlog ]   Don't add
```

- Every genre shown as a suggestion starts **selected**.
- Clicking a selected chip deselects it before the game is added. Adding with no
  selected genres is allowed.
- Show at most three chips in the collapsed row; `+N` expands the remaining
  suggestions. Generate at most **five** suggestions for the notification.
- `Why?` is intentionally small. It can reveal short evidence such as
  `RAWG: Roguelite` or `Explicit co-op metadata`; it must not turn the panel into
  a rules explanation form.
- Keep a compact **+ Add genre** control beside the chips. It opens a searchable
  picker of the owner's existing personal genres; it never creates a genre there.
  The normal game editor remains the place for broader/manual editing.
- If the Steam candidate already links to a Backlog game, never show these genre
  controls or modify that game's personal genres.

## Metadata is a prerequisite

Genre suggestions require a resolved catalog match with usable, full metadata.
The notification flow must not treat a queued-after-import metadata repair as
good enough for genre suggestions.

Required order:

```text
Steam observation -> catalog match -> full metadata available
-> calculate suggestions -> render notification -> explicit import
```

- The frontend must consume server-calculated suggestions; it must not recreate
  rules from raw provider data.
- Metadata retrieval/repair needs an observable loading and retry state, for
  example `Getting game details…`.
- A temporary provider failure must not permanently strand an imported game with
  empty metadata. It must retry through the normal repair path.
- If metadata is truly unavailable after recovery, status/import controls still
  work and the genre row is omitted.

## Rule precedence

Apply evidence in this order:

1. Explicit owner decisions and per-game/per-series overrides.
2. Hard personal exclusions.
3. Normalized high-confidence metadata patterns. Provider ordering is not a
   confidence signal: RAWG genre/tag arrays are treated as unordered evidence.
4. Conservative genre-specific evidence.
5. No suggestion when evidence conflicts or is too weak.

Metadata spelling is normalized through explicit aliases only (for example
`Online Co-op`, `Deck Building`, `Character Action Game`, and FPS/TPS spellings).
It does not use fuzzy name matching. Existing personal genres act as conflict
constraints and are never re-suggested or modified.

A chip deselected during one import changes only that import. It must not create
a broad permanent rule. Later versions may offer an explicit "do not suggest
this for this game" control or derive rule proposals from repeated decisions.

## Agreed genre logic

### Roguelike

- Normalize `Roguelike` and `Roguelite` into personal **Roguelike**.
- `Action Roguelike` means melee/action-led Roguelike and may suggest both
  **Roguelike** and **Action**.
- Shooter Roguelike means **Roguelike + Shooter**, not Action.
- Deckbuilder or turn-based Roguelike means **Roguelike + Card Game and/or
  Strategy**, not Action.
- Bullet-heaven/survivor-like games do not receive Action by default.
- Do not infer Roguelike from procedural generation, permadeath, or a deck
  alone.

### Soulslike

- Soulslike is strict and review-led. Never infer it merely from difficulty,
  dark fantasy, melee combat, or generic Action RPG metadata.
- Soulslike suppresses both **Action** and **RPG**.
- Maintain explicit reviewed allow/deny decisions for this category.

### Co-op

- Explicit `Co-op`, `Local Co-op`, or `Online Co-op` is strong evidence.
- `Multiplayer` alone is not Co-op evidence.
- Known metadata misses, such as Remnant II, belong in a reviewed override list.

### Survival

- Suggest only when survival is a main or meaningful secondary game loop.
- Crafting, zombies, danger, resource collection, or an open world alone are
  insufficient.

### Shooter

- Shooter means aiming is a central gameplay skill.
- Do not classify a game as Shooter from Bullet Hell alone, magic/projectiles,
  puzzle/action games that happen to shoot, or survivor/bullet-heaven combat.
- A Shooter Roguelike is normally Shooter + Roguelike, not Action.

### Strategy, Card Game, and City Builder

- Clear Strategy, RTS, turn-based strategy, city-building, or deck-strategy
  evidence is useful.
- `Tactical` alone is too broad and must not drive Strategy suggestions.
- Card Game and City Builder mostly looked like personal cataloguing omissions,
  so they are suitable reviewable suggestions.

### Story Focus

- Story must be a main or second-main selling point, not merely present.
- It is generally a substantial, narrative-led experience rather than a short
  action middle.
- Suppress Story Focus for Roguelikes and Soulslikes.
- `Story Rich` alone is too broad. Visual Novel and Interactive Fiction are
  stronger clues but still require sanity checks.

### Horror, Stealth, Relaxing, and Open World

- These remain conservative, reviewable suggestions.
- Horror must be central; noisy tags have produced clear false positives.
- Stealth means a dedicated stealth identity, not optional crouching/stealth
  sections.
- Relaxing is a low-volume personal mood label and needs strong calm/cozy
  evidence.
- Open World remains review-only because metadata mixes open worlds, open zones,
  sandboxes, and large levels.

### Platformer and Beat 'em Up

- Both are intentionally high-precision and low-priority: missing a partial
  match is acceptable.
- Platformer requires movement/platforming as a central identity. Do not infer it
  just because a game is a 2D action game, action Roguelike, Metroidvania, or
  Soulslike.
- Beat 'em Up requires strong Beat 'em Up or Character Action evidence. `Hack
  and Slash` alone is insufficient. Do not infer it merely from melee Roguelike
  combat or Soulslike combat.

### Action

RAWG's generic Action genre is evidence only; it is too broad for this personal
label. The export comparison found strong recall but many extra matches.

- Always suppress Action for **Soulslike**, **Shooter**, **Stealth**, and
  **Relaxing**.
- A melee/action-led Roguelike may receive Action under the Roguelike rules.
- Strategy does not generally imply Action. Mount & Blade II is a valid
  game-specific exception, not a general rule.
- Platformer alone does not imply Action.
- Metroidvania can be an Action candidate, except for explicit personal
  exceptions such as Leap Year.
- Metroidvania and Open World are mutually exclusive in this personal catalog;
  never suggest Open World when the game is already or newly a Metroidvania.
- Never assign Action directly from RAWG's base Action genre.

### RPG

- Do not suggest RPG for Soulslikes, Roguelikes, or Card Games.
- Generic progression/upgrades are not enough for RPG.
- Specific traditional/party-RPG or CRPG evidence can become a reviewable signal
  later, but generic provider RPG data is not sufficient.

### Long-form narrative RPGs

- **Story Focus** may be suggested for a Visual Novel/Interactive Fiction, or a
  JRPG/CRPG/traditional or party-based RPG with a RAWG playtime estimate of at
  least 15 hours.
- Game length alone, or a generic RAWG RPG label, is never enough.
- The existing Roguelike, Soulslike, Card Game, Shooter, and Strategy exclusions
  still take priority.

### Indie

- An exact Indie metadata signal is a normal reviewable suggestion, not a silent
  assignment.
- The personal Indie label usually favors smaller-scale games. Higher-production
  AA games may technically be indie while not fitting the owner's Indie label.
- Tainted Grail: The Fall of Avalon and Clair Obscur: Expedition 33 are examples
  of this soft exclusion.
- Do not use graphics quality as an automatic classifier; reviewed accept/reject
  decisions provide the safer personal exceptions.

## Part of a Series is separate

`Part of a Series` is not a generic franchise genre. It means a meaningful
continuation path the owner wants to track after finishing a game.

- Do not label every game in annual/disconnected franchises, such as every
  Assassin's Creed release.
- Do not use title numbers as a deciding rule; named sequels and unrelated
  numbered titles make it unreliable.
- RAWG's `/games/{id}/game-series` endpoint can discover related games, but it
  cannot decide whether the relationship matters to this owner.
- Later, keep a personal series bank with series name, members, meaningful entry
  points, optional play order, and notes such as `Play DMC3 before DMC5`.
- Series discovery/caching can be tested independently and must not delay the
  first genre-suggestion release or make opening a notification wait on a live
  RAWG call.

## Reuse beyond new Steam notifications

### Existing game action

Add a `Find genre suggestions` action inside an existing game's More actions
menu. It refreshes/uses metadata, shows preselected suggestions, and requires
explicit Apply/Save. The review presents the complete personal-genre selection,
so the owner can also remove an existing genre or choose another owned genre.
Saving rejects a stale review rather than overwriting a newer genre edit.

### Settings batch review

A private Genre Suggestions area in Settings scans only already-cached, full
metadata and offers a review queue. It has an **Only games with no personal
genres** filter: this includes uncategorized games with no confident automatic
match as manual-review rows, so they are not invisible. Batch changes require an
explicit confirmation.

## Local verification requirement

Before implementing the notification UI, create a localhost-only Notification
Lab that creates isolated, resettable fixture events through the normal inbox and
action paths. It must cover new unplayed/played games, metadata loading/failure,
suggested genres, no suggestions, five-chip overflow, duplicate/link states,
Wishlist events, long titles, and empty states. It must never call real Steam or
provider APIs and must never be reachable in production.

## Recommended delivery order

1. Build the local Notification Lab.
2. Verify and repair the metadata-before-suggestions path.
3. Implement the shared server-side suggestion engine and its tests.
4. Add selected genre chips to new Steam notifications.
5. Add the existing-game `Find genre suggestions` action.
6. Add Settings batch review.
7. Run the separate RAWG series-data experiment and then design the personal
   continuation bank.
