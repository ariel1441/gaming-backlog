# Gaming Backlog Competitive Landscape

Research date: 2026-07-17

## Purpose and scope

This report surveys current products that help people track video games,
organize a backlog, record play history, decide what to play, or manage a game
collection. It goes beyond the largest Letterboxd-like products and includes
smaller web products, app-led services, physical-collection tools, launchers,
and achievement communities when they offer a useful product lesson.

"Every available website" cannot be guaranteed literally: small trackers
appear and disappear constantly, some are private betas, and app stores contain
many near-identical native-only products. The useful goal is broad market
coverage and saturation: keep searching until new results mostly repeat
already-seen ideas. This survey reached that point across more than 35 active
or recently active products.

Sources favor official feature pages, documentation, public roadmaps, and
current app listings. Recent community discussions are used for friction and
unmet needs, not as authoritative descriptions. FinalSave and Infinite Backlog
are JavaScript-only; FinalSave's public frontend bundle was inspected directly,
while Infinite Backlog is supported by its creator's public feature posts,
release notes, and recent user reports. No accounts were created and
authenticated-only screens were not tested.

## Executive conclusion

The market does not lack trackers. It lacks a product that combines these four
jobs without becoming bloated:

1. Trust the library: know what the user owns, where it came from, whether
   copies are duplicates, and which data still needs review.
2. Choose intentionally: turn hundreds of possible games into a few explained
   choices that fit time, mood, energy, platform, and current priorities.
3. Resume effortlessly: show what the user was doing, where they stopped, and
   the smallest useful next action.
4. Preserve the memory: make starts, pauses, finishes, playthroughs, and
   reflections feel like a personal history instead of edits to one mutable
   database row.

This project already has unusually strong foundations for job 1: a durable
catalog, reviewed Steam import, source rows separate from personal game data,
metadata repair, duplicate protection, private Lists, Timeline, Reviews, and
Insights. Its strongest next move is therefore not a generic social feed,
another set of charts, or custom statuses. It is the selected **Play Next &
Resume** track, followed by a focused completion flow and then a durable
activity/playthrough model.

The differentiated product promise could be:

> A private-first gaming library that helps you choose the right game for
> tonight, remember where you left off, and keep an honest history of what you
> played.

## The most important cross-market findings

### 1. "Backlog" and "library" are different concepts

Infinite Backlog, GameSHLF, KTOMG, Backlog Zero, CLZ, and collector tools model
ownership independently from play status. This matters when a user owns the
same title on Steam and PlayStation, temporarily has it through Game Pass, has
a physical copy, or wants to play a game they do not own.

The current app already separates Steam source data from the personal `games`
row, which is the correct direction. A future Unified Library should extend
that relationship deliberately instead of treating every imported game as a
backlog item.

### 2. A random button is useful, but an explained shortlist is better

Backloggery's Fortune Cookie, Infinite Backlog's roulette, FinalSave's "Pick
for me," Backlog Zero's Backlog Picker, and this app's Surprise Me all reduce
choice overload. Newer products go further:

- FinalSave offers quick wins, older backlog games, and a random choice.
- SessionPick ranks by session length, pause behavior, pickup friendliness,
  mental energy, FOMO, and session structure.
- Questly uses a focused swipe stack based on the user's real library.
- Game Rover's Scout answers questions against library and trophy context.

The lesson is not "add AI chat." It is to return two to four candidates with
plain-language reasons and let the user say "not today." Deterministic,
inspectable rules should come first; AI can later explain results without
owning the decision.

### 3. Resume context is a real, underserved job

KTOMG saves progress notes. SavePoint centers notes, in-game to-dos, and quick
links. SessionPick explicitly measures how hard a game is to resume after a
break. Infinite Backlog has play records. GameTrack and WListDB record sessions.
Recent user discussions repeatedly ask for "where I stopped" notes.

A private `resume_note` or "Next time" field is a small feature with unusually
high practical value. It should be visible only for active/paused games, easy
to update from a game card or detail view, and independent from a public review.

### 4. Completion is a moment, not just a status dropdown

The strongest implementations create a small completion ritual:

- Savepoint uses a guided completion stepper for finish date, rating, playtime,
  and reflection, then builds a personal memory timeline.
- Backloggd creates logs/playthroughs with dates and reviews.
- Completionator records individual completions and their time.
- Minimap explicitly separates one final review from unlimited journal posts.

The current app should intercept an intentional move to Finished and offer a
short, skippable completion sheet. Private notes and publishable review text
must be separate before reviews become public.

### 5. Data health can be a user-facing feature

Backlog Zero's strongest idea is not its random picker; it is Library Trust and
Library Health. It explains duplicates, add-ons that inflate counts, sync
quality, missing covers, reference gaps, and cleanup decisions. KTOMG similarly
serves libraries with thousands of games through bulk edit, filters, tags, and
export.

This project already has metadata repair, missing-hours work, Steam match
review, and duplicate protection scattered across screens. A single
privacy-safe "Needs Attention" center can turn engineering safeguards into
visible product value.

### 6. Portability creates trust

KTOMG, WListDB, GameLog, Backlog Zero, and several newer products advertise
export prominently. Backloggd users have publicly worried about losing reviews
and journals when the service is unavailable. This app has CSV export, but JSON
export with a documented, versioned format would better preserve notes, dates,
Lists, source relationships, and future events.

### 7. Social features are powerful and expensive

Backloggd, Grouvee, GG, Minimap, GameTrack, and LUDENSLOG use feeds, follows,
reviews, lists, reactions, and profiles to create discovery and retention.
Grouvee's community lists and Minimap's distinction between review and journal
are particularly good.

They also imply granular privacy, account discovery, blocking/muting,
moderation, abuse handling, notification controls, and content deletion. The
current roadmap is right to delay broad social features until visibility
controls and durable activity data exist.

### 8. Gamification can make the backlog feel worse

FinalSave includes levels, XP, daily check-ins, quests, streak-like activity,
and a heatmap. Minimap has points, missions, user rankings, badges, and titles.
Completionator has challenges, leaderboards, and bounties.

These can increase engagement, but they can also convert leisure into another
obligation. SavePoint's team publicly described removing XP, streaks, and
badges because the tracker should solve a decision problem, not create another
meta-game. Prefer meaningful goals and recaps over daily pressure.

## Deep product analysis

### FinalSave

Source: [FinalSave](https://finalsave.app/)

**Core system idea:** combine backlog management, community activity, discovery,
deals, and explicit engagement mechanics in one modern dashboard.

Verified public frontend features include Backlog, Playing, Completed, and
Dropped states; wishlist and release-calendar discovery; reviews and 0-10
ratings; favorites; completion-time editing; Steam playtime and session data;
PlayStation import; community rankings and live activity; public profiles with
activity heatmaps; levels/supporter tiers; daily check-ins and quests; deal
pages; and a backlog roulette. Its recent in-product changelog describes
"Recommended next" choices split into quick wins, older backlog games, and a
random pick, plus a simpler table-first backlog view.

**What to learn**

- Give recommendations named reasons instead of one opaque result.
- A compact table can be the serious management view while covers remain the
  emotional browsing view.
- Community status counts on game pages create useful social proof without
  requiring comments.
- Release discovery should let a user wishlist immediately and later promote
  the title into their backlog.

**What not to copy yet**

- XP, check-ins, and quests compete with the user's actual goal of playing.
- Deals and affiliate flows can distort discovery toward buying more games,
  directly opposing backlog reduction.
- Public activity and leveling need privacy and moderation foundations.

### Grouvee

Source: [Grouvee](https://www.grouvee.com/)

**Core system idea:** flexible shelves plus a conversational community.

Grouvee provides Playing, Played, Backlog, and Wish List shelves; unlimited
custom shelves; Steam import; five-star reviews; shared community lists;
follows; activity/status posts; comments; events; and polls. Its home page
immediately demonstrates community activity instead of explaining it
abstractly.

**What to learn**

- Keep canonical semantic states stable, but let users create lightweight
  shelves such as "co-op with my partner" or "summer 2026."
- Public lists are a lower-risk discovery primitive than a full recommendation
  engine: people explain taste through curation.
- Events/showcases can group announced games into an actionable collection.
- A status update attached to a game can be lighter than a formal review.

**Risk for this app**

Custom shelves, manual Lists, smart Lists, saved views, and a Next Up queue can
become five overlapping concepts. Each must have a distinct promise.

### Infinite Backlog

Sources:
[creator overview](https://www.reddit.com/r/gaming/comments/1461f43),
[Play Log and Play Records](https://www.patreon.com/posts/release-1-10-log-87370131)

**Core system idea:** a cross-platform ownership and achievement hub in which
collection facts are separate from playing intent.

It supports Steam, PlayStation, Xbox, GOG, and RetroAchievements integrations;
automatic library, playtime, achievement, and trophy updates; ownership,
platform, store, and subscription information; backlog and wishlist states;
social feeds; reviews; challenges; statistics; roulette; play logs; and
customizable play records for progress such as collectibles or levels.

**What to learn**

- The same game can have multiple ownership/source records and one personal
  intent state.
- Imports should update factual source data without silently rewriting a
  user's subjective status.
- A generic progress record can handle "18/50 collectibles" or "chapter 6"
  without forcing every game into achievement percentage.
- Cross-platform achievement history can enrich a private timeline.

**What to avoid**

Infinite Backlog's breadth is also its UX danger: many systems can make basic
tracking feel complex. Progressive disclosure is essential.

### Backloggd

Sources: [Backloggd overview](https://backloggd.com/),
[about and FAQ](https://backloggd.com/about/),
[public roadmap](https://backloggd.com/roadmap/)

**Core system idea:** Letterboxd-style game logging and identity expression.

Backloggd supports Played, Playing, Backlog, and Wishlist tracking; individual
logs/playthroughs; dates; time tracking; platform ownership; ratings; reviews;
lists; favorites; journal/activity views; follows; and community feeds.

**What to learn**

- A game in the catalog and a user's playthrough/log are different entities.
- The profile should communicate taste through favorites, recent completions,
  lists, and reviews—not just collection totals.
- Quick logging should stay quick; deeper ownership and playthrough fields can
  live in an expanded editor.

**Observed gaps worth exploiting**

Recent users still ask for easier bulk import, export, native/mobile presence,
and stronger next-game help. This project already has reviewed Steam import and
can differentiate on decision support and data portability instead of trying
to out-social Backloggd.

### Keep Track of My Games (KTOMG)

Source: [Keep Track of My Games](https://keeptrackofmygames.com/)

**Core system idea:** privacy-first control for very large, multi-service
libraries.

KTOMG syncs Steam, Xbox, PSN, and GOG; models platform ownership; provides
wishlist, favorites, custom and ranked lists, tags, bulk editing, advanced
filters, progress notes, playthroughs, completions, release notifications,
statistics, mobile web, and CSV export. Collections are private by default and
shared deliberately.

**What to learn**

- Design management operations for 2,000 games, even if most users have 100.
- Bulk selection must be cleared or reconciled when filters change.
- Ranked "Want to Play" and a bounded Up Next concept are different.
- Progress notes belong where the user sees active games.
- Export and privacy are product features, not settings-page afterthoughts.

### SessionPick

Sources: [SessionPick](https://www.sessionpick.com/),
[method and metadata](https://www.sessionpick.com/about)

**Core system idea:** choose a game for the session the user actually has.

SessionPick adds data ignored by ordinary catalog providers: pause flexibility,
pickup friendliness after a break, FOMO pressure, mental energy, and session
structure. It ranks games for 15-, 30-, 60-, or 120-minute windows and combines
AI-seeded estimates with community verification.

**What to learn**

- Whole-game HLTB duration is not the same as tonight's useful session length.
- "Easy to resume" is actionable metadata for active games.
- Recommendation controls should speak human language: time, mood, energy,
  solo/co-op, and platform.
- Show why a game fits and how confident the data is.

**Recommended adaptation**

V1 should use only reliable fields already present: queue priority, HLTB
estimate, status, last played, source/platform, and explicit user exclusions.
Mood, energy, and session structure should arrive later as personal tags or
community/catalog metadata.

### Game Rover

Source: [Game Rover features](https://gamerover.io/welcome)

**Core system idea:** a clean cross-platform library and trophy cockpit.

Game Rover syncs PlayStation, Xbox, Steam, and RetroAchievements; distinguishes
Wishlist, Complete, Beat, Playing, Up Next, Backlog, Paused, and Retired;
offers four library views, deep filtering, bulk editing, drag ordering, trophy
details, notes, lists, direct launch/store links, shareable posters, and a
library-aware AI assistant.

**What to learn**

- "Beat main story" and "100% complete" are meaningful separate outcomes.
- Trophy progress needs spoiler controls and DLC separation.
- Share cards can turn existing private data into an optional showcase without
  first building a social network.
- List duplication and pinned lists reduce repeated organization work.

**What to adapt carefully**

Do not make Up Next another mutually exclusive game status. This project
already has semantic status, backlog ordering, and list ordering; queue
membership must remain independent.

### Backlog Zero

Sources: [feature overview](https://backlogzero.app/features),
[user guide](https://backlogzero.app/guide)

**Core system idea:** a local-first, trustworthy ledger for a messy real-world
library.

Its standout systems are duplicate detection, DLC/add-on linking, accurate
owned counts, sync-quality review, Library Recalibration, and a Library Health
dashboard. It also includes sessions, goals, wishlist price signals, free-game
discovery, a backlog picker, JSON backup, keyboard navigation, and a local
mobile companion.

**What to learn**

- Missing data has different severity: a missing cover is not the same as a
  broken identity link.
- Counts should explain what is excluded and why.
- Imports need a post-sync cleanup summary, not only a success toast.
- A recalculation/migration tool can safely apply improved rules to old data.
- Every issue in a health center needs an explanation, fix, dismiss, and safe
  bulk path.

This is the closest external validation of the roadmap's proposed Data Health
Center.

### GameTrack

Sources: [GameTrack features](https://gametrack.app/features),
[2026 release notes](https://gametrack.app/change-log)

**Core system idea:** a polished mobile companion that records sessions and
turns the year into a story.

It supports multiple account integrations, statuses, tags, smart and
collaborative lists, built-in session timers, session history, recommendations,
HLTB estimates, release alerts, reviews, activity, advanced filters, private
profiles, price alerts, a calendar, and Year in Gaming. Recent releases focus
on onboarding, persistent timers, speed, and large-list reliability.

**What to learn**

- Session timers must survive navigation, app termination, and device changes.
- Onboarding should seed library, wishlist, and currently playing separately.
- A yearly recap is strongest after events and sessions are trustworthy.
- Private profiles need follow approval, not only a single public switch.
- Saved/smart views should filter subscription service and source.

### WListDB

Source: [WListDB features](https://wlistdb.com/features)

**Core system idea:** combine HLTB-style decision data with a full tracker and
release calendar.

WListDB offers six statuses, Steam import, custom/ranked lists, release
calendar, multiple playtime estimates, reviews, annual recap, and a Windows
companion that detects sessions across Steam, Epic, GOG, Battle.net, EA,
Ubisoft, and Xbox PC.

**What to learn**

- Display Main Story, Main + Extra, and Completionist estimates rather than one
  unexplained hour value.
- Put estimated and actual playtime side by side and keep their provenance.
- Wishlist items become more useful when placed on a calendar.
- Desktop session capture can complement manual, cross-platform history later.

### Completionator

Source: [Completionator](https://www.completionator.com/)

**Core system idea:** make completion itself a durable object and hobby.

Completionator tracks ownership, platform, condition, backlog, custom tags and
lists, Steam/bulk import, collection value, individual completion times,
challenges, goal templates, leaderboards, stacks, articles, blogs, and forums.

**What to learn**

- A completion/playthrough should have its own time and date.
- Goals can target a chosen list or theme instead of an arbitrary daily streak.
- Physical ownership fields can be valuable without taking over the main
  backlog UI.

### IGN Playlist

Source: [IGN Playlist product page](https://ign-product.squarespace.com/)

**Core system idea:** editorial curation becomes an actionable personal list.

Playlist includes Backlog, Playing, Paused, Beat, and Quit states; Steam
import; community and HLTB data; curated discovery; ranked lists; comments;
reviews; guides/maps/media; and unusually useful list operations: remix,
multi-select, and batch edit.

**What to learn**

- "Remix this list" is a strong bridge from discovery to personal planning.
- Curated lists need a one-click way to show owned, completed, and already
  backlogged games.
- Game details can link to high-value external resources without trying to
  recreate guides.
- Batch editing is essential once imports create hundreds of records.

### HowLongToBeat

Source context: [Xbox/HLTB integration explanation](https://www.gamespot.com/articles/xbox-pc-app-updates-include-howlongtobeat-integration-and-improved-performance/1100-6507503/)

**Core system idea:** time is first-class decision metadata.

HLTB's durable advantage is not its backlog UI; it is crowd-sourced Main Story,
Main + Extras, Completionist, and combined time estimates, plus user-submitted
times and playthrough notes.

**What to learn**

- Ask what kind of completion the user intends before calculating backlog ETA.
- Show sample size/freshness and preserve manual overrides.
- Compare expected, personal actual, and provider actual rather than collapsing
  them into one number.

### Backloggery

Source context:
[current user description](https://www.reddit.com/r/gaming/comments/1tlrblt/looking_for_a_website_like_backlogged/)

**Core system idea:** manual entry keeps the system universal and lightweight.

Backloggery is intentionally not catalog-driven. Users type their own games and
track states such as unplayed, beaten, completed, and null, along with a Now
Playing area and random Fortune Cookie selection.

**What to learn**

- Manual add is not merely a fallback; it covers mods, delisted games, ROM
  hacks, and obscure releases immediately.
- "Beat" and "completed" answer different questions.
- A neutral/null state is useful for owned games the user does not intend to
  finish.

**Tradeoff**

No shared catalog avoids missing-game friction but sacrifices canonical
identity, metadata reuse, discovery, and cross-user aggregation. This app's
catalog plus safe manual fallback is stronger.

### Minimap

Sources: [Minimap overview](https://minimap.net/),
[review versus journal FAQ](https://minimap.net/faq/4/0)

**Core system idea:** a game journal and community layered on synchronized
platform history.

Minimap syncs platform activity, achievements, playtime, and progress; supports
status, reviews, unlimited journal posts, images, comments, collections,
profiles, recommendations, statistics, and community ranking.

**What to learn**

- One review per game and unlimited chronological journal entries is a clean
  content model.
- The writing UI can insert a structured game reference without leaving the
  editor.
- Profiles can show common games and actual play behavior, not only ratings.

**What to avoid**

Activity points, attendance, rankings, and reward events may optimize posting
volume instead of useful personal history.

### SavePoint family

Sources:
[current completion-flow listing](https://apps.apple.com/us/app/savepoint-game-tracker/id6760267998),
[resume-focused SavePoint](https://savepoint-app.com/),
[local-first collector SavePoint](https://savepointgamer.app/)

Several unrelated products use this name, but together they reveal a clear
product gap:

- A guided completion stepper captures date, rating, playtime, and reflection.
- "Your Savepoint" summarizes a person's history with one game.
- A memory timeline shows starts, finishes, and notes.
- Context-aware notes ask for the right information at the right moment.
- In-game to-dos and links to the wiki/Reddit help a user resume.
- Local-first collection tracking includes platform, format, physical/digital,
  subscription, DLC, preorders, hardware, and storage location.

**Recommended adaptation**

Add one lightweight private "Next time" field now. Let a later activity model
turn those updates into a history. Do not build quest management or hardware
inventory into V1.

### Questly

Source: [Questly](https://www.questly.games/)

**Core system idea:** discovery should be constrained by the user's actual
library and trust relationships.

Questly offers Steam and CSV import, per-platform ownership, statuses, replays,
play journals, ratings, swipe-based recommendations, and friend
recommendations contextualized by that friend's score history.

**What to learn**

- A focused candidate stack is calmer than an infinite discovery grid.
- A recommendation is more credible when the user can see why the source's
  taste is relevant.
- CSV migration is a meaningful acquisition feature.

### Video Game Backlog

Source: [Video Game Backlog](https://www.videogamebacklog.com/)

**Core system idea:** make library shape useful before demanding an account.

It offers a public Steam backlog analyzer, a visible start-pause-resume-finish
timeline, first-class manual entry, taste profiles, year review, library
comparison, and a shared-game shortlist for two public profiles.

**What to learn**

- A no-account analyzer is an excellent guest funnel.
- A lifecycle is easier to understand as a timeline than scattered date fields.
- "What do we both own and not play?" is a concrete social utility.
- Manual and synchronized games should look coherent while retaining source
  provenance.

### GameSHLF

Sources: [GameSHLF features](https://www.gameshlf.com/),
[about](https://www.gameshlf.com/about)

**Core system idea:** combine social tracking with collector-grade copies.

It supports Steam, Xbox, and GOG import; playtime; status; notes; reviews;
custom ranked lists; social activity; clubs; recommendations; and multiple
copies differentiated by platform and region.

**What to learn**

- Catalog game, owned copy, and played-on platform are separate facts.
- A community "club" is a more purposeful future social unit than a global
  feed, but it still requires moderation.

### Collector products: CLZ, PriceCharting, VGCollect, GAMEYE

Sources:
[CLZ Games](https://clz.com/games/mobile),
[PriceCharting tracker](https://www.pricecharting.com/page/collection-tracker),
[VGCollect](https://vgcollect.com/about),
[GAMEYE](https://www.gameye.app/)

**Shared core idea:** the object being tracked is a specific owned copy, not
only a title.

Common features include barcode capture, regional/edition variants, loose/CIB/
new condition, purchase price/date/store, location, personal photos, estimated
value, hardware/accessories, sold history, and public collection sharing.

**Useful future lessons**

- Barcode scanning is the lowest-friction physical import.
- Edition and copy data must not pollute the catalog identity.
- Purchase/location/value fields belong in an optional ownership layer.
- A collection can support insurance/export use cases without turning the
  backlog into a marketplace.

This is valuable only after the app chooses to become a broader Unified Library.

### Platform and achievement products: Exophase, RetroAchievements,
TrueAchievements

Sources:
[Exophase](https://www.exophase.com/faq/),
[RetroAchievements](https://docs.retroachievements.org/general/faq.html),
[TrueAchievements](https://www.trueachievements.com/aboutus.aspx)

**Shared core idea:** objective activity can create progression, goals, guides,
and identity across games.

Useful lessons include cross-platform gamercards, earned-date timelines,
achievement rarity, spoiler controls, DLC separation, progression versus
mastery, achievement to-do lists, community solutions, and bounded events.

For this app, achievement data should remain a private signal and optional
goal—not silently define whether the user considers a game finished.

### Playnite

Source: [Playnite filter presets](https://api.playnite.link/docs/manual/features/filtersAndFiltersPresets.html)

**Core system idea:** power users value control, saved filters, extensibility,
and the ability to launch anything.

Playnite aggregates PC storefronts and emulators, offers rich editable metadata,
filter presets, themes, extensions, scripts, multiple views, statistics, and a
controller-first full-screen mode.

**What to learn**

- Saved views should be named, reorderable, and one click away.
- Metadata provenance and editable fields matter to power users.
- Keyboard and controller navigation can make a large library feel fast.

An extension ecosystem and launcher are outside this web app's present scope.

## Additional current products worth monitoring

These products repeat many core features but introduce one or two useful
variations:

| Product | Notable angle | Useful lesson |
| --- | --- | --- |
| [LUDENSLOG](https://ludenslog.com/) | Diary, detailed stats, web and native apps | Mobile logging and annual recap |
| [Stash](https://stash.games/) | Visual mobile tracking, friends, news and release alerts | Fast capture and release notifications |
| [GG](https://ggapp.io/) | Social profiles, lists, favorites and activity | Taste-forward profiles |
| [GameLog](https://gamelog.uk/) | Local-first web app, offline, barcode, JSON | No-account trial and data ownership |
| [Backloggia](https://backloggia.com/) | Priority, difficulty, deals and library health | Difficulty as optional decision context |
| [OpenBacklog](https://www.openbacklog.app/en) | Explicit productivity and next-action positioning | Product language centered on finishing |
| [My Gaming Backlog](https://mygamingbacklog.com/) | Four simple completion levels and friendly competition | Cleared versus 100% Cleared |
| [WListDB](https://wlistdb.com/) | HLTB, calendar, automatic desktop sessions | Estimate/actual side-by-side |
| [GameTrack](https://gametrack.app/) | Deep polish, timers, recap, shared lists | Resilient session capture |
| [Game Rover](https://gamerover.io/) | Trophy vault and clean multi-view library | Spoiler-safe achievement UX |
| [RETROSPECT](https://www.retrospect.gg/) | Retro-focused journals and preservation | Memories matter beyond completion |
| [Playlogged](https://playlogged.netlify.app/) | Minimal tracking | Reduce setup and management burden |
| [vgstack](https://vgstack.app/) | Backloggery migration with dates preserved | Competitor import as acquisition |
| [Backlog](https://www.backlog.site/) | One private-by-default library for all media | Per-item and per-stat privacy |
| [Ludenza](https://ludenza.com/) | Steam-only backlog and friend co-op overlap | Useful comparison without both users joining |
| [Gameedy](https://gameedy.com/en/) | Contextual recommendations and barcode capture | Physical and digital capture in one mobile flow |
| [PlayTrak](https://playtrakapp.com/) | Offline tracking and AI-assisted recommendations | Avoid unverifiable AI-derived factual metadata |
| [Savepoint](https://www.savepoint.one/) | Lightweight trending discovery and tracking | Simple game-first landing experience |
| [Questly](https://www.questly.games/) | Focused recommendations and trust-weighted friends | Explain the recommendation source |

## Recommended product strategy for this app

### Priority 1: Play Next & Resume V1

This is strongly validated by FinalSave, SessionPick, Questly, Game Rover,
KTOMG, Backlog Zero, and recurring user complaints about trackers that record a
backlog but do not help use it.

Recommended boundary:

- Create a separate ordered Next Up queue. It must not reuse backlog position,
  manual-list position, smart-list rank, or semantic status.
- Limit the focused queue visually, even if membership is technically larger.
- Add actions from cards and game details: Add to Next Up, remove, reorder, and
  Start Playing.
- Add one private `resume_note` / "Next time" field for active games.
- Make Start Playing explicit: confirm the status change, set `started_at` only
  when absent, preserve user dates, optionally remove from Next Up, and never
  infer the action from Steam activity.
- Return three explained recommendation lanes:
  - **Quick win:** short remaining estimate.
  - **Your priority:** high in Next Up.
  - **Worth returning to:** active or paused with recent context.
- Keep Surprise Me, but run it against Next Up or a user-selected filtered pool.
- Remember "not today" locally or with a short expiry; permanent exclusion is a
  separate explicit control.

Do not add mood/energy, AI chat, or a general event schema to this V1.

### Priority 2: Focused completion flow

When the owner deliberately marks a game Finished:

- Show a skippable sheet for finish date, score, actual/manual time, and short
  private reflection.
- Explain which fields were prefilled and their source.
- Keep private thoughts separate from future public review copy.
- Offer Cleared versus 100%/Mastered only after the status semantics and
  Insights grouping are designed.
- Create a durable completion event only when the activity model is ready; do
  not fabricate old history.

### Priority 3: Data Health Center

Unify existing repair surfaces:

- Ambiguous/unlinked catalog identity.
- Steam imports needing match review.
- Duplicate candidates.
- Missing hours, cover, finish date, or score.
- Stale Playing games.
- Provider/sync failures.

Each issue should show severity, why it matters, source/provenance, direct fix,
dismiss, and safe bulk actions. Counts must distinguish factual integrity from
optional completeness.

### Priority 4: Durable events and playthroughs

After the small queue and completion flow prove useful:

- Add append-only events for start, pause, resume, finish, status change,
  review, favorite, list, and import activity.
- Add optional play sessions with date, duration, progress, and note.
- Model multiple playthroughs separately from the catalog game and ownership
  source.
- Derive Timeline and recap data from events instead of reconstructing history
  from current fields.
- Keep visibility private until per-content controls exist.

### Priority 5: Portability and saved views

- Add versioned JSON export before richer notes/events increase lock-in risk.
- Add previewed import with identity matching and conflict resolution later.
- Decide whether saved views extend smart Lists or are a separate navigation
  primitive.
- Provide high-value presets: stale active games, short unplayed games,
  unscored finished games, metadata issues, and unmatched Steam games.

### Defer

- Global social feed, comments, reactions, clubs, and collaborative Lists.
- Public Steam playtime/achievements.
- XP, daily streaks, badges, and leaderboards.
- Deal aggregation and price alerts.
- Hardware, collection value, condition, and region tracking.
- AI-authored reviews or factual playtime estimates.
- Custom statuses before every downstream semantic dependency is redesigned.

## UI/UX principles taken from the market

1. **One primary action per context.** A Backlog card can offer Start or Queue;
   deeper editing belongs in details.
2. **Progressive disclosure.** Quick edit for status/queue; full edit for dates,
   identity, source, and hours policy.
3. **Cover grid for desire, table for control.** Preserve both mental modes and
   remember the user's chosen view.
4. **Explain automation.** Every imported, inferred, or recommended value needs
   a source and a way to override it.
5. **Show empty states as next actions.** "Your queue is empty—add from these
   short backlog games" is better than an illustration alone.
6. **Keep state vocabulary human.** Backlog, Playing, Paused, Finished, and
   Dropped should have descriptions; ownership and wishlist are separate axes.
7. **Make mobile capture faster than desktop organization.** Resume note,
   session log, score, finish, and queue actions should be thumb-friendly.
8. **Never punish non-use.** No red streak loss, shame copy, or misleading
   "backlog debt."

## Suggested success measures

Avoid optimizing only for account opens or games added. Measure whether the
product helps users make and remember decisions:

- Percentage of active owners who create a bounded Next Up queue.
- Queue-to-Start conversion within 7 and 30 days.
- Time from opening Next Up to choosing a game.
- Percentage of active games with a resume note.
- Return-to-active conversion after using a resume note.
- Completion-flow completion versus skip rate by field.
- Duplicate/metadata/import issues resolved through Data Health.
- Export usage and successful re-import tests.
- Percentage of recommendations accepted, dismissed for now, or excluded.

## Final recommendation

Do not compete by having the largest feature count. Infinite Backlog,
GameTrack, Minimap, and newer all-in-one products already demonstrate how
quickly that becomes a crowded control panel.

Compete on a coherent loop:

**Import safely → understand the library → choose a few credible options →
start deliberately → resume without friction → finish and remember.**

The current architecture already covers the hardest first step better than many
competitors. Play Next & Resume is the most defensible bridge from a good
tracker to a genuinely useful gaming companion.
