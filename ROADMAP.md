### Phase 2 — Authentication, API Keys, and Administrative Access

**Status:** Phase 2 implementation and CodeQL remediation are complete on code head `ee317f3ea051e1754d3070c09e9704a7375fe464` in draft PR #4. CI #419 (`41425478647`) passed on Bun 1.4.4. PR CodeQL #207 (`41425470119`) and result check `125211158149` passed; a direct full SARIF scan at [`41426255599`](https://github.com/Yoganataa/alphaway/actions/runs/41426255599) on the same source head produced **0 JavaScript/TypeScript results and 0 GitHub Actions results**. A default-branch alert inventory at `main` HEAD `e2492fb3a995677d24f3078b7925a2c48c877ca7` found 14 open CodeQL alerts. All 14 are addressed in the PR branch; they remain open on `main` until PR #4 is merged and CodeQL re-analyzes the default branch. Temporary diagnostic workflow removed; its audit branch remains. Independent human security review is still outstanding; automated CodeQL/Codex review does not substitute for that gate.
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
- Latest verified PR code head [`ee317f3ea051e1754d3070c09e9704a7375fe464`](https://github.com/Yoganataa/alphaway/commit/ee317f3ea051e1754d3070c09e9704a7375fe464); `main` HEAD remains `e2492fb3a995677d24f3078b7925a2c48c877ca7`.
- Latest required CI run [`41425478647`](https://github.com/Yoganataa/alphaway/actions/runs/41425478647) (#419) passed on Bun 1.4.4: unit/protocol tests, dashboard E2E, UI/standalone build, installer/embedded-dashboard smoke, and TLS fingerprint passed. Optional live upstream drill was skipped by design.
- Latest PR CodeQL run [`41425470119`](https://github.com/Yoganataa/alphaway/actions/runs/41425470119) (#207) and result check [`125211158149`](https://github.com/Yoganataa/alphaway/runs/125211158149) succeeded. Direct full SARIF scan [`41426255599`](https://github.com/Yoganataa/alphaway/actions/runs/41426255599) against `ee317f3` returned **0 JavaScript/TypeScript results and 0 Actions results**.
- Default-branch CodeQL inventory at `main` HEAD `e2492fb3a995677d24f3078b7925a2c48c877ca7` identified 14 open alerts, including three critical shell command-injection findings, clear-text logging, weak password hashing of proxy credentials, SHA-1 UUID derivation, insecure randomness, and seven URL substring findings. The PR branch now contains corresponding code/test remediations; these alerts remain open on `main` until PR #4 merges and default-branch CodeQL reruns.
- Additional fixes replace the credential-bearing proxy URL's unkeyed SHA-256 health ID with a purpose-separated HMAC-SHA-256 derived from the local master key (and bump cache version to v2), replace SHA-1 deterministic conversation UUIDs with SHA-256-based UUIDv8, and replace six `raw.githubusercontent.com` substring checks in URL mocks with parsed URL hostname validation. Direct SARIF on the final code head found no remaining findings in either CodeQL language.
- Source-review findings previously raised on OAuth subprocess execution, restore locking by destination, stale-lock assertion text, and daemon PID ordering were fixed and their four Codex review threads resolved. Codex re-review of code head `18a885604dc329e9ca4dc28997cb20da8863fefe` completed with no new findings; that review predates the latest CodeQL-specific edits.
- Independent human security review has not been submitted. CodeQL and Codex are automated; they do not satisfy the independent review requirement. Keep PR #4 draft until an independent review is completed and any findings are resolved.
- Repository Ruleset `Protect main` is active and targets `refs/heads/main`; it requires the four CI jobs with strict up-to-date checks, conversation resolution, and a PR, blocks deletion and force pushes, and requires zero approvals for the solo-developer workflow. No bypass actors are configured.
- Windows ACL behavior for bootstrap/encryption-key files and SQLite migration backups remains unverified and is deferred to Phase 7. POSIX `0600`/`0700` behavior is covered.
- Do not merge PR #4 or start Phase 3 until the independent human review, Phase 2 acceptance criteria, and final CI/CodeQL checks are complete on the final PR head.

**Acceptance criteria**

- Newly issued keys authenticate gateway requests; revoked keys stop working immediately (covered by committed tests).
- Administrative operations require an authenticated administrator session; same-host cross-port Origin requests are rejected.
- Existing OpenAI, Anthropic, and Codex gateway protocols retain documented authorization-header compatibility.
- Managed caller keys and persisted upstream credentials are not stored as plaintext in their canonical database representations.
- SQLite is the only persistent application-state backend. Standalone JSON files are neither imported nor modified. Encrypted SQLite migration snapshots retain v1/v2 restore compatibility; POSIX permissions are restricted and Windows ACLs remain Phase 7.