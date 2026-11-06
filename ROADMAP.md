### Phase 2 — Authentication, API Keys, and Administrative Access

**Status:** Phase 2 is **merged** into `main` via PR #4. Merge commit `dc08b6d42ee0796c964eb5a8a5ecd58aeb0d15d9` contains source head `b057042362f6497852cb037ed7be2ec4c0aa63a4`. PR CI #425, PR CodeQL #210, post-merge CI #426, and default-branch CodeQL #211 all passed. A direct full SARIF scan on earlier remediated source head `ee317f3` produced 0 JavaScript/TypeScript and 0 Actions results. The original pre-merge baseline had 14 CodeQL alerts with remediations in PR #4; the current open-alert count was not independently accessible through this session and must be checked in GitHub Security. All six inline PR review threads are resolved. Solo maintainer acceptance is recorded; no second human reviewer participated.
**Priority:** P1 — security-critical

- [x] Separate gateway caller authentication from dashboard/admin authentication.
- [x] Implement one-time first-admin bootstrap, password hashing, login throttling, hashed database sessions, expiry, logout, and HttpOnly/SameSite cookies.
- [x] Protect administrative `/api/*` routes by default; keep only the narrow bootstrap/login/status/session endpoints public. Validate Host and the complete Origin tuple (scheme, host, port), including same-host cross-port rejection.
- [x] Store managed caller API keys as salted SHA-256 hashes with a non-secret lookup prefix; show raw keys only once on issuance/rotation.
- [x] Implement key lifecycle operations: create, list metadata, revoke, rotate, rename, inference scope, last-used time, and request counts.
- [x] Replace predictable `Math.random()` API key generation with CSPRNG keys and UUID identifiers.
- [x] Add per-key metadata, lifecycle state, inference scope, and usage counters without coupling gateway keys to administrator sessions. Plan assignment is intentionally Phase 3 scope.
- [x] Add negative tests for missing, invalid, revoked, wrong-scope, and unauthenticated admin credentials.
- [x] Encrypt custom-provider, proxy/pool/relay, and CodeBuddy OAuth credentials at rest using AES-256-GCM; use salted one-way hashes for managed gateway keys.
- [x] Separate AlphaWay gateway bearer credentials from CodeBuddy upstream credentials; preserve server-side CodeBuddy configuration and the explicit `x-codebuddy-api-key` override.
- [x] Keep CodeBuddy OAuth access/refresh tokens out of HTTP polling responses and persist OAuth-created credentials encrypted in SQLite.
- [x] Align the dashboard CodeBuddy OAuth client with the provider `state`/`authUrl` polling contract.
- [x] Remove CLI shell-based OAuth browser auto-launch; print the validated authorization URL for manual opening and never pass remote URL data to a child process.
- [x] Isolate Bun unit-test SQLite state using a preload before application modules are imported.
- [x] Bound administrator login inputs and failed-login tracking memory; reject control characters in API-key labels.
- [x] Bound administrator password KDF concurrency globally (4 active, 16 queued), reject queue overflow, and serialize KDF checks per username to prevent parallel throttle bypass.
- [x] Preserve active per-username login-throttle records when the bounded map reaches capacity; reject new untracked usernames rather than evicting existing lockouts under username-spraying pressure.
- [x] Hold both the compatibility data-directory lock and a lock beside the canonical SQLite database path across foreground/daemon/systemd/launchd lifetimes; reject concurrent writers even when `DATA_DIR` differs but `DB_PATH` is shared, and key restore locking to the actual destination path.
- [x] Keep `alphaway.pid` daemon-only for existing `--status`/`--stop` behavior; retain `DATA_DIR/alphaway.lock` for compatibility and use `<canonical-DB_PATH>.alphaway.lock` for database-level exclusion.
- [x] Preserve daemon `--daemon`/`-d` already-running behavior by checking a live `alphaway.pid` before rejecting generic data-directory/database lock conflicts; add a regression for this ordering.
- [x] Mark credential-transform migrations v2 and v4 destructive so the migration runner requires an encrypted pre-migration SQLite snapshot before rewriting stored credentials or API keys.
- [x] Canonicalize quoted and relative installer `DATA_DIR` values to an absolute directory rooted at `BINDIR` so systemd/launchd and manual starts resolve the same state root.
- [x] Decode supported double-quoted `.env` escapes once and preserve unknown escape sequences; add regression tests for Windows-style paths, literal backslashes, newlines, unknown escapes, and escaped quotes.
- [x] Cap all admin settings/configuration and OpenAI/Anthropic/Codex gateway JSON request bodies at 10 MiB using Content-Length validation and a streaming byte limit; oversized requests return 413 before JSON parsing or provider dispatch.
- [x] Keep public administrator bootstrap/login request bodies on a stricter 16 KiB limit and reject oversized requests before parsing or password KDF work.
- [x] Bound master encryption-key reads to exactly 32 bytes plus a sentinel and bootstrap-token file reads to 64 bytes; validate file identity/metadata and strict token format.
- [x] Bound proxy health cache reads to 1 MiB using no-follow descriptors and metadata checks, and cap the in-memory health map at 512 egress records; this cache remains best-effort and independent of canonical proxy configuration.
- [x] Make `/health` recognize an encrypted CodeBuddy credential without exposing its value.
- [x] Prevent the interactive CodeBuddy CLI from logging JWT `sub` claims derived from `CODEBUDDY_API_KEY`; expose only generic credential-configured status and cover it with a regression test.
- [x] Parse Cloudflare Quick Tunnel output as a URL and validate HTTPS, credentials, port, and the actual `trycloudflare.com` hostname suffix before logging only the origin; cover suffix/userinfo/path/query spoofing with tests.
- [x] Add AES-GCM tests for nonce uniqueness, authenticated decryption/tamper rejection, symlink refusal, and POSIX owner-only key-file permissions.
- [x] Retire the pre-SQLite standalone JSON importer and `--restore-legacy-backup` CLI. Runtime persistence now uses SQLite only; existing standalone JSON files are left untouched and are not imported.
- [x] Align persistent storage configuration with 9router-go's `DATA_DIR`/`DB_PATH` conventions, including the default `db/data.sqlite` location and directory-layout fallback, while preserving AlphaWay compatibility aliases and its existing database filename fallback.
- [x] Decode double-quoted `.env` escapes in a single pass; preserve unknown escape sequences and cover Windows-style paths, literal backslash sequences, newlines, and escaped quotes with regression tests.
- [x] Add schema migration v5 to remove the obsolete `legacy_imports` ledger from existing databases while preserving canonical SQLite application data and immutable v1–v4 migration history.
- [x] Normalize and rewrite older SQLite analytics, TokenSaver, and proxy settings through allowlisted schemas before exposing them to application/dashboard code.
- [x] Encrypt destructive-migration SQLite snapshots as AES-256-GCM `.sqlite.awenc` envelopes and migrate historical plaintext migration/pre-restore snapshots before they are used.
- [x] Stream SQLite backup encryption and restore with bounded 96 KiB file I/O, without an arbitrary database-size cap; emit v2 envelopes and preserve compatibility with v1 encrypted backups. Staged restore still runs SQLite `quick_check` before replacement.
- [x] After the v2 credential migration, enable SQLite `secure_delete`, checkpoint/truncate WAL, `VACUUM`, and checkpoint again under a retryable v3 marker before startup serves requests. This is logical SQLite cleanup, not physical-media sanitization.
- [x] Migration v4 encrypts the legacy JSON-encoded `codebuddy_api_key` setting for databases that already reached v3, then re-arms the cleanup marker so startup repeats WAL checkpoint/VACUUM after replacing the old plaintext value.
- [x] Redact raw, decoded, percent-encoded, and Bearer-prefixed provider credentials from custom-provider and CodeBuddy error responses/diagnostics; sanitize proxy connection-test errors.
- [x] Preserve installer upgrade behavior and verify `.env`, SQLite state, and `secret-encryption.key` remain intact through the Linux installer smoke test.
- [x] Remove CodeBuddy JWT `sub` claim logging and OAuth shell-based browser launch; do not expose bearer-derived identity claims or pass a remote authorization URL to a child process.
- [x] Replace proxy health IDs derived from credential-bearing URLs with purpose-separated HMAC-SHA-256 keyed by AlphaWay's local master encryption key; bump health cache schema to v2.
- [x] Replace deterministic SHA-1 UUIDv5-style CodeBuddy conversation IDs with stable SHA-256-based RFC 9562 UUIDv8 IDs.
- [x] Replace URL substring checks in test mocks with parsed HTTPS hostname validation for `raw.githubusercontent.com`.
- [x] Audit the 14 open CodeQL alerts on baseline `main` (`e2492fb`); implement remediations in PR #4 and verify a full PR-head SARIF scan has zero JavaScript/TypeScript and Actions results.
- [x] Complete solo-maintainer acceptance for Phase 2 after reviewing the passing CI/CodeQL evidence and resolving all six inline review threads; residual review risk is explicitly accepted.
- [x] Configure and verify repository Ruleset `Protect main`: active for `refs/heads/main`, no bypass actors, PR required, 0 approvals for the solo-developer workflow, conversation resolution required, four successful CI jobs required with strict up-to-date checks, deletion blocked, and non-fast-forward updates (force-push) blocked.

**Implementation notes**

- Migration v2 adds `api_keys`, `admin_users`, and `admin_sessions`; converts the old JSON-serialized API-key setting inside SQLite into hashed rows; and encrypts existing custom-provider/proxy credentials.
- Migration v3 writes a retryable secret-residue cleanup marker. Startup enables SQLite `secure_delete`, checkpoints/truncates WAL, runs `VACUUM`, and marks cleanup complete after a successful final checkpoint.
- Migration v4 converts a previously plaintext, JSON-serialized `codebuddy_api_key` value inside SQLite `app_settings` into an AES-256-GCM envelope, then re-arms the v3 cleanup marker so SQLite free pages/WAL are scrubbed again. This is a SQLite value migration, not a standalone JSON-file importer.
- Migration v5 removes the obsolete `legacy_imports` bookkeeping table. Historical migrations v1–v4 remain unchanged; migration v5 removes only importer metadata and preserves canonical provider, API-key, usage, and settings rows.
- The master encryption key is supplied by `ALPHAWAY_ENCRYPTION_KEY` or generated in the AlphaWay state directory. Back it up with the database and encrypted migration snapshots; losing it makes encrypted credentials and backups unrecoverable.
- Server startup and restore acquire both the data-directory compatibility lock and the canonical database-path lock. Restore supplies its actual destination path, covering different `DATA_DIR` roots and explicit CLI destinations; symlink DB_PATH targets are refused.
- Server startup and restore acquire both the data-directory compatibility lock and the canonical database-path lock. Restore supplies its actual destination path, so an explicit CLI destination cannot bypass a lock held by another `DATA_DIR` that points to the same SQLite file.
- Legacy `API_KEY` and `BRIDGE_API_KEY` remain supported as environment-managed inference credentials. `CODEBUDDY_API_KEY` remains an optional environment override.
- Windows ACL behavior for bootstrap/encryption-key files and SQLite migration backups remains unverified and is explicitly deferred to Phase 7 hardening. POSIX `0600`/`0700` behavior is covered.
- Per-key Plan assignment and quota enforcement belong to Phase 3; do not add a placeholder Plan field during Phase 2.

**Verification state**

- Merged PR #4: [Phase 2 — Authentication, API keys, and administrative access](https://github.com/Yoganataa/alphaway/pull/4).
- Phase 2 merge commit [`dc08b6d42ee0796c964eb5a8a5ecd58aeb0d15d9`](https://github.com/Yoganataa/alphaway/commit/dc08b6d42ee0796c964eb5a8a5ecd58aeb0d15d9); merged source head [`b057042362f6497852cb037ed7be2ec4c0aa63a4`](https://github.com/Yoganataa/alphaway/commit/b057042362f6497852cb037ed7be2ec4c0aa63a4).
- PR CI [#425](https://github.com/Yoganataa/alphaway/actions/runs/41442485797) passed on the final Phase 2 source head. PR CodeQL [#210](https://github.com/Yoganataa/alphaway/actions/runs/41442479398) passed both JavaScript/TypeScript and Actions analyzers.
- Post-merge CI [#426](https://github.com/Yoganataa/alphaway/actions/runs/41448272244) passed on the merge commit: unit/protocol tests, dashboard browser tests, UI/standalone build, and installer/embedded-dashboard smoke all succeeded; optional live upstream drill was skipped by design.
- Default-branch CodeQL [#211](https://github.com/Yoganataa/alphaway/actions/runs/41448263339) passed both analyzers on the merge commit.
- Direct full SARIF [run #41426255599](https://github.com/Yoganataa/alphaway/actions/runs/41426255599) on earlier remediated source head `ee317f3` returned **0 JavaScript/TypeScript results and 0 Actions results**.
- GitHub Security screenshot supplied by the project owner (2026-11-02), filtered to `is:open branch:main`, confirms **0 Open / 14 Closed** CodeQL alerts on `main`. Phase 2 PR #4 and default-branch CodeQL checks passed after remediation.
- All six inline review threads were resolved. The solo maintainer explicitly accepted residual review risk after reviewing CI/CodeQL evidence; no second human reviewer participated.
- Repository Ruleset `Protect main` remains active, requires a PR, conversation resolution, and four mandatory CI jobs with strict up-to-date checks, blocks deletion/force-pushes, and requires zero approvals for the solo-developer workflow.
- Windows ACL behavior for bootstrap/encryption-key files and SQLite migration backups remains unverified and is deferred to Phase 7. POSIX `0600`/`0700` behavior is covered.
- Phase 3 — Plans, Limits, and Request Enforcement — is active on `feat/phase-3-plans-limits` in PR #6. The main CodeQL baseline was checked before Phase 3 started; do not repeat Phase 0–2 work unless a regression is verified.

**Acceptance criteria**

- Newly issued keys authenticate gateway requests; revoked keys stop working immediately (covered by committed tests).
- Administrative operations require an authenticated administrator session; same-host cross-port Origin requests are rejected.
- Existing OpenAI, Anthropic, and Codex gateway protocols retain documented authorization-header compatibility.
- Managed caller keys and persisted upstream credentials are not stored as plaintext in their canonical database representations.
- SQLite is the only persistent application-state backend. Standalone JSON files are neither imported nor modified. Encrypted SQLite migration snapshots retain v1/v2 restore compatibility; POSIX permissions are restricted and Windows ACLs remain Phase 7.

---

### Phase 3 — Plans, Limits, and Request Enforcement

**Status:** Phase 3 is **merged** via PR [#6 — Plans, limits, and request enforcement](https://github.com/Yoganataa/alphaway/pull/6), merge commit `145230a69c0b9295a0ac8ee3966aa669196094fa`. Post-merge CI [#41719318611](https://github.com/Yoganataa/alphaway/actions/runs/41719318611) passed all four mandatory jobs; optional live upstream drill skipped by design. Post-merge CodeQL [#41719315494](https://github.com/Yoganataa/alphaway/actions/runs/41719315494) passed both JavaScript/TypeScript and Actions analyzers.  
**Priority:** P1 — security-critical

**Goal:** Add enforceable, reusable policy tiers for managed AlphaWay API keys without changing legacy environment-key behavior or the OpenAI/Anthropic/Codex protocol contracts. Keep one effective-policy resolver as the only source of truth for key-scoped model access, rate limits, concurrency, and token allowances.

**Architecture constraints**

- Runtime remains Bun 1.4.4+, TypeScript, Hono, and native Bun SQLite. Do not port the Go backend from 9router-go.
- Reuse the Phase 2 managed `api_keys` table and hashed credential authentication. Never persist raw key secrets.
- Add SQLite migration v6 (additive only). Preserve migrations v1–v5 and existing records. No JSON persistence/import/rollback path.
- Policy scope applies to managed API keys only. Environment-managed `API_KEY` / `BRIDGE_API_KEY` and managed keys without an assigned Plan stay unrestricted unless explicit backward-compatible per-key policy is configured.
- No implicit default Plan assignment for existing or newly created keys. Unassigned means no Plan restrictions.
- A Plan is a reusable template. Per-key overrides apply only when explicitly set; unset fields inherit from the Plan. Use bounded integer validation and explicit semantics for zero/unset.
- Resolve the effective policy once per request after model alias normalization and before upstream dispatch. Enforce consistently across OpenAI Chat, Anthropic Messages, Codex Responses, and all legacy aliases.
- Key request accounting must be attributable by stable managed key ID, not raw secret, prefix alone, or the upstream provider credential. Historical request rows remain unattributed; do not backfill guessed ownership. A request authenticated before key revocation still records its eventual usage against that key ID.
- In-flight concurrency slots must be released on success, error, stream completion, cancellation, and body cancellation. RPM/TPM windows and concurrency state are process-local and reset on process restart; the lifetime token quota is persisted in SQLite. State maps must be bounded and avoid memory growth from arbitrary callers.
- Never display synthetic/random RPM or TPM values. Quota Tracker must use real AlphaWay gateway policy/usage data or explicitly show that an upstream provider quota is unavailable.
- Do not implement USD spend caps with hardcoded model prices. AlphaWay currently lacks a trustworthy pricing ledger. Token quotas may be enforced only after streaming and non-streaming token accounting is made deterministic and covered; never use the current fixed streaming completion estimate.

**Work breakdown / acceptance criteria**

**3.1 — SQLite schema and policy model**
- [x] Add migration v6 with a reusable `plans` table, nullable `api_keys.plan_id` foreign-key assignment, and nullable per-key policy override columns.
- [x] Define and validate typed Plan/PlanInput fields for RPM, prompt TPM, concurrency, lifetime token quota, and allowed-model patterns.
- [x] Add the single `resolveEffectivePolicy` resolver with defaults → Plan → explicit key override precedence; unassigned keys remain unrestricted.
- [x] Define exact-ID and prefix-wildcard allowlist matching; normalize model aliases before policy evaluation. Empty allowlists mean unrestricted.
- [x] Add Plan create/list/get/update/delete and managed-key assignment/override operations. Plan deletion is transactional and rejected while keys remain assigned.
- [x] Cover fresh initialization, v5 upgrade, failed-migration rollback, and preservation of canonical existing state.

**3.2 — Request attribution and metering**
- [x] Add nullable `client_api_key_id` through migration v6 and carry the stable managed-key ID in request context; raw secrets are never stored in request logs.
- [x] Attribute request logs for OpenAI Chat, Anthropic Messages, and Codex Responses, including policy/upstream error outcomes. Environment-key traffic remains unattributed.
- [x] Replace fixed streaming completion counts with text-based streaming estimation; count OpenAI streamed tool/function call names and argument deltas as completion output, prefer valid final provider-reported prompt/completion usage when supplied, and use the text estimator only as fallback.
- [x] Resolve non-streaming OpenAI-style usage consistently for OpenAI Chat, Anthropic Messages, and Responses. Provider prompt/completion counts are authoritative when valid (including zero); missing or invalid fields fall back to AlphaWay's estimator, which includes response text, reasoning, refusal, tool-call names/arguments, and legacy function-call names/arguments. This prevents fixed protocol-translator placeholder counts from being used for quota settlement.
- [x] Verify exactly-once accounting across upstream 5xx retry, stream completion, stream cancellation, and protocol translation. `test/server.test.ts`, `test/streaming-usage.test.ts`, and `test/managed-key-stream-concurrency.test.ts` assert one usage event per client request. HTTP upstream responses retain the prompt charge; thrown dispatch/transport errors are recorded as zero-token failures.
- [x] Add indexed per-key usage queries for 1h/24h/7d/30d windows plus persisted lifetime totals, with canonical UTC boundaries and bounded range validation.

**3.3 — Enforcement**
- [x] Implement bounded per-key RPM, prompt TPM, and concurrency gates with consistent 429/Retry-After behavior and fail-closed limiter capacity. No unbounded request queue is created.
- [x] Enforce normalized model allowlists before dispatch across OpenAI, Anthropic, and Codex paths. Integration tests cover canonical endpoints and every legacy route alias.
- [x] Enforce lifetime token quotas with concurrent reservations, bounded output tokens, and quota settlement. For managed keys with nonzero prompt TPM or token quota, reject non-text prompt parts with `multimodal_prompt_unmeterable` when media tokens cannot be measured safely; integration tests cover OpenAI image URLs and Anthropic image blocks. Period budgets remain deferred until rollover/time-zone semantics are designed.
- [x] Verify concurrency release on normal body completion, upstream read error, no-body responses, and downstream cancellation with idempotent lifecycle callbacks. Integration tests hold OpenAI Chat, Anthropic Messages, and Codex Responses streams open, assert a concurrent request is rejected, cancel the active stream, then assert a subsequent request is admitted and usage is recorded once. The OpenCode streaming adapter propagates downstream cancellation to the upstream reader.
- [x] Keep provider-specific upstream quota separate from AlphaWay client policy; the dashboard does not fabricate provider RPM/TPM values.

**3.4 — Admin API and dashboard**
- [x] Add administrator-session-protected Plan CRUD endpoints with strict input validation and bounded JSON parsing.
- [x] Extend managed API key read/update APIs for Plan assignment and nullable per-key overrides; expose only metadata/effective policy, never hashes or salts.
- [x] Add Plans management UI and Plan assignment in the managed API key table.
- [x] Replace synthetic Quota Tracker values with API-backed effective limits and persisted usage. Clearly distinguish AlphaWay policy limits from unavailable upstream-provider quotas.
- [x] Add per-key lifetime and selectable 1h/24h/7d/30d usage views, with loading, empty, and error handling.

**3.5 — Verification**
- [x] Complete unit/integration verification for policy precedence, validation, wildcard models, RPM/TPM/concurrency windows, quota reservation/settlement, token accounting, bounded limiter state, upstream retries, stream completion/error/cancellation, exactly-once usage events, and managed-key concurrency release across all three protocols.
- [x] Integration tests cover Plan CRUD/assignment/deletion constraints and policy enforcement on OpenAI Chat, Anthropic Messages, Codex Responses, and all legacy aliases.
- [x] Regression tests cover environment-managed credentials and unrestricted unassigned managed keys.
- [x] Dashboard browser tests cover Plan create/edit/delete, key assignment, inherited Plan quota display, and selectable usage windows.
- [x] CI #41602464606 passed on exact implementation code head `a6e1d2e`: Bun 1.4.4 frozen install, unit/protocol tests (including non-streaming tool-call fallback, authoritative zero-usage, and missing-usage estimator regressions), fingerprint check, dashboard E2E, UI/standalone build, and installer/embedded dashboard smoke. All four mandatory jobs succeeded; the optional live upstream drill was skipped by design. PR CodeQL #41602459053 passed both JavaScript/TypeScript and Actions analyzers on the same code head.

**Current implementation boundary (PR #6):** All Phase 3 acceptance criteria in 3.1–3.5 are implemented, verified, and merged into `main` at `145230a69c0b9295a0ac8ee3966aa669196094fa`. Post-merge CI [#41719318611](https://github.com/Yoganataa/alphaway/actions/runs/41719318611) passed all four mandatory jobs; optional live upstream drill skipped by design. Post-merge CodeQL [#41719315494](https://github.com/Yoganataa/alphaway/actions/runs/41719315494) passed JavaScript/TypeScript and Actions analyzers. RPM, prompt TPM, and in-flight concurrency state are process-local and reset on restart; lifetime token totals and completed-request usage windows are persisted in SQLite. OpenAI streaming metering counts visible text and tool/function-call names and arguments, preferring valid final provider usage where present. Non-streaming OpenAI Chat, Anthropic Messages, and Responses share a usage resolver that preserves valid provider zero values and falls back to the AlphaWay estimator across visible text, reasoning, refusal, and tool/function-call payloads; legacy translator placeholder counts are not used for quota settlement. The text estimator remains fallback only and is not a billing-grade tokenizer. Managed keys with nonzero TPM/token quota fail closed on non-text prompt parts the current estimator cannot safely measure. No USD spend budget, period rollover, provider quota probing, or queueing is implemented.

**Out of scope / deferred**
- Provider-specific quota probing unless an upstream API provides authoritative quota values.
- Period token budgets until rollover/time-zone semantics are specified.
- USD spend budgets and cost alerts until accurate, versioned model/provider pricing and request-cost attribution exist.
- Multi-tenant Plan ownership; AlphaWay remains a single-tenant local gateway.
- Plan billing, subscriptions, account provisioning, and payment integrations.
- Queueing requests behind saturated keys; Phase 3 initially rejects rather than introducing unbounded waiting.
- Windows ACL verification remains Phase 7.

**Reference:** 9router-go policy resolver, Plans CRUD, and per-key limiter are behavioral references only. Adapt all persistence and execution to AlphaWay's Bun/TypeScript/Hono/SQLite architecture.

### Phase 4 — Persona, Jailbreak Presets, SOUL, and Security Rules

**Status:** Phase 4 is **merged** via PR [#7](https://github.com/Yoganataa/alphaway/pull/7), merge commit `4494d2c3371ec723d76f8289485cdebdcb2a988d`. PR-head CI #41727468557 passed all four mandatory jobs and PR CodeQL #41727027847 passed both analyzers. Post-merge CI [#41743465576](https://github.com/Yoganataa/alphaway/actions/runs/41743465576) passed all four mandatory jobs and post-merge CodeQL [#41743465102](https://github.com/Yoganataa/alphaway/actions/runs/41743465102) passed both analyzers on the merge commit.  
**Priority:** P1 — prompt policy and data-loss prevention

**Goal:** add first-class, opt-in model-bound Persona presets and make persisted Security Rules enforceable in live gateway traffic. Preserve the existing global SOUL.md engine and adapt reference behavior from 9router-go to AlphaWay's Bun/TypeScript/Hono/SQLite architecture.

**Design boundaries**
- SQLite remains the only canonical persistence store. Migration v7 normalizes Persona presets, include/exclude keyword rules, exact model bindings, global exclusions, and Security Rules.
- Persona injection is off unless an exact binding or an include-keyword rule matches. Global excludes win over every binding; exact bindings outrank keywords and remain authoritative even when the bound prompt is empty; preset excludes then deny an otherwise matching preset.
- Keyword matching supports `word` (model-ID delimiter boundary) and `partial` (substring). Longer matching keywords win; ties resolve by preset ID for deterministic behavior. User-controlled regex is intentionally unsupported.
- Existing SOUL.md behavior remains global and unchanged. SOUL Studio becomes an inner section of the Persona view.
- Security Rule patterns are printable literal strings, case-insensitive, bounded to 100 rules and 128 characters each. `mask` replaces matching text; `block` rejects outbound prompts with HTTP 403 before upstream dispatch. Rules are rechecked after SOUL/Persona injection. Inbound provider text passes through the same custom rules plus the existing built-in sanitizer.
- Security Rule preview calls the same backend engine used by runtime requests. Security Rules remain separate from the legacy TokenSaver DLP toggles.
- Remote URL/repository imports and prompt file uploads are excluded from this phase. They need a separate SSRF-safe import and file-validation design.

**4.1 — SQLite model and migration**
- [x] Add additive migration v7 for Persona presets, preset keyword include/excludes, exact model bindings, global excludes, and normalized Security Rules.
- [x] Migrate legacy `app_settings.security_rules` records into the normalized table and delete the old setting only inside the migration. Preserve an explicitly empty legacy rule list; seed safe defaults only when no usable legacy list exists.
- [x] Keep foreign-key behavior so deleting a Persona preset removes its dependent binding and keyword rows.

**4.2 — Persona preset library and resolver**
- [x] Add administrator-session-protected preset CRUD, exact model binding CRUD, global excludes CRUD, resolver endpoint, and dry preview endpoint.
- [x] Implement exact binding, word/partial keyword include rules, per-preset excludes, global excludes, and deterministic precedence.
- [x] Inject resolved Persona prompts after model resolution for OpenAI Chat, Anthropic Messages, and Codex Responses, including legacy aliases.
- [x] Recheck final transformed prompts after SOUL/Persona injection so custom Security Rules also cover generated system instructions.
- [x] Keep the existing SOUL engine, SOUL route, and Soul Studio implementation; move its dashboard entry under Persona rather than rebuilding it.

**4.3 — Live Security Rules**
- [x] Replace legacy JSON-in-app_settings rule storage with normalized SQLite CRUD and admin-protected APIs.
- [x] Validate rule IDs, uniqueness, bounded pattern/description lengths, actions, and enabled state. Do not execute user-supplied regular expressions.
- [x] Apply mask/block rules to outbound textual content before provider dispatch; return a protocol-shaped 403 on a block and record the rejected request with zero tokens.
- [x] Re-run custom rules after TokenSaver/Persona/SOUL injection. Run built-in DLP after generated prompts are composed so secrets in SOUL/Persona prompts are also masked.
- [x] Apply custom rules to inbound provider text, tool-call arguments, and legacy function-call arguments alongside the existing built-in response sanitizer for JSON and streaming provider paths.
- [x] Add a backend inspection endpoint and connect the Security dashboard sandbox to the same runtime matcher; allow individual rules to be enabled/disabled.

**4.4 — Dashboard and regression coverage**
- [x] Add Persona navigation with preset editor, exact model bindings, global exclusions, resolver preview, and a SOUL Studio inner tab.
- [x] Add Security Rule enabled-state controls and backend-backed preview.
- [x] Add unit/API/migration/integration regressions for Persona precedence/injection, generated-prompt DLP, Security Rules validation, mask/block, Unicode text matching, legacy settings import, intentional empty legacy rules, disabled rules, nested tool-call arguments, `__proto__` JSON keys, and fail-closed inspection-depth limits.
- [x] Add request-level tests proving `block` returns 403 before upstream dispatch on OpenAI Chat, Anthropic Messages, and Codex Responses and records one zero-token usage row per blocked request.
- [x] Pass Bun 1.4.4 frozen install, unit/protocol CI, dashboard browser tests, UI/standalone build, installer smoke, and both CodeQL analyzers on exact PR head `ccd70499efd154972defa4d6918a15f6fc33604e`: CI [#41727033021](https://github.com/Yoganataa/alphaway/actions/runs/41727033021) passed all four mandatory jobs; optional live upstream drill skipped by design. CodeQL [#41727027847](https://github.com/Yoganataa/alphaway/actions/runs/41727027847) passed JavaScript/TypeScript and Actions analyzers.

**Implementation boundary and merge verification**

Phase 4 is merged into `main` at `4494d2c3371ec723d76f8289485cdebdcb2a988d`. All acceptance criteria 4.1–4.4 are implemented and verified. Post-merge CI #41743465576 passed unit/protocol tests, dashboard browser tests, UI/standalone build, and installer/embedded dashboard smoke. The optional live-upstream gate drill is skipped by design. Post-merge CodeQL #41743465102 passed JavaScript/TypeScript and Actions analyzers on the merge commit.

**Known limitations / deferred**
- No URL/repository/file import for Persona presets. Do not fetch arbitrary user-supplied URLs without an explicit SSRF-safe importer design.
- Inbound custom Security Rules are applied to text and tool-argument segments as current stream translators emit them; final aggregated non-streaming tool-call results are rechecked. A literal split across separate SSE delta boundaries is not guaranteed to match; add a buffered streaming sanitizer before claiming cross-delta coverage.
- Model IDs are entered explicitly; model catalog auto-completion and batch binding are deferred.
- Windows ACL verification remains Phase 7.

**Reference:** 9router-go Persona/Jailbreak preset resolution and UI are behavioral references only. Do not port Go types, repositories, HTTP handlers, or persistence; retain AlphaWay's native SQLite and Bun/Hono runtime.

### Phase 5 — Accurate Backend Feature Contracts

**Status:** Phase 5 is **merged** in two PRs: [#9 — Proxy Pool backend contracts](https://github.com/Yoganataa/alphaway/pull/9), merge commit `cec10d3cd0e9d9fa6b33f0755b5adb8c30d67393`; and [#10 — Health/dashboard contracts](https://github.com/Yoganataa/alphaway/pull/10), merge commit `dc1c82afbf91ec34a57809b9003318b5b35acdd6`. PR CI and CodeQL passed for both. Post-merge CI [#41766711401](https://github.com/Yoganataa/alphaway/actions/runs/41766711401) passed for PR #9 and [#41766990569](https://github.com/Yoganataa/alphaway/actions/runs/41766990569) passed all four required jobs for PR #10. Post-merge CodeQL [#41766990065](https://github.com/Yoganataa/alphaway/actions/runs/41766990065) passed both JavaScript/TypeScript and Actions analyzers on the merge commit.

**Goal:** make dashboard-visible controls and system status reflect real backend capabilities, canonical SQLite state, and actual runtime semantics. Do not invent state or actions in the UI.

**5.1 — Proxy Pool backend and dashboard contract**
- [x] Persist pool entries, strategy, cooldown configuration, and relay credentials through the existing SQLite proxy configuration. Keep credentials encrypted at rest.
- [x] Return credential-free pool metadata; never return proxy URLs containing credentials or relay tokens. Preserve encrypted configuration when updating an existing entry by ID using metadata only.
- [x] Expose pool configuration through `/api/proxy`, rejecting combined single-proxy and pool updates rather than applying partial changes.
- [x] Expose bounded per-entry probes through `POST /api/proxy/pool/test`; use the matching direct/proxy/relay transport, return measured latency/status, and do not report an empty pool as successful.
- [x] Replace seeded Proxy Pools UI state and random latency estimates with persisted API-backed entries, strategy, CRUD/toggles, import validation, and actual probe results.
- [x] Reject unsupported SOCKS5 entries instead of presenting a transport the current Bun fetch path cannot use.

**5.2 — Health response and dashboard contract**
- [x] Align `HealthResponse` TypeScript types with the actual `GET /health` response and add measured `uptimeSeconds`.
- [x] Correct Overview, Providers, Endpoint, and Tunnel views to consume the actual health fields. Do not describe provider credentials as a live upstream connection.
- [x] Remove the client-only API-key toggle that implied a local UI state change controlled backend authentication. Display server authentication policy read-only.
- [x] Distinguish public endpoint configuration from a verified active tunnel process; the current health contract does not provide daemon PID or tunnel process connectivity.
- [x] Return only safe TokenSaver status flags from public `/health`; omit custom SOUL prompt content, local SOUL path, CodeBuddy JWT subject claims, and raw upstream error text.
- [x] Preserve bounded upstream status and Cloudflare diagnostic metadata, while keeping raw failure messages private.
- [x] Align the admin TokenSaver TypeScript configuration and initial UI state with the SQLite-backed backend configuration.
- [x] Label the browser TokenSaver sandbox as a local illustration with approximate token counts, not a gateway execution or provider-tokenizer result.
- [x] Add regression tests for the health response schema, privacy redaction, provider status semantics, dynamic dashboard origin, and the proxy-pool API/transport cases above.

**Implementation boundaries and known limitations**
- The health endpoint derives public URL configuration from environment settings; it does not prove that a tunnel process is connected. No daemon PID/lifecycle telemetry is exposed by the current contract.
- The TokenSaver browser sandbox is still a local approximation and does not execute the complete runtime Security Rules pipeline or a provider tokenizer.
- Phase 5 did not port the 9router-go backend or rebuild unrelated dashboard screens. Remaining UI migration/parity belongs to Phase 6.
- Windows ACL verification remains Phase 7.

**Reference:** use 9router-go as a behavioral/UI reference only. Retain AlphaWay's Bun + TypeScript + Hono + native SQLite architecture.

### Phase 6 — 9router-go Dashboard Migration and UI/UX Parity

**Status:** In progress. Phase 6 has merged the original runtime-truthfulness, navigation, Connections/Providers audit, custom-provider probe, Command Palette/TopBar, Usage chart-window scope, Quota Tracker, TokenSaver, Security DLP, Console Log, Profile database diagnostics, Endpoint/Tunnel/Playground clipboard, Proxy Pools, Usage Request Details, and configuration-load recovery work (PRs #12–#49). Usage aggregate-load recovery merged in PR #51; mobile sidebar accessibility merged in PR #53; Proxy Pools dialogs recovered in PR #55; remaining managed API-key/Profile Settings dialogs recovered in PR #57; shared Modal keyboard focus management merged in PR #59; collapsible sidebar navigation groups merged in PR #61; duplicate Endpoint clipboard writes/pending-state handling merged in PR #63. The latest code-bearing `main` baseline is `533436145ec875201d0ed9dd481bc548a256f96f`.

- Plans recovery [PR #43](https://github.com/Yoganataa/alphaway/pull/43), merge commit `76eb23ff7b03322b852c00f85d1084bca479fd5d`; exact-head CI [#41874285414](https://github.com/Yoganataa/alphaway/actions/runs/41874285414) passed required jobs and both CodeQL analyzers.
- Security Rules recovery [PR #44](https://github.com/Yoganataa/alphaway/pull/44), merge commit `11991b080f16e87ab2348e91135df4b9f69d7e8f`; exact-head CI [#41872825379](https://github.com/Yoganataa/alphaway/actions/runs/41872825379) and both CodeQL analyzers passed.
- Providers load recovery [PR #45](https://github.com/Yoganataa/alphaway/pull/45), merge commit `58584855a177c07a76ec535a29c572063cd46017`; exact-head CI [#41874777454](https://github.com/Yoganataa/alphaway/actions/runs/41874777454) and both CodeQL analyzers passed.
- Plans E2E fixture isolation [PR #47](https://github.com/Yoganataa/alphaway/pull/47), merge commit `a22966fceb5da87bd7406b36c5ad3b9670a3afac`; exact-head CI [#41877002154](https://github.com/Yoganataa/alphaway/actions/runs/41877002154) and both CodeQL analyzers passed.
- Persona recovery [PR #48](https://github.com/Yoganataa/alphaway/pull/48), merge commit `0548801c1c63d2b2a4c3193913997ff50fbd4e54`; exact-head CI [#41965103356](https://github.com/Yoganataa/alphaway/actions/runs/41965103356), CodeQL, and both analyzers passed. The three inline review threads were resolved.
- SOUL Studio recovery [PR #49](https://github.com/Yoganataa/alphaway/pull/49), merge commit and current code-bearing `main` baseline `4fd4a72df5d3a20a16e46d352ae7b5dd8f9fe69b`; exact-head CI [#41965630855](https://github.com/Yoganataa/alphaway/actions/runs/41965630855) passed all four required jobs, including 29 browser E2E tests with zero failures, and CodeQL plus both analyzers passed. Post-merge `main` CI [#41965783606](https://github.com/Yoganataa/alphaway/actions/runs/41965783606) passed all four required jobs.

- Usage aggregate-load recovery [PR #51](https://github.com/Yoganataa/alphaway/pull/51), merged at current code-bearing `main` `9508c09c574d638fbedaf0615f786404e880d7d5`. The client validates the `/api/usage` aggregate DTO; `UsageView` uses single-flight 4-second polling, explicit initial-unavailable/retry state, timestamped stale snapshots, and gates Reset/Clear until fresh data is loaded. Valid zero-request summaries show an em dash for success rate. No route, SQLite schema, accounting, or chart-period semantics changed. Exact-head CI [#41967369575](https://github.com/Yoganataa/alphaway/actions/runs/41967369575) passed all four required jobs; browser E2E reported **31 pass, 0 fail**; CodeQL and both analyzers passed.
- Post-merge CI [#41967533474](https://github.com/Yoganataa/alphaway/actions/runs/41967533474) passed all four required jobs; Push on main [#41967532815](https://github.com/Yoganataa/alphaway/actions/runs/41967532815) also passed.
- Mobile sidebar keyboard accessibility [PR #53](https://github.com/Yoganataa/alphaway/pull/53), merged at `029863dae24cbe9f7b5579aa73b7071fda99d6e7`. Closed mobile navigation is inert and hidden from assistive technology; opening moves focus to the close control; Escape/navigation/backdrop dismissal restores focus to the trigger. Exact-head CI [#41976922346](https://github.com/Yoganataa/alphaway/actions/runs/41976922346) passed all four required jobs (31 E2E pass, 0 fail, 375 assertions); CodeQL [#41976919320](https://github.com/Yoganataa/alphaway/actions/runs/41976919320) and post-merge checks [#41977126019](https://github.com/Yoganataa/alphaway/actions/runs/41977126019), [#41977125796](https://github.com/Yoganataa/alphaway/actions/runs/41977125796) passed.
- Proxy Pools dialog prop-contract recovery [PR #55](https://github.com/Yoganataa/alphaway/pull/55), merged at `eede5fb8f49bb23fb7d31f3cef464781156a896c`. The Add Proxy Egress Node and Bulk Import Proxies call sites now use Modal's declared `isOpen`/`onClose` props. E2E opens both dialogs, verifies the expected fields, and cancels without saving. Exact-head CI [#42009520574](https://github.com/Yoganataa/alphaway/actions/runs/42009520574) passed all four required jobs (31 E2E pass, 0 fail, 378 assertions); CodeQL [#42009517536](https://github.com/Yoganataa/alphaway/actions/runs/42009517536) passed both analyzers. Post-merge checks [#42009751472](https://github.com/Yoganataa/alphaway/actions/runs/42009751472) and [#42009745546](https://github.com/Yoganataa/alphaway/actions/runs/42009745546) passed.
- Remaining dashboard dialog prop-contract recovery [PR #57](https://github.com/Yoganataa/alphaway/pull/57), merged at `ff4cc9be0738bdbd082f8226fa2df28da997655e`. The managed API-key creation Modal now uses `isOpen`/`onClose`; Profile Settings Clear Logs and Reset Usage ConfirmModal instances use `isOpen`, `onClose`, `onConfirm`, and `danger`. E2E opens and cancels all three dialogs without creating a key or invoking destructive actions. Exact-head CI [#42011173658](https://github.com/Yoganataa/alphaway/actions/runs/42011173658) passed all four required jobs (33 E2E pass, 0 fail, 381 assertions); CodeQL [#42011165178](https://github.com/Yoganataa/alphaway/actions/runs/42011165178) passed both analyzers. Post-merge checks [#42011509191](https://github.com/Yoganataa/alphaway/actions/runs/42011509191) and [#42011508009](https://github.com/Yoganataa/alphaway/actions/runs/42011508009) passed.
- Shared Modal keyboard focus management [PR #59](https://github.com/Yoganataa/alphaway/pull/59), merged at `c6454a2b99e25c9094f29549e989756f68ee6830`. Titled dialogs receive an accessible name; opening moves focus into the dialog; Tab/Shift+Tab remain within enabled, visible controls; closing restores focus to the invoker. Command Palette search keeps its child-owned autofocus. Exact-head CI [#42014134380](https://github.com/Yoganataa/alphaway/actions/runs/42014134380) passed all four required jobs (33 E2E pass, 0 fail, 385 assertions); CodeQL [#42014128843](https://github.com/Yoganataa/alphaway/actions/runs/42014128843) passed both analyzers. Post-merge CI [#42014439049](https://github.com/Yoganataa/alphaway/actions/runs/42014439049) and Push on main CodeQL [#42014438813](https://github.com/Yoganataa/alphaway/actions/runs/42014438813) passed all four required CI jobs and both analyzers, respectively.

These recovery slices validate client DTOs, distinguish unavailable data from valid empty state, retain stale snapshots, and block destructive/full-replacement writes until a complete fresh state is available. They do not add backend routes, change SQLite schema, or introduce the 9router-go provider-node/connection domain.

**Goal:** migrate the remaining 9router-go-inspired dashboard screens and interaction patterns to AlphaWay while mapping every visible control to an existing, verified AlphaWay backend contract. Preserve AlphaWay runtime behavior and persistence.

**Reference pin:** `luqman-v1/9router-go@e328decc174015514f49c7046d4bde57690bedc9`. Treat this commit as the initial design baseline; re-pin deliberately if the reference moves.

**Initial capability matrix (AlphaWay `main` at `75dc66f`)**

| 9router-go screen / capability | AlphaWay implementation / API | Canonical state | Runtime meaning / gap |
|---|---|---|---|
| Endpoint & Key | `EndpointView`; `/health`, `/v1/models`, `/api/keys`, `/api/keys/:id`, rotate/policy endpoints | Managed keys and gateway configuration in SQLite; browser client key is session-scoped | Existing. Endpoint view is the active default dashboard; do not wire only the unused `OverviewView`. PR #32 makes TopBar Base URL and Endpoint local/snippet clipboard feedback truthful on rejected and successful Clipboard API writes; no backend change. |
| Playground / Chat Completion | `PlaygroundView`; `/v1/models`, `POST /v1/chat/completions` (SSE) | Gateway chat request/response stream; no persisted Playground session state | Existing API. The Playground sends a live streaming completion and displays response/reasoning metrics; it is not a provider sandbox or saved conversation store. PR #36 makes response copy report clipboard rejection, show a pending state, and confirm success only after Clipboard API resolution. |
| Tunnel & Daemon | `TunnelView`; `/health` endpoint metadata and CLI lifecycle guidance | Public endpoint URL from health/configuration; actual process supervision remains with CLI/system service | Existing read-only guidance. Health reports whether the public URL is configured, not whether a tunnel is connected; dashboard does not report daemon PID/lifecycle. PR #34 makes public endpoint clipboard failure visible and only confirms copy after Clipboard API success; no tunnel runtime/API behavior changed. |
| Connections / Providers | `ProvidersView`; `/api/custom-providers` GET/POST/DELETE, `/api/custom-providers/test` POST, `/api/codebuddy/oauth/start`, `/api/codebuddy/oauth/poll`, global `/v1/models` | SQLite `custom_providers` plus encrypted CodeBuddy credential | Partial equivalent only. One custom-provider record represents one URL/credential/protocol/model list; it is not a provider node with multiple credential connections. No generic provider-node/connection CRUD, per-connection priority/proxy binding/usage, node limits, per-connection model catalog, capability registry, or model batch-management API. Full operation-by-operation mapping: [PHASE6_CONNECTIONS_PROVIDERS_AUDIT.md](PHASE6_CONNECTIONS_PROVIDERS_AUDIT.md). PR #18 corrected the existing probe feedback: it reports the upstream HTTP status (or AlphaWay request status), sends one configured/default probe model, and explicitly does not claim that the configured model list was validated. No latency or model-count metrics are fabricated. |
| Combos & Vision Adapter | No `/api/combos` route or combo execution service in AlphaWay | No combo definition/state model identified | **Backend gap.** Requires combo schema, adapter selection semantics, validation, execution/routing and usage attribution before UI. |
| Analytics / Usage | `UsageView`; `/api/usage`, `/api/usage/chart`, `/api/usage/heatmap`, `/api/usage/details/:id` | SQLite request/usage logs | Existing. `/api/usage` summaries are totals since the last reset; the selected range filters only `/api/usage/chart`. Values are AlphaWay-recorded traffic and estimates where documented, not provider billing truth. PR #51 makes aggregate loading validated/recoverable, prevents overlapping polling, labels stale snapshots, and gates destructive actions until refresh recovery. |
| Quota Tracker | `QuotaTrackerView`; `/api/keys`, `/api/keys/usage`, `/api/plans` | SQLite managed-key counters, Plan policies and request records | Existing partial equivalent. AlphaWay-enforced per-key limits are not upstream provider quota probes. Failed loads are distinct from empty results; stale rows retain the last successful window label and can be retried. |
| Token Saver | `TokenSaverView`; `GET/POST /api/tokensaver` | SQLite `tokensaver_config` | Existing. POST response is unwrapped/validated; load and save errors are recoverable. Persisted image/command guardrail flags drive inbound sanitization. Local sandbox remains an approximation and gates outbound secret/path masking on the DLP master flag; it is not full gateway execution or provider tokenization. |
| CLI Tools | No browser-facing CLI tool registry/API in AlphaWay; `src/cli` contains local maintenance/operation commands | No dashboard-managed CLI tool state | **Backend gap.** Do not expose install/run/permission controls until a bounded, authenticated command catalog and execution policy exist. |
| Security | `SecurityView`; `/api/security/rules`, `/api/security/inspect`, `GET/POST /api/tokensaver` | Normalized SQLite Security Rules and `tokensaver_config` | Existing. Runtime enforcement is part of gateway request/response processing. Security exposes persisted outbound `dlpEnabled` separately from inbound image/command guardrails; configuration must load before controls become editable. |
| Persona / Jailbreak | `PersonaView`; `/api/persona` presets/models/excludes/resolve/preview; legacy `/api/jailbreak` alias | Normalized SQLite Persona presets, bindings and keyword rules; SOUL remains separate | Existing. Persona is model-bound; do not reintroduce an unscoped global jailbreak switch. |
| Plans & managed keys | `PlansView`, key views; `/api/plans`, `/api/keys` and policy endpoints | SQLite Plan and managed-key tables | Existing. Single-tenant local policy, not billing/subscription management. |
| Media Providers (Embedding, Image, TTS, STT, Video, Web Fetch) | No matching media-provider routes, typed provider adapters or model execution endpoints | No media-provider state model identified | **Backend gap.** Each media modality needs protocol, adapter, credential, model catalog, timeout/streaming and quota semantics. |
| Proxy Pools | `ProxyPoolsView`; `/api/proxy`, `POST /api/proxy/pool/test` | SQLite proxy/pool config; credentials encrypted at rest | Existing (Phase 5). Status metadata is credential-free; probes use real bounded transport checks. PR #55 fixes Add Node/Bulk Import dialog wiring to shared Modal's `isOpen`/`onClose` contract and E2E covers open/field/cancel. |
| Skills | No Skills registry, API or invocation runtime in AlphaWay | No skill package/permission/persistence model identified | **Backend gap.** Needs packaging, trust/signature, grants, execution isolation and audit design. |
| Console Log | `ConsoleLogStream`; `/api/console-logs`, `/api/console-logs/clear` | Bounded in-process console buffer | Existing, process-local (not durable history). PR #28 makes polling health truthful, exposes API errors and retry, retains the last successful snapshot on transient failures, and distinguishes an empty server buffer from filtered-empty results. No backend route or buffer semantics changed. |
| Terminal | No browser terminal/shell execution API in AlphaWay | No terminal session/process model | **Backend gap.** Requires explicit command allowlisting, process lifecycle, isolation, output limits, cancellation and audit policy; do not add a generic shell endpoint as a UI shortcut. |
| Settings / Storage | `ProfileSettingsView`, `SettingsView`; `/api/settings/database`, `/api/settings/database/stats`, backup and vacuum endpoints; admin auth/session routes | SQLite database and server configuration; dashboard client API key in browser session storage | Existing partial equivalent. Browser key is not the server environment key or a managed API key. PR #30 preserves the last successful database stats snapshot after failed refreshes, labels it stale, surfaces the endpoint error/retry action, and validates the response. Backend route and database behavior are unchanged. |
| Navigation visibility/order presets | Current static AlphaWay `Sidebar` navigation; no dedicated saved nav-preference API found | No persisted per-user/nav preference contract identified | Persistent visibility/order presets still require an explicit settings schema and authorized API. Separately, PR #53 adds a keyboard-accessible ephemeral mobile drawer (accurate expanded state, inert closed state, Escape dismissal, and focus restoration); no preference persistence was added. |

**Initial classification**
- Existing API wiring / semantic correction: Endpoint, Providers, Usage, Quota Tracker, Token Saver, Security, Persona, Plans, Proxy Pools, Console Log, Settings.
- Genuine backend gaps: Combos, Media Providers, Skills, Terminal, and browser-managed CLI Tools.
- UI-only parity candidates: responsive navigation, command palette affordances, grouping/spacing, and view layout where no persistence or backend action is implied.
- Do not add navigation entries for backend-gap screens as if they were operational. Any future design-only preview must be visibly marked as unavailable and must not accept fake configuration.



**Design boundaries**
- Do not port Go repositories, HTTP handlers, data models, or persistence. Reuse existing Bun/Hono routes and native SQLite services.
- Treat the existing AlphaWay backend as the source of truth. If a target control has no supported endpoint or persisted state, record it as a backend gap instead of implementing a fake frontend toggle.
- Keep status wording precise: configured, registered, authenticated, probed, and connected are distinct states.
- Keep provider quota, usage, and health values authoritative only where the backend can support them. Do not infer upstream quota or connectivity from static constants.
- Preserve admin session protections, gateway API-key scopes, secret redaction, and server-side validation for every new control.
- For each screen, document endpoint, request/response schema, persistence owner, error/loading/empty states, and regression coverage before implementation.

**Suggested work sequence**
- [x] Pin the reference frontend at `luqman-v1/9router-go@e328decc174015514f49c7046d4bde57690bedc9` and create the initial screen/control capability matrix above. Remaining component-by-component interaction audit continues below.
- [x] Classify initial screen gaps as UI-only parity, existing API wiring, or genuine backend capability gaps.
- [x] Complete the detailed Connections/Providers interaction audit and record the route, DTO, persistence, runtime-semantic, and backend-gap mapping in [PHASE6_CONNECTIONS_PROVIDERS_AUDIT.md](PHASE6_CONNECTIONS_PROVIDERS_AUDIT.md).
- [x] Correct the existing custom-provider probe feedback so it reports only backend-returned HTTP status/result; do not display fabricated latency or model-validation counts (PR #18 merged; route and browser regressions, four required CI jobs, and both CodeQL analyzers passed).
- [x] Align the Command Palette with implemented navigation/actions, truthful labels, keyboard behavior, and mobile navigation coverage (PR #15 merged; exact-head required CI and both CodeQL analyzers passed).
- [x] Make Usage range controls truthful: the selected range applies only to the chart; KPI/breakdown totals remain since-reset aggregates, and the duplicate 60D/All option is removed (PR #20 merged; browser regression, four required CI jobs, and both CodeQL analyzers passed).
- [x] Make Quota Tracker load errors recoverable and distinguish stale usage-window data from the selected window (PR #22 merged; browser regression, four required CI jobs, and both CodeQL analyzers passed).
- [x] Make TokenSaver config loading/saving truthful and recoverable; wire persisted inbound image/command guardrail flags to runtime and keep the local outbound preview consistent with the DLP master flag (PR #24 merged; unit and browser regressions, four required CI jobs, and both CodeQL analyzers passed).
- [x] Expose the existing outbound DLP master setting in Security with persisted-state status, safe config loading, retryable errors, and browser coverage for load failure and saved state (PR #26 merged; all four required CI jobs and both CodeQL analyzers passed).
- [x] Make Console Log polling failure states explicit, retain the last successful buffer, distinguish initial/empty/filter states, and prevent overlapping requests (PR #28 merged; E2E recovery regression, four required CI jobs, and both CodeQL analyzers passed).
- [x] Make Profile Settings SQLite diagnostics recoverable: preserve the last successful stats snapshot, show stale/error/retry state, validate the stats response, and cover initial failure plus failed post-VACUUM refresh in E2E (PR #30 merged; four required CI jobs and both CodeQL analyzers passed).
- [x] Make Endpoint & Key and TopBar copy actions wait for clipboard completion, surface write failures, and avoid false copied indicators or unhandled rejections (PR #32 merged; E2E covers rejected and successful writes; all four required CI jobs and both CodeQL analyzers passed).
- [x] Make Tunnel & Daemon public-endpoint copy report missing/rejected clipboard access and only show copied state after a successful write (PR #34 merged; E2E covers failure and recovery; all four required CI jobs and both CodeQL analyzers passed; no daemon/tunnel state claims added).
- [x] Make Playground response copy await Clipboard API completion, expose errors, prevent duplicate pending writes, and show success only after resolution (PR #36 merged; E2E covers denied writes and delayed successful completion; all four required CI jobs and both CodeQL analyzers passed).
- [x] Make Proxy Pools configuration loading fail closed: distinguish unavailable state from an empty pool, retain the last good snapshot on refresh errors, validate API response DTOs, and block writes while loading or stale (PR #39 merged; browser regressions, all four required CI jobs, and both CodeQL analyzers passed).
- [x] Restore Request ID copying in the Usage Request Details drawer; make ID/JSON operations report pending, success, and failure truthfully, with E2E coverage for rejected writes, pending completion, expected payloads, and success (PR #41 merged; 25 E2E tests, all four required CI jobs, and both CodeQL analyzers passed).
- [x] Make Plans loading recoverable and fail closed on malformed responses; retain stale snapshots, retry, and block mutations while unavailable or stale (PR #43; follow-up PR #47 isolates the E2E fixture from dashboard bootstrap; exact-head CI and CodeQL passed).
- [x] Protect Security Rules full-list replacement from unavailable/malformed reads; block Add/Toggle/Delete during stale or in-flight refresh and re-read canonical state after uncertain writes (PR #44; exact-head CI and CodeQL passed).
- [x] Replace silent Providers model/custom-provider fetch failures with explicit load/retry states instead of presenting failed reads as empty catalogs (PR #45; exact-head CI and CodeQL passed).
- [x] Make Persona state and nested exclusions fail closed; refresh the selected preset draft from canonical state and preserve the user's draft after definitive 4xx validation rejection (PR #48; browser E2E, CI, CodeQL, and review-thread resolution passed).
- [x] Make SOUL Studio config and preset-catalog loading validated/recoverable; retain the last valid snapshot and block live/disk writes while unavailable or stale (PR #49; 29 browser E2E tests, all required CI jobs, and CodeQL passed).
- [x] Make UsageView aggregate loading single-flight and recoverable; distinguish unavailable data from real zero usage, preserve a timestamped stale snapshot, and gate reset/clear actions until canonical data is loaded. Keep the chart-period contract unchanged (PR #51 merged; exact-head CI, 31 browser E2E tests, and both CodeQL analyzers passed).
- [x] Make the mobile sidebar keyboard-accessible and dismissible: accurate `aria-expanded`/`aria-controls`, inert hidden drawer, focus-on-open, shared Escape-stack dismissal, focus restoration, and desktop-breakpoint recovery (PR #53 merged; exact-head CI, 31 E2E pass/0 fail, and both CodeQL analyzers passed; post-merge CI/CodeQL passed).
- [x] Fix Proxy Pools Add Node and Bulk Import dialog bindings to the shared Modal API; add E2E coverage that opens both dialogs, verifies their form controls, and cancels without persisting changes (PR #55 merged; exact-head CI, 31 E2E pass/0 fail, 378 assertions, and both CodeQL analyzers passed).
- [x] Align the managed API-key creation Modal and Profile Settings Clear Logs/Reset Usage ConfirmModal call sites with their declared shared-component APIs; add E2E that opens and cancels all three dialogs without generating a key or invoking destructive actions (PR #57 merged; exact-head CI, 33 E2E pass/0 fail, 381 assertions, and both CodeQL analyzers passed).
- [x] Add keyboard focus management to the shared Modal: accessible name, initial focus, Tab/Shift+Tab containment among enabled/visible controls, focus restoration to the invoker, and preservation of Command Palette search autofocus (PR #59 merged; exact-head CI, 33 E2E pass/0 fail, 385 assertions, both CodeQL analyzers, and post-merge CI/CodeQL passed).
- [x] Add collapsible Main, Advanced Features, and System sidebar groups with browser-local persistence, accessible expanded/collapsed state, and active-section visibility (PR #61 merged at `927ced3f95433023036b267059153906a02b74af`).
- [x] Prevent overlapping Endpoint clipboard writes and expose pending state through disabled controls, `aria-busy`, and `Copying...` feedback (PR #63 merged at `533436145ec875201d0ed9dd481bc548a256f96f`; required CI and both CodeQL analyzers passed).
- [x] Replace managed API-key rename/revoke native `prompt()`/`confirm()` flows with the shared Modal/ConfirmModal dialogs; preserve existing API contracts and mutation semantics, forward accessible action labels through the shared Button contract, and add isolated E2E coverage for opening/cancelling both dialogs without mutation (PR #65 merged at `db0379529c7fca9bda987374229ac69dffbbcd83`; exact-head CI passed all four required jobs and both CodeQL analyzers).
- [x] Replace Usage Reset Stats and Clear Logs native confirmations with shared ConfirmModal dialogs; preserve existing recovery/mutation semantics, guard dismissal during mutation, and add E2E coverage for opening/cancelling the reset confirmation (PR #67 merged at `6a53e239585216137f816653725f7e70e7b0c7cf`; exact-head CI passed all four required jobs and both CodeQL analyzers).
- [x] Replace the Plans delete native confirmation with shared ConfirmModal; preserve existing delete/refresh/recovery behavior and update the Plan CRUD browser regression to cancel the confirmation before reopening and confirming the existing mutation (PR #69 merged at `30d7c6c082b6a4e35d9f4469fb73c9579229708c`; exact-head CI passed all four required jobs and both CodeQL analyzers).
- [x] Replace the Console Log clear native confirmation with shared ConfirmModal; preserve the existing clear API and notification behavior, and prevent dismissal while the clear mutation is in flight (PR #71 merged at `4d813d4e5638e2d3139e564086460039864e5d37`; exact-head CI passed all four required jobs).
- [x] Replace the Persona preset delete native confirmation with shared ConfirmModal; preserve the existing delete/refresh/recovery behavior, prevent dismissal while the delete mutation is in flight, and add isolated E2E coverage for cancellation, focus restoration, and persistence (PR #73 merged at `b11334cbbf1ea4c419c6ac6efa979bf9b3a44da6`; exact-head CI passed all four required jobs).
- [x] Replace the managed API-key rotation native confirmation with shared ConfirmModal; preserve the existing rotation and one-time secret display behavior, prevent dismissal while the rotation mutation is in flight, expose an accessible rotate action label, and add isolated E2E coverage for cancellation and persistence (PR #75 merged at `f33bdf96e025c42ae253370e4f48aade957a3632`; exact-head CI passed all four required jobs).
- [x] Replace the custom-provider delete native confirmation with shared ConfirmModal; preserve deletion/refresh/error-recovery semantics, prevent dismissal while deletion is in flight, expose an accessible delete action label, and add isolated E2E coverage for cancellation, focus restoration, and persistence (PR #77 merged at `23d941b1245f844b479c70f5a0505cb69596135c`; exact-head CI passed all four required jobs).
- [x] Expose the existing Usage chart Tokens / Est. Value mode through accessible `aria-pressed` state and add E2E coverage for the mode transition (PR #79 merged at `fbb8b6ed58ffcd3113eff65bdda48da8c31212ad`; exact-head CI passed all four required jobs).
- [ ] Decide whether AlphaWay requires the full provider-node + multi-connection domain or a lighter custom-provider registry. Clarify operational requirements for multiple accounts, auth modes, priority/rotation, proxy binding, and per-connection usage; do not design schema or connection routing until this product boundary is explicit.
- [ ] After the decision, design any required SQLite entities and secured API contracts before adding corresponding provider/model controls.
- [ ] Implement remaining UI-only parity against existing endpoints in independently reviewable slices with regression coverage.
- [ ] Add backend work only when the desired behavior is specified, persistable, secured, and covered by protocol/API tests.
- [ ] Verify responsive behavior, loading/empty/error states, keyboard interaction, and dashboard browser tests.

**Exit criteria:** every displayed control has a working and authorized action or is explicitly read-only; no mock metrics/status are presented as runtime facts; API and persistence semantics remain documented; all CI and CodeQL checks pass on the exact merge head.

