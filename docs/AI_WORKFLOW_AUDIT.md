# AI Workflow Audit

Status: maintained summary of lessons from local Codex/chat history. Keep this
short and actionable. Do not paste full private chat transcripts here.

Last updated: 2026-07-10

## Evidence Summary

The audit reviewed gaming-backlog-related local Codex sessions and repo
artifacts from the recent Catalog/Discover, Steam, Timeline, Owner
Profile/Settings, Lists, Reviews, release, and AI-workflow threads.

The strongest recurring pattern was not poor AI usage. The project got real
value from AI. The main problem was that large chats absorbed too many phases:
planning, implementation, debugging, UI polish, release, and handoff.

## What Worked

- Product correction by the user was strong. The best outcomes happened when
  the user paused coding and asked how the feature should feel.
- Focused sessions worked well, especially Timeline cleanup and review-only
  Reviews work.
- Durable docs helped future chats: `AGENTS.md`, `SYSTEM_CONTEXT.md`,
  `AI_WORKFLOW.md`, and feature handoffs all reduced repeated explanation.
- Manual QA caught issues the assistant would not reliably notice, especially
  Steam import UX, Reviews card readability, and production deploy behavior.

## Repeated Problems

- Large feature threads became too broad and expensive.
- Some sessions moved from planning to implementation before product decisions
  were settled.
- New chats sometimes read too many historical planning docs.
- UI polish often iterated without early screenshot/browser verification.
- Release checks sometimes assumed GitHub, Vercel, Railway, and production DB
  moved together, even though they can diverge.
- Selective commits became painful when unrelated features touched shared files.
- Production-derived backup/export safety needed stronger default rules.

## Rules Adopted From The Audit

- Every task should start with a mode: `PLAN ONLY`, `REVIEW ONLY`,
  `IMPLEMENT`, `DEBUG ONLY`, `UI POLISH`, or `RELEASE`.
- New chats should use minimal context by default: `AGENTS.md`,
  `SYSTEM_CONTEXT.md`, and one focused doc only when relevant.
- Large features should be split into phases or chats.
- Release work must verify GitHub/CI, migrations, Vercel, Railway, and direct
  production API smoke checks separately.
- Before creating backups, exports, dumps, or production-derived files, verify
  the target is ignored and avoid private identifiers in filenames.
- If unrelated work exists in shared files, report staging risk before
  committing only one feature.

## Highest-Value Improvements

1. Use explicit mode labels in every prompt.
2. Keep `docs/NEXT_TASKS.md` short and current.
3. Use task templates from `docs/templates/`.
4. Create small skills instead of one large project skill.
5. Use browser/visual checks earlier for UI polish.
6. Treat release as its own phase.
7. Keep historical planning docs out of default startup context.
