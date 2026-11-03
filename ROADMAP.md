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

**Status:** Phase 3 implementation and acceptance tests are complete on [PR #6 — Plans, limits, and request enforcement](https://github.com/Yoganataa/alphaway/pull/6); PR is **Ready for review** and has not been merged. Latest verified implementation source head: `9996474261aeb8b4154846a27ce5427cc1bcf46b`; Phase 3 base `main`: `a28ed9baef0c698ec879d649a24726706d1eee3d`. CI #461 and PR CodeQL #246 passed on that exact implementation head. The checkpoint/roadmap metadata update is a later documentation-only commit; inspect its live Actions results before further changes. The owner-supplied GitHub Security screenshot (2026-11-02), filter `is:open branch:main`, confirms **0 Open / 14 Closed** alerts on `main`.

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
- [x] Replace fixed streaming completion counts with text-based streaming estimation; prefer provider-reported usage for non-streaming and fall back to the existing estimator where needed.
- [x] Verify exactly-once accounting across upstream 5xx retry, stream completion, stream cancellation, and protocol translation. `test/server.test.ts`, `test/streaming-usage.test.ts`, and `test/managed-key-stream-concurrency.test.ts` assert one usage event per client request. HTTP upstream responses retain the prompt charge; thrown dispatch/transport errors are recorded as zero-token failures.
- [x] Add indexed per-key usage queries for 1h/24h/7d/30d windows plus persisted lifetime totals, with canonical UTC boundaries and bounded range validation.

**3.3 — Enforcement**
- [x] Implement bounded per-key RPM, prompt TPM, and concurrency gates with consistent 429/Retry-After behavior and fail-closed limiter capacity. No unbounded request queue is created.
- [x] Enforce normalized model allowlists before dispatch across OpenAI, Anthropic, and Codex paths. Integration tests cover canonical endpoints and every legacy route alias.
- [x] Enforce lifetime token quotas with concurrent reservations, bounded output tokens, and quota settlement. Period budgets remain deferred until rollover/time-zone semantics are designed.
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
- [x] CI #461 passed on PR #6 source head `9996474`: Bun 1.4.4 frozen install, unit/protocol tests, fingerprint check, dashboard E2E, UI/standalone build, and installer smoke. The optional live upstream drill was skipped by design. PR CodeQL #246 passed both JavaScript/TypeScript and Actions analyzers.

**Current implementation boundary (PR #6):** All Phase 3 acceptance criteria in 3.1–3.5 are implemented and verified. PR #6 is Ready for review; merge remains a separate maintainer decision. RPM, prompt TPM, and in-flight concurrency state are process-local and reset on restart; lifetime token totals and completed-request usage windows are persisted in SQLite. Token metering uses provider-reported totals when available and an AlphaWay text estimator fallback, not a billing-grade tokenizer. No USD spend budget, period rollover, provider quota probing, or queueing is implemented.

**Out of scope / deferred**
- Provider-specific quota probing unless an upstream API provides authoritative quota values.
- Period token budgets until rollover/time-zone semantics are specified.
- USD spend budgets and cost alerts until accurate, versioned model/provider pricing and request-cost attribution exist.
- Multi-tenant Plan ownership; AlphaWay remains a single-tenant local gateway.
- Plan billing, subscriptions, account provisioning, and payment integrations.
- Queueing requests behind saturated keys; Phase 3 initially rejects rather than introducing unbounded waiting.
- Windows ACL verification remains Phase 7.

**Reference:** 9router-go policy resolver, Plans CRUD, and per-key limiter are behavioral references only. Adapt all persistence and execution to AlphaWay's Bun/TypeScript/Hono/SQLite architecture.

