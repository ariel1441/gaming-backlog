# Comprehensive Project Audit

## 1. Executive summary

The application has a solid baseline: authenticated game/list queries are generally scoped by `user_id`, public responses intentionally omit Steam joins, SQL values are parameterized, centralized API errors are widely used, descriptions are sanitized before HTML rendering, reorder and Steam import/merge operations use transactions in several of the highest-risk paths, and the declared lint/unit/build check passes. Those strengths are undermined by several concrete defects that the current mocked test strategy cannot detect.

No Critical issue was confirmed. The audit found **42 findings: 17 High, 22 Medium, and 3 Low**. Category counts are: security/privacy 4, authentication/authorization 3, database/data integrity 8, backend/API 5, integrations 3, performance 4, frontend/UX/accessibility 8, testing 2, documentation/configuration 3, and maintainability 2.

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 17 |
| Medium | 22 |
| Low | 3 |
| **Total** | **42** |

| Category | Count |
|---|---:|
| Security/privacy | 4 |
| Authentication/authorization | 3 |
| Database/data integrity | 8 |
| Backend/API | 5 |
| Integrations | 3 |
| Performance | 4 |
| Frontend/UX/accessibility | 8 |
| Testing | 2 |
| Documentation/configuration | 3 |
| Maintainability | 2 |

Highest-risk themes:

1. Authentication state is unsafe around `403`: even an unauthenticated public request can erase a valid persisted token, leaving React state and local storage disagreeing until reload.
2. Steam OpenID linking is not bound to the browser that initiated it, enabling login-CSRF/account-link confusion; a normal user can also overwrite a global Steam-app-to-catalog mapping used by every account.
3. A shipped Steam status-suggestion path always fails against the tracked schema because it updates a nonexistent `games.updated_at` column.
4. The database does not atomically enforce duplicate-game, normalized-title, date-order, numeric, position, or cross-owner relationship invariants. Several route-level check-then-write sequences race.
5. Steam review actions contain related writes outside transactions, and duplicate merging silently loses manual-list membership.
6. Insights is a mutating GET and can overwrite a concurrent manual HLTB edit; its cache is not invalidated for hour-source preference changes.
7. RAWG/Steam requests have no deadlines. RAWG failures are represented as valid empty results and cached as successes, making outages indistinguishable from no matches.
8. Large Steam libraries are processed synchronously and sequentially with repeated scans/queries, making the core sync path vulnerable to timeouts and partial completion.
9. Drag reorder sends an index from a filtered/sorted subset to a backend that interprets it in the complete rank group, so a valid drag can reorder the wrong hidden position.
10. Tests mock database calls and all Playwright APIs. The separate Playwright suite currently fails and is absent from both `npm run check` and CI, while the migration/schema contract is never exercised.

Recommended remediation order:

1. Fix AUTH-001, AUTH-002, DATA-004, and API-001 first; these are externally triggerable authentication/cross-user integrity/runtime failures.
2. Add database invariants and atomic write paths (DATA-001 through DATA-008), with preflight duplicate/invalid-data reports before constraints.
3. Add third-party deadlines and correct outage semantics (INT-001/002), then move/bound Steam sync work (PERF-001).
4. Repair filtered reorder, demo lifetime, insights races, and accessibility.
5. Add real-Postgres contract/migration tests and enforce the browser suite before relying on green CI.
6. Reconcile maintained documentation, environment templates, and dead/duplicated abstractions.

Review limitations:

- No database command was run. This avoided any chance of touching a remote or non-disposable database, but means SQL findings were verified statically against schema/migrations rather than reproduced against Postgres.
- No real Steam, RAWG, HLTB network, production, deployment, or production data was used.
- `npm audit --omit=dev --json` could not reach the npm advisory endpoint because certificate verification failed; this report makes no claim that dependencies are vulnerability-free.
- The local verification runtime was Node `v22.11.0`, outside the declared `>=20 <21` engine. GitHub CI declares Node 20.
- Browser verification used the repository's mocked desktop-Chromium Playwright suite. Mobile, touch, screen-reader, real-backend, and cross-browser behavior was reviewed statically but not interactively verified.
- The worktree already contained the modifications listed in section 2. They were preserved and were not attributed to this audit.

## 2. Verification performed

| Command/check | Result | Important result |
|---|---|---|
| `git status --short --branch` | Passed | Branch `Dev...origin/Dev`; pre-existing modified/untracked files are listed below. The audit file did not exist. |
| `rg --files` plus targeted `rg -n` searches across `src`, `backend`, `scripts`, migrations, tests, configuration, and maintained docs | Passed | Inventoried all major directories; traced auth, backlog CRUD/reorder, public, lists, catalog/RAWG, insights, timeline/reviews, Steam, schema/migrations, errors, permissions, and tests. |
| Initial sandboxed `npm run check` | Failed before project checks | Node could not `lstat C:\\Users\\ariel` under the filesystem sandbox (`EPERM`). This was an execution-environment failure, not a repo failure. |
| `npm run check` (approved outside sandbox) | Passed | `eslint .` passed; `node --test` ran **160 tests, 160 passed, 0 failed/skipped/todo**; Vite built 2,565 modules. Tests were present and did **not** pass through `--passWithNoTests`. |
| `npm run build` (as part of `npm run check`) | Passed with warnings | Main JS chunk was **1,600.89 kB minified / 372.84 kB gzip**; Vite warned about chunks over 500 kB. `caniuse-lite` data was 14 months old. |
| First short-timeout `npm run test:e2e` attempt | Timed out | The 1-second command deadline was insufficient; no result was inferred from it. |
| `npm run test:e2e` (approved, full run) | **Failed** | Desktop Chromium: **6 passed, 1 failed**. `updates favorite games from public profile settings` timed out expecting the removed `Public Profile` modal; current code navigates to Settings. |
| `npm audit --omit=dev --json` | **Failed / inconclusive** | npm advisory endpoint request failed with `unable to verify the first certificate`. No advisory result was available. |
| `npm ls eslint --depth=0` | **Failed / empty** | The project declares no direct ESLint package. |
| `Get-Command eslint` and `npm exec --no -- eslint --version` | Mixed | No normal-shell `eslint` command was found, while npm resolved ESLint `10.9.0` from outside the declared dependency graph. This explains why local lint success is not clean-install proof. |
| `git check-ignore -v -- test-results dist` | Passed | Both verification output directories are ignored. Generated `test-results/` and `dist/` were removed after checks. |
| `git diff --check` and final `git status --short --branch` | Passed with line-ending warnings | No whitespace error was reported. Git warned that several pre-existing LF files may be converted to CRLF when Git next touches them; this audit did not touch those files. Final status preserved every pre-existing entry and added only `?? docs/reviews/` for this report; generated `dist/`/`test-results/` were removed. The new report was separately checked for trailing whitespace/template counts because untracked files are not included by `git diff --check`. |

Checks deliberately skipped:

- `npm run db:migrate:local`, `npm run db:migrate:status`, and all reset/copy commands: no known disposable localhost database was established. The status command is also not read-only because it creates `schema_migrations` before reporting status (DOC-001).
- `npm run env:check`: the command can print `STEAM_MOCK_OWNED_GAMES_JSON` verbatim (SEC-002), so running it could expose local private/mock data.
- Real integration/API calls, production smoke checks, deployment commands, and production migration checks: prohibited by review scope and unnecessary to prove the static findings.
- Interactive mobile/screen-reader testing: there was no isolated real-backend test environment; the Playwright configuration only provides mocked desktop Chromium.

Pre-existing worktree state, preserved exactly as found before review:

```text
## Dev...origin/Dev
 M .gitignore
 M AGENTS.md
 M README.md
 M docs/AI_WORKFLOW.md
 M docs/README.md
 M docs/planning/ideas.md
 M docs/planning/metadata-catalog-refactor.md
?? docs/AI_TOOLING.md
?? docs/AI_WORKFLOW_AUDIT.md
?? docs/NEXT_TASKS.md
?? docs/hooks/
?? docs/skills/
?? docs/templates/ai-handoff.md
?? docs/templates/ai-implementation-brief.md
?? docs/templates/ai-plan-brief.md
?? docs/templates/ai-release-brief.md
?? docs/templates/ai-review-brief.md
```

## 3. Findings index

| ID | Severity | Confidence | Category | Short title | Primary location | Effort | Dependencies |
|----|----------|------------|----------|-------------|------------------|--------|--------------|
| SEC-001 | Medium | High | Security/privacy | Neutralize formulas in CSV exports | `src/pages/SettingsPage.jsx:88` | XS | None |
| SEC-002 | Medium | High | Security/privacy | Redact all environment payloads | `scripts/check-env.js:31` | S | None |
| SEC-003 | Medium | High | Security/privacy | Verify PostgreSQL server certificates | `backend/db.js:59` | M | DOC-001 |
| SEC-004 | Low | High | Security/privacy | Sanitize client request IDs before logging | `backend/middleware/requestId.js:3` | XS | None |
| AUTH-001 | High | High | Authentication/authorization | Do not erase sessions on arbitrary 403 responses | `src/services/apiClient.js:159` | M | None |
| AUTH-002 | High | High | Authentication/authorization | Bind Steam OpenID linking to the initiating browser | `backend/services/steamService.js:85` | L | AUTH-001 |
| AUTH-003 | Medium | High | Authentication | Define password byte-length policy | `backend/routes/auth.js:243` | S | None |
| DATA-001 | High | High | Database/data integrity | Make backlog uniqueness and position allocation atomic | `backend/routes/games.js:601` | L | DOC-001 |
| DATA-002 | High | High | Database/data integrity | Enforce valid calendar dates and date order | `backend/validators/games.js:21` | M | DOC-001 |
| DATA-003 | Medium | High | Database/data integrity | Enforce cross-owner and numeric invariants in PostgreSQL | `backend/schema.sql:202` | L | DOC-001 |
| DATA-004 | High | High | Cross-user data integrity | Stop user decisions from rewriting global Steam mappings | `backend/services/steamService.js:1480` | L | AUTH-002 |
| DATA-005 | High | High | Data loss | Preserve list membership during duplicate merge | `backend/services/steamService.js:2491` | M | DATA-003 |
| DATA-006 | High | High | Database/data integrity | Transactionalize related Steam review writes | `backend/services/steamService.js:2841` | L | DATA-003 |
| DATA-007 | High | High | Database/data integrity | Prevent insights reads from clobbering game edits | `backend/routes/insights.js:239` | M | API-004 |
| DATA-008 | High | High | Database/data integrity | Make catalog identity upsert race-safe | `backend/services/catalogService.js:420` | L | DOC-001 |
| API-001 | High | High | Backend/API | Remove nonexistent `games.updated_at` write | `backend/services/steamService.js:2126` | S | None |
| API-002 | Medium | High | Backend/API | Validate statuses and real dates before SQL | `backend/validators/games.js:6` | M | DATA-002 |
| API-003 | Medium | High | Backend/API | Allow users to clear estimated hours | `backend/routes/games.js:784` | S | API-004 |
| API-004 | Medium | High | Cache/API | Invalidate insights for hour-policy changes | `backend/routes/games.js:912` | S | None |
| API-005 | Medium | High | API contracts | Reject junk/ignored query and update fields | `backend/routes/insights.js:200` | M | None |
| INT-001 | High | High | Integrations | Add deadlines to RAWG and Steam calls | `backend/utils/fetchRAWG.js:49` | M | None |
| INT-002 | High | High | Integrations | Distinguish RAWG outage from empty results | `backend/utils/fetchRAWG.js:38` | L | INT-001 |
| INT-003 | Medium | High | Integrations | Fix catalog collection pagination gaps | `backend/services/catalogService.js:1263` | M | INT-002 |
| PERF-001 | High | High | Performance/reliability | Bound and move large Steam sync work | `backend/services/steamService.js:1811` | XL | INT-001, DATA-006 |
| PERF-002 | Medium | High | Performance | Bound public RAWG hydration and cache growth | `backend/routes/public.js:15` | M | INT-001, INT-002 |
| PERF-003 | Medium | High | Performance | Remove manual-list preview N+1 queries | `backend/routes/lists.js:158` | M | None |
| PERF-004 | Medium | High | Frontend performance | Code-split the 1.60 MB application bundle | `src/App.jsx:1` | M | None |
| UI-001 | High | High | Frontend correctness | Disable or translate reorder in derived views | `src/pages/Backlog/BacklogPage.jsx:280` | M | DATA-001 |
| UI-002 | High | High | Guest/demo | Do not delete demos on refresh/unload | `src/contexts/AuthContext.jsx:65` | M | None |
| UI-003 | Medium | High | Frontend correctness | Make insights URL and requests latest-wins | `src/hooks/useQueryBackedState.js:19` | M | API-004 |
| UI-004 | Medium | High | Frontend state | Reconcile deletions during silent refresh | `src/hooks/useGames.js:161` | S | None |
| UI-005 | Medium | High | Public UX | Render the intended private-profile state | `src/pages/PublicProfile.jsx:200` | S | AUTH-001 |
| UI-006 | Medium | High | Accessibility | Implement complete modal focus/stack behavior | `src/components/ui/Modal.jsx:20` | L | None |
| UI-007 | Medium | High | Accessibility | Make cards and listboxes keyboard-operable | `src/components/GameCard.jsx:303` | M | UI-006 |
| UI-008 | Low | High | Frontend hardening | Add read-only and unknown-route fallbacks | `src/pages/PublicProfile.jsx:293` | S | None |
| TEST-001 | High | High | Testing | Add real-Postgres authorization/schema tests | `backend/services/steamService.test.js:398` | XL | DOC-001 |
| TEST-002 | Medium | High | Testing/CI | Repair and enforce the Playwright suite | `tests/e2e/smoke.spec.js:514` | L | UI-005, UI-006 |
| DOC-001 | High | High | Deployment/database | Make migration automation fail-safe and bootstrappable | `backend/migrations/001_add_demo_user_columns.sql:1` | XL | None |
| DOC-002 | Medium | High | Schema/documentation | Reconcile schema, migrations, and schema-only policy | `backend/migrations/002_add_rawg_identity_to_games.sql:5` | M | DOC-001 |
| DOC-003 | Medium | High | Documentation/tooling | Make setup and checks reproducible | `package.json:22` | M | None |
| MAINT-001 | Medium | High | Maintainability/correctness | Centralize status semantics | `src/pages/Backlog/BacklogPage.jsx:94` | L | API-002 |
| MAINT-002 | Low | High | Maintainability | Remove dead legacy UI and misleading admin language | `src/components/Sidebar.jsx:1` | M | TEST-002 |

## 4. Detailed findings

### [SEC-001] Neutralize formulas in CSV exports

- Severity: Medium
- Confidence: High
- Category: Security/privacy
- Status: Confirmed
- Locations:
  - `src/pages/SettingsPage.jsx:88`
  - `src/pages/SettingsPage.jsx:95`
  - `src/pages/SettingsPage.jsx:913`
- Affected flows: Settings -> Data -> backlog CSV export -> spreadsheet import/open.
- Evidence:
  - `csvValue` quotes commas, quotes, and newlines but leaves cells beginning with `=`, `+`, `-`, `@`, tab, or carriage return intact.
  - Exported fields include user-controlled `name`, `my_genre`, and `thoughts`, and upstream-derived cover/title values.
- Impact:
  - Opening a crafted export in formula-evaluating spreadsheet software can execute a formula, trigger external requests, or mislead the user. This is a local export injection, not server-side code execution.
- Reproduction or verification:
  1. Create a game named `=HYPERLINK("https://example.invalid","click")` or put a leading formula marker in thoughts.
  2. Export CSV in Settings and inspect/open it in a formula-evaluating spreadsheet.
  3. Observe that the cell is emitted as a formula rather than inert text.
- Root cause: CSV escaping and spreadsheet formula neutralization were treated as the same concern.
- Recommended fix:
  1. In `SettingsPage.jsx`, prefix formula-leading cells with an apostrophe (or a documented safe tab/apostrophe policy) before RFC-style CSV quoting.
  2. Keep numeric fields numeric by applying the rule only to string values.
  3. Extract and export the serializer for unit testing.
- Acceptance criteria:
  - All dangerous leading characters are inert in Excel/LibreOffice/Google Sheets imports.
  - Quotes, commas, Unicode, and multiline thoughts still round-trip.
- Tests to add:
  - Unit: formula-leading values, whitespace before formulas, quotes/newlines, and ordinary numeric cells.
- Dependencies:
  - None.
- Regression risks:
  - Preserve UTF-8, CRLF output, existing headers, and legitimate negative numeric values.

### [SEC-002] Redact all environment payloads

- Severity: Medium
- Confidence: High
- Category: Security/privacy
- Status: Confirmed
- Locations:
  - `scripts/check-env.js:13`
  - `scripts/check-env.js:27`
  - `scripts/check-env.js:31`
  - `scripts/check-env.js:57`
  - `backend/services/steamService.js:202`
  - `backend/services/steamService.js:220`
- Affected flows: Local/CI diagnostics via `npm run env:check`.
- Evidence:
  - Redaction is name-based (`SECRET|KEY|TOKEN|PASSWORD`) and otherwise prints the complete value.
  - `STEAM_MOCK_OWNED_GAMES_JSON` is explicitly printed but its name does not match the redaction pattern; it can contain a private library payload. `STEAM_MOCK_PLAYER_SUMMARY_JSON` is consumed by code but is absent from the audited optional list.
- Impact:
  - Terminal logs, CI logs, or support transcripts can expose mock/private Steam library data and any future sensitive value whose variable name misses the regex.
- Reproduction or verification:
  1. In an isolated shell, set `STEAM_MOCK_OWNED_GAMES_JSON` to a harmless marker payload.
  2. Run `npm run env:check` and observe the entire payload printed. Do not use real private data.
- Root cause: The script defaults to disclosure and relies on a partial name blacklist.
- Recommended fix:
  1. Make redaction the default and allowlist only low-risk scalar configuration values.
  2. Print structured payload variables as `<set>` plus optional byte count.
  3. Add all variables actually consumed by the app, including player summary, base URLs, cache limits, HLTB settings, and remote-DB override.
- Acceptance criteria:
  - No JSON payload, credential, token, connection string password, or personal identifier is printed.
  - Missing/malformed required configuration remains actionable.
- Tests to add:
  - Script unit/child-process test covering every environment key class and redacted output snapshots.
- Dependencies:
  - None. DOC-003 should later make the environment inventory canonical.
- Regression risks:
  - Do not weaken the localhost database guard or print secret values in error branches.

### [SEC-003] Verify PostgreSQL server certificates

- Severity: Medium
- Confidence: High
- Category: Security/privacy
- Status: Needs verification
- Locations:
  - `backend/db.js:55`
  - `backend/db.js:67`
  - `scripts/db-migrate.js:61`
  - `scripts/db-migrate.js:74`
  - `.github/workflows/ci.yml:47`
- Affected flows: Hosted application database traffic and production migrations.
- Evidence:
  - When SSL is enabled, both runtime and migration clients use `{ rejectUnauthorized: false }`, which encrypts traffic without authenticating the database certificate.
  - Missing evidence: the deployed provider's CA/certificate requirements and whether the connection URL itself injects a safer TLS configuration.
- Impact:
  - In a hostile or misrouted network, credentials and data could be exposed to a man-in-the-middle endpoint. Tightening blindly may break providers that require a supplied CA.
- Reproduction or verification:
  1. Obtain the managed provider's documented CA chain and TLS requirements without exposing credentials.
  2. Test a staging connection with `rejectUnauthorized: true` and the provider CA where required.
  3. Confirm an untrusted/self-signed endpoint is rejected.
- Root cause: Hosted-database compatibility was implemented by globally disabling certificate validation.
- Recommended fix:
  1. Centralize PG TLS configuration shared by `backend/db.js` and `scripts/db-migrate.js`.
  2. Default production to verification; accept a CA through a secret/file mechanism when the provider requires it.
  3. Provide an explicit, narrowly named development-only escape hatch rather than silent disablement.
- Acceptance criteria:
  - Production runtime and migrations authenticate the DB server.
  - Local non-SSL development still works and provider-specific setup is documented.
- Tests to add:
  - Config unit tests for local, forced SSL, forced off, CA-present, and invalid-certificate cases.
- Dependencies:
  - Coordinate with DOC-001 production migration changes.
- Regression risks:
  - Validate Railway/current provider compatibility before deployment; never commit a CA secret if it contains private material.

### [SEC-004] Sanitize client request IDs before logging

- Severity: Low
- Confidence: High
- Category: Security/privacy
- Status: Confirmed
- Locations:
  - `backend/middleware/requestId.js:3`
  - `backend/middleware/errorHandler.js:113`
  - `backend/middleware/errorHandler.js:119`
- Affected flows: Any failing API request from a non-browser client.
- Evidence:
  - Any nonblank `X-Request-Id` is trusted after trim/truncate, including control characters.
  - The value is interpolated directly into single-line production logs and multiline development logs.
- Impact:
  - A client can forge extra log lines or corrupt log parsing/alert fields. The 128-character cap limits volume but not control characters.
- Reproduction or verification:
  1. Send a failing request with `X-Request-Id` containing encoded CR/LF using a raw HTTP client.
  2. Inspect development log structure and confirm forged line breaks.
- Root cause: Correlation IDs were bounded but not validated.
- Recommended fix:
  1. Accept a conservative printable pattern such as UUID/ULID or `[A-Za-z0-9._:-]{1,128}`.
  2. Generate a UUID when invalid; optionally retain the upstream ID in structured, escaped metadata.
- Acceptance criteria:
  - Response/log IDs contain no control characters and remain correlatable.
- Tests to add:
  - Middleware unit tests for UUID, whitespace, oversized, CR/LF, Unicode-control, and missing IDs.
- Dependencies:
  - None.
- Regression risks:
  - Preserve legitimate proxy correlation formats used in production.

### [AUTH-001] Do not erase sessions on arbitrary 403 responses

- Severity: High
- Confidence: High
- Category: Authentication/authorization
- Status: Confirmed
- Locations:
  - `src/services/apiClient.js:120`
  - `src/services/apiClient.js:158`
  - `src/services/publicService.js:4`
  - `src/pages/PublicProfile.jsx:41`
  - `backend/routes/public.js:87`
  - `backend/routes/public.js:125`
  - `backend/middleware/auth.js:15`
  - `src/contexts/AuthContext.jsx:17`
- Affected flows: Any API request returning 403; reproducibly, an authenticated user viewing `/u/:username` for a private profile.
- Evidence:
  - `apiFetch` removes the local-storage token on every 401 or 403, even when the call used `auth:false` and sent no token.
  - Private public-profile endpoints correctly return 403. `PublicProfile` deliberately calls them without auth.
  - `AuthContext` retains its in-memory `token` state, so after the storage deletion the UI can still say authenticated while default service calls omit Authorization. Reload then logs the user out.
  - Invalid/expired bearer tokens also return 403 rather than 401, making permission denials indistinguishable from invalid credentials.
- Impact:
  - Merely opening a private profile silently damages the current session. Subsequent requests behave inconsistently, unsaved work can be interrupted, and reload completes the logout.
- Reproduction or verification:
  1. Sign in and confirm `localStorage.token` exists.
  2. Navigate directly to a known private `/u/:username`.
  3. Observe the 403 and confirm storage token removal while the current React tree may still show the signed-in user.
  4. Reload and observe logout.
- Root cause: HTTP authorization status was treated as a global authentication event, and storage mutation is outside AuthContext.
- Recommended fix:
  1. Return 401 for missing/invalid/expired tokens; reserve 403 for an authenticated principal lacking permission.
  2. Never clear auth state for `auth:false` calls or ordinary 403 responses.
  3. Route actual 401 session expiry through one AuthContext-owned event/callback so memory and storage clear atomically.
  4. Preserve the original request error for page-specific UX.
- Acceptance criteria:
  - Public/private/forbidden requests cannot remove a valid session.
  - A genuinely expired token signs out once, consistently, after a 401.
  - Context state, headers, and local storage never disagree after handling an auth failure.
- Tests to add:
  - API client unit: unauthenticated 403, authenticated 403, authenticated 401, `auth:false` 401/403.
  - Playwright: signed-in user visits private public profile, returns to backlog, mutates a game, and remains signed in after reload.
- Dependencies:
  - None.
- Regression risks:
  - Do not turn permission failures into retry loops or expose private-profile existence beyond the chosen product policy.

### [AUTH-002] Bind Steam OpenID linking to the initiating browser

- Severity: High
- Confidence: High
- Category: Authentication/authorization
- Status: Confirmed
- Locations:
  - `backend/routes/steam.js:58`
  - `backend/routes/steam.js:66`
  - `backend/routes/steam.js:76`
  - `backend/services/steamService.js:85`
  - `backend/services/steamService.js:106`
  - `backend/services/steamService.js:350`
  - `src/pages/SteamImportPage.jsx:291`
- Affected flows: Link/relink Steam; account uniqueness and callback error display.
- Evidence:
  - The state JWT contains app user ID/provider/time but no browser/session nonce. The callback is unauthenticated and accepts any valid signed state URL until expiry.
  - An attacker can obtain a link URL while signed into the attacker's app account and cause another browser/user to complete it. Steam authenticates the victim's Steam account, then the callback links that SteamID to the attacker app user from state.
  - `upsertSteamAccount` disconnects that same SteamID from any other app user, but does not disconnect the old user's `user_game_sources` rows.
  - Callback errors redirect with raw `err.message`, and the frontend displays the query-string value verbatim; database/JWT implementation messages can leak to the user.
- Impact:
  - Login CSRF/account-link confusion can attach a victim's Steam identity and subsequently synced private library metadata to the attacker's application account. Existing linkage may be displaced and stale source state remains behind.
- Reproduction or verification:
  1. Account A calls `/api/steam/auth/start` and copies the returned Steam URL.
  2. Open that URL in a separate browser authenticated to Steam account B, without an app session for A.
  3. Complete OpenID and observe that B's SteamID is linked to app account A.
  4. If B was already linked elsewhere, inspect that account/source state using non-production test users.
- Root cause: Signed state authenticates server origin but not the initiating browser or one-time transaction.
- Recommended fix:
  1. Create a cryptographically random, single-use link transaction persisted server-side with app user ID, expiry, and consumed timestamp.
  2. Bind it to a SameSite, Secure, HttpOnly callback nonce cookie (or equivalent authenticated callback handoff) and compare both values.
  3. Consume atomically before linking and reject replay/missing-cookie callbacks.
  4. Revisit provider-account reassignment policy; require explicit unlink/confirmation instead of silently displacing another user.
  5. Map callback failures to stable public codes/messages, not raw exception text; reconcile displaced source rows transactionally.
- Acceptance criteria:
  - A link URL completed in a different browser/session is rejected.
  - State is single-use, expires, and cannot silently displace another user's active linkage.
  - Callback URLs never contain raw JWT/Postgres exception text.
- Tests to add:
  - Route/integration: correct browser, missing nonce, wrong nonce, replay, expired state, existing provider ownership, callback DB failure.
  - Browser: two-context login-CSRF test with mocked provider verification.
- Dependencies:
  - Fix AUTH-001 first so expected 403 handling does not destroy sessions.
- Regression risks:
  - Preserve Steam OpenID verification, development linking restrictions, return URL configuration, and private Steam serialization.

### [AUTH-003] Define password byte-length policy

- Severity: Medium
- Confidence: High
- Category: Authentication
- Status: Confirmed
- Locations:
  - `backend/routes/auth.js:243`
  - `backend/routes/auth.js:263`
  - `backend/routes/auth.js:291`
  - `backend/validators/demo.js:19`
  - `src/components/AdminLoginForm.jsx:23`
  - `backend/middleware/security.js:27`
- Affected flows: Registration, login, and converting a demo to a permanent account.
- Evidence:
  - Normal registration accepts any nonempty password up to the 1 MB JSON body limit; the UI has the same rule.
  - Demo conversion requires six characters, so the two account-creation paths disagree.
  - bcrypt only considers the first 72 password bytes, creating confusing equivalent passwords for long/multibyte inputs; no byte-aware maximum is communicated.
- Impact:
  - Users can create weak one-character accounts or believe characters beyond bcrypt's effective limit add uniqueness. Very large inputs also waste parsing/hashing resources within the route rate limit.
- Reproduction or verification:
  1. Register with a one-character password; observe success.
  2. In an isolated test, register/login with two passwords sharing the first 72 UTF-8 bytes and differing afterward; verify bcrypt equivalence.
  3. Compare with demo-keep validation, which rejects fewer than six characters.
- Root cause: Auth routes use hand-written presence checks instead of a shared credential schema/policy.
- Recommended fix:
  1. Add shared Celebrate/Joi validation for username/password on register/login/demo keep.
  2. Choose and document minimum strength and a UTF-8 byte-aware maximum no greater than bcrypt's effective input, or pre-hash with an explicitly designed migration-compatible scheme.
  3. Apply the same policy and messages in both account-creation UIs; do not silently truncate.
  4. Do not invalidate existing hashes without a migration/login-upgrade plan.
- Acceptance criteria:
  - Both account-creation paths enforce the same documented policy.
  - Overlong/multibyte passwords are rejected explicitly and existing users can still log in.
- Tests to add:
  - Route tests for empty, minimum boundary, over-byte-limit ASCII/Unicode, and existing-account login.
- Dependencies:
  - None.
- Regression risks:
  - Preserve current bcrypt hashes and avoid revealing whether a username exists.

### [DATA-001] Make backlog uniqueness and position allocation atomic

- Severity: High
- Confidence: High
- Category: Database/data integrity
- Status: Confirmed
- Locations:
  - `backend/routes/games.js:255`
  - `backend/routes/games.js:601`
  - `backend/routes/games.js:669`
  - `backend/routes/games.js:683`
  - `backend/routes/catalog.js:31`
  - `backend/routes/catalog.js:215`
  - `backend/routes/catalog.js:227`
  - `backend/routes/catalog.js:302`
  - `backend/services/steamService.js:3313`
  - `backend/schema.sql:202`
- Affected flows: Manual add, catalog add, Steam import, and initial ordering within a rank group.
- Evidence:
  - Manual and catalog adds read for duplicates, separately read `MAX(position)`, then insert without a transaction/lock or database uniqueness constraint.
  - Two concurrent requests can both observe no duplicate and the same maximum, then create duplicate games with identical positions.
  - `games` only enforces unique favorite ranks. There is no partial uniqueness for `(user_id, catalog_game_id)`, `(user_id, rawg_id)`, or a durable normalized title key.
  - Steam import performs duplicate checks inside its transaction, but different candidate rows do not serialize on a per-user identity key; the same missing database invariant remains.
- Impact:
  - Double clicks, retries, tabs, or concurrent imports create duplicate backlog rows and ambiguous manual order. Later merges can lose secondary relationships (DATA-005).
- Reproduction or verification:
  1. Against a disposable local DB, pause two authenticated POST `/api/games` requests after their duplicate/position reads.
  2. Release both and verify two normalized-equivalent rows and/or equal positions.
  3. Repeat with two catalog add requests and with two candidate imports resolving to one catalog identity.
- Root cause: Application preflight checks are used as integrity enforcement, and position allocation is a non-locking `MAX + 1000` operation.
- Recommended fix:
  1. Write a pre-migration report for duplicate catalog IDs, RAWG IDs, normalized titles, and tied positions; define deterministic merge/manual-resolution rules.
  2. Add a canonical normalized-title column/function and partial unique indexes per user for strong external identities and the chosen manual-title rule.
  3. Wrap duplicate check, rank-group lock/advisory lock, position allocation, and insert in one transaction in manual, catalog, and import paths.
  4. Catch `23505` and return the existing stable 409 contract.
  5. Consider a per-user/per-rank sequence or lock rather than relying only on position uniqueness.
- Acceptance criteria:
  - Concurrent equivalent adds produce one row and one deterministic 201/409 outcome.
  - Concurrent distinct adds receive deterministic, noncolliding order.
  - All three creation paths share the invariant.
- Tests to add:
  - Real-Postgres concurrency tests with barriers for manual, catalog, and Steam add paths; migration tests with pre-existing duplicates/ties.
- Dependencies:
  - DOC-001 must establish a safe migration baseline/deployment path.
- Regression risks:
  - Do not collapse legitimate editions/sequels through an overaggressive title normalizer; preserve existing IDs/relationships during cleanup.

### [DATA-002] Enforce valid calendar dates and date order

- Severity: High
- Confidence: High
- Category: Database/data integrity
- Status: Confirmed
- Locations:
  - `backend/validators/games.js:21`
  - `backend/validators/games.js:113`
  - `backend/routes/games.js:761`
  - `backend/routes/games.js:840`
  - `backend/routes/games.js:871`
  - `backend/schema.sql:220`
  - `backend/routes/catalog.js:207`
- Affected flows: Create/edit game, catalog add, automatic started/finished dates, timeline/reviews/insights.
- Evidence:
  - Joi only checks the `YYYY-MM-DD` shape, so impossible dates such as `2026-02-31` reach PostgreSQL.
  - The object-level order check compares dates only when both are present in the same request.
  - Update preserves an omitted stored counterpart. Sending only a new `finished_at` earlier than existing `started_at` (or only a new later `started_at`) creates an inverted range.
  - PostgreSQL has no `finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at` constraint. Invalid date SQLSTATE `22008` is not mapped by the central handler and becomes a generic 500.
- Impact:
  - Core date history becomes logically invalid, timeline/insights group incorrect events, and malformed client input is reported as an internal failure.
- Reproduction or verification:
  1. Create a game with `started_at=2026-07-10`, then PUT the full required body with only `finished_at=2026-07-01`; observe the inverted stored range.
  2. POST `started_at=2026-02-31`; observe validation pass and a PostgreSQL error/generic 500.
  3. Repeat catalog add with impossible/inverted dates.
- Root cause: Partial-update validation lacks current-row context and the database does not own the invariant.
- Recommended fix:
  1. Use strict ISO calendar-date validation in all game/catalog validators.
  2. After loading the owned current row, compute effective started/finished values and reject an inverted pair before update.
  3. Add a backward-compatible CHECK migration after reporting/repairing existing invalid rows; update `schema.sql`.
  4. Map any remaining date-format SQLSTATE to a safe 400/422 response.
- Acceptance criteria:
  - Impossible dates and inverted effective ranges return structured 422 without writes.
  - Direct SQL cannot insert/update an inverted range.
  - Same-day and single-ended ranges remain valid.
- Tests to add:
  - Validator/route tests for leap days, month bounds, partial updates, clearing either date, auto-date transitions, and catalog add.
  - Migration constraint tests against invalid fixture rows.
- Dependencies:
  - DOC-001 for safe constraint deployment.
- Regression risks:
  - Preserve SQL DATE string semantics/timezone handling and the deliberate Israel-local automatic date.

### [DATA-003] Enforce cross-owner and numeric invariants in PostgreSQL

- Severity: Medium
- Confidence: High
- Category: Database/data integrity
- Status: Confirmed
- Locations:
  - `backend/schema.sql:202`
  - `backend/schema.sql:208`
  - `backend/schema.sql:210`
  - `backend/schema.sql:214`
  - `backend/schema.sql:251`
  - `backend/schema.sql:297`
  - `backend/schema.sql:344`
  - `backend/migrations/006_add_steam_integration.sql:33`
  - `backend/migrations/013_add_user_lists.sql:15`
- Affected flows: Manual lists, Steam source/candidate links, scores/hours/playtime/achievements, direct maintenance/backfills, and future route changes.
- Evidence:
  - `user_list_games(list_id, game_id)` has independent FKs; PostgreSQL permits a list owned by user A to reference user B's game.
  - `user_game_sources(user_id, game_id)` and `steam_import_candidates(user_id, duplicate_game_id)` have the same cross-owner gap.
  - App joins often add owner equality and current routes generally check ownership, which limits current exposure, but corrupt rows can be inserted and then disappear from some reads while cascading unexpectedly in others.
  - `games.position`, `how_long_to_beat`, `my_score`, Steam playtime/achievement counts, percentages, and observed playtime lack database range/nonnegative checks beyond a few enum/favorite constraints.
- Impact:
  - One missed predicate, failed multi-write, migration, or manual operation can create cross-tenant relationships or impossible metrics that the database accepts. Current route scoping is defense-in-depth evidence, not an integrity substitute.
- Reproduction or verification:
  1. In a disposable DB with two users, directly insert user B's `game_id` into user A's list/source/candidate row; observe acceptance.
  2. Insert negative position/hours/playtime or score outside 0–10; observe acceptance where the SQL type permits it.
- Root cause: The schema models IDs but not the owning-user relationship or domain ranges.
- Recommended fix:
  1. Add unique `(id,user_id)` parent keys as needed and composite FKs from relationship tables, with explicit cascade/set-null behavior.
  2. Backfill/report cross-owner rows before validation; use `NOT VALID` then `VALIDATE CONSTRAINT` where deployment size warrants it.
  3. Add CHECK constraints for nonnegative positions/hours/counts, score 0–10, percentage 0–100, and unlocked <= total when both exist.
  4. Update schema and all insert/update tests; keep handler ownership predicates as the security boundary.
- Acceptance criteria:
  - PostgreSQL rejects all cross-owner relationships and invalid numeric states.
  - Valid current routes/imports still write successfully.
- Tests to add:
  - Real-DB constraint tests and migration tests with dirty fixtures; route cross-user tests for every relationship mutation.
- Dependencies:
  - DOC-001; coordinate with DATA-005/006 to avoid transient invalid writes.
- Regression risks:
  - Composite FKs must preserve intended `ON DELETE` behavior, especially nullable Steam links and list cascades.

### [DATA-004] Stop user decisions from rewriting global Steam mappings

- Severity: High
- Confidence: High
- Category: Cross-user data integrity
- Status: Confirmed
- Locations:
  - `backend/services/steamService.js:1266`
  - `backend/services/steamService.js:1277`
  - `backend/services/steamService.js:1457`
  - `backend/services/steamService.js:1480`
  - `backend/services/steamService.js:2753`
  - `backend/services/steamService.js:2930`
  - `backend/services/steamService.js:3338`
  - `backend/schema.sql:150`
- Affected flows: User-selected Steam catalog match, candidate attach/import, every later user's Steam sync/auto-match.
- Evidence:
  - A user may select any existing catalog game for their candidate.
  - Attach/import then executes global `external_game_ids(source='steam', external_id=appId) ... ON CONFLICT DO UPDATE SET catalog_game_id=EXCLUDED.catalog_game_id`.
  - `findCatalogMatch` treats that global row as an exact provider-ID match for all users, before title checks.
- Impact:
  - Any authenticated user can intentionally or accidentally remap a Steam app to an unrelated catalog game, poisoning matches, metadata, HLTB recommendations, and imports for every other user. This is a cross-user integrity boundary violation even though backlog rows remain user-scoped.
- Reproduction or verification:
  1. User A syncs an app, selects an unrelated catalog ID, accepts/imports it.
  2. Confirm `external_game_ids` now maps that Steam app globally to the chosen ID.
  3. User B syncs the same app and observe an `exact` match to A's choice.
- Root cause: A global curated/provider identity table is updated from untrusted per-user preferences.
- Recommended fix:
  1. Keep manual corrections in a user-scoped mapping/override table or only on candidate/source rows.
  2. Restrict global identity changes to trusted ingestion/admin curation with provenance/confidence/audit fields.
  3. Stop `attachSteamCandidateTx` and import paths from upserting global mappings for user-selected matches.
  4. Audit existing Steam global mappings against app/title evidence and repair before changing lookup precedence.
- Acceptance criteria:
  - One user's manual choice affects only that user's source/candidate/import.
  - Global mappings cannot be changed through ordinary authenticated endpoints.
  - Existing verified mappings still provide exact matching.
- Tests to add:
  - Two-user real-DB test proving user A's correction cannot alter user B; trusted-ingestion tests for global mapping creation/conflict.
- Dependencies:
  - Coordinate with AUTH-002 account-link ownership policy.
- Regression risks:
  - Preserve idempotent imports and existing correct global mappings; migrate provenance without orphaning sources.

### [DATA-005] Preserve list membership during duplicate merge

- Severity: High
- Confidence: High
- Category: Data loss
- Status: Confirmed
- Locations:
  - `backend/services/steamService.js:2491`
  - `backend/services/steamService.js:2517`
  - `backend/services/steamService.js:2572`
  - `backend/services/steamService.js:2582`
  - `backend/services/steamService.js:2591`
  - `backend/schema.sql:251`
- Affected flows: Steam duplicate review -> merge backlog games; manual lists.
- Evidence:
  - Merge transfers selected game fields, Steam sources, and candidate duplicate references, then deletes duplicate games.
  - It never reads/transfers `user_list_games`. The FK cascades each deleted duplicate's list memberships.
  - If keep and duplicate both belong to a list, a naive transfer would also hit the composite primary key and needs explicit deduplication/position policy.
- Impact:
  - Confirming a duplicate merge silently removes the game from one or more user-curated lists, a user-visible irreversible data loss not disclosed by the UI response.
- Reproduction or verification:
  1. Put duplicate game D, but not keep game K, into a manual list.
  2. Merge D into K through the Steam duplicate flow.
  3. Reload the list and observe that membership disappeared.
- Root cause: The merge relationship inventory was incomplete.
- Recommended fix:
  1. Inside the existing merge transaction, lock memberships for keep/remove IDs.
  2. Insert K into every affected list with deterministic position (prefer K's existing position; otherwise earliest/minimum duplicate position), using conflict handling.
  3. Renumber affected lists only if their ordering contract requires it, then delete duplicates.
  4. Include transferred list count in the response/audit log.
- Acceptance criteria:
  - The union of list memberships is preserved after merge with no duplicate memberships.
  - Manual list order remains deterministic and other list games do not move unexpectedly.
- Tests to add:
  - Real-DB merge tests: duplicate-only membership, both present, multiple lists, multiple duplicates, rollback on membership failure.
- Dependencies:
  - DATA-003 composite ownership constraints should be designed together.
- Regression risks:
  - Preserve favorite-rank conflict handling, Steam source transfer, candidate references, and transaction rollback.

### [DATA-006] Transactionalize related Steam review writes

- Severity: High
- Confidence: High
- Category: Database/data integrity
- Status: Confirmed
- Locations:
  - `backend/services/steamService.js:447`
  - `backend/services/steamService.js:2841`
  - `backend/services/steamService.js:2845`
  - `backend/services/steamService.js:2870`
  - `backend/services/steamService.js:2919`
  - `backend/services/steamService.js:3030`
  - `backend/services/steamService.js:3121`
  - `backend/services/steamService.test.js:293`
- Affected flows: Disconnect Steam, ignore/restore/select catalog, bulk ignore/restore, and auto-match.
- Evidence:
  - These functions update candidate/account state and corresponding source rows with separate `pool.query` calls and no transaction.
  - A failure after the first write leaves contradictory states, e.g. candidate `ignored` while source remains `owned`, or account disconnected while source rows remain attached.
  - The unit test asserts both mock queries occur but cannot inject a real second-write failure and assert rollback.
  - Attach, unlink, import, and merge already demonstrate the transaction pattern that should be reused.
- Impact:
  - Transient DB failures or deploy interruptions leave review piles, filters, source badges, and retry behavior disagreeing. Subsequent sync may preserve/compound the wrong state.
- Reproduction or verification:
  1. In a disposable DB, add a trigger or test hook that fails the second related update.
  2. Invoke ignore, restore, select-catalog, bulk ignore/restore, disconnect, and auto-match.
  3. Observe first-table changes persist without the corresponding second-table change.
- Root cause: Related state transitions are implemented as independent statements on the pool rather than transaction-owned services.
- Recommended fix:
  1. Define invariants/state-transition helpers for candidate/source/account pairs.
  2. Use one checked-out client and `BEGIN/COMMIT/ROLLBACK`; lock the owned candidate/source rows where concurrent sync can race.
  3. Verify expected row counts and treat missing counterpart rows according to an explicit invariant (create, no-op, or fail).
  4. Reuse the existing transaction pattern from attach/import/merge and clear caches only after commit.
- Acceptance criteria:
  - Injecting failure at any statement leaves all related rows unchanged.
  - Concurrent sync/review action has a deterministic final state.
- Tests to add:
  - Real-Postgres failure-injection and concurrency tests for every multi-write action; route error-shape tests.
- Dependencies:
  - Coordinate with DATA-003 constraints and PERF-001 job boundaries.
- Regression risks:
  - Keep bulk limits, user scoping, hidden-state persistence, and idempotent retries.

### [DATA-007] Prevent insights reads from clobbering game edits

- Severity: High
- Confidence: High
- Category: Database/data integrity
- Status: Confirmed
- Locations:
  - `backend/routes/insights.js:196`
  - `backend/routes/insights.js:217`
  - `backend/routes/insights.js:234`
  - `backend/routes/insights.js:239`
  - `backend/routes/insights.js:250`
  - `src/services/apiClient.js:107`
- Affected flows: GET `/api/insights`, HLTB write-through, concurrent game edit, GET retry/cache.
- Evidence:
  - A GET resolves HLTB values, then updates up to 50 `games` rows.
  - The update matches only `g.id=v.id`; IDs originated from a user-scoped read, so direct cross-user selection was not found, but it omits `user_id` and `how_long_to_beat IS NULL` at write time.
  - If a user saves manual hours after the base read and before this update, the GET overwrites the new value. The API client also retries GET network failures by default.
  - Only 50 rows are persisted, while the full computed payload is cached; remaining rows are deferred until cache expiry.
- Impact:
  - Viewing analytics can overwrite a concurrent user edit and produce DB/cache state that differs depending on row order and timing.
- Reproduction or verification:
  1. Seed a game with null HLTB that resolves from local HLTB data.
  2. Pause insights after `fetchBaseRows`, update the game manually to a different hour value, then release insights.
  3. Observe the manual value overwritten.
  4. Seed >50 resolvable null rows and compare returned sources to persisted rows/cache.
- Root cause: Read-time enrichment is a side effect without an optimistic concurrency predicate or explicit write contract.
- Recommended fix:
  1. Prefer making GET insights read-only; move enrichment to explicit/background write-through with its own tests.
  2. If write-through remains, update with `WHERE user_id=$user AND how_long_to_beat IS NULL`, return affected IDs, and never overwrite manual/locked values.
  3. Define batch continuation independently of the cached aggregate or persist all bounded rows before caching.
  4. Record source/provenance if estimates and manual values must coexist.
- Acceptance criteria:
  - GET insights cannot overwrite a value changed after its base read.
  - Repeating/retrying GET is side-effect free or safely idempotent.
  - More than 50 missing rows converge predictably.
- Tests to add:
  - Real-DB concurrency test, >50-row batch test, retry/idempotency test, and user predicate assertion.
- Dependencies:
  - API-004 cache invalidation semantics should be fixed with this change.
- Regression risks:
  - Preserve aggregate hour-source policy and avoid making page load depend on a long enrichment job.

### [DATA-008] Make catalog identity upsert race-safe

- Severity: High
- Confidence: High
- Category: Database/data integrity
- Status: Confirmed
- Locations:
  - `backend/services/catalogService.js:406`
  - `backend/services/catalogService.js:420`
  - `backend/services/catalogService.js:482`
  - `backend/services/catalogService.js:509`
  - `backend/services/catalogService.js:512`
  - `backend/schema.sql:116`
  - `backend/schema.sql:140`
- Affected flows: Catalog search, collection seed/scheduler, game identity hydration, concurrent server instances.
- Evidence:
  - Upsert first selects by external ID, then inserts a `catalog_games` row and attempts the unique external-ID association with `ON CONFLICT DO NOTHING`.
  - Two concurrent calls can both see no mapping and each insert a catalog row. One association wins; the loser still returns its newly inserted, now-unassociated orphan row.
  - `catalog_games` itself has no unique provider identity.
- Impact:
  - Duplicate/orphan catalog rows accumulate and can be placed in shelves/backlogs. Metadata updates diverge, manual selection becomes ambiguous, and cleanup risks breaking references.
- Reproduction or verification:
  1. Add a barrier after `selectCatalogByExternal` and call the upsert twice for one RAWG ID using a disposable DB.
  2. Release both; inspect two catalog rows but one `external_game_ids` row.
  3. Observe one caller receives the orphan ID.
- Root cause: The unique conflict is handled on the association after creating an unconstrained parent, without transaction/loser reselect cleanup.
- Recommended fix:
  1. Serialize per `(source,external_id)` using transaction advisory lock or redesign identity creation around an atomic insert/upsert that returns the winning catalog ID.
  2. On conflict, select/update the winner and remove any unreferenced loser in the same transaction.
  3. Audit and merge existing orphan/duplicate catalog rows before adding stronger invariants.
  4. Cover multi-process scheduler/search concurrency.
- Acceptance criteria:
  - Concurrent upserts return the same catalog ID and leave exactly one identity/catalog record.
  - Full metadata is never downgraded by a lower-quality concurrent result.
- Tests to add:
  - Real-Postgres barrier concurrency tests for search-result/full-result orderings and multi-collection insertion.
- Dependencies:
  - DOC-001 for safe cleanup/migration deployment.
- Regression risks:
  - Preserve references from games, collections, sources, candidates, and external IDs while merging existing rows.

### [API-001] Remove the nonexistent `games.updated_at` write

- Severity: High
- Confidence: High
- Category: Backend/API
- Status: Confirmed
- Locations:
  - `backend/services/steamService.js:2110`
  - `backend/services/steamService.js:2126`
  - `backend/services/steamService.js:2134`
  - `backend/schema.sql:202`
  - `backend/migrations/001_add_demo_user_columns.sql:1`
  - `backend/services/steamService.test.js:398`
- Affected flows: Steam Library/Import -> apply “playing” status suggestion to a linked backlog game.
- Evidence:
  - The service executes `UPDATE games ... updated_at = NOW()`.
  - The final fresh schema has no `games.updated_at`, and no migration adds it.
  - The mocked unit test accepts any SQL text matching the prefix and therefore passes without PostgreSQL parsing the column reference.
- Impact:
  - Every status-suggestion request fails with PostgreSQL `42703` and becomes a generic 500/database error. A promoted core Steam flow is nonfunctional despite green unit/build checks.
- Reproduction or verification:
  1. Apply the tracked schema to a disposable local DB and link a Steam source to a game.
  2. POST `/api/steam/games/:gameId/status-suggestion` with `{ "status":"playing" }`.
  3. Observe `column "updated_at" of relation "games" does not exist` server-side and a 500 client response.
- Root cause: Service SQL and schema evolved independently; tests mock the SQL executor.
- Recommended fix:
  1. Decide whether games require timestamps. For the smallest fix, remove the assignment; if product behavior needs it, add a backward-compatible migration and schema column first.
  2. Add a real-schema integration test for this endpoint and verify cache invalidation if status changes affect insights.
  3. Keep the existing `user_id` plus Steam-source `EXISTS` ownership guard.
- Acceptance criteria:
  - The endpoint updates only the authenticated user's Steam-linked game and returns 200.
  - Unlinked/cross-user IDs do not update.
- Tests to add:
  - Real-Postgres endpoint tests for success, missing source, cross-user ID, started-date behavior, and rollback/error response.
- Dependencies:
  - None for the remove-assignment fix; a new column depends on DOC-001.
- Regression risks:
  - Preserve conservative status rules and do not silently overwrite an existing `started_at`.

### [API-002] Validate statuses and real dates before SQL

- Severity: Medium
- Confidence: High
- Category: Backend/API
- Status: Confirmed
- Locations:
  - `backend/validators/games.js:6`
  - `backend/validators/games.js:70`
  - `backend/validators/games.js:113`
  - `backend/routes/games.js:598`
  - `backend/middleware/errorHandler.js:4`
  - `backend/schema.sql:207`
- Affected flows: Game create/update/reorder and client error display.
- Evidence:
  - `baseStatusSchema` only trims/normalizes a nonempty string; it does not verify membership in `statuses` or a canonical API-provided set.
  - An unknown status passes Joi and fails the FK as `23503`, which is mapped to 409 “Related resource constraint” rather than a field-level 422.
  - Date validation is regex-only (DATA-002); PostgreSQL date errors other than `22P02` are returned as generic 500.
- Impact:
  - Malformed or stale clients receive misleading conflict/internal errors instead of actionable validation, and error behavior depends on which write path reaches SQL.
- Reproduction or verification:
  1. POST a syntactically valid game with `status="not-a-real-status"`; observe Joi pass and FK 409.
  2. POST an impossible calendar date; observe a DB error rather than field validation.
  3. Compare Steam candidate status selection, which explicitly queries `statuses` before update.
- Root cause: Normalization was mistaken for membership validation and DB error mapping was used as a validator fallback.
- Recommended fix:
  1. Introduce a shared async status guard after Joi normalization (or cache canonical statuses with invalidation) for game/catalog/reorder paths.
  2. Use the strict date parser designed in DATA-002.
  3. Return Celebrate-compatible details and stable `validation_error`/422 contracts.
  4. Keep the FK as the final integrity boundary and handle a race where a status is removed.
- Acceptance criteria:
  - Unknown status/impossible date requests return 422 with the exact field path and never issue a write.
  - Valid DB-defined statuses, including intended variants, remain accepted consistently.
- Tests to add:
  - Validator/route tests with mocked and real DB status sets; response-shape assertions including `requestId`.
- Dependencies:
  - Implement with DATA-002 and MAINT-001 to avoid another status list.
- Regression risks:
  - Do not hardcode a frontend-only list that can drift from the database.

### [API-003] Allow users to clear estimated hours

- Severity: Medium
- Confidence: High
- Category: Backend/API
- Status: Confirmed
- Locations:
  - `src/pages/Backlog/backlogForm.js:118`
  - `src/pages/Backlog/backlogForm.js:123`
  - `backend/validators/games.js:95`
  - `backend/routes/games.js:784`
  - `backend/routes/games.js:854`
- Affected flows: Edit Game -> clear HLTB/estimated hours -> save; insights/hour filters.
- Evidence:
  - The frontend intentionally serializes a blank hour field as `null`, and Joi allows null.
  - Backend converts null to `newHLTB=null`, then computes `hours_new = newHLTB ?? existing`, restoring the old value.
  - When the name changes, null can also trigger automatic HLTB lookup, further preventing an explicit clear.
- Impact:
  - The UI reports a successful edit but the value reappears. Users cannot remove an incorrect estimate, and analytics/filtering continue using unwanted data.
- Reproduction or verification:
  1. Edit a game with non-null HLTB hours.
  2. Clear the field and save.
  3. Reload and observe the old/automatically resolved value remains.
- Root cause: Null conflates “explicitly clear” with “no usable new value/perform fallback.”
- Recommended fix:
  1. Track `hasOwnProperty('how_long_to_beat')` separately from the normalized value.
  2. If explicitly null, store null and skip automatic lookup; if omitted, preserve; if name changed without the key, apply the chosen lookup policy.
  3. Align create/catalog semantics and document the three states.
- Acceptance criteria:
  - Explicit null clears; omitted preserves; positive input updates.
  - Clearing invalidates insights and updates filters immediately.
- Tests to add:
  - Form payload plus route tests for null/omitted/0/positive/name-change combinations and reload.
- Dependencies:
  - Coordinate with API-004 cache invalidation.
- Regression risks:
  - Preserve Steam actual playtime as a separate source and do not interpret null estimate as deleting Steam data.

### [API-004] Invalidate insights for hour-policy changes

- Severity: Medium
- Confidence: High
- Category: Cache/API
- Status: Confirmed
- Locations:
  - `backend/routes/games.js:854`
  - `backend/routes/games.js:864`
  - `backend/routes/games.js:912`
  - `backend/routes/insights.js:85`
  - `backend/utils/microCache.js:9`
  - `src/utils/hours.js:20`
- Affected flows: Edit hour preferred source/lock -> Insights.
- Evidence:
  - Game update clears the per-user insights cache only if status, name, or stored HLTB number changes.
  - `hours_preferred_source` and `hours_locked` change which estimate/Steam value insights resolves even when the numeric DB fields do not change.
  - Therefore cached analytics remain stale for up to the configured TTL (default five minutes).
- Impact:
  - Users change hour policy and see cards/details update but totals, status hours, ETA, and genres remain inconsistent until cache expiry or another invalidating mutation.
- Reproduction or verification:
  1. Use a finished Steam-linked game where estimate and Steam actual differ.
  2. Load insights to populate cache.
  3. Change preferred source or lock without changing status/hours, then reload insights.
  4. Observe the cached old total.
- Root cause: Cache relevance was expressed as an incomplete ad hoc field comparison.
- Recommended fix:
  1. Centralize an `affectsInsights(before,after)` predicate covering status, name, estimates, source preference, lock, Steam source data, and future relevant fields.
  2. Call it from every mutation/Steam sync/merge path after commit.
  3. Add a cache version bump only as deployment cleanup, not as the ongoing fix.
- Acceptance criteria:
  - Every analytics-relevant mutation produces fresh next-request results; irrelevant edits do not churn cache unnecessarily.
- Tests to add:
  - Route/cache integration matrix for preference, lock, Steam playtime, merge, status, name, and thoughts-only updates.
- Dependencies:
  - Coordinate with DATA-007 and API-003.
- Regression risks:
  - Clear only the affected user's bounded micro-cache.

### [API-005] Reject junk and ignored API fields

- Severity: Medium
- Confidence: High
- Category: API contracts
- Status: Confirmed
- Locations:
  - `backend/routes/insights.js:200`
  - `backend/routes/insights.js:205`
  - `backend/routes/insights.js:208`
  - `backend/validators/lists.js:47`
  - `backend/validators/lists.js:56`
  - `backend/routes/lists.js:234`
  - `backend/routes/lists.js:238`
- Affected flows: Insights query URLs and list update.
- Evidence:
  - `weekly_hours=10junk` is accepted as 10 via `parseInt`; unknown boolean strings silently become false. Insights has no Celebrate validator.
  - The shared list metadata validator accepts `listType` on update, but the update handler ignores it. A client can receive 200 while its requested type change did not occur.
- Impact:
  - Clients cannot distinguish accepted changes from silently normalized/ignored input. Bad links are cached under unintended values and UI can report false success.
- Reproduction or verification:
  1. GET `/api/insights?weekly_hours=10junk&include_missing_names=yes`; observe 200 with normalized 10/false.
  2. PUT a manual list with `listType:"smart"`; observe validation success but unchanged `list_type`.
- Root cause: Validators are reused across operations with different semantics, and insights hand-parses inputs.
- Recommended fix:
  1. Add a dedicated Insights query Joi schema with integer 0–200 and explicit boolean coercions only.
  2. Split create/update list schemas. Either reject `listType` on update or implement an explicit conversion endpoint with rules for membership/query migration.
  3. Preserve centralized validation error shape.
- Acceptance criteria:
  - Junk inputs return 422; every accepted field has observable documented semantics.
- Tests to add:
  - Route contract tests for query boundaries/coercion and list type update rejection/conversion.
- Dependencies:
  - None.
- Regression risks:
  - Existing valid bookmarked insight URLs and list edits must remain compatible.

### [INT-001] Add deadlines to RAWG and Steam calls

- Severity: High
- Confidence: High
- Category: Integrations
- Status: Confirmed
- Locations:
  - `backend/utils/fetchRAWG.js:49`
  - `backend/utils/fetchRAWG.js:82`
  - `backend/utils/fetchRAWG.js:107`
  - `backend/utils/fetchRAWG.js:132`
  - `backend/services/steamService.js:131`
  - `backend/services/steamService.js:169`
  - `backend/services/steamService.js:1827`
- Affected flows: RAWG search/detail/collections/hydration; Steam OpenID verification, profile/library/achievement sync.
- Evidence:
  - All provider `fetch` calls omit an AbortSignal/deadline.
  - Steam library sync marks the account `syncing` before awaiting provider calls; a connection that never settles can leave the request and state stuck indefinitely.
  - Express has no route-level timeout/cancellation propagation for these calls.
- Impact:
  - Provider/network stalls consume server sockets/workers, hang UI loading states, prevent safe retries, and leave Steam sync status misleading. Under load this can become an application-wide availability issue.
- Reproduction or verification:
  1. Route RAWG/Steam DNS or TCP to a test endpoint that accepts but never responds.
  2. Invoke each provider-backed flow and observe no bounded failure.
  3. Inspect Steam account state after client disconnect/server deadline.
- Root cause: External access helpers lack a shared reliability policy.
- Recommended fix:
  1. Build a shared provider fetch wrapper with AbortSignal timeout, typed errors, bounded response parsing, and safe logging.
  2. Set per-operation deadlines (short search/detail, longer Steam library) and propagate request/job cancellation where useful.
  3. On timeout, update Steam state to failed with stable code; never expose API keys/URLs containing keys.
  4. Add bounded retry/backoff only for idempotent transient failures and honor provider rate limits.
- Acceptance criteria:
  - Every external call settles within a documented bound and produces a stable 503/provider error.
  - Steam cannot remain `syncing` solely because a provider call hung.
- Tests to add:
  - Fake-server timeout, abort, transient retry, non-retryable 4xx, malformed/oversized JSON, and client-disconnect tests.
- Dependencies:
  - None; PERF-001 should reuse the wrapper.
- Regression risks:
  - Choose deadlines compatible with real large libraries and do not retry OpenID verification unsafely.

### [INT-002] Distinguish RAWG outage from empty results

- Severity: High
- Confidence: High
- Category: Integrations/cache correctness
- Status: Confirmed
- Locations:
  - `backend/utils/fetchRAWG.js:38`
  - `backend/utils/fetchRAWG.js:51`
  - `backend/utils/fetchRAWG.js:62`
  - `backend/services/catalogService.js:934`
  - `backend/services/catalogService.js:942`
  - `backend/services/catalogService.js:970`
  - `backend/services/catalogService.js:979`
  - `backend/services/catalogService.js:914`
- Affected flows: Discover search, catalog collections, legacy game hydration, guest cached results.
- Evidence:
  - RAWG helpers return `[]`/`null` for missing key, non-2xx, parse/network exceptions, and legitimate no-results alike.
  - `searchCatalog`'s `try/catch` therefore sees an outage as success, writes a fresh empty cache, and returns a live empty result. Its failure-cache path is effectively bypassed for these failures.
  - A legitimate fresh empty cache is not reused because the cache condition also requires `cachedIds.length`; repeated no-result searches hit RAWG again.
- Impact:
  - Outages/quota failures look like “no games found,” can suppress valid stale data, and are cached misleadingly. True empty searches repeatedly spend provider quota.
- Reproduction or verification:
  1. Stub RAWG 429/500/network error and search a query; observe a successful empty response and fresh empty cache rather than provider error/failure metadata.
  2. Stub a real 200 with empty results, repeat before TTL, and observe another provider call.
- Root cause: Provider helpers erase outcome type, while cache freshness is coupled to nonempty results.
- Recommended fix:
  1. Return a discriminated result or throw typed errors for missing configuration, timeout, HTTP failure, malformed response, and success (including empty).
  2. Cache successful empty results and reuse them until TTL.
  3. On provider failure, mark failure/backoff and return stale cached results when available; otherwise a stable 503/unavailable response.
  4. Surface “temporarily unavailable” separately from zero matches in Discover.
- Acceptance criteria:
  - 200-empty, 429, 500, timeout, missing key, and malformed JSON have distinct observable/cache behavior.
  - Fresh empty results are reused without another provider call.
- Tests to add:
  - Catalog service/provider contract matrix with cache DB assertions and stale fallback.
- Dependencies:
  - INT-001 typed timeout wrapper.
- Regression risks:
  - Guests must remain cache-only and provider keys/errors must not leak.

### [INT-003] Fix catalog collection pagination gaps

- Severity: Medium
- Confidence: High
- Category: Integrations
- Status: Confirmed
- Locations:
  - `backend/services/catalogService.js:1113`
  - `backend/services/catalogService.js:1121`
  - `backend/services/catalogService.js:1135`
  - `backend/services/catalogService.js:815`
  - `backend/services/catalogService.js:851`
  - `backend/services/catalogService.js:1263`
  - `backend/services/catalogService.js:1267`
  - `backend/services/catalogService.js:1268`
- Affected flows: Discover collection initial seed and “load more.”
- Evidence:
  - Default initial seed stores 24 qualifying rows but fetches up to 40 RAWG results.
  - Collection config stores `pageSize=24`; load-more calculates page 2, then fetches page 2 with page size 40.
  - RAWG page 2 starts after result 40, so initial results 25–40 were never stored and are skipped permanently. If a page appends nothing, `existingCount` does not advance and the same page can be fetched repeatedly.
- Impact:
  - Discover shelves silently omit valid games and load-more can waste quota without progress.
- Reproduction or verification:
  1. Stub RAWG with numbered results 1–80 and default seed limit 24.
  2. Seed, then load more; inspect requested page/page_size and stored IDs.
  3. Verify 25–40 are missing; repeat with all page-2 candidates filtered/duplicate and observe refetch.
- Root cause: Paging cursor is derived from stored accepted count while provider page size differs and filtering changes accepted count.
- Recommended fix:
  1. Persist the provider next URL/page/cursor and exact provider page size in `source_config_json` independently of accepted count.
  2. Advance cursor after every successful provider page, even when zero items append, with an end/no-progress marker.
  3. Keep accepted-rank assignment separate from provider offsets.
- Acceptance criteria:
  - Numbered provider fixtures are visited once with no gaps/duplicates; filtered empty pages still advance safely.
- Tests to add:
  - Service integration tests for mixed quality, duplicates, empty pages, max collection size, and retry after provider failure.
- Dependencies:
  - INT-002 must distinguish successful empty page from outage.
- Regression risks:
  - Existing collection configs need backward-compatible cursor initialization.

### [PERF-001] Bound and move large Steam sync work

- Severity: High
- Confidence: High
- Category: Performance/reliability
- Status: Confirmed
- Locations:
  - `backend/services/steamService.js:1811`
  - `backend/services/steamService.js:1827`
  - `backend/services/steamService.js:1864`
  - `backend/services/steamService.js:1867`
  - `backend/services/steamService.js:1870`
  - `backend/services/steamService.js:1926`
  - `backend/services/steamService.js:1313`
  - `backend/services/steamService.js:1377`
- Affected flows: Manual Steam library sync for large libraries and subsequent auto-match.
- Evidence:
  - The request synchronously iterates every owned app and awaits multiple DB reads/writes sequentially.
  - Matching can scan up to 2,000 catalog rows and duplicate matching can fetch/scan up to 2,000 user games per app.
  - It then auto-matches up to 150 candidates sequentially and can call catalog/RAWG search for each.
  - There is no job queue, progress checkpoint, server deadline, or bounded whole-sync transaction; partial writes are expected but not resumably modeled.
- Impact:
  - Hundreds/thousands of apps can cause thousands of queries and O(apps × 2,000) JS comparisons, exceed proxy/request limits, retain resources, and return failure after partially changing state.
- Reproduction or verification:
  1. Use a generated mock library of 1,000 apps and instrument query count/duration in a disposable environment.
  2. Seed 2,000 catalog and 2,000 backlog rows.
  3. Measure request time, event-loop/DB load, partial state after forced termination, and retry behavior.
- Root cause: A batch ingestion workflow is implemented as a synchronous HTTP request with per-item discovery queries.
- Recommended fix:
  1. Preload/index catalog IDs/titles and user games once per batch; use set-based UPSERTs for sources/candidates.
  2. Move sync to a durable job/checkpoint model returning 202/job ID, with per-user mutual exclusion, progress, failure, cancellation, and resumable chunks.
  3. Separate local matching from rate-limited provider enrichment; cap/concurrently schedule external calls.
  4. Make every chunk idempotent and define final account status from job outcome.
- Acceptance criteria:
  - A representative maximum library completes within documented query/time budgets or continues asynchronously without request timeout.
  - Killing/retrying a job produces no duplicates/contradictory states and exposes accurate progress.
- Tests to add:
  - 1k-app performance budget, query-count assertion, crash/resume, same-user concurrent sync, provider timeout/rate limit, and partial-error tests.
- Dependencies:
  - INT-001 deadlines and DATA-006 transactional state transitions.
- Regression risks:
  - Preserve hidden candidates, first-play observations, conservative status suggestions, cooldown, and private-library handling.

### [PERF-002] Bound public RAWG hydration and cache growth

- Severity: Medium
- Confidence: High
- Category: Performance
- Status: Confirmed
- Locations:
  - `backend/routes/public.js:15`
  - `backend/routes/public.js:18`
  - `backend/routes/public.js:29`
  - `backend/routes/public.js:60`
  - `backend/routes/public.js:133`
  - `backend/routes/games.js:269`
  - `backend/routes/games.js:381`
- Affected flows: Public profile games for legacy/non-catalog rows; process-wide RAWG cache.
- Evidence:
  - Public hydration starts one RAWG lookup per uncached legacy game using unbounded `Promise.all`.
  - The private backlog path has an explicit concurrency helper/limit, but public does not.
  - Public results are added to an in-memory object with no entry cap/eviction and are not persisted through the private cache's atomic save path.
- Impact:
  - One large public profile or several simultaneous visitors can burst provider calls, trigger rate limits, increase memory indefinitely, and make public response latency depend on all upstream calls.
- Reproduction or verification:
  1. Seed a public profile with many legacy rows absent from cache/catalog.
  2. Instrument concurrent RAWG calls/memory and request duration for simultaneous GETs.
  3. Compare with private route's bounded hydration.
- Root cause: Public hydration duplicated older private behavior instead of reusing the bounded catalog/cache service.
- Recommended fix:
  1. Reuse a shared bounded hydration function with coalescing, timeout, negative TTL, and cache-size policy.
  2. Prefer catalog metadata and return promptly with missing fields rather than blocking the whole public list.
  3. Add pagination/response limits if public backlog size is unbounded.
- Acceptance criteria:
  - Public requests never exceed configured provider concurrency/memory bounds and degrade gracefully during outage.
- Tests to add:
  - Concurrency-limit, coalescing, large-profile, cache-eviction, and upstream-failure integration tests.
- Dependencies:
  - INT-001 and INT-002.
- Regression risks:
  - Preserve public Steam privacy and sanitized HTML.

### [PERF-003] Remove manual-list preview N+1 queries

- Severity: Medium
- Confidence: High
- Category: Performance
- Status: Confirmed
- Locations:
  - `backend/routes/lists.js:142`
  - `backend/routes/lists.js:145`
  - `backend/routes/lists.js:158`
  - `backend/routes/lists.js:160`
- Affected flows: GET `/api/lists` and Lists overview.
- Evidence:
  - The route loads all lists, then awaits `listGamesForList` once per list in a sequential loop.
  - Each preview can perform additional catalog/RAWG decoration work. Query count/latency grows linearly with user list count.
- Impact:
  - Users with many lists see slow overview loads and consume avoidable DB round trips; one slow preview blocks all later previews.
- Reproduction or verification:
  1. Seed 100 lists with games and enable SQL query counting.
  2. GET `/api/lists`; observe at least one base query plus one preview query per list and sequential latency.
- Root cause: Preview retrieval is implemented per entity rather than as a set-based query.
- Recommended fix:
  1. Fetch top four games per list with a window function/lateral query scoped by user, then group in JS.
  2. Batch catalog decoration and cap response payload.
  3. Keep smart-list preview computation bounded; if it cannot be set-based, explicitly limit/concurrently batch it.
- Acceptance criteria:
  - Query count is constant/small-bounded as list count grows and preview order/content remains unchanged.
- Tests to add:
  - Real-DB query-count/performance test with manual/smart/empty lists and cross-user rows.
- Dependencies:
  - None.
- Regression risks:
  - Preserve per-user isolation, four-item limit, manual position order, and smart-list semantics.

### [PERF-004] Code-split the 1.60 MB application bundle

- Severity: Medium
- Confidence: High
- Category: Frontend performance
- Status: Confirmed
- Locations:
  - `src/App.jsx:1`
  - `src/App.jsx:14`
  - `package.json:36`
  - `vite.config.js:1`
- Affected flows: Initial load for every route, especially mobile/public profile/login.
- Evidence:
  - All route pages, including Recharts insights, dnd-kit backlog, Steam, settings, and lists, are eagerly imported in `App.jsx`.
  - Verified build output: one main JS chunk of 1,600.89 kB minified / 372.84 kB gzip; Vite emitted the >500 kB warning.
- Impact:
  - Users download/parse features they may never visit, increasing time-to-interactive and memory on slower mobile devices.
- Reproduction or verification:
  1. Run `npm run build` and inspect chunk output.
  2. Profile `/u/:username` and login on throttled mobile CPU/network; confirm unrelated chart/Steam modules are in the initial graph.
- Root cause: Route-level lazy loading/manual chunking is absent.
- Recommended fix:
  1. Use `React.lazy`/`Suspense` for route pages, keeping providers/lightweight shell eager.
  2. Split charting and heavy integration/editor code at route/component boundaries; use route-appropriate skeletons.
  3. Set a realistic bundle budget in CI and measure, not merely raise Vite's warning limit.
- Acceptance criteria:
  - Public/login initial chunks exclude Recharts, Steam, settings, and list editors; navigation loading/error states are graceful.
- Tests to add:
  - Build artifact budget check and Playwright navigation/suspense smoke under throttling.
- Dependencies:
  - None.
- Regression risks:
  - Preserve deep links, provider context, error handling, and avoid layout shifts.

### [UI-001] Disable or translate reorder in derived views

- Severity: High
- Confidence: High
- Category: Frontend correctness
- Status: Confirmed
- Locations:
  - `src/pages/Backlog/BacklogPage.jsx:280`
  - `src/pages/Backlog/BacklogPage.jsx:296`
  - `src/pages/Backlog/BacklogPage.jsx:465`
  - `src/components/GameGrid.jsx:94`
  - `src/components/GameGrid.jsx:103`
  - `src/components/GameGrid.jsx:109`
  - `src/utils/reorder.js:8`
  - `backend/routes/games.js:1025`
  - `backend/routes/games.js:1040`
- Affected flows: Backlog drag/keyboard reorder while search, status/genre/hours/date/source filters, or non-manual sort/reverse are active.
- Evidence:
  - `GameGrid` receives only `displayGames`, a filtered/fuzzy-searched/sorted subset, and computes `targetIndex` within that local rank subset.
  - Reorder remains enabled whenever the user can edit; it is not disabled for active filters or alternate sorts.
  - Backend interprets the index in the complete DB rank group, including hidden games, ordered by stored position.
- Impact:
  - A legitimate drag can move the game to a different absolute position than shown, reorder around hidden games, or mutate manual order while the UI is sorted by another field. Reload/removing filters reveals surprising order changes.
- Reproduction or verification:
  1. Create three same-rank games A/B/C in manual order.
  2. Filter so B is hidden; drag C before A in the two-item view.
  3. Clear the filter and inspect backend order; submitted index was derived without B.
  4. Repeat under score/name sort and reverse.
- Root cause: UI-derived index and backend canonical index use different collections/orderings.
- Recommended fix:
  1. For the safest first fix, enable reorder only for default manual order with no search/filter/reverse and explain why it is disabled.
  2. If product requires filtered reorder, send neighboring canonical IDs/intent and resolve position against the full locked group server-side; define hidden-item placement explicitly.
  3. Use the same predicate for mouse, touch, keyboard sensors, affordance text, and permissions.
- Acceptance criteria:
  - Every visible drop has a documented identical post-reload order; derived views cannot silently mutate an unrelated manual order.
- Tests to add:
  - Utility/Playwright/real-route cases for hidden middle rows, search, each sort, reverse, shared-rank statuses, keyboard and touch.
- Dependencies:
  - DATA-001 ordering/position policy.
- Regression risks:
  - Preserve same-rank restriction, optimistic rollback, authoritative `rank_order`, and keyboard reorder in valid manual view.

### [UI-002] Do not delete demos on refresh or unload

- Severity: High
- Confidence: High
- Category: Guest/demo correctness
- Status: Confirmed
- Locations:
  - `src/contexts/AuthContext.jsx:65`
  - `src/contexts/AuthContext.jsx:72`
  - `src/contexts/AuthContext.jsx:75`
  - `src/contexts/AuthContext.jsx:84`
  - `backend/routes/demo.js:63`
  - `backend/routes/demo.js:180`
  - `backend/routes/demo.js:194`
  - `backend/index.js:141`
- Affected flows: Try Live Demo -> edit -> refresh/navigation/tab close -> return/keep demo.
- Evidence:
  - While `isGuest`, AuthContext sends `/api/demo/discard` on both `pagehide` and `beforeunload`.
  - The discard endpoint deletes the guest user; FK cascades its games.
  - This defeats the backend's idempotent `/demo/start` reuse, heartbeat, 36-hour TTL, and scheduled cleanup design. Normal refresh fires unload and destroys work.
- Impact:
  - Demo changes disappear on refresh/close/navigation before the user can choose “keep,” creating severe trust and onboarding failure. Keepalive is best-effort, so behavior can vary by browser.
- Reproduction or verification:
  1. Start demo, add/edit a game, refresh the page.
  2. Observe discard request/user deletion and a missing/new demo session after reload.
  3. Repeat with back/forward cache, tab close/reopen, and mobile backgrounding.
- Root cause: Browser lifecycle events are treated as explicit user abandonment despite an existing TTL/heartbeat lifecycle.
- Recommended fix:
  1. Remove unload/pagehide deletion. Let TTL cleanup expire abandoned guests.
  2. Call discard only from an explicit “discard/end demo” action or after successful conversion if cleanup is needed.
  3. Keep heartbeat/idempotent start and define logout behavior explicitly.
  4. Add copy explaining retention duration/privacy.
- Acceptance criteria:
  - Refresh/navigation/browser restart within TTL restores the same demo and edits.
  - Explicit discard deletes it; TTL cleanup still removes abandoned sessions.
- Tests to add:
  - Playwright with page reload/new context using persisted storage, explicit discard, keep conversion, heartbeat/expiry, and pagehide.
- Dependencies:
  - None.
- Regression risks:
  - Avoid accumulating guests beyond TTL; preserve private/demo restrictions and conversion transaction.

### [UI-003] Make insights URL state and requests latest-wins

- Severity: Medium
- Confidence: High
- Category: Frontend correctness
- Status: Likely
- Locations:
  - `src/hooks/useQueryBackedState.js:19`
  - `src/hooks/useQueryBackedState.js:21`
  - `src/hooks/useQueryBackedState.js:26`
  - `src/pages/Insights/InsightsPage.jsx:61`
  - `src/pages/Insights/InsightsPage.jsx:106`
  - `src/pages/Insights/InsightsPage.jsx:145`
  - `src/pages/Insights/InsightsPage.jsx:151`
  - `src/pages/Insights/InsightsPage.jsx:163`
- Affected flows: Insights initialization, bookmarked query params, local-storage preferences, rapid weekly-hours/missing toggles, navigation/unmount.
- Evidence:
  - Five hook instances each clone their captured `sp` and call `setSp` in an effect depending only on `value`; initial effects can overwrite parameters written by sibling hooks.
  - The hook does not respond to browser/query changes after initialization and reads/writes localStorage without try/catch, unlike other storage code.
  - `load` has no AbortController/request sequence. Initial and subsequent debounced/toggle loads can overlap; a slower old response can replace newer data and clear loading/error state.
  - Missing runtime evidence: exact React Router batching/order across target browsers; the stale-response race is deterministic with delayed mock responses.
- Impact:
  - Query parameters/preferences disappear, back/forward does not restore controls, storage-denied browsers can crash the page, and charts can display values for the previous control selection.
- Reproduction or verification:
  1. Open a URL containing all five insight params and observe URL after initial effects; repeat with stored defaults.
  2. Delay the old insights response, change weekly hours/toggle missing, return the new response first, then old; inspect final UI/data.
  3. Deny localStorage access and load the route.
- Root cause: Each field owns and rewrites the whole query snapshot; network state has no latest-wins primitive.
- Recommended fix:
  1. Use functional/current search-param updates or one reducer/schema that parses and serializes all insight controls atomically.
  2. Synchronize from location changes and wrap storage access.
  3. Add AbortController/request sequence to `load`, pass signals through `insightsService`/`gameService`, and ignore stale finalizers.
  4. Route game loading through `gameService` rather than direct `api.get`.
- Acceptance criteria:
  - All valid params survive initialization; back/forward updates controls; last user selection always owns data/loading/error.
- Tests to add:
  - Hook/router tests for sibling updates/history/storage errors and Playwright delayed-response races/unmount.
- Dependencies:
  - Coordinate with API-004 cache behavior.
- Regression risks:
  - Preserve bookmarked URL compatibility and debouncing without request storms.

### [UI-004] Reconcile deletions during silent refresh

- Severity: Medium
- Confidence: High
- Category: Frontend state
- Status: Confirmed
- Locations:
  - `src/hooks/useGames.js:129`
  - `src/hooks/useGames.js:161`
  - `src/hooks/useGames.js:164`
  - `src/hooks/useGames.js:284`
  - `src/hooks/useGames.js:294`
- Affected flows: Silent post-edit hydration/revalidation, external/dependent deletion/merge, navigation after edit.
- Evidence:
  - Silent refresh starts with every previous row and only inserts/merges rows from the server; IDs absent from the authoritative response are never removed.
  - A delayed refresh is scheduled with `setTimeout` after edit and is not retained/cleared on unmount.
- Impact:
  - Rows deleted/merged in another component/tab or server transition remain as ghosts until a full refresh. A timer can issue a request after navigation and attempt state updates in an inactive hook instance.
- Reproduction or verification:
  1. Load rows A/B, delete/merge B outside this hook, trigger `refresh({silent:true})`; B remains.
  2. Edit a hydration-needing game and navigate away within 400 ms; instrument the delayed request.
- Root cause: “Silent” was implemented as additive merge rather than authoritative reconciliation, and timer lifecycle is unmanaged.
- Recommended fix:
  1. Build the next list from the authoritative server IDs while merging old client-only fields for IDs still present.
  2. Define preservation only for active optimistic temp rows/operations.
  3. Store/clear timeout and abort refresh on unmount; keep latest-wins sequence.
- Acceptance criteria:
  - Silent refresh removes server-absent persisted rows but keeps active optimistic rows until resolution; no post-unmount request/state update occurs.
- Tests to add:
  - Hook tests for deletion, merge, optimistic temp row, stale response, timer cleanup, and abort.
- Dependencies:
  - None.
- Regression risks:
  - Do not make background hydration flicker or discard an in-flight optimistic add/edit.

### [UI-005] Render the intended private-profile state

- Severity: Medium
- Confidence: High
- Category: Public UX
- Status: Confirmed
- Locations:
  - `backend/routes/public.js:87`
  - `backend/routes/public.js:125`
  - `src/pages/PublicProfile.jsx:38`
  - `src/pages/PublicProfile.jsx:49`
  - `src/pages/PublicProfile.jsx:200`
  - `src/pages/PublicProfile.jsx:218`
- Affected flows: Visit `/u/:username` for a private account.
- Evidence:
  - Backend returns 403 rather than a profile object with `is_public:false`.
  - The catch stores the API message and the component returns generic “Could not load this profile” first.
  - The dedicated “This profile is private” branch requires a non-error profile with `is_public:false`, a response shape the backend never returns.
- Impact:
  - Expected privacy state is presented as a technical failure. Combined with AUTH-001 it also silently damages a signed-in visitor's session.
- Reproduction or verification:
  1. Visit a known private username and observe the generic error instead of the private-state copy.
  2. Verify the private branch is unreachable with current API contracts.
- Root cause: Frontend and backend disagree whether privacy is a successful resource state or a forbidden error.
- Recommended fix:
  1. Choose an enumeration/privacy policy (often identical 404 for nonexistent/private, or stable 403 code for known-private).
  2. Map the stable error `code/status` to the intended EmptyState; do not depend on a never-returned profile object.
  3. Add retry only for network/5xx, not privacy.
- Acceptance criteria:
  - Private/nonexistent behavior matches the documented enumeration policy and never looks like an outage.
- Tests to add:
  - Public route/component/Playwright cases for public, private, nonexistent, malformed username, network failure, and signed-in visitor session retention.
- Dependencies:
  - AUTH-001.
- Regression risks:
  - Do not expose private game/profile fields or unintentionally reveal account existence.

### [UI-006] Implement complete modal focus and stack behavior

- Severity: Medium
- Confidence: High
- Category: Accessibility
- Status: Confirmed
- Locations:
  - `src/components/ui/Modal.jsx:20`
  - `src/components/ui/Modal.jsx:39`
  - `src/components/ui/Modal.jsx:44`
  - `src/components/ui/Modal.jsx:65`
  - `src/components/GameModal.jsx:218`
  - `src/components/ui/ConfirmProvider.jsx:33`
- Affected flows: Auth/add/edit/settings/onboarding/confirm dialogs and game details.
- Evidence:
  - Shared Modal adds global Escape but does not move initial focus, trap Tab, mark background inert, or restore opener focus.
  - Every shared modal title uses the same fixed `id="modal-title"`; stacked confirm/parent dialogs duplicate IDs.
  - Every open modal registers Escape, so stacked dialogs can all close on one event.
  - Custom GameModal has dialog roles but no Escape/focus lifecycle at all.
- Impact:
  - Keyboard/screen-reader users can interact with content behind dialogs, lose their place, hear ambiguous labels, or be unable to close GameModal with Escape. Destructive nested confirmation is particularly risky.
- Reproduction or verification:
  1. Open edit/add, Tab repeatedly, and observe focus leaving the dialog; close and inspect focus restoration.
  2. Open a nested confirm, inspect duplicate IDs, press Escape, and observe multiple listeners.
  3. Open GameModal and press Escape.
- Root cause: Dialog rendering is visual/semantic only; there is no shared stack/focus manager.
- Recommended fix:
  1. Add unique IDs via `useId`, initial focus, focus trap, inert/aria-hidden background, body scroll lock, and opener restoration to shared Modal.
  2. Add a modal stack so only topmost handles Escape/backdrop.
  3. Migrate GameModal to the shared primitive or the same dialog hook; ensure close-disabled semantics are announced.
  4. Consider a well-tested accessible dialog primitive if compatible with the design system.
- Acceptance criteria:
  - WCAG dialog keyboard expectations pass; only top dialog closes; labels are unique; focus returns to opener.
- Tests to add:
  - Component/Playwright keyboard and axe tests for single/nested dialogs, destructive confirm, GameModal, close-disabled, mobile scroll.
- Dependencies:
  - None.
- Regression risks:
  - Preserve nested confirmation, scrollable long forms, mobile viewport behavior, and backdrop rules.

### [UI-007] Make cards and listboxes keyboard-operable

- Severity: Medium
- Confidence: High
- Category: Accessibility
- Status: Confirmed
- Locations:
  - `src/components/GameCard.jsx:189`
  - `src/components/GameCard.jsx:303`
  - `src/components/GameCard.jsx:395`
  - `src/components/ui/SelectMenu.jsx:31`
  - `src/components/ui/SelectMenu.jsx:58`
  - `src/components/ui/MultiSelectMenu.jsx:102`
  - `src/components/ui/MultiSelectMenu.jsx:159`
- Affected flows: Open game details from grid/list/public profile; all custom select/multiselect forms and filters.
- Evidence:
  - Clickable game cards are `<article onClick>` without tabindex, button/link semantics, or Enter/Space handler. Read-only public cards have no edit/delete child control that incidentally focuses the card.
  - Custom listboxes render buttons with `role=option` but implement no Arrow/Home/End/Escape/typeahead/focus management or `aria-activedescendant` pattern.
  - MultiSelect search handles Enter for custom addition only.
- Impact:
  - Keyboard-only users cannot open game details reliably and custom selects do not behave like their advertised ARIA roles, blocking form/filter use or confusing screen readers.
- Reproduction or verification:
  1. Navigate a public games view using Tab/Enter only; attempt to open a card.
  2. Open each select and use arrow keys/Escape/Home/End/typeahead; inspect focus/announcements.
- Root cause: Mouse/touch interactions were layered onto noninteractive elements and partial ARIA roles.
- Recommended fix:
  1. Give each card a real named button/link overlay or a focusable semantic control; keep edit/delete buttons separate and prevent nested interactive invalidity.
  2. Implement the WAI-ARIA listbox keyboard pattern in shared components or use a proven accessible primitive.
  3. Announce multiselect additions/removals and ensure visible focus.
- Acceptance criteria:
  - Every card/select action is reachable and operable by keyboard with correct screen-reader name/state.
- Tests to add:
  - Testing-library semantics plus Playwright Tab/Enter/Space/arrow/Escape and axe scans on backlog/public/forms.
- Dependencies:
  - Coordinate focus behavior with UI-006.
- Regression risks:
  - Preserve dnd-kit keyboard drag controls and avoid nested button/link markup.

### [UI-008] Add read-only and unknown-route fallbacks

- Severity: Low
- Confidence: High
- Category: Frontend hardening
- Status: Confirmed
- Locations:
  - `src/pages/PublicProfile.jsx:293`
  - `src/components/GameModal.jsx:108`
  - `src/components/GameModal.jsx:356`
  - `src/App.jsx:17`
  - `src/App.jsx:34`
- Affected flows: Public game details and unknown/deprecated URLs.
- Evidence:
  - PublicProfile opens `GameModal` without `readOnly=true`. Current public serializer omits Steam fields, so no mutation control appears today, but a future serializer addition would expose the sync action in a public view (backend authorization still protects it).
  - Routes have no wildcard element, so unmatched paths render an empty application shell/blank page.
- Impact:
  - Read-only intent relies on accidental response omission, and bad/deprecated links provide no recovery navigation.
- Reproduction or verification:
  1. Inject a public fixture with `steamOwned:true` and open modal; observe mutation affordance due to default false.
  2. Visit `/does-not-exist`; observe no Not Found UI.
- Root cause: View mode and route fallback are implicit.
- Recommended fix:
  1. Pass `readOnly` explicitly from PublicProfile and keep permission helpers/backend auth authoritative.
  2. Add a wildcard Not Found route with safe links and no private data assumptions.
- Acceptance criteria:
  - Public modal never renders mutations regardless of payload; unknown routes render an accessible recovery page.
- Tests to add:
  - Component fixture with private-only fields and Playwright unknown/deprecated route tests.
- Dependencies:
  - None.
- Regression risks:
  - Preserve normal private Steam actions and deep links.

### [TEST-001] Add real-Postgres authorization and schema tests

- Severity: High
- Confidence: High
- Category: Testing
- Status: Confirmed
- Locations:
  - `backend/routes/games.integration.test.js:54`
  - `backend/routes/lists.integration.test.js:54`
  - `backend/routes/auth.test.js:50`
  - `backend/services/steamService.test.js:398`
  - `backend/services/steamService.test.js:432`
  - `package.json:23`
  - `.github/workflows/ci.yml:33`
- Affected flows: Schema/SQL compatibility, constraints/migrations, cross-user authorization, transactions/concurrency, public/Steam/insights/catalog/demo.
- Evidence:
  - “Integration” route tests replace `pool.query`; Steam tests similarly pattern-match SQL and fabricate rows.
  - This allowed API-001's nonexistent column to pass. Migrations/schema never parse/run in CI, transactions cannot truly rollback, and concurrency/constraint behavior is untested.
  - Existing positive evidence is useful but narrow: games delete/list query ownership strings and public query omission of Steam are asserted; there are no end-to-end two-user route matrices for all mutations.
- Impact:
  - Cross-user, deployment, SQL drift, transaction, and race regressions can ship under a fully green 160-test result.
- Reproduction or verification:
  1. Observe the mocked `applySteamStatusSuggestion` test pass while tracked schema proves its SQL invalid.
  2. Search CI/package scripts: no ephemeral Postgres/schema/migration step exists.
- Root cause: Fast mock/unit tests are the only backend execution layer.
- Recommended fix:
  1. Add an ephemeral PostgreSQL service/container in CI with a dedicated test URL and hard localhost/test DB guard.
  2. Test fresh `schema.sql`, migration path from a documented baseline, and schema-vs-migrations object parity.
  3. Run actual Express routes with two users, guest, public/private, and Steam fixtures; inject external providers, not DB.
  4. Add transaction failure/concurrency barriers and verify central error payload/status/request ID.
  5. Keep current unit tests for speed but label mocked route tests accurately.
- Acceptance criteria:
  - CI fails on invalid SQL columns, missing constraints, cross-user access, migration failure, or partial transaction writes.
  - Test DB creation cannot target a remote/non-test database.
- Tests to add:
  - Full matrix in section 6, especially API-001, DATA-001–008, AUTH-001/002, and migration parity.
- Dependencies:
  - DOC-001 baseline. Add DATA-003 constraint cases as that design lands.
- Regression risks:
  - Never use production data/URLs; keep test isolation/cleanup deterministic and runtime acceptable.

### [TEST-002] Repair and enforce the Playwright suite

- Severity: Medium
- Confidence: High
- Category: Testing/CI
- Status: Confirmed
- Locations:
  - `tests/e2e/smoke.spec.js:381`
  - `tests/e2e/smoke.spec.js:514`
  - `tests/e2e/smoke.spec.js:523`
  - `src/pages/Backlog/BacklogPage.jsx:388`
  - `playwright.config.js:20`
  - `package.json:24`
  - `package.json:26`
  - `.github/workflows/ci.yml:30`
- Affected flows: Browser regression signal, public settings/favorites, responsive/accessibility/cross-browser behavior.
- Evidence:
  - Verified `npm run test:e2e`: 6 pass, 1 fails. The test expects the old `Public Profile` modal after the product now navigates to Settings public section.
  - `npm run check` and CI run lint/unit/build only; the red suite does not block changes.
  - All seven tests mock every API, use one desktop Chromium project, and omit mobile, Firefox/WebKit, accessibility, auth failure, real backend/DB, Steam, lists, timeline/reviews, private-profile, and error/empty/loading paths.
- Impact:
  - A known-red suite decays further, while green CI creates false confidence about browser contracts and responsive/accessibility behavior.
- Reproduction or verification:
  1. Run `npm run test:e2e`; observe timeout at `smoke.spec.js:525`.
  2. Run `npm run check`; observe it passes without executing Playwright.
- Root cause: Product navigation changed without test maintenance, and browser tests are optional/unlayered.
- Recommended fix:
  1. Update the favorites test to assert `/settings?section=public` and current headings, then keep it behavior-focused.
  2. Add Playwright to protected CI after installing browsers/cache; separate fast mocked smoke from a small real-backend/ephemeral-DB suite.
  3. Add mobile viewport and focused keyboard/axe coverage; expand browsers based on supported policy.
  4. Avoid brittle copy-only selectors where stable roles/labels/state are available.
- Acceptance criteria:
  - Browser suite is green, runs in CI, and a regression in current public settings flow fails it.
  - At least one mobile and keyboard accessibility path is enforced.
- Tests to add:
  - Section 6 browser cases plus delayed-response/auth-state fixtures for UI-001/002/003/005/006/007.
- Dependencies:
  - UI-005/UI-006 behavior decisions.
- Regression risks:
  - Mocked smoke must not be presented as real backend authorization proof.

### [DOC-001] Make migration automation fail-safe and bootstrappable

- Severity: High
- Confidence: High
- Category: Deployment/database
- Status: Confirmed
- Locations:
  - `backend/migrations/001_add_demo_user_columns.sql:1`
  - `backend/schema.sql:18`
  - `backend/schema.sql:202`
  - `scripts/db-migrate.js:80`
  - `scripts/db-migrate.js:90`
  - `scripts/db-migrate.js:101`
  - `.github/workflows/ci.yml:39`
  - `.github/workflows/ci.yml:64`
  - `.github/workflows/ci.yml:72`
  - `.github/workflows/ci.yml:80`
- Affected flows: Fresh production/bootstrap, migration status, deployment when secret missing/misconfigured.
- Evidence:
  - Migration history begins by altering pre-existing `users`; it never creates baseline `users`, `statuses`, or `games`. A truly empty DB cannot be built by the production migration runner.
  - Runner creates `schema_migrations` before `--status`, so the advertised status command mutates its target.
  - Main-push production job skips both status/apply and succeeds when `PROD_DATABASE_URL` is empty, allowing an app deploy/merge to look healthy with required migrations unapplied.
  - Fresh local reset uses destructive `schema.sql`/seed, a different path from production.
- Impact:
  - Disaster recovery/new environment bootstrap is undocumented/nonfunctional through migrations; a missing secret silently bypasses schema deployment; “status” can write to the wrong DB.
- Reproduction or verification:
  1. Point migration runner at a disposable empty DB and apply migrations; migration 001 fails because `users` is absent.
  2. Point `--status` at a disposable DB without `schema_migrations`; observe the table created.
  3. Review a main CI run/config with missing secret; job reports skip success.
- Root cause: Migrations assume an untracked historical baseline, status shares initialization logic, and CI treats missing production authority as success.
- Recommended fix:
  1. Define/version a canonical production baseline: e.g. guarded baseline migration plus explicit adoption procedure for existing DBs, or a documented schema bootstrap recorded atomically in `schema_migrations`.
  2. Add empty-DB and adopted-existing-DB migration tests before changing production.
  3. Make status truly read-only (report missing metadata separately) and verify target identity before any write.
  4. Make missing `PROD_DATABASE_URL` fail the protected production job (or explicitly prevent deployment), with environment reviewers/secret validation.
  5. Add post-migration schema/version health check and keep advisory locking/transactions.
- Acceptance criteria:
  - Empty and documented existing baselines reach the same final schema through tested procedures.
  - Production main workflow cannot silently succeed without its migration target.
  - Status performs no writes.
- Tests to add:
  - CI ephemeral DB: empty bootstrap, existing baseline adoption, rerun idempotency, concurrent runner, failure rollback, read-only status, missing-secret workflow test.
- Dependencies:
  - None; this enables safe deployment of other DATA findings.
- Regression risks:
  - Baseline adoption must not reapply destructive schema/drop statements or mark migrations applied without verifying existing objects.

### [DOC-002] Reconcile schema, migrations, and schema-only policy

- Severity: Medium
- Confidence: High
- Category: Schema/documentation
- Status: Confirmed
- Locations:
  - `backend/migrations/002_add_rawg_identity_to_games.sql:5`
  - `backend/schema.sql:228`
  - `backend/migrations/004_add_catalog_metadata.sql:66`
  - `backend/migrations/004_add_catalog_metadata.sql:138`
  - `backend/migrations/README.md:14`
  - `backend/migrations/README.md:47`
  - `DEVELOPMENT.md:262`
  - `AGENTS.md:88`
- Affected flows: Fresh schema performance/parity, migration review policy, local-vs-production reproducibility.
- Evidence:
  - Migration 002 creates `idx_games_rawg_id`; final `schema.sql` does not. Fresh reset and migrated DBs therefore differ.
  - Migration 004 performs production data backfill/inserts/updates across lines 66–143, while maintained docs repeatedly say migrations must be schema-only/no data changes.
  - No automated schema-object parity check exists.
- Impact:
  - Local fresh installs can miss a production index and performance characteristics; reviewers cannot apply the stated migration policy consistently, risking unsafe future changes or rejection of necessary backfills.
- Reproduction or verification:
  1. Compare tracked schema object names to ordered migrations and observe missing `idx_games_rawg_id`.
  2. Read migration 004's CTE/backfill and compare to maintained schema-only rule.
- Root cause: Fresh schema is manually maintained and policy does not distinguish data copies/seeds from required idempotent data migrations/backfills.
- Recommended fix:
  1. Add the missing index to `schema.sql` and audit all constraints/indexes/defaults systematically.
  2. Clarify policy: migrations may contain minimal deterministic schema-coupled backfills with rollback/locking/runtime review, but not production data copies/demo seeds.
  3. Add automated normalized schema diff/introspection between fresh schema and migrated baseline.
- Acceptance criteria:
  - Fresh and migrated schemas have equivalent tables/columns/constraints/indexes.
  - Maintained docs accurately describe allowed backfills and review requirements.
- Tests to add:
  - Schema introspection parity test and migration 004 idempotency/backfill fixture test.
- Dependencies:
  - DOC-001 baseline definition.
- Regression risks:
  - Do not rerun historical data backfill on production or edit applied migration contents without an explicit migration policy.

### [DOC-003] Make setup and checks reproducible

- Severity: Medium
- Confidence: High
- Category: Documentation/configuration
- Status: Confirmed
- Locations:
  - `package.json:22`
  - `package.json:63`
  - `.github/workflows/ci.yml:30`
  - `README.md:27`
  - `.env.example:1`
  - `README.md:44`
  - `README.md:60`
  - `DEVELOPMENT.md:68`
  - `docs/SYSTEM_CONTEXT.md:21`
  - `src/App.jsx:25`
- Affected flows: Clean install, local/CI lint, environment setup, maintained route/tooling documentation.
- Evidence:
  - `lint` invokes `eslint .`, but ESLint is absent from `dependencies`/`devDependencies`; `npm ls eslint --depth=0` is empty. Local success resolved ESLint 10.9.0 outside the declared project graph, while CI separately downloads pinned 8.57.1 with `npx --yes`.
  - README says tooling uses Vitest, but `npm test` is Node's test runner.
  - `.env.example` omits used/documented catalog, Steam, frontend return/base, cache, HLTB, and mock-summary variables; `check-env` both omits some and requires frontend-only `VITE_API_BASE_URL` for all contexts.
  - Maintained SYSTEM_CONTEXT route list omits implemented `/reviews` (and its detailed route inventory is incomplete), while current App includes it.
- Impact:
  - Clean/offline installs cannot reproduce local lint reliably; developer and CI lint versions differ; setup fails or integrations use surprising defaults; maintained handoff docs misroute future work.
- Reproduction or verification:
  1. Run `npm ls eslint --depth=0`; observe empty.
  2. Compare package test script/README tooling claim.
  3. Diff consumed environment variables and App routes against `.env.example`, check-env, README, and SYSTEM_CONTEXT.
- Root cause: Tooling/configuration truth is spread across package scripts, CI, environment scripts, and prose without consistency checks.
- Recommended fix:
  1. Declare/pin compatible ESLint plus config/plugins in devDependencies and use `npm run lint` identically in CI; remove network `npx --yes` drift.
  2. Correct Vitest/Node test docs and explicitly state Playwright is separate until TEST-002.
  3. Make `.env.example` the commented canonical inventory with safe placeholders and context-required rules; generate/check diagnostics from it where practical.
  4. Update route docs for `/reviews`, `/settings`, `/lists/:id`, `/steam/library`, and current navigation.
- Acceptance criteria:
  - `npm ci && npm run check` works offline on declared Node 20 with the same linter/version as CI.
  - Every consumed env var and implemented route is documented once accurately.
- Tests to add:
  - Clean-install CI, package-lock lint dependency check, environment inventory test, and lightweight App-route/docs consistency review.
- Dependencies:
  - None; coordinate SEC-002 redaction.
- Regression risks:
  - Pin a version compatible with current config rather than adopting ESLint 10 implicitly; never add real secrets to examples.

### [MAINT-001] Centralize status semantics

- Severity: Medium
- Confidence: High
- Category: Maintainability/correctness
- Status: Confirmed
- Locations:
  - `backend/utils/status.js:16`
  - `backend/routes/games.js:699`
  - `backend/routes/catalog.js:328`
  - `backend/services/steamService.js:1047`
  - `src/contexts/StatusGroupsContext.jsx:71`
  - `src/pages/Backlog/BacklogPage.jsx:94`
  - `src/pages/PublicProfile.jsx:21`
  - `src/components/ProfileSnapshot.jsx:20`
  - `src/utils/automaticLists.js:5`
  - `src/utils/steamAchievements.js:143`
  - `src/components/GameCard.jsx:48`
  - `src/components/GameModal.jsx:43`
- Affected flows: Completed filters, automatic dates/lists, public overview, Steam suggestions, badges/cards/insights.
- Evidence:
  - Backend shared semantic groups tolerate both `played alot but didnt finish` and `played a lot but didn't finish` and expose meta groups.
  - Multiple UI/backend modules hardcode only the canonical two completed labels or their own spelling sets; SQL auto-date logic also hardcodes labels.
  - A DB-defined new/variant done status can be counted as done in insights but missed by completed filters/profile/date automation/achievement suggestion.
- Impact:
  - The same game can be “done” in one feature and active/other in another. Every status change requires coordinated edits across many hidden copies.
- Reproduction or verification:
  1. Add/use the tolerated done spelling variant in a disposable status set/game row.
  2. Compare insights group, Backlog/Public completed quick filter, ProfileSnapshot, auto-date, and automatic lists.
- Root cause: Semantic groups are nominally shared but consumers continue to own hardcoded label lists/maps.
- Recommended fix:
  1. Make backend status-group metadata/canonical semantic helpers the source of truth for all UI filtering/display decisions.
  2. Move backend auto-date/suggestion logic to shared status predicates or schema metadata, not SQL literals.
  3. Consolidate duplicate status class maps and define behavior for unknown statuses.
  4. Version/cache status metadata safely.
- Acceptance criteria:
  - Every status in a semantic group behaves identically across backlog, public, profiles, lists, insights, dates, and Steam.
- Tests to add:
  - Cross-feature contract table driven by canonical and tolerated/new status fixtures.
- Dependencies:
  - API-002 membership validation.
- Regression risks:
  - Preserve DB rank grouping (distinct from semantic grouping) and existing stored spelling compatibility.

### [MAINT-002] Remove dead legacy UI and misleading admin language

- Severity: Low
- Confidence: High
- Category: Maintainability
- Status: Confirmed
- Locations:
  - `src/components/Sidebar.jsx:1`
  - `src/components/Sidebar.jsx:25`
  - `src/components/AdminLoginForm.jsx:1`
  - `src/components/GameCard.jsx:197`
  - `src/hooks/useUI.js:11`
  - `src/pages/Backlog/BacklogModals.jsx:71`
  - `src/pages/Backlog/BacklogPage.jsx:388`
  - `src/components/PublicSettingsModal.jsx:1`
  - `src/utils/applyFiltersAndSort.js:1`
  - `src/utils/insightsFormat.js:1`
  - `AGENTS.md:102`
- Affected flows: Developer navigation/ownership model, login/edit denial copy, public settings maintenance, filter/status utilities.
- Evidence:
  - No role/admin column or admin backend guard exists; ordinary authentication is called `AdminLogin`, `isAdmin`, and “Admin access required.”
  - `Sidebar` has no importer. `applyFiltersAndSort.js` and `insightsFormat.js` have no consumers.
  - Backlog public settings now navigates to Settings, while `showPublicSettings`/`PublicSettingsModal` remains wired but has no current open action; the failed E2E still expects it.
- Impact:
  - Future agents can incorrectly infer an admin security model or update dead implementations, duplicating fixes and tests. Users receive misleading authorization language.
- Reproduction or verification:
  1. Search imports/usages for the named modules and admin role fields.
  2. Trace account Public profile action to `goSettings("public")`, not the retained modal state.
- Root cause: Incremental UI migrations left compatibility names/files without a retirement pass.
- Recommended fix:
  1. Decide/document whether product has a real admin role. If not, rename auth UI/state/messages to account/sign-in language; if yes, design backend role/guards/tests first.
  2. Remove confirmed dead modules/state after coverage is repaired; consolidate live filter/status utilities into documented shared modules.
  3. Keep changes in separate focused commits from functional fixes.
- Acceptance criteria:
  - No production code/docs imply an unenforced admin role; dead modules have no references and are removed without behavior change.
- Tests to add:
  - Import/dead-code lint where practical and current auth/settings browser smoke.
- Dependencies:
  - TEST-002 should first cover current navigation so deletion is safe.
- Regression risks:
  - Do not remove a component used by external/untracked work without checking the dirty worktree and branch history.

## 5. Cross-cutting inconsistencies

### Authentication/error ownership is split

- `backend/middleware/auth.js:9` returns 401 for missing token but `backend/middleware/auth.js:18` returns 403 for invalid/expired token.
- `src/services/apiClient.js:159` mutates local storage for either status, while `src/contexts/AuthContext.jsx:17` separately owns in-memory token/user state.
- Public calls explicitly use `auth:false` in `src/services/publicService.js:7` yet can still trigger the global storage mutation.
- The intended central error shape is widely followed, but Steam callback handles errors as redirects with raw messages at `backend/routes/steam.js:66`, outside `errorHandler`.

Result: authorization, authentication expiry, page-specific privacy, and global session transitions compete. AUTH-001 should establish one owner and stable status/code semantics before page-level error fixes.

### Integrity is enforced differently by each creation/mutation path

- Manual add uses JS normalized-title preflight (`backend/routes/games.js:601`).
- Catalog add embeds a separate long SQL normalization/identity preflight (`backend/routes/catalog.js:227`).
- Steam import uses provider/catalog/title/fuzzy checks (`backend/services/steamService.js:3241`) and can write global identities (`backend/services/steamService.js:3338`).
- PostgreSQL lacks the corresponding uniqueness/normalized ownership constraints (`backend/schema.sql:202`).

Result: duplicate and relationship behavior depends on entry point and concurrency. DATA-001/003/004/008 should define database-owned invariants and shared conflict serialization before simplifying route preflights.

### Status meaning has competing sources of truth

- Backend semantic groups: `backend/utils/status.js:16`.
- API metadata/context: `backend/routes/meta.js:13`, `src/contexts/StatusGroupsContext.jsx:71`.
- Hardcoded completed values: `src/pages/Backlog/BacklogPage.jsx:94`, `src/pages/PublicProfile.jsx:21`, `src/components/ProfileSnapshot.jsx:20`.
- Hardcoded SQL transition values: `backend/routes/games.js:699`, `backend/routes/catalog.js:328`.
- Independent Steam/automatic-list rules: `backend/services/steamService.js:1047`, `src/utils/automaticLists.js:5`, `src/utils/steamAchievements.js:143`.

Result: a status can be done for insights but not for quick filters, date automation, public summaries, or Steam suggestions. MAINT-001/API-002 should be one coordinated group.

### Hour meaning and cache invalidation are distributed

- Server insights source policy: `backend/routes/insights.js:85`.
- Client display policy: `src/utils/hours.js:20`.
- Game update fallback/clear behavior: `backend/routes/games.js:784`.
- Cache invalidation subset: `backend/routes/games.js:912`.
- Steam writes/invalidation occur in separate route/service paths.

Result: estimate, Steam actual, preferred source, and lock can display/calculate differently and caches miss relevant transitions. API-003/004 and DATA-007 should be implemented/tested as one contract group.

### Third-party failure/cache behavior is inconsistent

- RAWG utilities erase errors into empty values (`backend/utils/fetchRAWG.js:38`).
- Catalog has failure tables/functions that those erased errors bypass (`backend/services/catalogService.js:914`).
- Private legacy hydration bounds concurrency (`backend/routes/games.js:269`); public legacy hydration does not (`backend/routes/public.js:18`).
- Steam utilities throw stable service errors for HTTP failure (`backend/services/steamService.js:169`) but neither provider has timeouts.

Result: UI cannot reliably distinguish zero results, cache-only, stale, rate limited, misconfigured, and unavailable. INT-001/002 plus PERF-002 should introduce shared typed outcomes/limits.

### Frontend service and state abstractions are only partially adopted

- Most network traffic goes through `src/services/*`, but Insights directly calls `api.get('/api/games')` at `src/pages/Insights/InsightsPage.jsx:115` rather than `gameService`.
- Backlog uses canonical `src/utils/gameList.js`, while `src/hooks/useFilters.js` still derives its own `filteredGames`, and `src/utils/applyFiltersAndSort.js` is unused.
- Current public settings lives in `SettingsPage`, while the old modal/state remains (`src/components/PublicSettingsModal.jsx`, `src/hooks/useUI.js:11`).

Result: fixes can land in a nominal shared abstraction without reaching all consumers. UI-003 and MAINT-002 should inventory consumers before deleting/consolidating.

### Schema, migration, runtime, and documentation do not form one contract

- Fresh reset schema and migration history are separate, with a missing fresh-schema index (DOC-002).
- Migration history assumes a pre-existing baseline (DOC-001).
- Runtime SQL references a column in neither source (API-001).
- Mocked tests validate SQL strings, not PostgreSQL behavior (TEST-001).
- Maintained docs claim schema-only migrations even though migration 004 backfills data.

Result: each layer can be internally green while deployment/runtime is broken. DOC-001/002 and TEST-001 are prerequisites for safely adding constraints.

### Error/loading/accessibility behavior varies by page/primitive

- Backlog has retry/error/empty states; PublicProfile maps privacy to generic error (UI-005).
- Shared Modal has partial Escape semantics, GameModal has a separate incomplete implementation (UI-006).
- Native buttons/fields coexist with custom listbox roles that lack full keyboard behavior (UI-007).
- Playwright covers only selected happy paths and one desktop browser (TEST-002).

Result: visual consistency does not imply interaction/accessibility consistency. UI-005/006/007 should be verified through shared component tests plus page-level keyboard/mobile cases.

### Documentation/configuration drift is representative, not isolated

- README says Vitest; package uses `node --test`.
- Package omits ESLint; CI downloads a separate version.
- `.env.example`, `check-env`, and actual environment consumers disagree.
- SYSTEM_CONTEXT omits current `/reviews` route.
- AGENTS refers to an admin flow that has no backend role model, while frontend names ordinary login “Admin.”

Result: future implementation agents can follow maintained docs and still choose the wrong tool/route/security model. DOC-003 and MAINT-002 should update maintained docs only after code decisions are verified.

## 6. Missing test matrix

| Flow | Existing coverage | Missing cases | Recommended test level | Priority |
|------|-------------------|---------------|------------------------|----------|
| Login/register/current user | Mock-pool auth route tests for `/me`, preferences, profile; API network retry unit tests | Real password policy/byte boundaries, expired token 401, permission 403, storage/context sync, cross-user JWT subject, malformed JSON, DB failure | Route + real Postgres + Playwright | P0 |
| Steam OpenID link/relink | Pure state/provider helpers are indirectly covered; no callback integration | Browser nonce binding, replay/expiry/wrong browser, existing provider owner, atomic source reconciliation, safe redirect error | Route + real Postgres + two-browser-context provider stub | P0 |
| Cross-user game access | Query-string utility tests and delete ownership mock test | Read/update/reorder/favorite/status-suggestion with user B IDs; relationship corruption constraints; IDs from mixed request bodies | Real Postgres route matrix | P0 |
| Backlog create | Mock duplicate/title/date-order tests | Concurrent manual/catalog/Steam adds, normalized/external uniqueness, position collision, impossible date, provider partial failure | Real Postgres concurrency + route | P0 |
| Backlog update/delete | Mock duplicate/delete/favorite tests; form utility tests | Partial date order, clear HLTB, raw identity omission/clear, hour policy cache, concurrent edits/rollback, delete while listed/Steam-linked | Real Postgres + hook/component | P0 |
| Backlog reorder | Utility and mocked route; one mocked desktop drag | Filter/search/sort/reverse, hidden rows, shared-rank status, tied positions, concurrent reorder, keyboard/touch/mobile | Real Postgres + Playwright | P0 |
| Public/private profiles | Query utility asserts no Steam joins; one mocked public happy-path Playwright test | Private/nonexistent enumeration policy, AUTH-001 retention, malformed username, large legacy hydration, keyboard cards, public modal read-only, sanitized malformed HTML | Route + component + Playwright | P0 |
| Admin behavior | No true role exists; only legacy naming | Product decision and, if retained, backend role guard/claims/cross-role tests; otherwise removal/rename coverage | Architecture decision + route/browser | P2 |
| Demo/guest | No route/browser lifecycle tests; demo start mocked in Playwright | Refresh/reopen persistence, explicit discard, keep conversion, expiry/cleanup, guest external-call restrictions, transaction failure | Real Postgres + Playwright | P0 |
| Manual/smart lists | Mock-pool list route tests cover ownership, membership, reorder, validation | Real FK ownership, N+1 budget, merge membership transfer, concurrent add/reorder, listType update contract, smart query edge cases | Real Postgres + service/browser | P1 |
| Steam library sync | Pure normalization/matching and mocked service fragments | 1k apps/query budget, timeout/rate limit/private-vs-zero, crash/retry/resume, simultaneous sync, partial DB failure, stale account/source state | Provider fake + real Postgres performance/integration | P0 |
| Steam import/review | Mock service tests for several actions/import/attach/unlink/merge | Transaction rollback for each multi-write action, cross-user candidate/source IDs, global mapping poisoning, concurrent duplicate import, scope limits/retry | Real Postgres concurrency + route | P0 |
| Steam achievements | Normalization/suggestion utility tests and one mocked scoped sync | Provider timeout/malformed/private/rate-limit, partial batch, cache invalidation, status endpoint real schema, cross-user game | Provider fake + real Postgres | P0 |
| RAWG/catalog | Mocked browser discover happy path; limited service behavior implicit | Typed outcome matrix, empty cache reuse, concurrent identity upsert, pagination cursor/gaps, cooldown, guest cache-only, stale fallback, malformed HTML/URLs | Service + fake HTTP + real Postgres | P0 |
| HLTB/insights | Pure normalization/aggregation helpers; no route real DB test | Concurrent manual edit vs GET write, >50 writes, cache invalidation matrix, query validation, request race, storage/query history | Real Postgres + hook/Playwright | P0 |
| Timeline/reviews | Date/review utility tests | Auth/network/error/empty/long-title/missing-cover, timezone browser matrix, modal keyboard, mobile layout, live update after CRUD | Component + Playwright | P2 |
| Validation/error responses | Celebrate tests for game/Steam validators; central error unit tests | Every route malformed params/body/query, impossible dates, unknown status, PG SQLSTATE matrix, requestId, no raw exception leaks | Route + real Postgres contract | P1 |
| Migration/schema agreement | None | Empty bootstrap, existing baseline adoption, ordered rerun, rollback, concurrent runner, read-only status, schema object diff, dirty-data constraint migration | CI ephemeral Postgres | P0 |
| CI/build/tooling | Unit/build run; CI lint/test/build | Clean offline lint dependency, Node 20 parity, Playwright enforcement, bundle budget, npm advisory workflow with trusted CA/proxy | CI jobs | P1 |
| Mobile/responsive | Responsive classes; screenshots in docs only | 320/375/768 widths, touch drag, fixed banners/modals, safe areas, long titles, virtual keyboard, charts/tables overflow | Playwright devices + manual | P2 |
| Accessibility | Some roles/labels and permission utility tests | Modal focus/stack/restore/inert, card keyboard access, listbox pattern, live regions, contrast, axe scans, reduced motion | Component + Playwright + manual screen reader | P1 |

## 7. Remediation plan

### Phase 0: emergency security/data-integrity fixes

#### 0A — Session status semantics

- Findings: AUTH-001, UI-005.
- Why first: prevents an unauthenticated/private-resource response from damaging valid sessions and establishes 401/403 ownership for later endpoint work.
- Likely overlap: `apiClient.js`, AuthContext, auth middleware/error mapping, PublicProfile/public route tests.
- Commit: one focused auth-state/API-contract commit; UI private-state mapping may be a second commit if enumeration policy needs review.
- Verify: `npm test`; new API client tests; targeted Playwright private-profile session test; `npm run check`.

#### 0B — Steam link boundary

- Findings: AUTH-002.
- Why first: closes login-CSRF/account displacement before expanding Steam behavior.
- Likely overlap: Steam route/service, transient link storage/cookie middleware, schema migration if persisted nonce table is chosen.
- Commit: separate security commit; do not combine with sync performance.
- Verify: real-DB callback tests, two-context browser/provider-stub tests, replay/expiry tests, `npm run check`.

#### 0C — Cross-user Steam mapping

- Findings: DATA-004.
- Why first: ordinary users can currently change a globally trusted mapping used by others.
- Likely overlap: Steam service, external identity schema/provenance, candidate/source serialization.
- Commit: separate behavior/migration commit with an audit/repair script kept outside migrations if it requires judgment.
- Verify: two-user real-DB mapping tests and existing import/attach tests.

#### 0D — Shipped runtime failure

- Findings: API-001.
- Why first: small, independently verifiable fix restores a core action.
- Likely overlap: Steam service/test only unless choosing a new column.
- Commit: separate XS fix. Prefer removing the write unless timestamps are an approved schema feature.
- Verify: real-schema endpoint test plus `npm run check`.

#### 0E — Immediate export/diagnostic hardening

- Findings: SEC-001, SEC-002, SEC-004.
- Why now: low-overlap, small security fixes; SEC-002 also makes future environment diagnostics safe.
- Commits: CSV separate from backend diagnostic/request-ID changes.
- Verify: serializer/script/middleware unit tests; no real secrets.

### Phase 1: high-risk correctness and authorization

#### 1A — Migration/test safety foundation

- Findings: DOC-001, TEST-001 (foundation only).
- Why first: all constraint work needs a bootstrappable, tested, fail-safe migration path.
- Likely overlap: migration runner/workflow, migration README, schema test harness, package/CI.
- Commits: baseline design/adoption procedure; read-only status; fail-closed workflow; test harness as separate reviewable commits.
- Mixed-file/migration risk: highest in audit. Do not edit historical applied migrations without an explicit adoption strategy. Preserve production environment protection/advisory lock.
- Verify: empty/adopted DB paths, rerun, rollback, concurrency, missing-secret workflow test, `npm run check`.

#### 1B — Backlog/database invariants

- Findings: DATA-001, DATA-002, DATA-003, DATA-008, API-002.
- Why ordering is safe: report/repair dirty data first; deploy additive keys/constraints `NOT VALID` where appropriate; update tolerant code; validate constraints last.
- Likely overlap: schema, new migrations, games/catalog validators/routes/services, error handler, real-DB tests.
- Implement together: DATA-001 external identity/normalized uniqueness with DATA-008 catalog race only after identity rules are agreed. DATA-002/API-002 date validation/constraint together.
- Separate commits: data-audit scripts/report, additive schema, code adoption, constraint validation.
- Verify: migration tests, concurrency barriers, two-user constraint matrix, `npm run check`, localhost migration only against disposable DB.

#### 1C — Steam transition integrity

- Findings: DATA-005, DATA-006.
- Why: after ownership constraints exist, transaction/state-transfer work can rely on them.
- Likely overlap: large `backend/services/steamService.js`, list/source/candidate tables/tests.
- Implement together only where the same transaction helper is reused; duplicate merge/list transfer should remain a separate commit from candidate action transactions.
- Mixed-file risk: `steamService.js` is high-conflict/high-coupling; re-read current worktree before every patch.
- Verify: injected second-statement failures, merge list union/order, concurrent sync/review, `npm run check`.

#### 1D — Insights data/cache integrity

- Findings: DATA-007, API-003, API-004.
- Why: defines hour provenance/clear/cache semantics coherently.
- Likely overlap: games/insights routes, hours utilities, micro-cache, form/service tests.
- Commits: read-only/conditional insights enrichment; explicit clear semantics; centralized invalidation (can be two commits with shared contract tests).
- Verify: concurrency test, >50 rows, cache matrix, UI reload, `npm run check`.

#### 1E — Provider reliability and Steam scale guardrail

- Findings: INT-001, INT-002, PERF-001.
- Why: deadlines/outcome types are prerequisites for a safe job/chunk model.
- Likely overlap: RAWG utility, catalog service, Steam service/routes, new provider HTTP helper/job storage.
- Commits: provider wrapper; RAWG outcome/cache semantics; bounded/preloaded sync; asynchronous job architecture separately.
- Verify: fake provider timeout/429/500/malformed, 1k-app query/time budget, crash/resume/idempotency, `npm run check`.

### Phase 2: API/schema consistency

#### 2A — Remaining request contracts

- Findings: API-005, INT-003.
- Why: once provider outcome and core schema behavior stabilize, strict query/list/pagination contracts can be finalized.
- Likely overlap: insights/list/catalog validators/services and frontend services.
- Commits: API validation separate from catalog cursor migration.
- Verify: contract tests, cursor fixtures, old-config migration compatibility, `npm run check`.

#### 2B — Schema parity/policy

- Findings: DOC-002, SEC-003.
- Why: follows baseline work and should land before more migrations accumulate.
- Likely overlap: schema, migration docs/tests, DB config/migration runner.
- Commits: schema parity/doc policy; TLS configuration separately due deployment risk.
- Verify: normalized schema diff, provider staging TLS verification, local non-SSL check, `npm run check`.

#### 2C — Status contract

- Findings: MAINT-001 (and API-002 follow-through).
- Why: status membership is validated first; consumers can then converge on shared semantic metadata.
- Likely overlap: meta/context, game/catalog SQL, backlog/public/profile/list/Steam utilities.
- Commits: backend semantic API/SQL predicates; frontend consumer migration; dead map removal separately.
- Verify: cross-feature status fixture matrix, `npm run check`, targeted browser smoke.

### Phase 3: frontend/UX/accessibility

#### 3A — Canonical reorder UI

- Findings: UI-001.
- Why: isolated high-impact correctness fix after server ordering policy is stable.
- Likely overlap: BacklogPage, GameGrid, reorder utility/service.
- Commit: separate; begin with disable predicate if canonical-ID protocol is not yet approved.
- Verify: filtered/sorted/reversed/shared-rank mouse/keyboard/touch cases.

#### 3B — Demo lifecycle

- Findings: UI-002.
- Why: high-impact onboarding loss with little overlap.
- Likely overlap: AuthContext, demo UI/copy, demo route only if explicit lifecycle changes.
- Commit: separate.
- Verify: refresh/reopen/keep/discard/expiry Playwright plus DB cleanup test.

#### 3C — Insights and game state races

- Findings: UI-003, UI-004.
- Why: backend data/cache semantics from Phase 1 are now stable.
- Likely overlap: hooks, InsightsPage/services, useGames.
- Commits: query/request state; silent refresh/timer cleanup separately.
- Verify: delayed-response, history, storage-denied, unmount, optimistic-row tests.

#### 3D — Accessibility primitives

- Findings: UI-006, UI-007, UI-008.
- Why: modal stack/focus foundation should precede per-page keyboard fixes.
- Likely overlap: shared Modal/Confirm/Select components, GameModal/Card, PublicProfile, App routes.
- Commits: dialog primitive; GameModal migration; cards/listboxes; route/read-only fallbacks separately.
- Verify: keyboard/axe/stack tests, screen-reader manual pass, mobile viewport/scroll.

#### 3E — Frontend/provider performance

- Findings: PERF-002, PERF-004.
- Why: provider helpers are stabilized and route behavior is covered before lazy-loading/hydration changes.
- Likely overlap: public route/catalog hydration, App route imports/skeletons.
- Commits: backend public hydration separate from frontend code splitting.
- Verify: concurrency/memory metrics, build budget, throttled public/login navigation.

### Phase 4: tests, maintainability, and documentation

#### 4A — Browser/CI quality gate

- Findings: TEST-002.
- Why: repair current failure first, then enforce/expand incrementally to avoid a permanently red gate.
- Likely overlap: e2e spec/config, CI, current Settings navigation.
- Commit: repair; CI enforcement; mobile/accessibility expansion separately.
- Verify: `npm run test:e2e` plus protected CI run.

#### 4B — Remaining performance cleanup

- Findings: PERF-003.
- Why: set-based list optimization is lower risk after real-DB harness exists.
- Likely overlap: list route/query helpers/tests.
- Commit: separate.
- Verify: query-count budget and list behavior matrix.

#### 4C — Reproducible tooling/docs

- Findings: DOC-003, MAINT-002.
- Why: update truth after behavior/security decisions land; remove dead code only with green browser coverage.
- Likely overlap: package/lock/CI, env example/check script, maintained docs, legacy UI/utilities.
- Commits: tooling dependency; env/docs; dead code/names each separate. Do not mix lockfile changes with functional cleanup.
- Verify: clean Node 20 `npm ci && npm run check`, e2e, environment redaction tests, docs proofread, `git diff --check`.

## 8. Handoff instructions for the implementation agent

1. Start from one remediation subgroup above, not an entire phase. Re-read every listed location and the relevant repo-local skill before editing.
2. Run `git status --short --branch` first. The audit was created in a dirty worktree; do not stage, overwrite, format, or “clean up” the pre-existing files listed in section 2.
3. For any migration, first complete DOC-001's baseline/test harness work. Never edit an already-applied migration casually; add a new numbered migration and keep `backend/schema.sql` equivalent.
4. Implement the smallest coherent fix that owns one invariant end-to-end: UI/service/route/validator/database/response as applicable. Do not rely on frontend permissions as authorization.
5. Add the exact regression tests named in the finding. For SQL/transactions/ownership/concurrency, use a disposable localhost/ephemeral Postgres—not pool mocks alone and never a remote DB.
6. Preserve stable centralized errors `{ error: { code, message, requestId } }`, per-user predicates, demo/public/Steam privacy, guest external-call restrictions, and existing idempotency/cooldowns.
7. Run risk-appropriate verification: focused tests while iterating; `npm run check` for shared/backend/data changes; Playwright for browser changes; local migration only when an explicitly disposable localhost DB is confirmed.
8. Review the diff for mixed-file risk, especially `backend/services/steamService.js`, `backend/schema.sql`, `src/pages/Backlog/BacklogPage.jsx`, package lockfiles, and maintained docs. Keep unrelated findings in separate commits.
9. Update this audit finding's `Status` only after evidence: use `Fixed` with commit/tests, `Deferred` with owner/reason, or `Unable to reproduce` with exact environment/steps. Do not delete history or mark fixed because a mock test passes.
10. Before handoff, run `git diff --check`, report every command/result and any skipped check, call out test suites that remain mocked, and confirm no secret/data/export artifact entered Git.

## 9. Items investigated but not found to be problems

The following were specifically checked and appeared correct in current code. These are not guarantees against future changes; preserve them with regression tests.

- **Core game ownership predicates:** shared queries require `user_id` for owned list/select/delete/status update (`backend/utils/gameAccess.js:15` through `backend/utils/gameAccess.js:55`). Manual update/delete/reorder routes use those helpers or explicit user predicates. No confirmed game IDOR was found.
- **List route ownership:** list read/update/delete/add/remove/reorder queries scope the list and game to the authenticated user (`backend/routes/lists.js:206`, `backend/routes/lists.js:234`, `backend/routes/lists.js:282`, `backend/routes/lists.js:352`, `backend/routes/lists.js:408`). Mock tests cover several cross-user/not-found cases, though real-DB coverage is still missing.
- **Reorder transaction itself:** backend reorder starts a transaction, verifies ownership, locks all same-rank peers, rejects cross-rank moves, renumbers with a user predicate, and commits atomically (`backend/routes/games.js:993` through `backend/routes/games.js:1073`). UI-001 concerns the index contract, not these ownership/locking protections.
- **Favorites transaction/uniqueness:** favorites validate owned IDs, update in a transaction, and `games_user_favorite_rank_unique` prevents duplicate favorite slots (`backend/routes/games.js:460`, `backend/schema.sql:224`).
- **Public Steam privacy:** public game query intentionally omits Steam tables and strips `user_id` (`backend/utils/publicAccess.js:4`, `backend/routes/public.js:130`, `backend/routes/public.js:137`). Existing test `backend/utils/publicAccess.test.js:9` asserts that query shape. No current public Steam data exposure was found.
- **Public opt-in and username validation:** both public endpoints resolve the requested user, require `is_public`, and scope game count/list to that ID (`backend/routes/public.js:65`, `backend/routes/public.js:112`); params use the shared validator (`backend/validators/public.js:1`). UI-005 is a response-state mismatch, not bypass.
- **Steam route/service user scoping:** candidate/source/account queries reviewed consistently include authenticated `user_id`; attach/unlink/import/merge validate owned rows. No direct backlog cross-user Steam IDOR was confirmed. DATA-003/004 concern database/global identity boundaries and defense in depth.
- **Transactions in critical Steam paths:** account upsert (`backend/services/steamService.js:350`), candidate attach (`backend/services/steamService.js:2674`), unlink (`backend/services/steamService.js:2783`), duplicate merge (`backend/services/steamService.js:2500`), and import (`backend/services/steamService.js:3241`) use transactions/rollback. DATA-005 identifies a missing relationship within merge; DATA-006 identifies other paths that do not follow this pattern.
- **Hidden Steam candidate persistence:** source/candidate UPSERT logic preserves ignored state across ordinary sync, and restore is explicit. Existing service tests cover ignore/restore query intent (`backend/services/steamService.test.js:293`).
- **Steam secrets/profile privacy:** the Web API key stays server-side; public serializers do not include provider account/source fields. External profile/store links use fixed/provider-derived destinations in current UI; no app open redirect from user request parameters was found.
- **SQL injection controls:** reviewed dynamic values are parameterized. Steam candidate sort uses a fixed whitelist (`backend/services/steamService.js:1214`), and validators bound pagination/IDs. No confirmed SQL injection was found.
- **HTML/XSS handling:** RAWG description HTML is sanitized by the strict DOMPurify utility before persistence/response and before the two `dangerouslySetInnerHTML` sinks (`backend/utils/sanitizeHtml.js:1`, `src/pages/DiscoverPage.jsx:313`, `src/components/GameModal.jsx:441`). No unsanitized description path was found.
- **CORS/headers baseline:** Helmet, one CORS policy, JSON limits, and compression are registered centrally (`backend/middleware/security.js:9`). Production origins fail closed when not allowlisted, suffix matching uses hostname boundary semantics, and browser credentials are disabled because bearer auth is used (`backend/config/cors.js:32`).
- **Rate limiting baseline:** auth, public, catalog, Steam, and demo prefixes have structured rate-limit responses including request ID (`backend/index.js:30`, `backend/middleware/rateLimit.js:3`). Coverage/capacity tuning may still be needed, but no bypass was proven from code.
- **Central API error shape:** most routes forward intentional errors to `errorHandler`, Celebrate details are normalized, and known PG constraints are mapped (`backend/middleware/errorHandler.js:4`, `backend/middleware/errorHandler.js:44`). Rate-limit handlers match the shape. Steam callback is the notable exception recorded in AUTH-002.
- **Development remote-DB guard and logging:** runtime rejects non-local `DATABASE_URL` outside production unless explicitly overridden, and diagnostic DB URLs redact passwords (`backend/db.js:19`, `backend/db.js:29`, `backend/db.js:80`). No secret value was observed in tracked `.env` files; `.env*` and exports/backups are ignored.
- **Migration execution atomicity:** once a valid baseline exists, each pending file runs in a transaction and the runner uses a Postgres advisory lock (`scripts/db-migrate.js:110` through `scripts/db-migrate.js:145`). DOC-001 concerns bootstrap/status/CI behavior, not those mechanics.
- **Fresh-reset command guard:** reset script validates localhost unless a deliberate flag is supplied; production copy/reset commands were not run. The review did not invoke any destructive DB operation.
- **RAWG cache file writes:** the legacy cache uses temp file, fsync, and atomic rename (`backend/routes/games.js:70` through `backend/routes/games.js:88`), and the target is gitignored. PERF-002 concerns concurrency/eviction/public reuse, not on-disk replacement corruption.
- **Bounded insights micro-cache:** cache entries are per-user, TTL-bound, and capped by `MICROCACHE_MAX_KEYS` (`backend/utils/microCache.js:9`). API-004/DATA-007 concern invalidation and mutation semantics.
- **DATE timezone handling:** pg DATE is parsed as `YYYY-MM-DD` string (`backend/db.js:8`); timeline/review utilities validate and format calendar dates without accidental local-day shifts, with passing unit tests (`src/utils/gameTimeline.test.js`, `src/utils/reviews.test.js`). DATA-002 concerns input/order constraints.
- **Demo creation atomicity and cleanup:** guest user plus template games are created in one transaction, the token carries `is_guest`, heartbeat extends expiry, and scheduled cleanup deletes expired guests (`backend/routes/demo.js:92`, `backend/routes/demo.js:117`, `backend/routes/demo.js:194`, `backend/index.js:141`). UI-002 concerns premature client-triggered deletion.
- **Guest provider restrictions:** guest manual add reads legacy cache rather than fetching RAWG (`backend/routes/games.js:618`); catalog search returns cache-only results (`backend/services/catalogService.js:956`); catalog refresh blocks guests. No direct guest-triggered provider quota path was confirmed.
- **Frontend permission helpers:** `src/utils/permissions.js` consistently makes public/read-only views non-editable and tests cover ownership/read-only/demo public-toggle rules. Backend ownership remains the security boundary as required.
- **Network service routing baseline:** aside from the documented Insights direct `api.get`, frontend network calls are concentrated in `src/services/*` and shared `apiClient`; no raw frontend `fetch` bypass was found.
- **External API failure does not directly write bogus game data:** Steam normalization filters malformed app IDs and clamps playtime; catalog metadata upserts require provider ID/name. The main risks are timeout/outcome/race semantics recorded above, not SQL injection or unbounded arbitrary object persistence.
