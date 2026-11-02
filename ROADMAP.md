### Phase 2 — Authentication, API Keys, and Administrative Access

**Status:** Phase 2 implementation and hardening are substantially complete on `feat/phase-2-auth-admin-security`; draft PR #4 remains open. Code head `18a885604dc329e9ca4dc28997cb20da8863fefe` passed CI #404 (`41413386088`): 357 unit/protocol tests across 33 files (4,970 assertions), 8 dashboard E2E (52 assertions), UI/standalone build, installer/embedded-dashboard smoke, and Bun 1.4.4 TLS fingerprint. CodeQL analysis run `41413382680` completed both JavaScript/TypeScript and Actions analysis jobs, but CodeQL results check `125171574815` still fails with one high-severity alert on this exact PR head; its annotation's rule/path/line/dataflow remain inaccessible through the current GitHub integration. The branch removes CLI OAuth subprocess execution, locks both data-directory and canonical SQLite paths (including restore destinations), and checks a live daemon PID before generic lock conflicts. All four Codex review threads on the previous reviewed head were replied to and resolved after CI #404. A new automated Codex re-review was requested on this current head; independent human security review remains outstanding. SQLite is the only persistent application-state backend.
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
- [ ] Resolve the remaining high-severity CodeQL alert on PR #4; inspect the annotation for its rule, file, line, and source/sink path, then fix or document a justified false positive.
- [ ] Complete independent human security review of PR #4 and resolve any findings before merge.
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

- Draft PR #4: [Phase 2 — Authentication, API keys, and administrative access](https://github.com/Yoganataa/alphaway/pull/4).
- Verified implementation head [`18a885604dc329e9ca4dc28997cb20da8863fefe`](https://github.com/Yoganataa/alphaway/commit/18a885604dc329e9ca4dc28997cb20da8863fefe), CI run [`41413386088`](https://github.com/Yoganataa/alphaway/actions/runs/41413386088) (#404): **357 unit/protocol tests passed, 0 failed** across 33 files (4,970 assertions); **8 dashboard E2E passed, 0 failed** (52 assertions); UI/standalone build, installer/embedded-dashboard smoke, and Bun 1.4.4 TLS fingerprint (17 ciphers/12 extensions) passed. The optional live upstream gate drill was skipped by design.
- CodeQL analysis run [`41413382680`](https://github.com/Yoganataa/alphaway/actions/runs/41413382680) (#189) completed both JavaScript/TypeScript and Actions analysis jobs successfully. The separate CodeQL result check [`125171574815`](https://github.com/Yoganataa/alphaway/runs/125171574815) still reports **1 high-severity alert** on the exact PR head `18a885604dc329e9ca4dc28997cb20da8863fefe` (one annotation). Its annotation endpoint is not accessible through the current GitHub integration, so the finding's rule, file, line, and source/sink flow remain unverified. The OAuth subprocess, database lock, stale-lock test, and daemon ordering issues from Codex review have been addressed; do not assume the remaining CodeQL alert corresponds to any of those findings.
- Source-review findings fixed on the active branch: restore-vs-live-service race, username-spraying lockout eviction, missing encrypted pre-migration backups for credential-transform migrations, relative/quoted installer `DATA_DIR` inconsistency, unsafe CodeBuddy OAuth browser command interpolation, and restore locks that did not follow canonical `DB_PATH` destinations across different `DATA_DIR` roots. The last lock change is covered by cross-root/explicit-destination regression tests in CI #400.
- Automated Codex review on commit `5a75bac5f31c90682ba917720b3031adb7934a25` found P1 OAuth subprocess execution, P2 restore locking by destination, a stale-lock error/test mismatch, and daemon PID/lock ordering. All four findings were fixed, regression-tested, replied to, and their review threads resolved after CI #404 passed. A fresh Codex re-review was requested on `18a885604dc329e9ca4dc28997cb20da8863fefe`; it was pending at the last check.
- No independent human security review has been submitted. Codex and CodeQL are automated tools and do not satisfy the independent human review requirement. The remaining CodeQL high-severity alert must be inspected and fixed or explicitly justified before merge.
- Repository Ruleset `Protect main` is active and enforces the four required jobs with strict up-to-date checks. Its required approval count is 0 for the solo developer; no bypass actors are configured.
- Do not merge PR #4 or begin Phase 3 until the high-severity CodeQL alert is resolved, an independent human review is completed, all review findings are resolved, and CI is green on the final PR head.

**Acceptance criteria**

- Newly issued keys authenticate gateway requests; revoked keys stop working immediately (covered by committed tests).
- Administrative operations require an authenticated administrator session; same-host cross-port Origin requests are rejected.
- Existing OpenAI, Anthropic, and Codex gateway protocols retain documented authorization-header compatibility.
- Managed caller keys and persisted upstream credentials are not stored as plaintext in their canonical database representations.
- SQLite is the only persistent application-state backend. Standalone JSON files are neither imported nor modified. Encrypted SQLite migration snapshots retain v1/v2 restore compatibility; POSIX permissions are restricted and Windows ACLs remain Phase 7.