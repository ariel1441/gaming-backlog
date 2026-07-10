# AI Implementation Brief

Use this when the decision is made and the assistant should implement one
focused change.

```text
Mode: IMPLEMENT

Goal:

Acceptance criteria:
-
-

Allowed changes:
-

Do not touch:
-

Context to read:
- AGENTS.md
- docs/SYSTEM_CONTEXT.md
- [relevant files/docs only]

Instructions:
1. Start with `git status --short --branch`.
2. Inspect the relevant files before editing.
3. Keep the diff focused.
4. Use existing repo patterns and shared UI/services/utilities.
5. Add or update focused tests when the touched logic has meaningful risk.
6. Run the smallest useful verification and explain skipped checks.

Final response:
- changed files
- checks run
- skipped checks, if any
- pre-existing local modifications noticed
```
