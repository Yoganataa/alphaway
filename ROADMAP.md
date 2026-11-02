### Phase 2 — Authentication, API Keys, and Administrative Access

**Status:** Core implementation and in-repository hardening are complete on `feat/phase-2-auth-admin-security`. Code head `d4ef382c328ad3a26e2fa30f524bc3ade85c7828` passed CI run `41371688949`; documentation-synchronized PR head `9fdba247c1779885978e8357636358c2244c8649` passed CI run `41372136690` on Bun 1.4.4. Both runs cover bounded login KDF work, SQLite residue cleanup, migration v4 for legacy CodeBuddy credentials, and bounded legacy JSON reads. Draft PR #4 remains blocked on project-owner acceptance of the preserve-and-skip exception and independent security review.
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
- [x] Bound administrator password KDF concurrency globally (4 active, 16 queued), reject queue overflow, and serialize KDF checks per username to prevent parallel throttle bypass.
- [x] Make `/health` recognize an encrypted CodeBuddy credential without exposing its value.
- [x] Add AES-GCM tests for nonce uniqueness, authenticated decryption/tamper rejection, symlink refusal, and POSIX owner-only key-file permissions.
- [x] Refuse symlinked legacy JSON sources; open through no-follow descriptors, verify file identity, and atomically replace processed sources with encrypted rollback envelopes. Provide `--restore-legacy-backup` for operator recovery.
- [x] Bound legacy JSON reads to 50 MiB plus one sentinel byte, even when a source grows after `fstat`; skip without parsing/replacing a changed or oversized source, and verify the file metadata remained stable during a successful read.
- [x] Whitelist fields imported from legacy usage analytics, TokenSaver, and proxy configuration; discard unknown credential-bearing properties rather than persisting arbitrary JSON.
- [x] Normalize and rewrite older SQLite analytics, TokenSaver, and proxy settings through allowlisted schemas before exposing them to application/dashboard code.
- [x] Encrypt destructive-migration SQLite snapshots as AES-256-GCM `.sqlite.awenc` envelopes and migrate historical plaintext migration/pre-restore snapshots before they are used.
- [x] After the v2 credential migration, enable SQLite `secure_delete`, checkpoint/truncate WAL, `VACUUM`, and checkpoint again under a retryable v3 marker before startup serves requests. This is logical SQLite cleanup, not physical-media sanitization.
- [x] Migration v4 encrypts the legacy JSON-encoded `codebuddy_api_key` setting for databases that already reached v3, then re-arms the cleanup marker so startup repeats WAL checkpoint/VACUUM after replacing the old plaintext value.
- [x] Redact raw, decoded, percent-encoded, and Bearer-prefixed provider credentials from custom-provider and CodeBuddy error responses/diagnostics; sanitize proxy connection-test errors.
- [x] Preserve installer upgrade behavior and verify `.env`, SQLite state, and `secret-encryption.key` remain intact through the Linux installer smoke test.
- [x] Document the proposed **preserve-and-skip** recovery policy for legacy JSON sources above 50 MiB or files that cannot be safely atomically replaced: do not parse, partially import, truncate, or delete the source automatically; preserve it and report the skip. POSIX mode is restricted to `0600`. The operator must create and verify an encrypted archive before moving the source out of configured import directories. This intentionally keeps a bounded plaintext residual rather than risking data loss or unbounded parsing; project-owner acceptance remains required.
- [ ] Complete independent security review of PR #4 and resolve any findings before merge.

**Implementation notes**

- Migration v2 adds `api_keys`, `admin_users`, and `admin_sessions`; converts legacy API-key JSON records to hashes; and encrypts existing custom-provider/proxy credentials.
- Migration v3 writes a retryable secret-residue cleanup marker. Startup enables SQLite `secure_delete`, checkpoints/truncates WAL, runs `VACUUM`, and marks cleanup complete after a successful final checkpoint.
- Migration v4 converts the legacy `codebuddy_api_key` app setting from its JSON-encoded plaintext string into an AES-256-GCM envelope, then re-arms the v3 cleanup marker so SQLite free pages/WAL are scrubbed again.
- The master encryption key is supplied by `ALPHAWAY_ENCRYPTION_KEY` or generated in the AlphaWay state directory. Back it up with the database and encrypted migration snapshots; losing it makes encrypted credentials and backups unrecoverable.
- Legacy `API_KEY` and `BRIDGE_API_KEY` remain supported as environment-managed inference credentials. `CODEBUDDY_API_KEY` remains an optional environment override.
- Windows ACL behavior for bootstrap, encryption-key, legacy source, and migration-backup files remains unverified and is explicitly deferred to Phase 7 hardening. POSIX `0600`/`0700` behavior is covered.
- Per-key Plan assignment and quota enforcement belong to Phase 3; do not add a placeholder Plan field during Phase 2.

**Verification state**

- Draft PR #4: [Phase 2 — Authentication, API keys, and administrative access](https://github.com/Yoganataa/alphaway/pull/4).
- Code head `d4ef382c328ad3a26e2fa30f524bc3ade85c7828`, CI run [`41371688949`](https://github.com/Yoganataa/alphaway/actions/runs/41371688949): **331 unit/protocol tests passed, 0 failed** across 31 files; **8 dashboard E2E passed, 0 failed**; standalone build, Bun 1.4.4 TLS fingerprint (17 ciphers/12 extensions), and installer/embedded-dashboard smoke passed. Installer smoke verified the encryption master-key file survived upgrade unchanged. Optional live upstream gate drill was skipped by design.
- Documentation-synchronized PR head `9fdba247c1779885978e8357636358c2244c8649`, CI run [`41372136690`](https://github.com/Yoganataa/alphaway/actions/runs/41372136690), passed with 331 unit/protocol and 8 dashboard E2E results plus build, fingerprint, and installer smoke. The current checkpoint/roadmap synchronization follows this docs head; verify the live PR head before merge.
- Do not merge PR #4 or begin Phase 3 until the preserve-and-skip exception is accepted by the project owner, independent security review is complete, and CI is green on the final PR head.

**Acceptance criteria**

- Newly issued keys authenticate gateway requests; revoked keys stop working immediately (covered by committed tests).
- Administrative operations require an authenticated administrator session; same-host cross-port Origin requests are rejected.
- Existing OpenAI, Anthropic, and Codex gateway protocols retain documented authorization-header compatibility.
- Managed caller keys and persisted upstream credentials are not stored as plaintext in their canonical database representations.
- Legacy JSON and destructive-migration rollback snapshots are encrypted when successfully processed; oversized/unreplaceable legacy files remain an explicit preserve-and-skip/manual-archive exception. POSIX permissions are restricted; Windows ACLs remain Phase 7.