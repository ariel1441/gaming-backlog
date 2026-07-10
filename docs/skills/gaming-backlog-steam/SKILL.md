---
name: gaming-backlog-steam
description: Use for Steam integration work, including reviewed import, Steam Library, achievements, ownership/playtime source data, duplicate safety, and privacy.
---

# Gaming Backlog Steam

## Use When

- The task touches `/steam/import`, `/steam/library`, Steam auth/sync, Steam
  achievements, Steam playtime/hours source behavior, import candidates, or
  Steam-linked backlog games.

## Required Context

Read:

- `AGENTS.md`
- `docs/SYSTEM_CONTEXT.md`
- `docs/planning/steam-integration-handoff.md`
- relevant Steam route/service/frontend files

## Product Rules

- Steam is a private ownership/source layer, not the app's global identity.
- Do not blindly import a full Steam library into the backlog.
- Import/review flows should attach existing games whenever possible.
- Duplicate prevention is core behavior.
- Steam actual playtime must not overwrite estimated hours.
- Steam data is private in V1. Do not expose ownership, playtime, last played,
  or achievements publicly without explicit privacy controls.
- Steam sync should not silently change backlog status or dates.

## Risk Checks

- Matching and duplicate handling.
- Hidden/ignored/restored semantics.
- Private/public serializer boundaries.
- Long-running sync UX.
- Production Steam OpenID URLs and env vars.

## Verification

Prefer focused Steam service/validator/frontend utility tests plus build/lint
based on changed surface area.
