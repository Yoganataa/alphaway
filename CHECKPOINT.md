# AlphaWay Work Checkpoint

> Read this file first when resuming work in a new ChatGPT/agent session. Then read `ROADMAP.md`.
>
> **Checkpoint date:** 2026-11-02 (Asia/Jakarta)  
> **Repository:** [Yoganataa/alphaway](https://github.com/Yoganataa/alphaway)  
> **Active branch:** `main` (Phase 1 merged; no Phase 2 branch created)  
> **Merged Phase 1 branch HEAD:** `67f8ea1ccb0bfca719a80df312e6aaca214e92b5`  
> **Current main HEAD:** `1d34c45dbf2d7a2e947a62fd298642691c38f8e2`  
> **Last code-audited baseline:** `1fa0f434bfc3d140cdb8fe574e0c49da081eb70f`  
> **Merged Phase 0 PR:** [#1 — Phase 0 CI, installer, and standalone distribution](https://github.com/Yoganataa/alphaway/pull/1)  
> **Merged Phase 1 PR:** [#3 — Versioned SQLite migrations and canonical persistence](https://github.com/Yoganataa/alphaway/pull/3) (merged)  
> **Superseded Phase 1 PR:** [#2 — Versioned SQLite migrations and canonical persistence](https://github.com/Yoganataa/alphaway/pull/2) (closed; old stacked PR targeting the Phase 0 branch)

## 1. Current Status

**Phase 0 and Phase 1 are complete and merged into `main`. Phase 2 is now active on `feat/phase-2-auth-admin-security` at the user's explicit request.**

- [x] Phase 0 — Repository Baseline, CI, and Distribution Integrity (Linux x86_64 CI verified).
- [x] Phase 1 — Database Migrations and Canonical Persistence (PR #3 merged).
- [ ] Phase 2 — Authentication, API Keys, and Administrative Access (implementation branch in progress; CI/review pending).
- [ ] Phase 3 — Plans, Limits, and Request Enforcement.
- [ ] Phase 4 — Persona, Jailbreak Presets, SOUL, and Security Rules.
- [ ] Phase 5 — Accurate Backend Feature Contracts.
- [ ] Phase 6 — 9router-go Dashboard Migration and UI/UX Parity.
- [ ] Phase 7 — Hardening, Documentation, and Release.

Phase 0 PR #1 and Phase 1 PR #3 are merged. PR #2 is closed without merging because it was superseded by PR #3. Phase 1 merge commit: `1d34c45dbf2d7a2e947a62fd298642691c38f8e2`; final Phase 1 PR-head CI run `41328813739` passed on Bun 1.4.4.

Phase 2 work currently on the feature branch:
- Admin first-run bootstrap token, CLI token display, password hashing, login throttling, hashed database sessions, HttpOnly/SameSite cookie, login/logout UI.
- Global admin-session gate for `/api/*`, with narrow public admin-auth endpoints; Host/Origin checks remain additional protection.
- Managed inference keys stored as salted hashes with prefix lookup; create/list metadata/rename/rotate/revoke and last-used/request counters. Legacy `API_KEY` and `BRIDGE_API_KEY` environment credentials remain supported.
- Inference auth is enforced for `/v1/*`, `/chat/completions`, `/api/chat`, `/messages`, `/responses`, and `/response`.
- AES-256-GCM encryption for custom-provider credentials, persisted proxy/relay credentials, legacy JSON imports, and CodeBuddy OAuth credentials. The master key is provided by `ALPHAWAY_ENCRYPTION_KEY` or generated in the AlphaWay state directory.
- CodeBuddy gateway caller keys and upstream provider tokens are separate. OAuth access/refresh tokens are not returned by HTTP polling; OAuth credentials are persisted encrypted in SQLite. Dashboard OAuth client now uses the provider's actual `state`/`authUrl` contract.
- Unit tests preload isolated SQLite state before importing application modules; admin integration and E2E tests establish real admin sessions.

**Verification boundary:** Bun tests/build have not been run in this working session. Do not claim Phase 2 is complete until the draft PR's GitHub Actions checks on Bun 1.4.4 have been inspected and passed. The complete secret-flow review and platform-specific key-file ACL verification also remain open.
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

Continue only Phase 2 on `feat/phase-2-auth-admin-security`. The live `main` HEAD at the last check was `e2492fb3a995677d24f3078b7925a2c48c877ca7`; re-check it and the feature branch before any further changes. The Phase 2 branch has not yet been opened as a PR in this checkpoint; consolidate its commits onto the latest `main`, open one draft PR, then inspect every CI job and fix findings before requesting review.

Do not begin Phase 3 while Phase 2 is awaiting CI/security review. The current implementation intentionally leaves per-key plan assignment and complete security-flow auditing for follow-up work; record and close those gaps before marking Phase 2 complete.
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
Lanjutkan pekerjaan AlphaWay dari repository https://github.com/Yoganataa/alphaway.

Baca CHECKPOINT.md terlebih dahulu, lalu ROADMAP.md. Periksa live main, branch feat/phase-2-auth-admin-security, dan status PR/CI sebelum mengubah apa pun. Phase 0 dan Phase 1 sudah complete; Phase 2 Authentication, API Keys, and Administrative Access sedang berjalan pada branch fitur.

Rekonsiliasi branch fitur ke HEAD main terbaru, konsolidasikan riwayat commit, buka satu draft PR Phase 2, kemudian periksa seluruh GitHub Actions jobs pada Bun 1.4.4. Perbaiki kegagalan CI dan review temuan keamanan. Jangan merge sampai seluruh acceptance criteria Phase 2 benar-benar terpenuhi.

Phase 2 telah mengimplementasikan admin bootstrap/session, admin UI login/logout, global admin-route protection, managed inference keys hashed dan lifecycle, gateway/CodeBuddy credential separation, AES-256-GCM persistence untuk provider/proxy/relay/CodeBuddy OAuth credentials, serta test isolation. CI belum diverifikasi. Gaps yang tersisa termasuk per-key plan assignment, audit lengkap secrets pada logs/errors/analytics, dan verifikasi storage permission lintas platform.

Backend tetap Bun + TypeScript + Hono. Jangan port backend Go dari 9router-go, jangan mulai Phase 3 sebelum Phase 2 selesai, dan jangan melemahkan test suite.
```
