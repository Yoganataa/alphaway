# AlphaWay Work Checkpoint

> Read this file first when resuming work in a new ChatGPT/agent session. Then read `ROADMAP.md`.
>
> **Checkpoint date:** 2026-11-01 (Asia/Jakarta)  
> **Repository:** [Yoganataa/alphaway](https://github.com/Yoganataa/alphaway)  
> **Active branch:** `feat/phase-1-sqlite-migrations-rebased`  
> **Phase 1 base:** `chore/phase-0-ci-distribution` at `e47399a3bba8a2f7c86c07f44d0dfc6324ca89f3`  
> **Phase 1 implementation HEAD before this checkpoint update:** `e25c69ecb81956b1cbdcdea88a19f9b791578fe8`  
> **Base main HEAD:** `93b7945c6d6b32c8fa09b9aad65b6ce6839f9c95`  
> **Last code-audited baseline:** `1fa0f434bfc3d140cdb8fe574e0c49da081eb70f`  
> **PR:** [#1 — Phase 0 CI, installer, and standalone distribution](https://github.com/Yoganataa/alphaway/pull/1)

## 1. Current Status

**Phase 0 is complete; Phase 1 is in progress.** Phase 0 passed all required CI jobs on Bun 1.4.4 in run `41322998575`. PR #1 remains open and has not been merged into `main`. Phase 1 is isolated on `feat/phase-1-sqlite-migrations-rebased`, based on Phase 0 HEAD `e47399a3bba8a2f7c86c07f44d0dfc6324ca89f3`.

- [x] Repository and baseline structure inspected.
- [x] Existing product capabilities and major implementation risks recorded.
- [x] Target product direction and dashboard information architecture agreed.
- [x] `ROADMAP.md` created as the canonical plan.
- [x] `CHECKPOINT.md` created for cross-session continuity.
- [x] Phase 0 — Repository Baseline, CI, and Distribution Integrity (Linux x86_64 CI verified).
- [x] Phase 1 implementation started: versioned SQLite migrations, initial schema adoption, canonical persistence for current JSON-backed features, and ledger-backed legacy import.
- [ ] Phase 1 CI verification and credential-storage review.
- [ ] Phase 2 — Authentication, API Keys, and Administrative Access.
- [ ] Phase 3 — Plans, Limits, and Request Enforcement.
- [ ] Phase 4 — Persona, Jailbreak Presets, SOUL, and Security Rules.
- [ ] Phase 5 — Accurate Backend Feature Contracts.
- [ ] Phase 6 — 9router-go Dashboard Migration and UI/UX Parity.
- [ ] Phase 7 — Hardening, Documentation, and Release.

Phase 0 is complete; Phase 1 implementation has begun. Local execution is unavailable in this environment (Bun is not installed and a repository clone cannot be made), so all runtime verification must come from GitHub Actions. The latest Phase 0 branch run `41322998575` completed successfully with Bun 1.4.4: 270 unit/protocol tests passed (0 failed), 8 Playwright E2E tests passed (0 failed), build and fingerprint checks passed (17 ciphers, 12 extensions), and the installer smoke verified fresh install, upgrade preservation of `.env` and SQLite data, background startup, and embedded dashboard/JS serving. Phase 1 has not yet been run through CI; do not claim its tests or build pass until its PR workflow succeeds. Phase 0 verification remains Linux x86_64 only; macOS launchd and Windows binary runtime are not covered.

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

## 5. Phase 1 — In Progress

### Phase 0 baseline

Phase 0 remains complete on Bun 1.4.4. GitHub Actions [run `41322998575`](https://github.com/Yoganataa/alphaway/actions/runs/41322998575) on commit `e47399a3bba8a2f7c86c07f44d0dfc6324ca89f3` passed:
- Unit/protocol tests: 270 passed, 0 failed.
- Playwright E2E: 8 passed, 0 failed.
- Build, installer/upgrade smoke, background startup, embedded dashboard and TLS fingerprint (17 ciphers, 12 extensions): passed.
- Live upstream gate drill: intentionally skipped.

PR #1 remains open: [Stabilize CI, installer, and standalone distribution](https://github.com/Yoganataa/alphaway/pull/1).

### Phase 1 implementation

Active branch: `feat/phase-1-sqlite-migrations-rebased`, based on the latest Phase 0 branch HEAD `e47399a3bba8a2f7c86c07f44d0dfc6324ca89f3`.

Implemented so far:
- Added `src/core/migrations/` with ordered, contiguous migration registry and transactional migration history.
- Added migration v1 to adopt the pre-existing schema without deleting existing provider, usage, or setting rows; added `legacy_imports` ledger.
- Integrated migrations into database startup; migration failures abort initialization instead of silently running against a partial schema.
- Added a destructive-migration guard. Such migrations require a preflight backup callback; production uses WAL checkpoint plus SQLite `VACUUM INTO` before applying them.
- Added checksum-ledgered, transactional import for `custom_providers.json`, `usage_stats.json`, `tokensaver.json`, and `proxy.json`. Source JSON files are retained.
- Made SQLite canonical for TokenSaver configuration, custom providers, proxy/pool configuration, usage events and usage aggregate snapshots.
- Kept `pool-health.json` as runtime health cache only; it is not operator configuration.
- Made usage request-log insertion and aggregate-snapshot update atomic in the same SQLite transaction.
- Added guards/tests so stale JSON mirrors do not restore deleted provider data or merge stale recent usage logs into a newer canonical snapshot.
- Updated the Playwright Soul Studio E2E test to wait for asynchronous editor content while preserving the non-empty assertion.

### Verification status

| Area | Status |
|---|---|
| Phase 1 source implementation | Added on the branch |
| Migration runner unit tests | Pending Phase 1 CI |
| Legacy importer tests | Pending Phase 1 CI |
| Proxy SQLite persistence tests | Pending Phase 1 CI |
| Usage atomic persistence tests | Pending Phase 1 CI |
| Full unit/protocol suite | Pending Phase 1 CI |
| Build and Playwright E2E | Pending Phase 1 CI |
| Bun 1.4.4 runtime/fingerprint | Verified in Phase 0; Phase 1 CI must repeat it |

No Phase 1 test/build pass is claimed. The environment running this session has no Bun executable, so CI is the authoritative test path.

### Changed implementation files

```text
src/core/migrations/types.ts
src/core/migrations/001_initial_schema.ts
src/core/migrations/index.ts
src/core/legacy-imports.ts
src/core/database.ts
src/core/custom-providers.ts
src/core/proxy.ts
src/core/usage-tracker.ts
src/features/tokensaver.ts
test/migrations.test.ts
test/legacy-imports.test.ts
test/database.test.ts
test/proxy.test.ts
test/usage-analytics.test.ts
test/e2e/dashboard.test.ts
```

### Remaining Phase 1 work

- Run and fix the full CI workflow on this branch.
- Review the legacy import rules against representative existing AlphaWay state directories before merging.
- Decide credential storage design separately: caller keys should not be stored as plaintext; upstream secrets require recoverable encryption and key-management policy.
- Extend canonical persistence to Security, Plans and Persona only when their backend feature models are being implemented.
- Update docs with final test results and open a stacked PR targeting `chore/phase-0-ci-distribution`; merge PR #1 first, then retarget Phase 1 PR to `main`.

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

Lanjutkan dari fase aktif dalam ROADMAP.md. Phase 0 sudah selesai pada Bun 1.4.4. Lanjutkan Phase 1 pada branch `feat/phase-1-sqlite-migrations-rebased`, periksa CI terbaru, perbaiki kegagalan, dan jangan klaim selesai sebelum migration/import/persistence teruji. Kerjakan bertahap, gunakan branch/PR, jangan melemahkan tes, dan update CHECKPOINT.md setiap selesai satu blok kerja yang bermakna.
```

---

**Reminder:** This checkpoint captures the state of the planning/audit session, not a verified runtime test report.
