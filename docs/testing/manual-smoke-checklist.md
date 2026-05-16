# Manual Smoke Checklist

Status: manual checklist for deeper flows. A lightweight automated Playwright
smoke suite now covers demo start, public profile read-only rendering, and an
Insights-to-backlog filter link.

Run the automated smoke tests with:

```bash
npm run test:e2e
```

Run this before merging a larger UI/data branch to `main`.

## Private Backlog

- Open `/` while logged out: no fatal error screen and no private data shown.
- Log in: games load once auth is ready.
- Search, sort, and filter by status, RAWG genre, My Genre, hours, and
  completed shortcut.
- Switch between grid, compact, and list views.
- Open a game card and close the details modal.
- Add a game from RAWG search and verify the chosen match is saved.
- Try adding the same title again and confirm duplicate detection blocks it.
- Edit a game:
  - change status
  - change My Genre through multi-select
  - change started/finished dates
  - open Change metadata and select a different RAWG result
- Delete a game only after the confirmation dialog appears.
- Reorder games within the same rank/status group.

## Demo Flow

- Start the demo from the logged-out UI.
- Add/edit/reorder a demo game.
- Use Keep changes and confirm it opens the save-demo account flow.
- Use Discard demo and confirm the app returns to the logged-out state.

## Public Profile

- Enable public profile from account/settings controls.
- Open `/u/:username` in a clean browser/session.
- Confirm the profile is read-only.
- Search/filter/sort public games.
- Confirm edit/delete/reorder controls are not available.

## Insights

- Open `/insights` while logged in.
- Change weekly hours and confirm charts reload.
- Toggle missing games.
- Click a status/genre chart item and confirm it links back to filtered backlog.

## Production Migration Check

- For schema changes, confirm there is a migration in `backend/migrations/`.
- Confirm `backend/schema.sql` includes the same final schema.
- After merging to `main`, check GitHub Actions for the production migration
  result.
