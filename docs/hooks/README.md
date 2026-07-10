# Hook Drafts

Status: draft hook ideas from the AI workflow audit. These are not active
unless configured in the Codex environment or another automation layer.

Hooks should enforce repeatable safety checks. They should not replace
engineering judgment.

## Pre-Task Hook

Purpose: start every repo task with worktree awareness.

Suggested behavior:

```text
Run git status --short --branch.
If the worktree is dirty, summarize modified/untracked files before editing.
```

## Pre-Edit Hook

Purpose: reduce accidental broad edits.

Suggested behavior:

```text
Before editing, state the files intended to change and why.
If the task mode is PLAN ONLY or REVIEW ONLY, block file edits.
```

## Pre-Backup / Export Hook

Purpose: avoid leaking production-derived files or private identifiers.

Suggested behavior:

```text
Before creating backups, exports, dumps, or production-derived files:
1. Verify the target directory/file is ignored by git.
2. Prefer generic filenames without usernames or private account identifiers.
3. Confirm source and destination direction.
```

## Pre-Commit Hook

Purpose: make selective commits safer.

Suggested behavior:

```text
Show staged files.
Show unstaged modified files.
If unrelated work touches the same staged files, warn before committing.
Run git diff --check.
```

## Post-Schema-Change Hook

Purpose: keep migration workflow consistent.

Suggested behavior:

```text
If backend/migrations changed:
1. Confirm backend/schema.sql changed when schema changed.
2. Remind to run npm run db:migrate:local.
3. Remind to run npm run check when practical.
```

## Pre-Release Hook

Purpose: avoid assuming all deployment targets updated together.

Suggested behavior:

```text
Require separate checks for:
1. GitHub Actions
2. production migrations
3. Vercel frontend
4. Railway backend
5. direct production API smoke routes
```
