# Next Tasks

Updated: 2026-09-11. Read when choosing priorities, not on every small task.

## Selected next phase: release preparation

The release review/fixes and requested local gate are complete. Runtime candidate
`6dd5338` is on `fix/steam-candidate-account-isolation`, with a subsequent docs
commit. Reverify Git before acting. Read the
[preparation record](daily_sync__wishlist_and_loaded/local-release-preparation.md)
for evidence and the remaining remote CI/environment limits.

1. Review the three local commits; publish the feature branch only when authorized.
2. Obtain full CI for the exact candidate through a PR or Dev/main workflow.
3. Apply required migrations through the approved runner during an authorized
   rollout. Migration 035 was tested only in disposable localhost databases.
4. Verify CI, migrations, Railway, Vercel and production smoke targets separately.
   Verify actual daily Steam scheduling; do not infer it from code or local settings.

No commit, push, deploy or production configuration is authorized by this queue.
Preserve the local candidate and existing stashes; do not restore old drafts incidentally.

## Later, separately scoped work

- Loaded: Phase D; Fanatical: E; remaining deal/notification polish: F.
- Broader Gaming Activity, metadata repairs and acquisition/status automation stay
  separate. Scheduling, saved-data polling and metadata refresh are distinct concerns.
- Other candidates remain in [ROADMAP.md](ROADMAP.md); do not treat old plans as
  missing implementation without checking code. Personal genres and Backlog table
  are already implemented in this branch.

Older queues are preserved in [the pre-trim snapshot](NEXT_TASKS_history_2026-09-11.md)
for targeted historical lookup only. They do not override this queue.

## New-chat handoff

Give the phase, goal, acceptance criteria, branch/SHA, dirty-file risks, exact
completed checks and next action. Point to one relevant record; do not paste the
whole documentation set. Follow AGENTS.md and docs/VERIFICATION.md.
