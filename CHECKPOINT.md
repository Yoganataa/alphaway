# AlphaWay Work Checkpoint

> Read this file first when resuming work in a new ChatGPT/agent session. Then read `ROADMAP.md`.
>
> **Checkpoint date:** 2026-11-03 (Asia/Jakarta)  
> **Repository:** [Yoganataa/alphaway](https://github.com/Yoganataa/alphaway)  
> **Active workstream:** Phase 3 — Plans, Limits, and Request Enforcement. Only open PR: [#6](https://github.com/Yoganataa/alphaway/pull/6), **Ready for review**, branch `feat/phase-3-plans-limits`. Latest verified implementation head: `28c14009142485a8bda063ebd146dab756d5d30b`. PR CI #466 and CodeQL #251 passed on this exact head; both new P2 review findings are fixed and both inline threads are resolved. PR is not merged.
> **Phase 2 merge commit on `main`:** `dc08b6d42ee0796c964eb5a8a5ecd58aeb0d15d9` (PR #4).  
> **Latest merged Phase 2 code head:** `b057042362f6497852cb037ed7be2ec4c0aa63a4`; merged into `main` by `dc08b6d42ee0796c964eb5a8a5ecd58aeb0d15d9`.  
> **Latest implementation CI:** PR CI [#466](https://github.com/Yoganataa/alphaway/actions/runs/41562146258) passed on exact head `28c1400`: all four mandatory jobs passed (unit/protocol tests including new quota regressions, dashboard browser tests, UI/standalone build, installer/embedded dashboard smoke); optional live upstream drill was skipped by design.  
> **Latest CodeQL verification:** PR CodeQL [#251](https://github.com/Yoganataa/alphaway/actions/runs/41562140930) passed JavaScript/TypeScript and Actions analysis on exact head `28c1400`. Default-branch CodeQL [#213](https://github.com/Yoganataa/alphaway/actions/runs/41448964076) passed on `main` HEAD `a28ed9b`. GitHub Security screenshot (2026-11-02), filter `is:open branch:main`, confirms **0 Open / 14 Closed**.
> **Maintainer review decision:** This is a solo-developer repository with zero required approvals. The maintainer accepted residual review risk after passing CI/CodeQL evidence and resolution of all six inline review threads. No second human reviewer participated.  
> **Phase 2 PR:** [#4 — Authentication, API keys, and administrative access](https://github.com/Yoganataa/alphaway/pull/4) (merged; merge commit `dc08b6d`).  
> **Active Phase 3 PR:** [#6 — Plans, limits, and request enforcement](https://github.com/Yoganataa/alphaway/pull/6) (open, Ready for review; all implementation checks pass; not merged).  
> **Merged Phase 0 PR:** [#1 — Phase 0 CI, installer, and standalone distribution](https://github.com/Yoganataa/alphaway/pull/1)  
> **Merged Phase 1 PR:** [#3 — Versioned SQLite migrations and canonical persistence](https://github.com/Yoganataa/alphaway/pull/3)  
> **Superseded Phase 1 PR:** [#2 — Versioned SQLite migrations and canonical persistence](https://github.com/Yoganataa/alphaway/pull/2) (closed without merge)

## 1. Current Status

**Phase 0, Phase 1, and Phase 2 are merged into `main`. Phase 2 PR #4 merged at `dc08b6d42ee0796c964eb5a8a5ecd58aeb0d15d9`. The project owner confirmed 0 open / 14 closed CodeQL alerts on `main`. Phase 3 implementation and acceptance criteria 3.1–3.5 are complete on `feat/phase-3-plans-limits`, PR #6. Latest Phase 3 head `28c1400` passed CI #466 and CodeQL #251. Two new P2 findings were fixed: non-text/multimodal prompts are rejected for managed keys with nonzero TPM/token quota when the current estimator cannot measure them, and streamed tool-call/function-call names and arguments are included in OpenAI completion metering with valid final provider usage preferred. Regression tests cover OpenAI/Anthropic image input, tool-only streams, and provider-reported usage. Both new inline review threads are resolved. PR #6 remains Ready for review and has not been merged.

- [x] Phase 0 — Repository Baseline, CI, and Distribution Integrity (Linux x86_64 CI verified).
- [x] Phase 1 — Database Migrations and Canonical Persistence (PR #3 merged).
- [x] Phase 2 — Authentication, API Keys, and Administrative Access (PR #4 merged; PR and post-merge CI/CodeQL checks passed).
- [ ] Phase 3 — Plans, Limits, and Request Enforcement (implementation acceptance criteria verified; PR #6 is Ready for review, not yet merged).
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

- PR #4 is **merged** into `main`; merge commit `dc08b6d42ee0796c964eb5a8a5ecd58aeb0d15d9`. The merged source head was `b057042362f6497852cb037ed7be2ec4c0aa63a4`.
- Phase 0 PR #1 and Phase 1 PR #3 are also merged. Superseded PR #2 remains closed without merge.
- PR CI [#425](https://github.com/Yoganataa/alphaway/actions/runs/41442485797) passed on the final Phase 2 source head. PR CodeQL [#210](https://github.com/Yoganataa/alphaway/actions/runs/41442479398) passed JavaScript/TypeScript and Actions analysis.
- Post-merge CI [#426](https://github.com/Yoganataa/alphaway/actions/runs/41448272244) passed on merge commit `dc08b6d`: unit/protocol tests, UI/standalone build, dashboard browser tests, and installer/embedded dashboard smoke all succeeded. The optional live upstream gate drill was skipped by design.
- Default-branch CodeQL [#211](https://github.com/Yoganataa/alphaway/actions/runs/41448263339) passed both JavaScript/TypeScript and Actions jobs on merge commit `dc08b6d`.
- The direct full SARIF scan at [run #41426255599](https://github.com/Yoganataa/alphaway/actions/runs/41426255599) found zero results in both analyzers on the earlier remediated source head `ee317f3`. The PR and default-branch CodeQL workflows also passed on the later Phase 2 heads.
- GitHub Security screenshot supplied by the project owner on 2026-11-02, filtered to `is:open branch:main`, confirms **0 Open / 14 Closed**. Default-branch CodeQL #213 passed on `a28ed9b`.
- All six inline review threads on PR #4 are resolved. The maintainer accepted residual review risk for the solo-developer workflow after checking CI/CodeQL evidence and the resolved threads; no second human reviewer participated.
- Repository Ruleset [Protect main](https://github.com/Yoganataa/alphaway/rules/26337025) is active for `refs/heads/main`; it requires a PR, conversation resolution, four mandatory CI jobs with strict up-to-date checks, and blocks deletion/force pushes. It requires zero approvals.
- Windows ACL behavior for generated bootstrap/encryption-key files and SQLite migration backups remains unverified and is deferred to Phase 7; POSIX `0600`/`0700` behavior is covered.

### Remaining Phase 2 gaps / boundaries

- Standalone JSON file import/recovery is intentionally unsupported. AlphaWay uses SQLite as its only persistent application-state backend; old flat JSON files are ignored and left untouched. The v5 migration removes the obsolete import ledger without changing canonical SQLite data.
- No Phase 2 implementation blocker remains. The solo maintainer accepted the residual review risk for this solo-developer workflow after all six inline review threads were resolved. Windows ACL verification remains deferred to Phase 7; per-key Plan assignment and quota enforcement belong to Phase 3.
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

### Historical Phase 0 baseline

- Phase 0 PR #1 is merged; merge commit `9805d2335293539424fd66af3c047b493edad630`.
- `main` includes the Phase 0 CI, Bun 1.4.4 runtime, installer, and standalone distribution baseline.

### Historical Phase 2 implementation

Phase 2 PR #4 is merged into `main` at `dc08b6d42ee0796c964eb5a8a5ecd58aeb0d15d9` from code head `b057042362f6497852cb037ed7be2ec4c0aa63a4`. CI #425, PR CodeQL #210, post-merge CI #426, and default-branch CodeQL #211 passed. CI #428 and CodeQL #213 passed on documentation merge commit `a28ed9b`. GitHub Security currently shows 0 open / 14 closed CodeQL alerts for `main` (2026-11-02 screenshot). Do not repeat Phase 2 remediation work.

### Current Phase 3 implementation and verification

- PR #6 is open and Ready for review; `main` is unchanged at the Phase 3 baseline `a28ed9baef0c698ec879d649a24726706d1eee3d`. Implementation is complete; do not merge without explicit project-owner instruction.
- Migration v6 adds reusable Plans, managed-key Plan assignment/overrides, token usage counters, request attribution, and indexes for per-key range queries.
- Implemented: strict Plan CRUD, effective policy precedence, model allowlists, RPM/prompt-TPM/concurrency gates, lifetime token reservations/settlement, OpenAI/Anthropic/Responses enforcement and all legacy aliases, managed-key usage attribution, persisted 1h/24h/7d/30d usage windows, and truthful Plans/Quota dashboard views.
- Dashboard E2E covers Plan create/edit/delete, assigning a Plan through the API key dropdown, inherited quota display, and selectable usage windows. Unit/integration tests cover migration, policy validation/precedence, all protocol aliases, retry exactly-once metering, stream completion/cancellation metering, upstream reader cancellation, and concurrency-slot release.
- CI #466 passed on exact Phase 3 head `28c1400`: all four mandatory jobs succeeded; the optional live upstream drill was skipped by design. PR CodeQL #251 passed both JavaScript/TypeScript and Actions analyzers on the same exact commit.
- Review follow-up on `28c1400`: token-metered managed keys fail closed on non-text prompt parts with `multimodal_prompt_unmeterable`; streamed OpenAI tool/function names and arguments are metered, and valid final provider usage takes precedence over estimates. Regression coverage was added for OpenAI/Anthropic image inputs, tool-only streams, and provider usage. Both P2 inline review threads are replied to and resolved.
- Implementation acceptance criteria 3.1–3.5 are verified. PR #6 is Ready for review, all currently known inline review threads are resolved, and the PR has not been merged. Do not merge without explicit project-owner instruction.

Next actions:
1. Keep PR #6 Ready for review and inspect any new maintainer feedback; latest exact-head CI #466 and CodeQL #251 are green.
2. Do not merge PR #6 until the project owner explicitly instructs the merge.
3. After PR #6 is merged, inspect main's post-merge CI/CodeQL, then move to Phase 4 only when main is green.
4. Keep Windows ACL verification in Phase 7; POSIX file/directory permissions are already covered.

Do not reopen or recreate Phase 0–2 work unless a verified regression is found.
## 6. Working Rules for the Next Session

- Read `CHECKPOINT.md` first, then `ROADMAP.md`, then inspect live GitHub state.
- The live repository/PR state takes precedence over this checkpoint if newer commits exist.
- Keep backend runtime Bun + TypeScript + Hono. Preserve OpenCode TLS/BoringSSL behavior and all documented gateway protocols.
- Do not weaken or remove tests to make CI green. Do not claim tests/builds/CI passed unless the actual result was inspected.
- Work only on the active phase. Phase 0–2 are merged; Phase 3 implementation head `28c1400` passed CI #466 and CodeQL #251, and both new P2 review threads are resolved. The main CodeQL screenshot confirms 0 open / 14 closed alerts (2026-11-02). PR #6 is Ready for review but not merged; don't mark Phase 3 merged or start Phase 4 until the PR is actually merged and post-merge checks pass.
- Update this checkpoint and the roadmap after meaningful work, including branch/PR state, changed paths, verification evidence, open risks, and exact next action.
- If work is interrupted, leave a committed state and an accurate checkpoint; do not claim background work.

## 7. Prompt to Resume in a New Chat

```text
Lanjutkan AlphaWay dari repository https://github.com/Yoganataa/alphaway.
Baca CHECKPOINT.md terlebih dahulu, lalu ROADMAP.md. Periksa live main, branch `feat/phase-3-plans-limits`, PR #6, Ruleset Protect main, dan hasil GitHub Actions sebelum mengubah apa pun.

Phase 0 PR #1, Phase 1 PR #3, Phase 2 PR #4, dan dokumentasi sync PR #5 sudah merged. Main Phase 3 baseline: `a28ed9baef0c698ec879d649a24726706d1eee3d`. GitHub Security screenshot 2026-11-02 dengan filter `is:open branch:main` menunjukkan 0 Open / 14 Closed alerts.

Phase 2 selesai; jangan mengulang. Backend wajib tetap Bun >=1.4.4 + TypeScript + Hono + SQLite. Jangan port backend Go dari 9router-go; gunakan 9router-go hanya sebagai referensi konsep policy.

Phase 3 implementation acceptance criteria 3.1–3.5 telah diverifikasi pada source head `28c14009142485a8bda063ebd146dab756d5d30b`; CI #466 dan PR CodeQL #251 pass pada exact head. Dua P2 review finding telah diperbaiki dan kedua inline thread sudah resolved. PR #6 Ready for review, belum merged. Jangan merge tanpa instruksi eksplisit project owner.

Implementasi mencakup migration v6, Plan CRUD, effective policy precedence, nullable per-key overrides, model allowlists, RPM/prompt TPM/concurrency, lifetime token reservations/settlement, managed-key attribution, usage windows 1h/24h/7d/30d, Plans UI, key assignment selector, Quota Tracker, dan enforcement pada OpenAI Chat, Anthropic Messages, Codex Responses serta semua legacy aliases. Tests cover exactly-once retry usage, stream completion/cancellation, upstream reader cancellation, concurrency release + exactly-once request usage across all three protocols, response lifecycle success/error/no-body/cancellation, dashboard Plan CRUD/assignment/usage window, multimodal prompt fail-closed handling under TPM/token quota, streamed tool/function-call metering, and final provider-reported usage precedence. Do not recreate these tasks.

Operational limits: RPM, prompt TPM, and in-flight concurrency state are process-local and reset on restart; lifetime token totals and usage windows persist in SQLite. Text estimates are not billing-grade. No USD spend budget, period rollover, provider quota probe, or request queue. Environment keys and unassigned managed keys remain unrestricted.

Operational boundaries: RPM/TPM/in-flight concurrency buckets are process-local and reset on restart; lifetime token totals and per-key completed-request windows persist in SQLite. Text estimation is not billing-grade. No USD spend budgets, provider quota probing, period rollover, or queueing are included. Environment-key and unassigned managed key behavior remains unrestricted/backward-compatible.

Backend remains Bun >=1.4.4 + TypeScript + Hono + SQLite. Do not port backend Go from 9router-go. Keep Windows ACL verification in Phase 7.
```
