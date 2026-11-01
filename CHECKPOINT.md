# AlphaWay Work Checkpoint

> Read this file first when resuming work in a new ChatGPT/agent session. Then read `ROADMAP.md`.
>
> **Checkpoint date:** 2026-11-01 (Asia/Jakarta)  
> **Repository:** [Yoganataa/alphaway](https://github.com/Yoganataa/alphaway)  
> **Active branch:** `chore/phase-0-ci-distribution`  
> **Branch HEAD before this checkpoint update:** `466f526e77322e9cc40c72e40522c2d1beaeaaaa`  
> **Base main HEAD:** `93b7945c6d6b32c8fa09b9aad65b6ce6839f9c95`  
> **Last code-audited baseline:** `1fa0f434bfc3d140cdb8fe574e0c49da081eb70f`

## 1. Current Status

**Phase 0 is in progress.** A focused implementation branch exists; PR CI and runtime smoke verification are pending. No changes have been merged into `main`.

- [x] Repository and baseline structure inspected.
- [x] Existing product capabilities and major implementation risks recorded.
- [x] Target product direction and dashboard information architecture agreed.
- [x] `ROADMAP.md` created as the canonical plan.
- [x] `CHECKPOINT.md` created for cross-session continuity.
- [x] Phase 0 planning/audit and initial implementation block (CI/build/dashboard/updater/installer/docs).  
- [ ] Phase 0 acceptance verification (PR CI, clean build, installer, and embedded-dashboard smoke tests).
- [ ] Phase 1 — Database Migrations and Canonical Persistence.
- [ ] Phase 2 — Authentication, API Keys, and Administrative Access.
- [ ] Phase 3 — Plans, Limits, and Request Enforcement.
- [ ] Phase 4 — Persona, Jailbreak Presets, SOUL, and Security Rules.
- [ ] Phase 5 — Accurate Backend Feature Contracts.
- [ ] Phase 6 — 9router-go Dashboard Migration and UI/UX Parity.
- [ ] Phase 7 — Hardening, Documentation, and Release.

Implementation branch changes are limited to Phase 0. Source files, build configuration, installer, tests, README, and AGENTS have been updated; no application feature work for later phases has started. This environment has no Bun runtime and cannot clone the repository over its network, so application tests/build/installer were not run locally. The latest baseline `main` GitHub Actions run `41317617602` failed: the Bun test step used `.test.js` paths while the repository contains `.test.ts`, and Node compatibility jobs called the absent `test:node` script. The new PR CI is the authoritative verification path. Do not interpret source changes as proof that build/tests currently pass.

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

## 5. Phase 0 Implementation Progress

### Changes on `chore/phase-0-ci-distribution`

- Reworked `.github/workflows/ci.yml`: Bun 1.4.3 pin; corrected TypeScript unit test path; separate unit, build, installer/embedded-dashboard smoke, and Playwright E2E jobs; live upstream drill is a manual workflow dispatch; removed obsolete Node compatibility matrix.
- Updated `package.json`: Bun engine floor `>=1.4.3`; separate unit/E2E scripts; standalone build embeds `dist/`; host build emits `alphaway`; Windows x64 has an explicit cross-target.
- Updated `vite.config.ts` and `src/routes/dashboard.ts` to use a deterministic module-relative dashboard asset directory. Removed ambiguous root-dist/web-dist fallback and added safe asset path resolution/MIME handling.
- Removed the incompatible legacy updater calls from `src/index.ts`; replaced `src/core/updater.ts` with a no-network/no-write compatibility shim requiring complete installer updates.
- Replaced the obsolete root-level JavaScript installer with a staged installer for the current TypeScript source archive. It performs frozen dependency install, TLS fingerprint validation, dashboard/binary build, pre-swap validation, persistent state/config separation, and systemd/launchd/background registration.
- Replaced obsolete installer test assumptions in `test/install-migration.test.ts` and added `test/updater.test.ts`.
- Updated `README.md`, `AGENTS.md`, `.env.example`, `ROADMAP.md`, and this checkpoint for the current Bun build, installer, supported runtime, and test commands.

### Verification state

| Check | State |
|---|---|
| Baseline `main` workflow run `41317617602` | Confirmed failed on stale test paths and missing `test:node` script |
| Current branch unit/integration tests | Pending PR CI |
| Current branch fingerprint check | Pending PR CI |
| Dashboard and standalone binary build | Pending PR CI |
| Installer Bash syntax and isolated install | Pending PR CI |
| Compiled binary `/health`, `/`, and embedded JS asset | Pending PR CI |
| Playwright dashboard E2E | Pending PR CI |
| Local execution in this environment | Not available: Bun is not installed and repository clone/network access is unavailable |

No claim is made that the current branch passes. The workflow was authored to verify the built executable and installed artifact rather than relying only on static checks.

### Files changed on the branch

```text
.github/workflows/ci.yml
.env.example
AGENTS.md
README.md
install.sh
package.json
vite.config.ts
src/index.ts
src/core/updater.ts
src/routes/dashboard.ts
test/install-migration.test.ts
test/updater.test.ts
ROADMAP.md
CHECKPOINT.md
```

### Next action

1. Open/review the PR from `chore/phase-0-ci-distribution` to `main`.
2. Inspect its Actions run. Fix all failures; do not mark Phase 0 complete while any required job is failing or unexpectedly skipped.
3. Pay particular attention to standalone embedded-asset resolution, install-smoke startup, and installer behavior.
4. Once CI passes, perform a real upgrade test against a disposable state directory and a clean installation test; record exact command output here.
5. Move to Phase 1 only after Phase 0 acceptance criteria are met.

## 7. Working Rules for the Next Session

- Read `CHECKPOINT.md` first, then `ROADMAP.md`, then inspect the current GitHub state.
- The live repository/PR state takes precedence over this checkpoint if newer commits exist. Reconcile differences instead of blindly following stale notes.
- Do not ask the user to repeat product decisions already recorded here.
- Work only on the active phase unless a blocking dependency requires a documented change in sequence.
- Do not claim that tests/builds/CI pass unless the command was actually run and its output was checked.
- Do not mark roadmap tasks complete merely because code was written; verify behavior and acceptance criteria.
- After each coherent change, update this file with: date, branch, HEAD/PR, completed work, changed paths, verification commands/results, outstanding issues, and the exact next action.
- If work is interrupted, leave the repository in a clean, committed state where practical and update this checkpoint before stopping.

## 7. Prompt to Resume in a New Chat

Copy this prompt into the next session:

```text
Lanjutkan pekerjaan AlphaWay dari repository https://github.com/Yoganataa/alphaway.

Baca CHECKPOINT.md terlebih dahulu, lalu ROADMAP.md. Keduanya adalah catatan kanonis lintas sesi. Setelah itu periksa live branch/commit dan PR di GitHub; jangan mengasumsikan checkpoint masih identik dengan HEAD saat ini. Jika ada commit baru, baca diff dan perbarui pemahaman/checkpoint sebelum mengubah kode.

Target produk yang sudah diputuskan:
- Backend tetap Bun + TypeScript + Hono; jangan port backend Go dari 9router-go.
- Dashboard harus memiliki UI/UX yang sama dengan frontend 9router-go, tetapi semua fitur AlphaWay tetap tersedia dan menggunakan API backend AlphaWay.
- Frontend target berada di web/.
- Pertahankan OpenAI Chat, Anthropic Messages, Codex Responses, OpenCode TLS/BoringSSL behavior, CodeBuddy, custom providers, TokenSaver, SOUL.md, Cloudflare Tunnel, proxy engine, dan fitur AlphaWay lainnya.
- Tambahkan Plans serta Persona/Jailbreak.
- Ikuti struktur TypeScript idiomatis; jangan membuat struktur ala Go secara menyeluruh.

Lanjutkan dari fase aktif dalam ROADMAP.md. Phase 0 — Repository Baseline, CI, and Distribution Integrity sedang dikerjakan di branch `chore/phase-0-ci-distribution`. Mulai dengan memeriksa PR dan CI terbaru; jangan mengulang perubahan yang sudah dibuat. Kerjakan bertahap, gunakan branch/PR, jangan melemahkan tes, dan update CHECKPOINT.md setiap selesai satu blok kerja yang bermakna.
```

---

**Reminder:** This checkpoint captures the state of the planning/audit session, not a verified runtime test report.
