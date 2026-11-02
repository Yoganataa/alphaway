# AlphaWay Work Checkpoint

> Read this file first when resuming work in a new ChatGPT/agent session. Then read `ROADMAP.md`.
>
> **Checkpoint date:** 2026-11-02 (Asia/Jakarta)  
> **Repository:** [Yoganataa/alphaway](https://github.com/Yoganataa/alphaway)  
> **Active branch:** `feat/phase-2-auth-admin-security`  
> **Current `main` HEAD:** `e2492fb3a995677d24f3078b7925a2c48c877ca7`  
> **Latest verified PR head:** `d5e177411d83d11789d17531e42856f40b729cab` on `feat/phase-2-auth-admin-security`; `main` remains `e2492fb3a995677d24f3078b7925a2c48c877ca7`.  
> **Latest CI verification:** CI run [`41418380839`](https://github.com/Yoganataa/alphaway/actions/runs/41418380839) (#415) passed on Bun 1.4.4: **360 unit/protocol tests passed** across 33 files (4,982 assertions); **8 dashboard E2E tests passed** (52 assertions); UI/standalone build, installer/embedded-dashboard smoke, and TLS fingerprint (17 ciphers, 12 extensions) passed. Optional live upstream drill was skipped by design.  
> **Latest CodeQL verification:** analysis run [`41418375820`](https://github.com/Yoganataa/alphaway/actions/runs/41418375820) (#200) completed JavaScript/TypeScript and Actions jobs successfully. CodeQL result check [`125187906695`](https://github.com/Yoganataa/alphaway/runs/125187906695) is **success: “No new alerts in code changed by this pull request.”** The newly introduced `js/clear-text-logging` flow from `CODEBUDDY_API_KEY` through JWT `sub` extraction to CLI logging was removed. The production Quick Tunnel URL-substring check was also replaced with parsed-host validation. The temporary SARIF diagnostic workflow has been removed.  
> **Remaining review gate:** Independent human security review is still outstanding. Codex review and CodeQL are automated and do not substitute for that review. Do not merge PR #4 until review is completed and all findings are resolved.
> **Phase 2 PR:** [#4 — Authentication, API keys, and administrative access](https://github.com/Yoganataa/alphaway/pull/4) (open, draft; do not merge yet)  
> **Merged Phase 0 PR:** [#1 — Phase 0 CI, installer, and standalone distribution](https://github.com/Yoganataa/alphaway/pull/1)  
> **Merged Phase 1 PR:** [#3 — Versioned SQLite migrations and canonical persistence](https://github.com/Yoganataa/alphaway/pull/3)  
> **Superseded Phase 1 PR:** [#2 — Versioned SQLite migrations and canonical persistence](https://github.com/Yoganataa/alphaway/pull/2) (closed without merge)

## 1. Current Status

**Phase 0 and Phase 1 are complete and merged into `main`. Phase 2 implementation and hardening are substantially complete on `feat/phase-2-auth-admin-security` in draft PR #4. Required CI and the CodeQL PR check are green on the latest PR head; independent human security review remains the final pre-merge gate. Do not begin Phase 3 or merge PR #4 until that review is complete and any findings are resolved.

- [x] Phase 0 — Repository Baseline, CI, and Distribution Integrity (Linux x86_64 CI verified).
- [x] Phase 1 — Database Migrations and Canonical Persistence (PR #3 merged).
- [ ] Phase 2 — Authentication, API Keys, and Administrative Access (implementation, required CI, and CodeQL PR check are green; independent human security review remains before merge).
- [ ] Phase 3 — Plans, Limits, and Request Enforcement.
- [ ] Phase 4 — Persona, Jailbreak Presets, SOUL, and Security Rules.
- [ ] Phase 5 — Accurate Backend Feature Contracts.
- [ ] Phase 6 — 9router-go Dashboard Migration and UI/UX Parity.
- [ ] Phase 7 — Hardening, Documentation, and Release.

Phase 0 PR #1 and Phase 1 PR #3 are merged. PR #2 is closed without merging because it was superseded by PR #3. Phase 1 merge commit: `1d34c45dbf2d7a2e947a62fd298642691c38f8e2`; final Phase 1 CI run `41328813739` passed on Bun 1.4.4. The one-time flat-file JSON importer introduced during Phase 1 was retired by Phase 2 schema v5; AlphaWay now uses SQLite-only persistence.

### Phase 2 implementation on the active branch

- First-admin bootstrap token, CLI-only token display, scrypt password hashes, bounded login throttling, hashed admin sessions, expiry/revocation, HttpOnly/SameSite cookie, and dashboard login/logout.
- Administrator login KDF concurrency is bounded globally (4 active, 16 queued); same-username password checks are serialized so parallel guesses cannot race the failed-login throttle. Overload is rejected as rate-limited.
- Default-deny administrator session gate for `/api/*`; only status/session/bootstrap/login endpoints are public. Host/Origin validation compares scheme, host, and port and rejects same-host cross-port requests.
- Managed inference keys stored as salted SHA-256 hashes with prefix lookup; create/list metadata/rename/rotate/revoke, inference scope, last-used timestamps, and request counts. Legacy `API_KEY` and `BRIDGE_API_KEY` remain supported.
- Gateway inference authentication covers OpenAI, Anthropic, and Codex routes including aliases. Gateway caller credentials are not reused as upstream CodeBuddy credentials.
- AES-256-GCM at-rest encryption for custom-provider API keys, proxy/pool/relay credentials, CodeBuddy OAuth credentials, and destructive-migration SQLite snapshots.
- Existing plaintext SQLite migration/pre-restore snapshots are migrated to encrypted `.awenc` envelopes at startup or before restore. New SQLite snapshots use streaming AES-256-GCM envelope v2 with bounded 96 KiB file I/O; restore streams both v1 and v2 envelopes into a staged file, runs `PRAGMA quick_check`, then replaces the database. No arbitrary maximum database size is imposed.
- Migration v3 enables connection-local `PRAGMA secure_delete=ON` and records a retryable one-time cleanup marker. Startup checkpoints/truncates WAL, runs `VACUUM`, checkpoints again, and marks cleanup complete only after success. This removes logical SQLite page/WAL residue from the v2 credential migration; it is not a physical-media or filesystem-snapshot sanitization guarantee.
- Migration v4 encrypts a previously plaintext, JSON-serialized `codebuddy_api_key` value inside SQLite `app_settings` and re-arms the secret-residue cleanup marker. This is a SQLite value migration, not a standalone JSON-file importer.
- Migration v5 removes the obsolete `legacy_imports` bookkeeping table. Historical migrations v1–v4 remain unchanged; provider, API-key, usage, and settings rows in SQLite are preserved.
- Custom providers, usage analytics, TokenSaver, proxy settings, API keys, and admin sessions use canonical SQLite persistence. Existing SQLite analytics/TokenSaver/proxy values are normalized through explicit allowlists before use.
- The pre-SQLite standalone JSON importer and JSON rollback restore CLI have been removed. SQLite schema v5 drops the obsolete import ledger; existing standalone JSON files are ignored and left untouched.
- Persistent storage configuration follows the 9router-go contract: `DATA_DIR` and `DB_PATH`, default `$DATA_DIR/db/data.sqlite`, directory-layout fallback (`db/data.sqlite`, `data.sqlite`, `9router.db`, then legacy `alphaway.sqlite`), and compatibility aliases for existing AlphaWay installations. Double-quoted `.env` escapes are decoded in one pass.
- Proxy pool health is a credential-free best-effort cache: restore reads are no-follow and capped at 1 MiB with file identity/metadata checks; the in-memory cache is capped at 512 egress records. Oversized/corrupt cache data is ignored without affecting proxy configuration.
- All JSON request bodies across admin settings/configuration routes and the three gateway protocols are capped at 10 MiB using Content-Length validation plus streaming byte limits; oversized requests return 413 before JSON parsing or provider dispatch. Public administrator bootstrap/login use a stricter 16 KiB cap before parsing or KDF work.
- Master encryption-key files are read as exactly 32 bytes plus a one-byte sentinel, and bootstrap token files are capped at 64 bytes with strict 43-character base64url validation; both verify descriptor identity/metadata stability.
- Provider and CodeBuddy upstream diagnostic redaction covers raw, decoded, percent-encoded, Bearer-prefixed credentials; proxy connection-test diagnostics redact proxy authority credentials.
- CodeBuddy OAuth returns no upstream access/refresh token to the browser; the dashboard uses the provider `state`/`authUrl` polling contract. The configured CodeBuddy token is read from encrypted SQLite or the environment override. The CLI prints the validated authorization URL for manual opening, no longer invokes `child_process`, `exec`, or `spawn`, and reports only a generic credential-configured status instead of logging JWT identity claims derived from the token.
- Bun test preload isolates SQLite state before importing app modules. Tests cover admin sessions, key lifecycle/scope/revocation, CSRF origin ports, analytics/settings allowlists, encrypted SQLite backups (including v1 restore compatibility and a 24 MiB streaming snapshot), v5 removal of the obsolete JSON-import ledger without losing canonical records, oversized proxy health caches, AES-GCM tamper rejection, nonce uniqueness, POSIX key-file permissions, database-path locking across different `DATA_DIR` roots and explicit restore destinations, and rejection of symlink database targets.
- Login-throttle capacity pressure fails closed: active per-username records are never evicted to make room for attacker-chosen usernames, preventing username spraying from resetting an account lockout.
- Every server mode (foreground, daemon, systemd, and launchd) holds both the compatibility `DATA_DIR/alphaway.lock` and a second lock beside the canonical SQLite file (`<canonical-DB_PATH>.alphaway.lock`). This prevents distinct `DATA_DIR` roots from writing the same `DB_PATH`; restore passes its actual destination path to the same locking API, including explicit CLI destination overrides. Lock acquisition is atomic and rolls back the first lock if the second cannot be acquired. `alphaway.pid` remains daemon-only metadata.
- Credential-transform migrations v2 and v4 are explicitly destructive and require encrypted pre-migration SQLite backups before changing existing credentials or managed keys.
- Installer canonicalizes quoted and relative `DATA_DIR` values to an absolute path rooted at `BINDIR`, so service and manual starts use the same persistent directory.
- Installer smoke verifies the encryption master-key file survives an upgrade unchanged.

### GitHub / CI state at checkpoint

- PR #4 remains the only open PR. It targets `main`, is **open and draft**, and its latest head is `d5e177411d83d11789d17531e42856f40b729cab`; do not merge it yet.
- `main` HEAD remains `e2492fb3a995677d24f3078b7925a2c48c877ca7`.
- Latest required CI run [`41418380839`](https://github.com/Yoganataa/alphaway/actions/runs/41418380839) (#415) passed on Bun 1.4.4: **360 unit/protocol tests, 0 failures** across 33 files (4,982 assertions); **8 dashboard E2E tests, 0 failures** (52 assertions); UI/standalone build, installer/embedded-dashboard smoke, and TLS fingerprint (17 ciphers/12 extensions) passed. Optional live upstream gate drill was skipped by design.
- Latest CodeQL workflow run [`41418375820`](https://github.com/Yoganataa/alphaway/actions/runs/41418375820) (#200) completed both JavaScript/TypeScript and Actions analysis jobs successfully. CodeQL result check [`125187906695`](https://github.com/Yoganataa/alphaway/runs/125187906695) passed with **“No new alerts in code changed by this pull request.”**
- SARIF diagnostics identified the blocking high-severity `js/clear-text-logging` finding: a CodeBuddy JWT `sub` claim derived from `CODEBUDDY_API_KEY` was printed in the interactive CLI login. The CLI now logs only a generic “credential configured” status; the sensitive claim is not decoded for that log path. The subsequent SARIF result no longer contained `js/clear-text-logging`.
- The SARIF pass also surfaced URL-substring matches in the Cloudflare Quick Tunnel output parser and in existing test mocks. Production tunnel handling now parses candidate URLs and validates HTTPS, credentials, port, and the actual `hostname` suffix before printing only the URL origin. The remaining substring matches are confined to test URL-mock assertions and were not reported as new PR alerts by the final CodeQL check. The temporary `.github/workflows/codeql-sarif-diagnostics.yml` workflow was deleted after exporting and inspecting the SARIF artifacts.
- The four earlier Codex review threads (OAuth subprocess execution, DB-path locking, stale-lock assertion text, daemon PID ordering) remain resolved. Automated Codex re-review at `18a885604dc329e9ca4dc28997cb20da8863fefe` found no findings; the latest CodeQL and CI runs are newer than that review.
- No independent human security review has been submitted. Automated Codex review and CodeQL do not substitute for independent human security review. The repository ruleset requires zero PR approvals for the solo-developer workflow, but keep PR #4 draft until the independent review decision and any findings are resolved.
- Repository Ruleset [`Protect main`](https://github.com/Yoganataa/alphaway/rules/26337025) is active for `refs/heads/main`, has no bypass actors, requires a PR and conversation resolution, requires the four CI jobs to pass with strict up-to-date checks, blocks branch deletion and force pushes, and requires zero approvals.
- Windows ACL behavior for bootstrap/encryption-key files and SQLite backups is not verified. Keep it in Phase 7 hardening; POSIX `0600`/`0700` permissions are covered.
 
### Remaining Phase 2 gaps / boundaries

- Standalone JSON file import/recovery is intentionally unsupported. AlphaWay uses SQLite as its only persistent application-state backend; old flat JSON files are ignored and left untouched. The v5 migration removes the obsolete import ledger without changing canonical SQLite data.
- Independent security review of PR #4 is still outstanding. The repository ruleset intentionally requires zero PR approvals for the solo-developer workflow; that does not replace an independent review. Keep PR #4 draft until the review decision and findings are resolved.
- Windows ACL enforcement for generated master-key/bootstrap files and SQLite backups is deferred to Phase 7.
- Per-key Plan assignment is deferred to Phase 3 with the Plan model and enforcement semantics. Phase 2 API keys already have inference scope and lifecycle metadata.

**Verification boundary:** CI evidence is GitHub Actions on Linux x86_64 with Bun 1.4.4. No local Bun test/build was run in this session; GitHub Actions is the verified test environment. macOS launchd and Windows runtime/ACL behavior are not verified.
## 2. Agreed Product Direction

The goal is to evolve AlphaWay without replacing its core gateway:

- Backend remains **Bun + TypeScript + Hono**. Do not port the Go backend from 9router-go.
- Frontend should reach the **same UI/UX as 9router-go**, using its frontend as the visual/interaction reference. The frontend is to be adapted to AlphaWay's own backend contracts and capabilities.
- Frontend location: `web/`.
- Keep the current frontend until the replacement is built, integrated, and verified.
- Do not force a Go-style directory structure or a broad rewrite.
- Add first-class **Plans** and **Persona / Jailbreak** capabilities.
- Preserve AlphaWay's existing feature set and provider-specific behavior.

### Target sidebar

1. Endpoint & Key
2. Providers
3. Playground
4. Usage
5. Quota Tracker
6. Token Saver
7. Security
8. Proxy Pools
9. Persona
10. Plans
11. Console Log
12. Settings

Placement decisions:
- Cloudflare Tunnel → Endpoint & Key.
- SOUL Studio → inner tab/section of Persona.
- Daemon, SQLite/storage maintenance, runtime diagnostics → Settings.

## 3. Baseline Architecture Observed

Current repository layout includes:

```text
src/
  app.ts
  index.ts
  cli/
  client/
  core/
  features/
  providers/
  routes/
  types/
test/
.github/workflows/
install.sh
package.json
vite.config.ts
```

There is currently no root `ROADMAP.md` or `CHECKPOINT.md` in the inspected baseline. The old Svelte dashboard is located in `src/client/`; no replacement `web/` frontend existed in the inspected tree.

Important implementation observations:

| Area | Baseline observation |
|---|---|
| Runtime | Bun is required for production provider traffic; preserve OpenCode BoringSSL/TLS fingerprint behavior. |
| HTTP app | `src/app.ts` mounts Hono routes and gateway auth. Gateway auth checks environment key configuration (`BRIDGE_API_KEY || API_KEY`). |
| API keys | `src/routes/settings.ts` stores key records as JSON in `app_settings`; key generation/storage needs a secure redesign. |
| Admin routes | `src/core/admin-guard.ts` checks host/origin/CSRF-related conditions, but does not establish an authenticated admin identity/session. |
| Database | `src/core/database.ts` uses Bun SQLite and creates tables with `CREATE TABLE IF NOT EXISTS`; a versioned migration system was not found. |
| Chat routing | `src/routes/chat.ts` contains a large multi-protocol dispatcher. Keep changes narrow and test all protocol paths. |
| Providers | `src/providers/opencode.ts` and `src/providers/codebuddy.ts` contain specialized upstream behavior. Preserve them unless a verified requirement demands change. |
| Protocols | Keep OpenAI Chat, Anthropic Messages, and Codex Responses compatibility. |
| TokenSaver/SOUL | Existing implementations are in `src/features/`; preserve TokenSaver and SOUL.md behavior while making integration deterministic. |
| Proxy engine | A substantial proxy pool engine exists, but the current Proxy Pools UI is not fully connected to persisted backend pool CRUD. |
| Quota UI | Current quota values include hardcoded limits and randomized RPM/TPM readings; replace with real provider data or explicit unavailable state. |
| Security UI | Custom UI rules are not yet a durable, shared backend rule source for both sandbox and live requests. |
| Usage | SQLite request logs coexist with JSON stats/history; streaming token accounting has inaccurate fixed values in some paths. |
| CI | `.github/workflows/ci.yml` references stale JS paths and a missing `test:node` script. |
| Installer | `install.sh` references legacy root-level files (for example `server.js`) not present in the current `src/` layout. |
| Build | UI asset serving and binary packaging need to be tested as one release contract; do not assume the executable is self-contained. |

## 4. Important Files to Re-read Before Implementation

Do not rely only on this summary. Fetch the current files from GitHub before editing:

- `package.json`
- `.github/workflows/ci.yml`
- `install.sh`
- `vite.config.ts`
- `src/index.ts`
- `src/app.ts`
- `src/core/database.ts`
- `src/core/admin-guard.ts`
- `src/routes/settings.ts`
- `src/routes/chat.ts`
- `src/routes/dashboard.ts`
- `src/core/usage-tracker.ts`
- `src/core/proxy.ts`
- `src/features/tokensaver.ts`
- `src/features/soul-engine.ts`
- `src/client/App.svelte`
- `README.md`
- `AGENTS.md`
- `THIRD_PARTY_NOTICES.md`

Also inspect the current `9router-go` frontend and pin the exact upstream commit when beginning Phase 6.

## 5. Phase 0 — Complete

### Implementation summary

- Repaired `.github/workflows/ci.yml` for the current Bun + TypeScript project. CI has separate unit/protocol, build, installer/embedded-dashboard smoke, and Playwright E2E jobs. The live upstream gate drill is manual only.
- Set Bun support floor and CI runtime to 1.4.4, with the matching OpenCode TLS fingerprint check.
- Made the dashboard build output deterministic, embedded `dist/` into the standalone executable, and made Hono serve the embedded assets from the standalone module root.
- Removed the legacy root-level JavaScript self-updater and replaced it with a safe manual-install-required compatibility shim.
- Replaced `install.sh` with a staged install/upgrade flow for the current Bun + TypeScript source tree. Configuration and SQLite state remain outside the replaceable app directory.
- Added regression coverage for installer/distribution behavior and updater behavior.
- Stabilized the Playwright harness to launch the Chromium browser installed by CI directly, use bounded health probes, and clean up the server on launch failure.
- Updated README, AGENTS, `.env.example`, ROADMAP, and this checkpoint.

### Final verification evidence

GitHub Actions [run `41325472514`](https://github.com/Yoganataa/alphaway/actions/runs/41325472514), final Phase 0 PR head `bbad49140818abc340e0aef3203c317c2e77e173`:

| Job / check | Result |
|---|---|
| Unit and protocol tests | **271 passed, 0 failed**, 25 files |
| OpenCode transport fingerprint | Bun 1.4.4 matched baseline: 17 ciphers, 12 extensions |
| UI and standalone binary build | Passed |
| Installer and embedded dashboard smoke | Passed |
| Fresh install | Passed |
| Upgrade preservation | Passed; `.env` value and SQLite marker row retained |
| Background startup | Passed; health endpoint responded |
| Embedded dashboard | Passed after physical `app/dist/` directory was moved away; `/health`, `/`, and generated JS asset all responded |
| Dashboard browser E2E | **8 passed, 0 failed** |
| Live upstream gate drill | Skipped intentionally; manual-only workflow |

The workflow verifies Linux x86_64 only. macOS launchd service registration and Windows x64 executable runtime are not yet covered and must not be described as validated.

### Changed files

```text
.env.example
.github/workflows/ci.yml
AGENTS.md
CHECKPOINT.md
README.md
ROADMAP.md
install.sh
package.json
vite.config.ts
src/index.ts
src/core/updater.ts
src/routes/dashboard.ts
test/e2e/dashboard.test.ts
test/e2e/harness.ts
test/install-migration.test.ts
test/updater.test.ts
test/verify-quick.test.ts
```

### Current GitHub state

- Branch: `chore/phase-0-ci-distribution`
- PR: [#1 — Stabilize CI, installer, and standalone distribution](https://github.com/Yoganataa/alphaway/pull/1)
- PR state: merged.
- Merge commit: `9805d2335293539424fd66af3c047b493edad630`.
- `main` includes the Phase 0 CI, Bun 1.4.4 runtime, installer, and standalone distribution baseline.

### Current Phase 2 work

Continue only Phase 2 on `feat/phase-2-auth-admin-security` and draft PR #4. The latest PR head `d5e177411d83d11789d17531e42856f40b729cab` has passing required CI #415 and a passing CodeQL result check with no new alerts. The blocking CodeQL clear-text logging finding was removed; production Quick Tunnel URL handling now validates the parsed hostname. Do not repeat these fixes.

Next actions:
1. Complete an independent security review of PR #4 and resolve any findings. The repository ruleset still uses zero approvals for the solo-developer workflow; this does not replace the independent review.
2. Keep Windows ACL verification in Phase 7 hardening; POSIX file/directory permissions are covered.
3. Keep PR #4 draft and do not merge or begin Phase 3 until Phase 2 acceptance criteria and independent review are complete.

Per-key Plan assignment belongs to Phase 3. Do not add a placeholder plan field or begin quota enforcement during Phase 2.
## 6. Working Rules for the Next Session

- Read `CHECKPOINT.md` first, then `ROADMAP.md`, then inspect live GitHub state.
- The live repository/PR state takes precedence over this checkpoint if newer commits exist.
- Keep backend runtime Bun + TypeScript + Hono. Preserve OpenCode TLS/BoringSSL behavior and all documented gateway protocols.
- Do not weaken or remove tests to make CI green. Do not claim tests/builds/CI passed unless the actual result was inspected.
- Work only on the active phase. Do not start Phase 3 until Phase 2 acceptance criteria and CI/security review are complete.
- Update this checkpoint and the roadmap after meaningful work, including branch/PR state, changed paths, verification evidence, open risks, and exact next action.
- If work is interrupted, leave a committed state and an accurate checkpoint; do not claim background work.

## 7. Prompt to Resume in a New Chat

```text
Lanjutkan AlphaWay dari repository https://github.com/Yoganataa/alphaway.
Baca CHECKPOINT.md terlebih dahulu, lalu ROADMAP.md. Setelah itu periksa live main, branch feat/phase-2-auth-admin-security, PR #4, Ruleset Protect main, dan hasil GitHub Actions terbaru sebelum mengubah apa pun.

Phase 0 PR #1 dan Phase 1 PR #3 sudah merged. PR #4 adalah satu-satunya PR aktif, target main, open dan draft. Latest verified head: d5e177411d83d11789d17531e42856f40b729cab. CI #415 passed on Bun 1.4.4 (360 unit/protocol tests, 4,982 assertions; 8 dashboard E2E tests, 52 assertions; build, installer smoke, and TLS fingerprint passed). CodeQL #200 completed successfully; result check 125187906695 says “No new alerts in code changed by this pull request.”

The high-severity js/clear-text-logging finding was fixed by preventing CodeBuddy JWT subject claims derived from CODEBUDDY_API_KEY from being written to CLI logs. Cloudflare Quick Tunnel output now validates the parsed HTTPS URL hostname before logging the origin. The temporary SARIF diagnostic workflow was removed. Do not repeat these fixes.

Phase 2 implementation is substantially complete. Remaining pre-merge gate: an independent human security review of PR #4 and resolution of any findings. Codex and CodeQL are automated tools and do not satisfy this review. Keep PR #4 draft; do not merge or begin Phase 3 until the independent review and acceptance gates are complete.

Backend remains Bun 1.4.4 + TypeScript + Hono. SQLite is the only persistent application-state backend; no standalone JSON database import/recovery. Plan assignment and quota enforcement belong to Phase 3. Windows ACL verification stays in Phase 7. Do not weaken tests or claim unverified behavior.
```
