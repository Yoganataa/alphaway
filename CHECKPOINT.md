# AlphaWay Work Checkpoint

> Read this file first when resuming work in a new ChatGPT/agent session. Then read `ROADMAP.md`.
>
> **Checkpoint date:** 2026-11-01 (Asia/Jakarta)  
> **Repository:** [Yoganataa/alphaway](https://github.com/Yoganataa/alphaway)  
> **Active branch:** `feat/phase-1-sqlite-migrations` (based on merged Phase 0 main)  
> **Last implementation HEAD before this checkpoint update:** `1846eb0314e7968ca137adf12feb19a22ee5a115`  
> **Base main HEAD:** `9805d2335293539424fd66af3c047b493edad630`  
> **Last code-audited baseline:** `1fa0f434bfc3d140cdb8fe574e0c49da081eb70f`  
> **PR:** [#1 — Phase 0 CI, installer, and standalone distribution](https://github.com/Yoganataa/alphaway/pull/1)

## 1. Current Status

**Phase 0 is complete and merged into `main` at `9805d2335293539424fd66af3c047b493edad630`.** Final GitHub Actions run `41325472514` passed on Bun 1.4.4. The P1 legacy-systemd retirement finding was fixed and the review thread resolved. PR #1 is merged.

- [x] Repository and baseline structure inspected.
- [x] Existing product capabilities and major implementation risks recorded.
- [x] Target product direction and dashboard information architecture agreed.
- [x] `ROADMAP.md` created as the canonical plan.
- [x] `CHECKPOINT.md` created for cross-session continuity.
- [x] Phase 0 — Repository Baseline, CI, and Distribution Integrity (Linux x86_64 CI verified).
- [~] Phase 1 — Database Migrations and Canonical Persistence (implementation started on `feat/phase-1-sqlite-migrations`, based on merged Phase 0 main; no Phase 1 PR opened yet).
- [ ] Phase 2 — Authentication, API Keys, and Administrative Access.
- [ ] Phase 3 — Plans, Limits, and Request Enforcement.
- [ ] Phase 4 — Persona, Jailbreak Presets, SOUL, and Security Rules.
- [ ] Phase 5 — Accurate Backend Feature Contracts.
- [ ] Phase 6 — 9router-go Dashboard Migration and UI/UX Parity.
- [ ] Phase 7 — Hardening, Documentation, and Release.

Phase 1 is active on `feat/phase-1-sqlite-migrations`, now based directly on merged `main` at `9805d2335293539424fd66af3c047b493edad630`. The former diverged branch was rebuilt into a clean 14-file Phase 1 diff on top of the merged Phase 0 baseline. The E2E timing and legacy service retirement fixes are inherited from main, not duplicated. Phase 1 changes cover versioned SQLite migrations, legacy imports, and canonical persistence for custom providers, TokenSaver, usage, and proxy configuration. New Phase 1 tests have not yet been executed in GitHub Actions; local Bun execution is unavailable in this environment. Phase 0 evidence is GitHub Actions run `41325472514` on Bun 1.4.4: 271 unit/protocol tests passed, 8 Playwright E2E tests passed, build and fingerprint checks passed (17 ciphers, 12 extensions), and installer smoke verified fresh install, upgrade preservation of `.env` and SQLite data, background startup, and standalone embedded dashboard/JS serving. The live upstream gate drill was intentionally skipped. CI verified Linux x86_64; macOS launchd and Windows binary runtime are not yet covered.

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
- Set Bun support floor and CI runtime to 1.4.3, with the matching OpenCode TLS fingerprint check.
- Made the dashboard build output deterministic, embedded `dist/` into the standalone executable, and made Hono serve the embedded assets from the standalone module root.
- Removed the legacy root-level JavaScript self-updater and replaced it with a safe manual-install-required compatibility shim.
- Replaced `install.sh` with a staged install/upgrade flow for the current Bun + TypeScript source tree. Configuration and SQLite state remain outside the replaceable app directory.
- Added regression coverage for installer/distribution behavior and updater behavior.
- Stabilized the Playwright harness to launch the Chromium browser installed by CI directly, use bounded health probes, and clean up the server on launch failure.
- Updated README, AGENTS, `.env.example`, ROADMAP, and this checkpoint.

### Final verification evidence

GitHub Actions [run `41322403767`](https://github.com/Yoganataa/alphaway/actions/runs/41322403767), branch HEAD `e1d8fbbe2a8f0a360109e48f476d9745cdefda4a`:

| Job / check | Result |
|---|---|
| Unit and protocol tests | **270 passed, 0 failed**, 25 files |
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
- PR state: open, mergeable, no merge performed.
- Base: `main` at `93b7945c6d6b32c8fa09b9aad65b6ce6839f9c95`.
- Branch is ahead of main. Review the complete PR diff before merging.

### Next phase

Phase 0 acceptance criteria are met for the tested Linux x86_64 path. After reviewing/merging PR #1, proceed to **Phase 1 — Database Migrations and Canonical Persistence** in ROADMAP.md. Do not start Plans or Persona implementation before the database migration foundation is designed and tested.

## 6. Working Rules for the Next Session

- Read `CHECKPOINT.md` first, then `ROADMAP.md`, then inspect the current GitHub state.
- The live repository/PR state takes precedence over this checkpoint if newer commits exist. Reconcile differences instead of blindly following stale notes.
- Do not ask the user to repeat product decisions already recorded here.
- Work only on the active phase unless a blocking dependency requires a documented change in sequence.
- Do not claim that tests/builds/CI pass unless the command was actually run and its output was checked.
- Do not mark roadmap tasks complete merely because code was written; verify behavior and acceptance criteria.
- After each coherent change, update this file with: date, branch, HEAD/PR, completed work, changed paths, verification commands/results, outstanding issues, and the exact next action.
- If work is interrupted, leave the repository in a clean, committed state where practical and update this checkpoint before stopping.

## 7. Prompt to Resume in a New Chat

Current Phase 1 implementation files:
- `src/core/migrations/{types.ts,index.ts,001_initial_schema.ts}`: versioned migration runner and initial schema.
- `src/core/legacy-imports.ts`: idempotent JSON import ledger with checksums.
- `src/core/database.ts`: migration startup, backup hook, canonical SQLite queries and atomic usage writes.
- `src/core/custom-providers.ts`, `src/features/tokensaver.ts`, `src/core/usage-tracker.ts`, `src/core/proxy.ts`: SQLite canonical persistence.
- Tests: `test/migrations.test.ts`, `test/legacy-imports.test.ts`, plus database/proxy/usage regression coverage.

Next actions:
1. Run Phase 1 verification on Bun 1.4.4: `bun run test:unit`, `bun run test:e2e`, `bun run fingerprint:check`, and `bun run build`.
2. Fix all test/type/runtime regressions; then open Phase 1 PR against `main`.
3. Continue persistence coverage for API keys, security, Plans, and Persona; test file-backed backup/restore before marking Phase 1 complete.

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

Lanjutkan dari fase aktif dalam ROADMAP.md. Phase 0 selesai, semua CI job hijau, temuan P1 legacy systemd sudah ditangani, dan PR #1 siap merge. Setelah Phase 0 masuk ke main, rebase `feat/phase-1-sqlite-migrations` pada main terbaru, verifikasi ulang semua test, lalu lanjut Phase 1 — Database Migrations and Canonical Persistence sesuai ROADMAP.md. Jangan membuka PR Phase 1 sebelum branch sinkron dengan main. Kerjakan bertahap, jangan melemahkan tes, dan update CHECKPOINT.md setiap selesai satu blok kerja yang bermakna.
```

---

**Reminder:** This checkpoint captures the state of the planning/audit session, not a verified runtime test report.
