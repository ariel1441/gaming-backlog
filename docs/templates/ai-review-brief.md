# AI Review Brief

Use this before merging, after another agent worked, or when you want a
findings-first review.

```text
Mode: REVIEW ONLY

Review target:
- current diff / branch / specific files:

Focus:
- bugs and regressions
- user data isolation
- auth/security/privacy
- database/migration risk
- API error shape
- UI/UX breakage
- missing tests
- production/deploy risk

Context to read:
- AGENTS.md
- docs/SYSTEM_CONTEXT.md
- relevant changed files

Output:
1. Findings first, ordered by severity.
2. Include file and line references.
3. Open questions/assumptions.
4. Test gaps and residual risk.
5. Brief summary only after findings.

Do not edit files unless I explicitly ask for fixes after the review.
```
