# Play Next V2: Mood And Session Matching

Last updated: 2026-07-18

Status: planned product candidate. V1 is implemented; this plan is intentionally
not selected for immediate implementation.

## Goal

Improve `/next-up` so an owner can quickly answer:

**What fits the time and kind of experience I want right now?**

V2 keeps the trustworthy V1 foundation:

- deterministic and explainable recommendations;
- private owner data only;
- Next Up as an independent ordered queue;
- actual Playing games as the active set;
- Continue playing and Come back as separate concepts;
- page-session-only Not today;
- Surprise Me explicitly using Next Up;
- personal genres preferred over provider metadata;
- no AI or external provider calls.

V2 must remain a decision page, not become another Backlog filter page or a
questionnaire.

## Final Product Recommendation

Add three compact, optional controls:

1. **Time:** Anything, 30 min, About 1 hour, 2+ hours.
2. **Experience:** Anything, Relaxed, Jump right in, Story-focused, Deep focus,
   Intense.
3. **My Genre:** the existing personal-genre selector.

Do not add separate energy, challenge, familiar/exploratory, and start/continue
controls in V2:

- Relaxed and Intense already express useful energy/intensity preferences.
- Deep focus expresses concentration without assuming that challenge is wanted.
- Jump right in and Story-focused express the most useful continuity tradeoff.
- The page already presents planned, Playing, and Come back games separately,
  so a start/continue control would duplicate the page structure.
- Familiar versus exploratory cannot be inferred reliably enough to justify
  another daily control.

All controls default to Anything. A user should be able to open the page and
get useful recommendations without configuring any game.

## Current My Genre Inventory

This snapshot came from a read-only query against the configured localhost
database on 2026-07-18. It contains only distinct labels, not game or user
records:

1. action
2. beat em up
3. card game
4. city builder
5. co op
6. horror
7. indie
8. metroidvania
9. open world
10. part of a series
11. platformer
12. relaxing
13. roguelike
14. rpg
15. shooter
16. soulslike
17. stealth
18. story focus
19. strategy
20. survival

`my_genre` remains user-owned, comma-separated text rather than a fixed enum.
Normalize matching by trimming, collapsing repeated whitespace, and comparing
case-insensitively. Preserve the user's display spelling. A future label that
is not in the mapping receives no inferred traits; it remains usable as an
explicit My Genre filter.

RAWG genres must never add, replace, or silently fill personal genres or their
session defaults.

## Trait Model

Use five internal dimensions. Unknown is represented as missing evidence, not
as the lowest value.

| Dimension | Controlled values | Meaning |
| --- | --- | --- |
| `length_fit` | `short`, `standard`, `long` | Sessions the game can reasonably support: up to about 30 minutes, about 30-90 minutes, or about 90+ minutes |
| `energy` | `low`, `moderate`, `high` | How much activation or effort the game tends to ask from the player |
| `focus` | `light`, `moderate`, `deep` | How much sustained concentration it tends to reward |
| `continuity` | `drop_in`, `some_context`, `context_heavy` | How much previous story, systems, or situational context is useful when returning |
| `intensity` | `calm`, `moderate`, `intense` | The likely pressure or emotional/gameplay intensity |

These are session-fit traits, not quality judgments and not provider genres.
They do not describe the game's total length.

### Evidence strength

- **Explicit:** the owner set the trait for this game. This is authoritative
  for that dimension.
- **Reliable genre signal:** the personal label directly describes the trait.
  It can materially influence ranking but should still not create a hard
  exclusion.
- **Weak genre signal:** a common tendency with meaningful exceptions. It may
  nudge ranking only and must not penalize a game for a mismatch.
- **Unknown:** no usable evidence. Omit that scoring term and say the fit is
  unknown when relevant; never convert it to zero, low, short, or easy.

## Genre-To-Trait Defaults

Genre defaults are intentionally conservative. "Reliable" means reliable
enough to influence ranking more strongly, not universally true.

| My Genre | Reliable signals | Weak ranking nudges | Do not infer |
| --- | --- | --- | --- |
| action | None | `energy: high`, `intensity: intense` | Session length, continuity, difficulty |
| beat em up | `continuity: drop_in` | `length_fit: short/standard`, `energy: high`, `intensity: intense` | Difficulty, story weight |
| card game | None | `length_fit: short/standard`, `continuity: drop_in`, `focus: moderate` | Calmness, campaign length, online availability |
| city builder | None | `length_fit: standard/long`, `focus: moderate/deep`, `continuity: some_context` | Pressure, difficulty, whether pausing is safe |
| co op | None | `continuity: some_context` | Partner availability, session length, energy, voice/chat needs |
| horror | `intensity: intense` | `focus: moderate` | Session length, difficulty, action level |
| indie | None | None | All session traits; indie describes production context, not play experience |
| metroidvania | None | `length_fit: standard`, `continuity: some_context`, `focus: moderate` | Difficulty, intensity, story weight |
| open world | None | `length_fit: standard/long`, `continuity: some_context` | Story weight, focus, whether short activities exist |
| part of a series | None | `continuity: some_context` | Session length, in-game continuity, need to play earlier entries |
| platformer | None | `length_fit: short/standard`, `continuity: drop_in`, `focus: moderate` | Difficulty, intensity |
| relaxing | `intensity: calm`, `energy: low` | `focus: light/moderate` | Session length, mechanical simplicity |
| roguelike | `continuity: drop_in`, `length_fit: short/standard` | `focus: moderate/deep`, `intensity: intense` | Difficulty, run duration, story continuity between runs |
| rpg | None | `length_fit: standard/long`, `continuity: some_context/context_heavy`, `focus: moderate` | Story focus, difficulty, combat intensity |
| shooter | None | `energy: high`, `intensity: intense`, `continuity: drop_in` | Session length, multiplayer availability, difficulty |
| soulslike | `focus: deep`, `intensity: intense` | `length_fit: short/standard`, `continuity: some_context`, `energy: high` | Exact attempt length, required skill, story weight |
| stealth | `focus: deep` | `energy: moderate`, `continuity: some_context` | Session length, intensity, difficulty |
| story focus | `continuity: context_heavy` | `length_fit: standard/long`, `focus: deep` | Exact session length, difficulty, intensity |
| strategy | `focus: deep` | `length_fit: standard/long`, `continuity: some_context` | Difficulty, pressure, turn or match duration |
| survival | None | `length_fit: standard/long`, `focus: moderate/deep`, `continuity: some_context`, `intensity: intense` | Difficulty, horror, multiplayer availability |

Important limitations:

- Roguelike and Soulslike may support short attempts, but that does not prove
  every run or checkpoint fits a short session.
- RPG and open world often represent large total commitments, but total HLTB
  duration is not session length.
- Story focus suggests continuity, not that every useful session must be long.
- Part of a series suggests possible franchise context, not necessarily
  difficult in-game resumption.
- Co op says nothing about whether another player is available today.
- Indie provides no useful session signal.

## Combining Multiple Genres

Derive each dimension independently:

1. If the owner supplied an explicit value for a dimension, use it and ignore
   genre defaults for that dimension.
2. Otherwise collect reliable and weak evidence from every normalized personal
   genre.
3. Repeated signals in the same direction do not stack without limit. Keep the
   strongest evidence per value so adding more labels cannot overwhelm ranking.
4. Opposing reliable signals remain a mixed profile. Do not choose whichever
   genre appears first.
5. Opposing weak signals cancel to unknown for that dimension.
6. A game may support more than one `length_fit` value.
7. Unknown dimensions remain absent. Other known dimensions may still help.

Example: `relaxing, strategy` produces reliable calm/low-energy and deep-focus
signals. That is not contradictory: it describes a calm game that still
benefits from concentration.

Example: `story focus, roguelike` produces both context-heavy and drop-in
continuity evidence. Without an explicit override, continuity is mixed and
should contribute no mismatch penalty.

## Explicit Per-Game Traits

Add one private `games.session_traits` JSONB object rather than several nullable
columns or a generic `play_tags` string.

Recommended representation:

```json
{
  "length_fit": ["short", "standard"],
  "energy": "low",
  "focus": "deep",
  "continuity": "drop_in",
  "intensity": "calm"
}
```

Rules:

- Missing keys mean "use personal-genre defaults, otherwise unknown."
- Explicit keys replace genre defaults only for that dimension.
- `length_fit` accepts one or more controlled values.
- Scalar keys accept only their controlled values.
- Empty objects are valid and are the default for existing games.
- Do not persist derived defaults. Derive them in shared code so corrections to
  the mapping apply consistently.
- Do not parse thoughts or Next time note text to infer traits.

Editing location:

- Add an optional **Play style** section in the owner game editor.
- Keep it collapsed or secondary so Add Game does not become mandatory setup.
- Show "Based on My Genres" until an override is chosen.
- Allow restoring a dimension to its genre-derived default.
- A later shortcut from a recommendation reason may open this same editor; do
  not create a second editing model.

Privacy:

- Include `session_traits` only in authenticated owner and writable guest/demo
  game reads/writes.
- Exclude it from public profiles, public APIs, CSV export unless export scope
  is deliberately expanded, analytics telemetry, and provider requests.
- Backend user scoping remains the security boundary.

Existing games require no backfill. They work immediately from personal genres
and known V1 data. Games without genres or overrides remain eligible with
unknown session fit.

## Mood Controls And Trait Targets

The Experience control maps to requested traits:

| Experience | Requested traits |
| --- | --- |
| Relaxed | `energy: low`, `intensity: calm` |
| Jump right in | `continuity: drop_in`, `focus: light/moderate` |
| Story-focused | `continuity: context_heavy` |
| Deep focus | `focus: deep` |
| Intense | `intensity: intense`, `energy: high` |

The Time control maps directly to one `length_fit` value:

- 30 min -> `short`
- About 1 hour -> `standard`
- 2+ hours -> `long`

These buckets describe available session time only. Never derive them from
`how_long_to_beat`.

## Exact Deterministic Ranking

### Eligibility and hard filters

Preserve V1 semantic eligibility:

- Your priority and session-fit planned picks exclude Playing and Done games.
- Continue playing contains only actual Playing games.
- Come back remains separate.
- Next Up order and membership are never changed by controls.
- Not today removes only that lane's candidate for the current page session.

The selected My Genre is the only mood-related hard filter. Match it against
personal genres with case-insensitive exact OR semantics. Never fall back to
RAWG or the unfiltered library when no game matches.

Time and Experience are ranking preferences, not hard filters.

### Per-dimension score

For every requested dimension with known evidence:

| Evidence | Exact match | Adjacent scalar value | Opposite/conflicting value |
| --- | ---: | ---: | ---: |
| Explicit per-game trait | +6 | +2 | -4 |
| Reliable genre signal | +3 | +1 | -1 |
| Weak genre signal | +1 | 0 | 0 |
| Unknown | omit term | omit term | omit term |

For `length_fit`, membership in the selected bucket is an exact match. An
explicit non-empty list that omits the selected bucket is a conflict. Genre
length signals that omit the selected bucket receive no weak mismatch penalty.

The candidate's `sessionScore` is the sum of only applicable terms. Track
`evidenceCount` separately so a score of zero with evidence is distinguishable
from no evidence.

### Lane ordering

1. **Your priority:** descending `sessionScore`, then queue position, then game
   ID. With all controls set to Anything, queue position remains the result.
2. **Fits your session:** planned games ordered by descending `sessionScore`,
   descending `evidenceCount`, queued before unqueued, queue position when
   applicable, then game ID. Show this lane only when Time or Experience is
   selected and at least one candidate has supporting evidence.
3. **Quick win:** when Time and Experience are both Anything, preserve the V1
   rule based on the shortest known total HLTB estimate. Keep the reason about
   total game length; never call it session length.
4. **Continue playing:** descending `sessionScore`, then presence of a Next
   time note, oldest known Steam activity, oldest start date, then game ID.
   Note presence indicates that resumption context is available; note contents
   are not inspected.

Prefer distinct recommendation cards. If Fits your session selects the same
game as Your priority and another supported candidate exists, use the next
candidate. Reuse is allowed when there is no credible alternative.

Surprise Me remains an explicitly random user action over eligible Next Up
games after the selected My Genre hard filter. Time and Experience may restrict
it to the highest positive score tier when that tier exists; otherwise use the
full eligible pool and state that session fit is unknown. It never falls back
to Backlog.

## Recommendation Reasons

Reasons must name real evidence and its confidence:

- "You marked this as good for short sessions."
- "Your Relaxing tag suggests a calmer, lower-energy session."
- "Your Story focus tag suggests that previous context may help."
- "This is first in Next Up and matches the focused experience you chose."
- "You left a Next time note, so your return context is ready."
- "About 6 hours is the shortest known total estimate in your queue."
- "First in Next Up; session fit is not known yet."
- "Closest available match: your genres suggest intensity, but session length
  is unknown."

Avoid unsupported claims such as:

- "This game takes 30 minutes per session."
- "Soulslikes are always difficult."
- "Open-world games cannot be played briefly."
- "No Next time note means this game is hard to resume."
- "Co op is available now."

## Desktop And Mobile UX

### Desktop

- Keep **Pick a game** and the controls on one clean header row.
- Place Time and Experience as compact selects or segmented popovers on the
  right, followed by the existing My Genre control.
- Show active selections as short labels, not explanatory paragraphs.
- Put a single **Reset** action in the control area only when something is
  selected.
- Keep recommendation reasons directly on their cards.

### Mobile

- Keep the section title and one compact **Match my session** button on the
  first row.
- Open a small sheet containing Time, Experience, and My Genre.
- Apply immediately and show up to three removable summary chips below the
  title.
- Do not use horizontal scrolling, a multi-step wizard, or a sticky
  questionnaire.

Controls are page-session state in V2. Do not add persistence until normal use
shows that remembering the previous mood is helpful rather than surprising.

## Empty, Unknown, And Contradictory Behavior

- No controls selected: preserve V1 recommendations.
- No personal genres: keep the game eligible; its genre-derived traits are
  unknown.
- Unknown time/experience fit: do not penalize it and do not invent a reason.
- No matching selected My Genre: show a clear empty state and Clear genre;
  never use RAWG or silently clear the filter.
- No supporting session evidence: retain Your priority/Continue playing using
  their factual V1 reasons and omit Fits your session.
- Only weak support: label the reason with "suggests," never "is."
- Explicit trait contradicts genre: explicit wins for that dimension.
- Multiple genres conflict: preserve mixed evidence or cancel weak evidence;
  never resolve by CSV order.
- HLTB missing: Quick win may be omitted; unknown is not zero hours.
- Next time note exists: its presence is a resume-readiness tie-breaker.
- Next time note absent: resumability remains unknown, not difficult.
- Stale/deleted/status-changed games: preserve the V1 reconciliation rules.
- Not today: remains page-session-only and lane-specific.

## Recommended Implementation Sequence

1. **Pure trait engine**
   - Add normalized genre mapping, evidence resolution, control targets,
     deterministic scoring, lane selection, and reason builders in shared
     utilities.
   - Cover all 20 current labels, unknown labels, conflicts, stable ties, and
     unknown evidence with unit tests.
2. **Private data model**
   - Add an additive migration for `games.session_traits JSONB NOT NULL DEFAULT
     '{}'::jsonb`.
   - Update `backend/schema.sql`.
   - Validate the controlled object in Celebrate/Joi and normalize omitted or
     empty values.
   - Add private read/write and public-exclusion tests.
3. **Owner editing**
   - Add the optional Play style editor to the existing game edit flow.
   - Preserve signed-in owner, writable guest/demo, and public read-only
     boundaries.
4. **Play Next controls and ranking**
   - Add desktop controls and the mobile sheet.
   - Replace Quick win with Fits your session only while session controls are
     active; retain V1 Quick win otherwise.
   - Add evidence-based reasons and page-session reset behavior.
5. **Focused verification**
   - Run local migration verification once.
   - Run pure scoring/API privacy tests.
   - Run focused Playwright coverage for desktop/mobile controls, unknown data,
     conflicting genres, Not today, Surprise Me, and public exclusion.
   - Use CI as the complete release gate.

## Risks And Likely Bad Assumptions

- Personal genre labels may mean something different to this owner than common
  genre conventions. Keep defaults editable and conservative.
- Too many genre nudges can create false confidence. Cap duplicate evidence and
  expose the reason.
- A total completion estimate can look like session data when it is not.
- Relaxing does not necessarily mean mechanically simple or unfocused.
- Strategy does not always mean long; Soulslike does not always mean a long
  session; Roguelike runs are not always short.
- Story continuity and session length are related only weakly.
- More tags must not automatically produce a higher score.
- JSONB is appropriate for a small controlled private object, but it should not
  become an unvalidated generic tag dump.
- Controls can overwhelm the page if presented as equal-weight filters.
- Explicit traits must remain optional or the feature will have a cold-start
  problem.

## Decisions To Reconfirm Before Implementation

The plan recommends, rather than leaves open:

1. Three daily controls: Time, Experience, and My Genre.
2. No separate energy, challenge, familiar, or start/continue control in V2.
3. Five controlled trait dimensions in one private `session_traits` object.
4. Genre defaults derived at runtime and never stored.
5. Explicit per-game traits overriding one dimension at a time.
6. Only My Genre acting as a hard mood filter.
7. HLTB remaining a total-length Quick win signal, never a session-length
   signal.
8. V1 behavior remaining the fallback whenever V2 lacks evidence.

Before implementation, recheck the live personal-genre vocabulary and discuss
whether the proposed Time labels feel natural in actual daily use. No other
rule-writing or per-game setup is required from the user before work begins.

## Out Of Scope

- AI, provider calls, or parsing free-text notes.
- Finish Game or completion prompting.
- Session logs, playthroughs, or a general activity-event model.
- Partner availability, installed state, input device, or platform matching.
- Persistent mood history, reminders, streaks, or public recommendation data.
- Replacing Backlog filters, Lists, or Next Up ordering.
