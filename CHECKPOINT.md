# AlphaWay Work Checkpoint

> Read this file first when resuming work in a new ChatGPT/agent session. Then read `ROADMAP.md`.
>
> **Checkpoint date:** 2026-11-02 (Asia/Jakarta)  
> **Repository:** [Yoganataa/alphaway](https://github.com/Yoganataa/alphaway)  
> **Active branch:** `feat/phase-2-auth-admin-security`  
> **Current `main` HEAD:** `e2492fb3a995677d24f3078b7925a2c48c877ca7`  
> **Latest CI-verified Phase 2 code HEAD:** `d4ef382c328ad3a26e2fa30f524bc3ade85c7828` (run `41371688949`; documentation sync follows)  
> **Phase 2 PR:** [#4 — Authentication, API keys, and administrative access](https://github.com/Yoganataa/alphaway/pull/4) (open, draft; do not merge yet)  
> **Merged Phase 0 PR:** [#1 — Phase 0 CI, installer, and standalone distribution](https://github.com/Yoganataa/alphaway/pull/1)  
> **Merged Phase 1 PR:** [#3 — Versioned SQLite migrations and canonical persistence](https://github.com/Yoganataa/alphaway/pull/3)  
> **Superseded Phase 1 PR:** [#2 — Versioned SQLite migrations and canonical persistence](https://github.com/Yoganataa/alphaway/pull/2) (closed without merge)

## 1. Current Status

**Phase 0 and Phase 1 are complete and merged into `main`. Phase 2 is active on `feat/phase-2-auth-admin-security` in draft PR #4.** Do not begin Phase 3 or merge PR #4 until the remaining security review is complete.

- [x] Phase 0 — Repository Baseline, CI, and Distribution Integrity (Linux x86_64 CI verified).
- [x] Phase 1 — Database Migrations and Canonical Persistence (PR #3 merged).
- [ ] Phase 2 — Authentication, API Keys, and Administrative Access (core implementation and in-repository hardening complete; preserve-and-skip recovery policy documented, owner acceptance and independent security review remain).
- [ ] Phase 3 — Plans, Limits, and Request Enforcement.
- [ ] Phase 4 — Persona, Jailbreak Presets, SOUL, and Security Rules.
- [ ] Phase 5 — Accurate Backend Feature Contracts.
- [ ] Phase 6 — 9router-go Dashboard Migration and UI/UX Parity.
- [ ] Phase 7 — Hardening, Documentation, and Release.

Phase 0 PR #1 and Phase 1 PR #3 are merged. PR #2 is closed without merging because it was superseded by PR #3. Phase 1 merge commit: `1d34c45dbf2d7a2e947a62fd298642691c38f8e2`; final Phase 1 CI run `41328813739` passed on Bun 1.4.4.

### Phase 2 implementation on the active branch

- First-admin bootstrap token, CLI-only token display, scrypt password hashes, bounded login throttling, hashed admin sessions, expiry/revocation, HttpOnly/SameSite cookie, and dashboard login/logout.
- Administrator login KDF concurrency is bounded globally (4 active, 16 queued); same-username password checks are serialized so parallel guesses cannot race the failed-login throttle. Overload is rejected as rate-limited.
- Default-deny administrator session gate for `/api/*`; only status/session/bootstrap/login endpoints are public. Host/Origin validation compares scheme, host, and port and rejects same-host cross-port requests.
- Managed inference keys stored as salted SHA-256 hashes with prefix lookup; create/list metadata/rename/rotate/revoke, inference scope, last-used timestamps, and request counts. Legacy `API_KEY` and `BRIDGE_API_KEY` remain supported.
- Gateway inference authentication covers OpenAI, Anthropic, and Codex routes including aliases. Gateway caller credentials are not reused as upstream CodeBuddy credentials.
- AES-256-GCM at-rest encryption for custom-provider API keys, proxy/pool/relay credentials, CodeBuddy OAuth credentials, processed legacy JSON rollback envelopes, and destructive-migration SQLite snapshots.
- Existing plaintext SQLite migration/pre-restore snapshots are migrated to encrypted `.awenc` envelopes at startup or before restore. SQLite restore validates a staged database with `PRAGMA quick_check` before replacement.
- Migration v3 enables connection-local `PRAGMA secure_delete=ON` and records a retryable one-time cleanup marker. Startup checkpoints/truncates WAL, runs `VACUUM`, checkpoints again, and marks cleanup complete only after success. This removes logical SQLite page/WAL residue from the v2 credential migration; it is not a physical-media or filesystem-snapshot sanitization guarantee.
- Migration v4 encrypts the legacy JSON-encoded `codebuddy_api_key` setting at rest and re-arms the secret-residue cleanup marker. This covers existing databases that had already completed migration v3 before the CodeBuddy credential gap was identified; startup repeats WAL checkpoint/VACUUM before returning the database.
- Legacy JSON, usage analytics, TokenSaver, and proxy settings use explicit import/storage allowlists. Unknown credential-bearing fields are discarded; analytics/TokenSaver/proxy rows already present in SQLite are normalized and rewritten before use.
- Legacy import rejects symlink sources, uses no-follow descriptors and file identity checks, and atomically replaces successfully processed JSON files with encrypted rollback envelopes. Reads are capped at 50 MiB plus one sentinel byte even if a source grows after `fstat`; a changing or oversized source is skipped without parsing/replacing it. POSIX mode is restricted to `0600` and the plaintext residual remains documented.
- Provider and CodeBuddy upstream diagnostic redaction covers raw, decoded, percent-encoded, Bearer-prefixed credentials; proxy connection-test diagnostics redact proxy authority credentials.
- CodeBuddy OAuth returns no upstream access/refresh token to the browser; the dashboard uses the provider `state`/`authUrl` polling contract. The configured CodeBuddy token is read from encrypted SQLite or the environment override.
- Bun test preload isolates SQLite state before importing app modules. Tests cover admin sessions, key lifecycle/scope/revocation, CSRF origin ports, analytics/settings allowlists, encrypted legacy and SQLite backups, AES-GCM tamper rejection, nonce uniqueness, symlink refusal, bounded legacy-file growth during import, and POSIX key-file permissions.
- Installer smoke verifies the encryption master-key file survives an upgrade unchanged.

### GitHub / CI state at checkpoint

- PR #4 is the only open PR, targets `main`, and remains **draft**. Do not merge it or start Phase 3 in this checkpoint.
- `main` HEAD: `e2492fb3a995677d24f3078b7925a2c48c877ca7`.
- Phase 2 code head `d4ef382c328ad3a26e2fa30f524bc3ade85c7828` passed GitHub Actions run [`41371688949`](https://github.com/Yoganataa/alphaway/actions/runs/41371688949): **331 unit/protocol tests passed, 0 failed** across 31 files; **8 dashboard E2E passed, 0 failed**; standalone build, Bun 1.4.4 TLS fingerprint (17 ciphers/12 extensions), and installer/embedded-dashboard smoke passed. Installer smoke verified the encryption master-key file survived upgrade unchanged. Optional live upstream gate drill was skipped by design.
- `CHECKPOINT.md`, `ROADMAP.md`, and PR #4 description are being synchronized after this verified code head; require green CI on the final docs head before merge.
- An earlier CI failure on commit `117b51a...` was caused by an invalid escaped regex. It was corrected; the subsequent functional head run above passed.
- Windows ACL behavior is not verified. Keep it in Phase 7 hardening; POSIX `0600`/`0700` permissions are covered.

### Remaining Phase 2 gaps / boundaries

- Proposed operator recovery policy is **preserve-and-skip** for legacy JSON sources above 50 MiB or sources that cannot be safely atomically replaced: do not parse, partially import, truncate, or delete them automatically. Preserve the source and report the skip; POSIX mode is restricted to `0600`. The operator must create and verify an encrypted archive before moving the source out of configured import directories. Project-owner acceptance is still required. Windows ACL enforcement remains unverified and requires manual OS-level protection until Phase 7.
- Independent security review of PR #4 is outstanding. Keep PR #4 draft until review and acceptance criteria are complete.
- Windows ACL enforcement for generated master-key/bootstrap files and legacy/SQLite backups is deferred to Phase 7.
- Per-key Plan assignment is deferred to Phase 3 with the Plan model and enforcement semantics. Phase 2 API keys already have inference scope and lifecycle metadata.

**Verification boundary:** CI evidence is GitHub Actions on Linux x86_64 with Bun 1.4.4. No local Bun test/build was run in this session. macOS launchd and Windows runtime/ACL behavior are not verified.
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

Continue only Phase 2 on `feat/phase-2-auth-admin-security` and draft PR #4. Latest code head verified by CI is `d4ef382c328ad3a26e2fa30f524bc3ade85c7828` (run `41371688949`); `main` was `e2492fb3a995677d24f3078b7925a2c48c877ca7`. Re-fetch live refs, PR, and Actions before making changes.

The only open PR is [#4](https://github.com/Yoganataa/alphaway/pull/4). It targets `main`, remains draft, and must not be merged yet. Do not create another PR or start Phase 3.

Next exact actions:
1. Synchronize the current bounded legacy-import read hardening into this checkpoint/roadmap and PR description, then verify CI on the documentation-synchronized head.
2. Obtain project-owner acceptance of the documented preserve-and-skip/manual-archive exception for oversized or unsafe-to-replace legacy JSON sources.
3. Obtain independent security review for PR #4 and resolve all findings. Keep the PR draft until that review is complete.
4. Keep Windows ACL verification in Phase 7 hardening; POSIX file/directory permissions are covered.
5. Do not merge PR #4 or start Phase 3 until the residual legacy-source exception is accepted, Phase 2 acceptance criteria are met, and review findings are resolved.

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

Baca CHECKPOINT.md terlebih dahulu, lalu ROADMAP.md. Setelah itu periksa live main, branch feat/phase-2-auth-admin-security, PR #4, dan GitHub Actions. Jangan mengulang Phase 0 atau Phase 1 yang sudah merged. Main saat checkpoint: e2492fb3a995677d24f3078b7925a2c48c877ca7. PR #4 adalah satu-satunya PR aktif, open dan draft, target main.

Phase 2 mencakup admin bootstrap/login/session, default-deny admin API gate, managed inference keys hashed dan lifecycle/scopes, AES-256-GCM persistence untuk provider/proxy/relay/CodeBuddy OAuth secrets, pemisahan gateway dan CodeBuddy upstream credentials, OAuth state/authUrl flow, health/error redaction, isolated Bun test state, login KDF concurrency cap (4 active/16 queued), SQLite v3 residue cleanup, dan v4 legacy CodeBuddy credential encryption. Importer legacy menolak symlink, menggunakan no-follow descriptor, membatasi read ke 50 MiB plus sentinel byte, dan mempertahankan sumber yang oversized/berubah tanpa parsing atau penggantian otomatis.

CI run `41371688949` lulus pada head `d4ef382c328ad3a26e2fa30f524bc3ade85c7828`: 331 unit/protocol tests pass, 8 dashboard E2E pass, TLS fingerprint (17 ciphers/12 extensions), standalone build, dan installer/embedded-dashboard smoke lulus. Optional live upstream drill sengaja skipped.

Gap tersisa: persetujuan project owner untuk preserve-and-skip/manual-archive exception, independent security review PR #4, dan Windows ACL verification (Phase 7). Assignment Plan ke key dilakukan pada Phase 3 bersama model Plan. Jangan merge PR #4 atau mulai Phase 3 sampai syarat Phase 2 dipenuhi.

Backend tetap Bun 1.4.4 + TypeScript + Hono; jangan port backend Go dari 9router-go dan jangan melemahkan test.
```
