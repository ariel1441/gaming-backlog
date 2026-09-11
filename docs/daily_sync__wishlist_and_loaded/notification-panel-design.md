# Notification panel: local implementation

2026-09-08. Implemented on `fix/steam-candidate-account-isolation` over the
existing uncommitted C.5 and artwork changes. No branch switch, commit, provider
sync, schema change, or production configuration.

## Research and decisions

- [Carbon notification patterns](https://carbondesignsystem.com/patterns/notification-pattern/):
  keep system notifications relevant and minimally disruptive, let users open a
  persistent panel, group related messages, and avoid repeatedly delivering the
  same notification. Carbon notes that its panel guidance is still evolving;
  this implementation adapts the principles to this app.
- [WAI disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/):
  use accessible expand/collapse controls. Native details/summary groups expose
  actions only when expanded.
- [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/):
  the mobile sheet uses the existing focus trap, background isolation, Escape
  dismissal and focus restoration. The desktop panel is non-modal, opens only
  from its bell, and restores focus on dismissal.

The desktop bell sits at the right of the Backlog and Wishlist toolbars; mobile
keeps its header bell. The desktop panel is 500px wide, aligned beneath the bell
with a stable top edge and scrolling contents. The profile footer retains its full
width. Mobile uses the shared Sheet.
The former Activity
navigation entry and Wishlist Activity shortcut are removed; `/activity` remains
available as optional History from the panel.

## Interaction

- Groups: new Steam games, started on Steam outside Backlog, existing Backlog
  playing suggestions, Wishlist drops/sales, other updates.
  A small upper-left bell badge counts grouped pending decisions across all pages,
  capped visually at 99+. Reading does not clear it; resolving or dismissing a
  decision does. Prices and routine updates do not contribute. New markers remain
  inside the panel. The header states the pending-decision count.
- Existing current-account inbox reads, activation baseline and per-event receipts
  are reused. Reads poll once per minute while visible. Opening the panel activates
  the existing historical baseline. Merely opening does not resolve decisions.
- Each domain loads at most 50 saved groups per page, with explicit older-page
  loading. New arrivals while the panel is open offer Show new updates, preserving
  status selections and in-progress interactions.
- Matched new games: choose a status with the shared SelectMenu/status labels
  (no preselection), then Add to Backlog. Games with observed play outside Backlog
  offer Add as Playing, with Choose another status under More options. Import uses
  existing duplicate-aware authenticated APIs. Catalog details and Change match
  are secondary options.
- Link existing game: search the current owner's Backlog and confirm the selected
  game inside the panel. Its existing status is preserved.
- Don't add dismisses the suggestion without hiding the source or importing it.
  Ignore this game is a separate confirmed option that suppresses source suggestions;
  it can be restored in Steam Library.
  Unmatched entries offer match review; they cannot bypass catalog matching.
- Playing suggestions show the current saved Backlog status and observed total
  Steam hours. Accept Playing changes status explicitly with `setStartedAt: false`.
  Keep current status dismisses the suggestion.
- Price facts offer store/details links and Hide update. Group-level Mark read
  changes receipts independently of decisions. Successful actions show inline
  feedback; failed actions retain the controls and show an inline error.
- Completed game writes are not retried merely because notification dismissal
  failed. Such receipt failures are explained in the inline result.
- Game titles have small shared cover thumbnails and local-date labels. Wishlist
  reorder events share one run summary headed Steam Wishlist order updated.
- Mark read is limited to informational groups. Completed actions retain a result
  disclosure that closes after four seconds and can be reopened; retry controls
  and warnings remain expanded. Focus moves to the disclosure before its focused
  contents collapse. The panel keeps its top edge fixed.
- New ownership and Wishlist removal are delivered as one acquisition notification,
  even when separate syncs arrive in either order. New-game and outside-Backlog
  started-playing decisions for one app share a group. Source facts remain intact.
- Steam membership mirrors confirmed Steam removals immediately. A local Wishlist
  intention remains until explicitly selected for removal after a successful
  Backlog add/link. A secondary removal failure offers Retry Wishlist removal or
  Keep reminder, never a second import. The endpoint verifies the current account,
  exact saved Steam identity, ownership and the user's linked Backlog game.
- Hide all updates dismisses Other updates through a fixed server snapshot, including
  older pages, while retaining game decisions, positive price groups and later arrivals.
- Wishlist has a compact freshness/attention line and secondary recovery controls.
  Detailed coverage, daily opt-in, run diagnostics and Library recovery are in
  Settings > Integrations. Moving the switch does not change its value or schedules.

Hours/achievement provider selection, retry schedules, metadata refresh/repairs,
acquisition automation and daily production scheduling are unchanged. Broader
Gaming Activity remains separate. Loaded stays D, Fanatical E, remaining polish F.

## Verification

Focused mocked desktop/mobile Playwright scenarios cover chosen-status import,
direct linking, unmatched-game fallback/Don't add, Playing acceptance with
failed-write recovery, read/hide persistence, empty state, long titles, no
horizontal overflow, and Escape/focus restoration. No real game writes or provider
requests are used. Purchase consolidation, bulk hiding beyond a page, future-event
preservation, explicit retirement and owner/account guards are covered by the
disposable localhost database contract. Full CI and real-account release
verification remain separate.
