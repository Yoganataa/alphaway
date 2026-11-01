# AlphaWay Work Checkpoint

> Read this file first when resuming work in a new ChatGPT/agent session. Then read `ROADMAP.md`.
>
> **Checkpoint date:** 2026-11-02 (Asia/Jakarta)  
> **Repository:** [Yoganataa/alphaway](https://github.com/Yoganataa/alphaway)  
> **Active branch:** `feat/phase-2-auth-admin-security`  
> **Current `main` HEAD:** `e2492fb3a995677d24f3078b7925a2c48c877ca7`  
> **Latest verified Phase 2 branch HEAD:** `ca122b584886511a5d9d2ef4df39b04db43a6ee2`  
> **Phase 2 PR:** [#4 — Authentication, API keys, and administrative access](https://github.com/Yoganataa/alphaway/pull/4) (open, draft; do not merge yet)  
> **Merged Phase 0 PR:** [#1 — Phase 0 CI, installer, and standalone distribution](https://github.com/Yoganataa/alphaway/pull/1)  
> **Merged Phase 1 PR:** [#3 — Versioned SQLite migrations and canonical persistence](https://github.com/Yoganataa/alphaway/pull/3)  
> **Superseded Phase 1 PR:** [#2 — Versioned SQLite migrations and canonical persistence](https://github.com/Yoganataa/alphaway/pull/2) (closed without merge)

## 1. Current Status

**Phase 0 and Phase 1 are complete and merged into `main`. Phase 2 is active on `feat/phase-2-auth-admin-security` in draft PR #4.** Do not begin Phase 3 or merge PR #4 until the remaining security review is complete.

- [x] Phase 0 — Repository Baseline, CI, and Distribution Integrity (Linux x86_64 CI verified).
- [x] Phase 1 — Database Migrations and Canonical Persistence (PR #3 merged).
- [ ] Phase 2 — Authentication, API Keys, and Administrative Access (current branch-head CI passed; full secret-flow audit and final review remain).
- [ ] Phase 3 — Plans, Limits, and Request Enforcement.
- [ ] Phase 4 — Persona, Jailbreak Presets, SOUL, and Security Rules.
- [ ] Phase 5 — Accurate Backend Feature Contracts.
- [ ] Phase 6 — 9router-go Dashboard Migration and UI/UX Parity.
- [ ] Phase 7 — Hardening, Documentation, and Release.

Phase 0 PR #1 and Phase 1 PR #3 are merged. PR #2 is closed without merging because it was superseded by PR #3. Phase 1 merge commit: `1d34c45dbf2d7a2e947a62fd298642691c38f8e2`; final Phase 1 CI run `41328813739` passed on Bun 1.4.4.

### Phase 2 implementation on the active branch

- First-admin bootstrap token, CLI-only token display, scrypt password hashes, bounded login throttling, hashed admin sessions, expiry/revocation, HttpOnly/SameSite cookie, and dashboard login/logout.
- Default-deny administrator session gate for `/api/*`, with only status/session/bootstrap/login endpoints public; origin/host checks remain defense-in-depth.
- Managed inference keys stored as salted SHA-256 hashes with prefix lookup; create/list metadata/rename/rotate/revoke, inference scopes, last-used timestamps, and request counts. Legacy `API_KEY` and `BRIDGE_API_KEY` remain supported.
- Gateway inference authentication covers OpenAI, Anthropic, and Codex routes including aliases. Gateway caller credentials are not reused as upstream CodeBuddy credentials.
- AES-256-GCM at-rest encryption for custom-provider API keys, proxy/pool/relay credentials, and CodeBuddy OAuth credentials. Legacy DB migration and JSON import paths encrypt credentials before persisting them.
- CodeBuddy OAuth returns no upstream access/refresh token to the browser; the dashboard uses the provider's `state`/`authUrl` polling contract. The configured CodeBuddy token is read from encrypted SQLite or the documented environment override.
- Upstream custom-provider and CodeBuddy error bodies redact provider credentials. `/health` recognizes an encrypted CodeBuddy credential without returning its value.
- Bun test preload isolates SQLite state before importing app modules. Tests cover admin sessions, key lifecycle/scope/revocation, CodeBuddy credential separation/redaction, legacy imports, migration encryption, AES-GCM tamper rejection, nonce uniqueness, symlink refusal, and POSIX key-file permissions.
- Login username/password length and failed-login memory are bounded; API-key labels reject control characters. Installer smoke verifies the encryption master-key file survives an upgrade unchanged.

### GitHub / CI state at checkpoint

- PR #4 is the only open PR, targets `main`, and remains **draft**. No review submissions or inline review threads were present at the last check.
- `main` HEAD: `e2492fb3a995677d24f3078b7925a2c48c877ca7`.
- Latest verified Phase 2 branch HEAD: `ca122b584886511a5d9d2ef4df39b04db43a6ee2`.
- GitHub Actions run `41339693714` passed on Bun 1.4.4 for this exact PR head: **312 unit/protocol tests passed, 0 failed** across 31 files; transport fingerprint passed (17 ciphers/12 extensions), standalone binary build passed, installer/embedded-dashboard smoke passed including SHA-256 proof that `secret-encryption.key` survives upgrade unchanged, and dashboard E2E passed (**8 passed, 0 failed**). The optional live upstream gate drill was skipped by design.
- Runs `41339060686` and `41339200556` failed in installer smoke because `GITHUB_ENV` values are not visible in the same shell step. The test harness was corrected to compare against the local `key_digest_before` variable; runs `41339302362`, `41339526068`, and `41339693714` verify this fix.
- Reviews and inline review threads were empty at the last check. PR #4 remains draft and is mergeable with `main` (`ahead_by=29`, `behind_by=0`).

### Remaining Phase 2 gaps / boundaries

- Per-key Plan assignment is deferred to Phase 3 with the Plan model and enforcement semantics. Phase 2 API keys already have inference scope and lifecycle metadata.
- Complete the secrets audit across all logs, errors, diagnostics, analytics, backup/export, and persistence paths; some provider error paths are covered but a full audit is not yet signed off.
- Windows ACL enforcement for generated master-key/bootstrap files is not implemented or verified. POSIX 0600/0700 behavior is tested; Windows ACL verification belongs to Phase 7 hardening.
- Final PR review is outstanding. Keep PR #4 draft; do not merge and do not start Phase 3.

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

Continue only Phase 2 on `feat/phase-2-auth-admin-security` and draft PR #4. Latest verified branch head was `ca122b584886511a5d9d2ef4df39b04db43a6ee2`; `main` is `e2492fb3a995677d24f3078b7925a2c48c877ca7`. Re-fetch live refs, PR, and Actions before making changes.

The only open PR is [#4](https://github.com/Yoganataa/alphaway/pull/4). It targets `main`, remains draft, and must not be merged until the remaining secret-flow audit and security review are complete. Do not create another PR or start Phase 3.

Next exact actions:
1. Complete the end-to-end secret audit across logs, diagnostics, analytics, backup/export, and persistence; add regression coverage for any uncovered path.
2. Keep Windows ACL verification marked as Phase 7 hardening unless a verified implementation is added.
3. Update PR #4 with findings and request review/mark ready only after the secret audit is signed off.
4. Do not merge PR #4 or start Phase 3 until all Phase 2 acceptance criteria and review findings are resolved.

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

Phase 2 mencakup admin bootstrap/login/session, default-deny admin API gate, managed inference keys hashed dan lifecycle/scopes, AES-256-GCM persistence untuk provider/proxy/relay/CodeBuddy OAuth secrets, pemisahan gateway dan CodeBuddy upstream credentials, OAuth state/authUrl flow, health/error redaction, isolated Bun test state, login rate limiting, API key label validation, dan installer master-key preservation.

CI run 41339693714 passed pada exact head ca122b584886511a5d9d2ef4df39b04db43a6ee2: 312 unit tests pass, 8 browser E2E pass, transport fingerprint, binary build, dan installer smoke semuanya lulus. Optional live upstream drill sengaja skipped.

Gap tersisa: audit menyeluruh secret-flow di logs/diagnostics/analytics/backup-export, verifikasi Windows ACL (Phase 7), dan final PR security review. Assignment Plan ke key dilakukan pada Phase 3 bersama model Plan. Jangan merge PR #4 atau mulai Phase 3 sampai Phase 2 accepted.

Backend tetap Bun 1.4.4 + TypeScript + Hono; jangan port backend Go dari 9router-go dan jangan melemahkan test.
```
