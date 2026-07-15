---
name: gaming-backlog-backend-api
description: Use for Express backend route, validator, service, auth, error-handling, and API contract work in the gaming backlog app.
---

# Gaming Backlog Backend API

## Use When

- The task touches `backend/routes/`, `backend/validators/`,
  `backend/services/`, auth, public serializers, or API error handling.

## Required Context

Read:

- `AGENTS.md`
- `docs/SYSTEM_CONTEXT.md`
- relevant route, validator, service, and tests

## Endpoint Shape

Follow:

1. route declaration
2. auth/guard
3. Celebrate/Joi validation
4. request parsing/normalization
5. query/service work
6. response serialization
7. centralized error forwarding

Use `backend/utils/httpError.js` helpers and `next(err)` for intentional API
errors. Preserve `{ error: { code, message, requestId } }`.

## Risks

- Scope all authenticated user data by `req.user.id`.
- Public serializers must explicitly allowlist fields.
- Be careful with RAWG, HLTB, public, insights, and Steam caches.
- Steam data remains private unless explicit privacy controls exist.

## Verification

Follow the CI-first verification policy in `AGENTS.md`. Finish the coherent API
change before running at most one focused backend test command when warranted.
Do not default to `npm run check`, and never rerun a passing suite without a
relevant code change.
