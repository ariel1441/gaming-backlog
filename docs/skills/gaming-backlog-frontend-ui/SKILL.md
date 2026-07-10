---
name: gaming-backlog-frontend-ui
description: Use for React/Tailwind UI work in the gaming backlog app, especially layout, responsive polish, public/demo/read-only states, and shared UI primitives.
---

# Gaming Backlog Frontend UI

## Use When

- The task touches React pages/components, layout, visual polish, forms, cards,
  filters, modals, or navigation.

## Required Context

Read:

- `AGENTS.md`
- `docs/SYSTEM_CONTEXT.md`
- relevant page/component files
- `src/components/ui/` exports before creating new primitives
- `src/index.css` and Tailwind config before adding new styling conventions

## Rules

- Use shared UI primitives from `src/components/ui/`.
- Preserve guest/demo, public read-only, and signed-in owner flows.
- Keep private backlog route code under `src/pages/Backlog/`.
- Use `useToast` and `useConfirm`; do not add browser `alert()` or
  `confirm()`.
- Check long game titles, missing cover art, empty states, auth errors, mobile,
  and desktop.
- Use browser/screenshots early when doing visual polish.

## Verification

- Styling-only: run `npm run lint` when practical.
- Shared UI/forms/routes/state: run `npm run check` when practical.
- Mention any responsive or visual checks that were not performed.
