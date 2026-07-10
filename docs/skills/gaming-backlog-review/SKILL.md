---
name: gaming-backlog-review
description: Use for findings-first code review of this gaming backlog repo, especially before merge, after another agent worked, or when checking a risky diff.
---

# Gaming Backlog Review

## Use When

- The user asks for a review.
- A diff touches auth, user data, backend routes, migrations, public profile,
  Steam, insights, shared utilities, or release behavior.
- Another AI/agent produced code and the user wants confidence before editing.

## Required Context

Read:

- `AGENTS.md`
- `docs/SYSTEM_CONTEXT.md`
- the changed files or diff
- focused feature handoff only if directly relevant

Do not read the full roadmap unless prioritization or product direction is part
of the review.

## Review Priorities

Lead with findings, ordered by severity:

1. Data isolation and auth bugs.
2. Database/migration and production data risk.
3. Privacy leaks, especially public profile and Steam data.
4. API response shape regressions.
5. Frontend permission/read-only/demo regressions.
6. UX breakage, empty states, long titles, missing covers, mobile issues.
7. Missing tests around changed shared logic.

## Output Shape

Use:

1. Findings.
2. Open questions.
3. Test gaps.
4. Brief summary.

Do not edit files during review unless the user explicitly switches to
implementation.
