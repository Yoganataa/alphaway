### Phase 2 — Authentication, API Keys, and Administrative Access

**Status:** Core implementation and in-repository secret-flow hardening are complete on `feat/phase-2-auth-admin-security`. Draft PR #4 is awaiting independent security review and final acceptance. Functional head `c2424e84611efaac66e3575a504be74684df25e3` passed CI run `41368844575` on Bun 1.4.4; documentation synchronization follows that verified head.
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
- [x] Isolate Bun unit-test SQLite state using a preload before application modules are imported.
- [x] Bound administrator login inputs and failed-login tracking memory; reject control characters in API-key labels.
- [x] Make `/health` recognize an encrypted CodeBuddy credential without exposing its value.
- [x] Add AES-GCM tests for nonce uniqueness, authenticated decryption/tamper rejection, symlink refusal, and POSIX owner-only key-file permissions.
- [x] Refuse symlinked legacy JSON sources; open through no-follow descriptors, verify file identity, and atomically replace processed sources with encrypted rollback envelopes. Provide `--restore-legacy-backup` for operator recovery.
- [x] Whitelist fields imported from legacy usage analytics, TokenSaver, and proxy configuration; discard unknown credential-bearing properties rather than persisting arbitrary JSON.
- [x] Normalize and rewrite older SQLite analytics, TokenSaver, and proxy settings through allowlisted schemas before exposing them to application/dashboard code.
- [x] Encrypt destructive-migration SQLite snapshots as AES-256-GCM `.sqlite.awenc` envelopes and migrate historical plaintext migration/pre-restore snapshots before they are used.
- [x] Redact raw, decoded, percent-encoded, and Bearer-prefixed provider credentials from custom-provider and CodeBuddy error responses/diagnostics; sanitize proxy connection-test errors.
- [x] Preserve installer upgrade behavior and verify `.env`, SQLite state, and `secret-encryption.key` remain intact through the Linux installer smoke test.
- [ ] Decide the operator recovery policy for legacy JSON sources above the 50 MiB import limit or files that cannot be safely atomically replaced. They are not imported/encrypted; POSIX mode is reduced to `0600` and the source remains plaintext. This is a bounded, documented residual risk.
- [ ] Complete independent security review of PR #4 and resolve any findings before merge.

**Implementation notes**

- Migration v2 adds `api_keys`, `admin_users`, and `admin_sessions`; converts legacy API-key JSON records to hashes; and encrypts existing custom-provider/proxy credentials.
- The master encryption key is supplied by `ALPHAWAY_ENCRYPTION_KEY` or generated in the AlphaWay state directory. Back it up with the database and encrypted migration snapshots; losing it makes encrypted credentials and backups unrecoverable.
- Legacy `API_KEY` and `BRIDGE_API_KEY` remain supported as environment-managed inference credentials. `CODEBUDDY_API_KEY` remains an optional environment override.
- Windows ACL behavior for bootstrap, encryption-key, legacy source, and migration-backup files remains unverified and is explicitly deferred to Phase 7 hardening. POSIX `0600`/`0700` behavior is covered.
- Per-key Plan assignment and quota enforcement belong to Phase 3; do not add a placeholder Plan field during Phase 2.

**Verification state**

- Draft PR #4: [Phase 2 — Authentication, API keys, and administrative access](https://github.com/Yoganataa/alphaway/pull/4).
- Functional head `c2424e84611efaac66e3575a504be74684df25e3`, CI run [`41368844575`](https://github.com/Yoganataa/alphaway/actions/runs/41368844575): **327 unit/protocol tests passed, 0 failed** across 31 files; **8 dashboard E2E passed, 0 failed**; standalone build, Bun 1.4.4 TLS fingerprint (17 ciphers/12 extensions), and installer/embedded-dashboard smoke passed. Installer smoke verified the encryption master-key file survived upgrade unchanged. Optional live upstream gate drill was skipped by design.
- Follow-up commits after that functional head update documentation only. Confirm the latest PR-head CI run before considering merge.
- Do not merge PR #4 or begin Phase 3 until oversized/unreplaceable legacy-source handling is accepted, independent review is complete, and all Phase 2 acceptance criteria are satisfied.

**Acceptance criteria**

- Newly issued keys authenticate gateway requests; revoked keys stop working immediately (covered by committed tests).
- Administrative operations require an authenticated administrator session; same-host cross-port Origin requests are rejected.
- Existing OpenAI, Anthropic, and Codex gateway protocols retain documented authorization-header compatibility.
- Managed caller keys and persisted upstream credentials are not stored as plaintext in their canonical database representations.
- Legacy JSON and destructive-migration rollback snapshots are encrypted when successfully processed; oversized/unreplaceable legacy files remain an explicit recovery exception until an operator policy is accepted.