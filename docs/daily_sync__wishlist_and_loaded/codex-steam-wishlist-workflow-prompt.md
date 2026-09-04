# Codex — Review and Implementation Workflow Prompt

Use this prompt together with:

- `docs/daily_sync__wishlist_and_loaded/gaming-backlog-steam-wishlist-master-plan.md`
- the detailed plan for the phase currently being implemented

The live repository is the final authority for actual filenames, dependencies, schema state, and implementation constraints.

---

## STEP 1 — REVIEW ONLY

We are implementing the next phase of the Steam Automation / Wishlist / Deal Tracking work described in the attached planning documents.

Treat the master plan as the intended product behavior and architectural direction, and treat the current phase document as the detailed implementation proposal.

Before changing any code, perform a fresh senior-level review against the LIVE repository.

Read and follow:
- `AGENTS.md`
- any repo-local development instructions
- relevant architecture/docs
- relevant DB/migration guidance
- relevant Steam/backend/frontend/testing guidance

Inspect the actual implementation. Do not assume old docs are still accurate.

### Review goals

1. Verify that the proposed behavior matches the current codebase.
2. Identify concrete:
   - bugs
   - hidden dependencies
   - incorrect assumptions
   - migration risks
   - concurrency issues
   - transaction problems
   - API compatibility issues
   - frontend integration issues
   - opportunities to reuse existing code
   - simpler implementations that preserve the intended behavior
3. Check whether the proposed DB models overlap with existing tables/concepts.
4. Check whether filenames/module boundaries in the phase plan should change because of the live repo.
5. Check current tests and determine the exact tests that should be added/updated.
6. Check whether anything in the live repo already implements part of the proposal.
7. Challenge the plan only when there is a concrete codebase, correctness, security, reliability, or maintainability reason.

### Important architecture constraints

Do NOT redesign toward:
- microservices
- Redis
- Kafka
- a new ORM
- a TypeScript migration of the existing app
- event sourcing
- complex queues
- WebSockets
- a separate wishlist application

unless the live code proves one of these is genuinely necessary.

Preserve the existing Gaming Backlog stack and conventions unless there is a strong reason not to.

### Return before implementation

Return:

1. `Blocking problems`
2. `Recommended changes`, ordered by importance
3. `Plan decisions that should stay exactly as written`
4. `Live-repo findings that differ from the planning docs`
5. `Exact expected file surface`
6. `Exact DB migration impact`
7. `Test plan`
8. Final verdict:
   - `ready to implement as written`
   - `ready with small changes`
   - `needs redesign`

For every proposed change, explain the concrete reason from the live codebase.

DO NOT IMPLEMENT YET.

---

## STEP 2 — IMPLEMENT AFTER REVIEW

After I approve the review/change list, implement the phase.

Requirements:

- implement ONLY the current phase
- preserve existing project conventions
- reuse shared helpers/components/services where appropriate
- avoid unrelated refactors
- keep migrations safe and reversible where practical
- do not silently alter existing user data semantics
- keep manual and scheduled versions of the same operation on one shared service path
- preserve explicit failure states
- never advance a "successful baseline" on invalid/partial source data unless the phase plan explicitly permits it
- keep user-facing personal tracking decisions as suggestions when the source only provides factual external data
- add/update tests alongside implementation
- update relevant documentation
- do not implement later phases "while you are there"

### Before finishing

Run the repository's normal:
- tests
- lint
- typecheck if applicable
- build
- migration/schema checks

Then return:

1. Summary of behavior implemented
2. Files changed
3. Migration details
4. Tests added/updated
5. Commands run and results
6. Any deviations from the approved plan
7. Manual verification checklist
8. Any follow-up work that belongs to a LATER phase rather than this one
