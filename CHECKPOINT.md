# AlphaWay Work Checkpoint

> Read this file first when resuming work in a new ChatGPT/agent session. Then read `ROADMAP.md`.
>
> **Checkpoint date:** 2026-11-04 (Asia/Jakarta)  
> **Repository:** [Yoganataa/alphaway](https://github.com/Yoganataa/alphaway)  
> **Workstream in progress:** Phase 6 — 9router-go Dashboard Migration and UI/UX Parity. Phase 0–5 are merged; Phase 6 runtime-truthfulness, sidebar, Connections/Providers audit, provider probe, Command Palette/TopBar, Usage, Quota Tracker, TokenSaver, Security DLP master control, and Console Log polling recovery slices are merged and verified. Remaining work is the provider-domain product decision and a component-by-component UI parity audit against existing AlphaWay contracts.  
> **Current `main`:** `8f1c54e48abcf9da720be8a9924dd38bb13f44ad`.  
> **Phase 6 Console Log polling recovery:** PR [#28](https://github.com/Yoganataa/alphaway/pull/28) merged at `8f1c54e48abcf9da720be8a9924dd38bb13f44ad`; exact-head CI [#41790027313](https://github.com/Yoganataa/alphaway/actions/runs/41790027313) passed all four required jobs and CodeQL [#41790022117](https://github.com/Yoganataa/alphaway/actions/runs/41790022117) passed both analyzers. The dashboard now distinguishes initial load failure, empty server buffer, and filtered-empty results; polling failures retain the last successful snapshot with its timestamp and a retry action. Requests are single-flight, API error details are surfaced, and the existing admin-only routes/in-process buffer remain unchanged.
> **Phase 6 Security outbound-DLP master control:** PR [#26](https://github.com/Yoganataa/alphaway/pull/26) merged at `8962116ed81da243f98d69b7a8132f179bb86bdc`; exact-head CI [#41783742216](https://github.com/Yoganataa/alphaway/actions/runs/41783742216) passed all four required jobs, and CodeQL [#41783736352](https://github.com/Yoganataa/alphaway/actions/runs/41783736352) passed both analyzers. Security exposes the existing `dlpEnabled` SQLite-backed outbound master setting, reflects persisted status, and blocks edits until stored config loads; load/save errors are recoverable. No API route or schema was added.
> **Phase 6 TokenSaver reliability:** PR [#24](https://github.com/Yoganataa/alphaway/pull/24) merged at `0abe693974c51a61e8eaa32105f60e9d650336cc`; exact-head CI [#41782878278](https://github.com/Yoganataa/alphaway/actions/runs/41782878278) passed all four required jobs and CodeQL [#41782872712](https://github.com/Yoganataa/alphaway/actions/runs/41782872712) passed both analyzers. The client unwraps and validates `{ ok, config }`, load/save failures are recoverable, persisted inbound image/command guardrail flags now drive the existing sanitizer, and the local outbound DLP preview follows the master flag.
> **Phase 6 Quota Tracker load recovery:** PR [#22](https://github.com/Yoganataa/alphaway/pull/22) merged at `2b8add9889fe98726b712e62f11d64083f86ee5d`; exact-head CI [#41781165999](https://github.com/Yoganataa/alphaway/actions/runs/41781165999) passed all four required jobs, both CodeQL analyzers [#41781159798](https://github.com/Yoganataa/alphaway/actions/runs/41781159798) passed, and no review threads remained. The UI preserves the last successful rows, distinguishes an initial failure from an empty result, labels stale usage with the last successfully loaded window, and retries the selected window.
> **Phase 6 Usage trend-window scope:** PR [#20](https://github.com/Yoganataa/alphaway/pull/20) merged at `75dc66f7bac996201627273f9950a59568459a52`; exact-head CI [#41777048203](https://github.com/Yoganataa/alphaway/actions/runs/41777048203) and both CodeQL analyzers [#41777045751](https://github.com/Yoganataa/alphaway/actions/runs/41777045751) passed.  
> **Phase 6 Connections/Providers audit:** PR [#17](https://github.com/Yoganataa/alphaway/pull/17) merged at `d45dd643e8f73c3fc67f4fc0f7c26aa390349fc8`; the detailed capability audit is retained in `PHASE6_CONNECTIONS_PROVIDERS_AUDIT.md`. PR CI [#41773088591](https://github.com/Yoganataa/alphaway/actions/runs/41773088591) and both CodeQL analyzers [#41773085018](https://github.com/Yoganataa/alphaway/actions/runs/41773085018) passed.  
> **Phase 6 custom-provider probe correction:** PR [#18](https://github.com/Yoganataa/alphaway/pull/18) merged at `f626f8d0026acc21a6ad7d5af019a2dfa9743ba4`; required CI [#41774065042](https://github.com/Yoganataa/alphaway/actions/runs/41774065042) and both CodeQL analyzers [#41774060270](https://github.com/Yoganataa/alphaway/actions/runs/41774060270) passed.  
> **Phase 6 Command Palette/TopBar parity:** PR [#15](https://github.com/Yoganataa/alphaway/pull/15) merged at `d9d637944a663fb51744033d374f70f324acf8bd`; exact-head CI [#41774389381](https://github.com/Yoganataa/alphaway/actions/runs/41774389381) and both CodeQL analyzers [#41774385519](https://github.com/Yoganataa/alphaway/actions/runs/41774385519) passed.
> **Phase 6 navigation slice:** PR [#14](https://github.com/Yoganataa/alphaway/pull/14) merged at `61b5489bba4f05c1d45806984c9abc0c61941b82`; PR CI [#41771053548](https://github.com/Yoganataa/alphaway/actions/runs/41771053548), PR CodeQL [#41771046849](https://github.com/Yoganataa/alphaway/actions/runs/41771046849), post-merge CI [#41771264497](https://github.com/Yoganataa/alphaway/actions/runs/41771264497), and post-merge CodeQL [#41771264335](https://github.com/Yoganataa/alphaway/actions/runs/41771264335) all passed.  
> **Phase 6 first slice:** PR [#12](https://github.com/Yoganataa/alphaway/pull/12) merged at `786b7f3353a95d26f9f06f3c260ba55d5df2281b`. PR CI [#41769338132](https://github.com/Yoganataa/alphaway/actions/runs/41769338132) passed four required jobs and both CodeQL analyzers; post-merge CI [#41769488886](https://github.com/Yoganataa/alphaway/actions/runs/41769488886) passed all four required jobs; post-merge CodeQL [#41769489120](https://github.com/Yoganataa/alphaway/actions/runs/41769489120) passed both analyzers.  
> **Phase 5 Proxy Pool merge:** PR [#9](https://github.com/Yoganataa/alphaway/pull/9) merged at `cec10d3cd0e9d9fa6b33f0755b5adb8c30d67393`; PR CI [#41763299308](https://github.com/Yoganataa/alphaway/actions/runs/41763299308) and CodeQL [#41763294572](https://github.com/Yoganataa/alphaway/actions/runs/41763294572) passed. Post-merge CI [#41766711401](https://github.com/Yoganataa/alphaway/actions/runs/41766711401) and Push on main [#41766711028](https://github.com/Yoganataa/alphaway/actions/runs/41766711028) passed.  
> **Phase 5 Health/Dashboard merge:** PR [#10](https://github.com/Yoganataa/alphaway/pull/10) merged at `dc1c82afbf91ec34a57809b9003318b5b35acdd6`; PR CI [#41766842269](https://github.com/Yoganataa/alphaway/actions/runs/41766842269) and CodeQL [#41766837339](https://github.com/Yoganataa/alphaway/actions/runs/41766837339) passed. Post-merge CI [#41766990569](https://github.com/Yoganataa/alphaway/actions/runs/41766990569) passed all four required jobs; post-merge CodeQL [#41766990065](https://github.com/Yoganataa/alphaway/actions/runs/41766990065) passed both JavaScript/TypeScript and Actions analyzers.  
> **Phase 3 merge:** PR [#6](https://github.com/Yoganataa/alphaway/pull/6) merged on 2026-11-03 at commit `145230a69c0b9295a0ac8ee3966aa669196094fa`.  
> **Phase 3 post-merge CI:** [#41719318611](https://github.com/Yoganataa/alphaway/actions/runs/41719318611) passed all four mandatory jobs; the optional live-upstream drill was skipped by design.  
> **Phase 3 post-merge CodeQL:** [#41719315494](https://github.com/Yoganataa/alphaway/actions/runs/41719315494) passed both JavaScript/TypeScript and Actions analyzers on the merge commit.  
> **Phase 4 merge:** PR [#7](https://github.com/Yoganataa/alphaway/pull/7) merged on 2026-11-04 at `4494d2c3371ec723d76f8289485cdebdcb2a988d`.  
> **Phase 4 post-merge CI:** [#41743465576](https://github.com/Yoganataa/alphaway/actions/runs/41743465576) passed all four required jobs; optional live-upstream drill skipped by design.  
> **Phase 4 post-merge CodeQL:** [#41743465102](https://github.com/Yoganataa/alphaway/actions/runs/41743465102) passed both JavaScript/TypeScript and Actions analyzers on the merge commit.  
> **Repository operating model:** solo developer; Protect main ruleset requires PRs, resolved conversations, four mandatory CI jobs, and zero approvals. Do not bypass branch protection or force-push.

## 1. Current Status

**Phase 0 through Phase 5 are merged into `main`. Phase 6 remains in progress: PR #12 runtime-truthfulness, PR #14 sidebar grouping, PR #17 Connections/Providers audit, PR #18 custom-provider probe correction, PR #15 Command Palette/TopBar parity, PR #20 Usage trend-window scope, PR #22 Quota Tracker load recovery, PR #24 TokenSaver reliability, PR #26 Security outbound-DLP master control, and PR #28 Console Log polling recovery are merged. PR #18, #15, #20, #22, #24, #26, and #28 each passed all four required CI jobs and both CodeQL analyzers on their exact PR heads. Usage range controls now state that the range filters only the chart; summary and breakdown aggregates remain totals since the last reset, and the duplicate 60D/All option is removed. PR #22 preserves the last successful usage rows and their window label after a failed window switch, with browser coverage for initial failure, retry, stale-window messaging, and recovery. PR #24 corrected the TokenSaver POST response contract, added explicit load/save error and retry states, connected persisted inbound image/command guardrail flags to the existing sanitizer, and aligned the local outbound redaction preview with the DLP master flag. PR #26 exposes that same master switch in Security, reports persisted status instead of a static active badge, and covers failed initial load, retry, switch persistence, and disabled state until load succeeds. PR #28 makes Console Log polling errors visible, retains the last successful snapshot during transient failures, separates load/empty/filter states, prevents overlapping requests, and adds browser recovery coverage without changing the server buffer or route contract. Remaining Phase 6 work is the UI parity audit for implemented AlphaWay screens and the unresolved provider-node/multi-connection product decision.

- [x] Phase 0 — Repository Baseline, CI, and Distribution Integrity (Linux x86_64 CI verified).
- [x] Phase 1 — Database Migrations and Canonical Persistence (PR #3 merged).
- [x] Phase 2 — Authentication, API Keys, and Administrative Access (PR #4 merged; PR and post-merge CI/CodeQL checks passed).
- [x] Phase 3 — Plans, Limits, and Request Enforcement (PR #6 merged; post-merge CI and CodeQL passed).
- [x] Phase 4 — Persona, Jailbreak Presets, SOUL, and Security Rules (PR #7 merged; post-merge CI and CodeQL passed).
- [x] Phase 5 — Accurate Backend Feature Contracts (PRs #9 and #10 merged; required CI and PR CodeQL passed; post-merge CI passed).
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

### Completed Phase 3 implementation and verification

- PR #6 is merged into `main` at `145230a69c0b9295a0ac8ee3966aa669196094fa`.
- Post-merge CI [#41719318611](https://github.com/Yoganataa/alphaway/actions/runs/41719318611) passed Unit and protocol tests, Dashboard browser tests, UI and standalone build, and Installer/embedded dashboard smoke. Optional live upstream drill skipped by design.
- Post-merge CodeQL [#41719315494](https://github.com/Yoganataa/alphaway/actions/runs/41719315494) passed JavaScript/TypeScript and Actions analyzers.
- Do not repeat Phase 0–3 implementation unless a verified regression is found.

### Completed Phase 4 implementation and merge

- PR [#7 — Phase 4: Persona presets and live Security Rules](https://github.com/Yoganataa/alphaway/pull/7) is merged into `main` at `4494d2c3371ec723d76f8289485cdebdcb2a988d`; source head was `03e94c5a5b8f606214d91893291ad3295ec3f705`.
- Migration v7 adds normalized SQLite tables for Persona presets, include/exclude keyword rules, exact model bindings, global excludes, and Security Rules. Legacy `app_settings.security_rules` is migrated; an explicit empty array remains empty.
- Persona resolver is opt-in: global excludes override exact bindings; exact bindings outrank keywords and remain authoritative with an empty prompt; preset excludes deny the winning preset; longest keyword wins with a deterministic preset-ID tie-break.
- Persona admin API is available under `/api/persona` and compatibility alias `/api/jailbreak`; it supports preset CRUD, exact binding CRUD, global excludes, resolution, and prompt preview. Existing SOUL engine and SOUL REST API are preserved; Soul Studio is nested under Persona.
- Security Rules use normalized SQLite persistence and bounded case-insensitive literal matching (no user-controlled regex). `mask` redacts matches; `block` rejects outbound requests with a protocol-shaped HTTP 403 before provider dispatch and records zero-token usage. Rules run before and after SOUL/Persona/TokenSaver transformations. Inbound sanitization covers response text, OpenAI tool-call names/arguments, legacy function calls, JSON responses, and provider SSE segments.
- PR-head CI [#41727468557](https://github.com/Yoganataa/alphaway/actions/runs/41727468557) passed all four mandatory jobs on the final PR head; PR CodeQL [#41727027847](https://github.com/Yoganataa/alphaway/actions/runs/41727027847) passed both analyzers on code head `ccd7049` (later PR changes were documentation-only).
- Post-merge CI [#41743465576](https://github.com/Yoganataa/alphaway/actions/runs/41743465576) passed all four mandatory jobs on `4494d2c3371ec723d76f8289485cdebdcb2a988d`; optional live-upstream drill was skipped by design. Post-merge CodeQL [#41743465102](https://github.com/Yoganataa/alphaway/actions/runs/41743465102) passed JavaScript/TypeScript and Actions analyzers on the same merge commit.
- Known limitations remain: inbound custom-rule matching is segment-based and does not guarantee a match when a literal is split across separate SSE deltas; Persona URL/repository/file imports are excluded pending SSRF-safe import and file-validation design; model catalog autocomplete/batch binding is deferred; Windows ACL verification remains Phase 7.

### Completed Phase 5 implementation and merge

- PR [#9 — Phase 5: accurate proxy pool backend contracts](https://github.com/Yoganataa/alphaway/pull/9) merged at `cec10d3cd0e9d9fa6b33f0755b5adb8c30d67393`.
- Proxy Pool configuration is persisted through the existing SQLite-backed proxy configuration, with secrets encrypted at rest. The public status endpoint exposes metadata only; proxy URLs and relay tokens are not returned. Metadata-only updates by entry ID preserve the server-side encrypted URL/token.
- `/api/proxy` now exposes real persisted pool state and validates exclusive single-proxy versus pool updates. `/api/proxy/pool/test` performs bounded live probes per entry, uses the corresponding direct/proxy/relay transport, reports real latency/status, and fails with 409 for an empty pool. Relay credentials are sent in the relay auth header and are never returned in API responses.
- `ProxyPoolsView.svelte` is backend-driven: persisted entries, strategy, enable/disable, add/remove, bulk import, and actual probe results replace seeded local entries and random latency estimates. SOCKS5 is rejected because the current Bun fetch transport does not support it.
- PR [#10 — Phase 5: align dashboard with actual health contracts](https://github.com/Yoganataa/alphaway/pull/10) merged at `dc1c82afbf91ec34a57809b9003318b5b35acdd6`.
- `HealthResponse` now describes the actual `/health` payload. Health exposes measured `uptimeSeconds`; dashboard views consume `identity.gate`, the real egress description, auth policy, provider registration/configuration status, and actual endpoint fields.
- The Endpoint view no longer presents a local-only API-key toggle as a backend setting. Tunnel/daemon views distinguish a configured public URL from a verified running process; the `/health` contract does not currently expose tunnel process connectivity or daemon PID state.
- Public `/health` returns only safe TokenSaver flags and redacted upstream/gate diagnostics. It omits custom SOUL prompt content, local SOUL path, CodeBuddy JWT `sub` claims, and raw upstream error text. Upstream status, Cloudflare Ray ID, and placement metadata remain available.
- TokenSaver dashboard types and initial state match the full SQLite-backed configuration. Its client-side sandbox is explicitly labelled a local illustration with estimated tokens, not a runtime/gateway/tokenizer result.
- PR #9 CI [#41763299308](https://github.com/Yoganataa/alphaway/actions/runs/41763299308), PR CodeQL [#41763294572](https://github.com/Yoganataa/alphaway/actions/runs/41763294572), and post-merge CI [#41766711401](https://github.com/Yoganataa/alphaway/actions/runs/41766711401) passed. PR #10 CI [#41766842269](https://github.com/Yoganataa/alphaway/actions/runs/41766842269), PR CodeQL [#41766837339](https://github.com/Yoganataa/alphaway/actions/runs/41766837339), and post-merge CI [#41766990569](https://github.com/Yoganataa/alphaway/actions/runs/41766990569) passed. Optional live upstream gate drill was skipped by design. Post-merge CodeQL #41766990065 passed both JavaScript/TypeScript and Actions analyzers.
- **Deferred boundaries:** active Cloudflare process/daemon lifecycle telemetry is not exposed by `/health`; do not claim connectivity from a configured URL. Phase 6 should audit any additional dashboard views that still use presentation-only/local preview state before wiring new feature behavior. Windows ACL verification remains Phase 7.

Next actions:
1. Continue the component-by-component Phase 6 audit for screens backed by existing AlphaWay endpoints. For each candidate, verify the API contract, persistence meaning, error/loading/empty states, and browser coverage before changing UI.
2. Decide whether the product requires the full 9router-go provider-node + multiple credential-connections domain or only AlphaWay's lighter custom-provider registry. Do not invent connection entities or migrations before this boundary is explicit.
3. Keep unsupported node/connection/model, Combos, Media Providers, Skills, Terminal, and browser-managed CLI Tools as documented backend gaps until their capabilities are specified, persisted, secured, and tested.
4. Keep Windows ACL verification in Phase 7 and preserve Bun + TypeScript + Hono + native SQLite. Do not port the 9router-go Go backend.

Do not reopen or recreate Phase 0–5 work unless a verified regression is found.


### Phase 6 progress — first UI-truthfulness slice

- Reference frontend: `luqman-v1/9router-go`, pinned at `e328decc174015514f49c7046d4bde57690bedc9`. This is a UI/behavior reference only; no Go backend code is to be ported.
- PR [#12 — Phase 6: make dashboard runtime indicators truthful](https://github.com/Yoganataa/alphaway/pull/12) merged at `786b7f3353a95d26f9f06f3c260ba55d5df2281b`.
- PR [#14 — Phase 6: align sidebar navigation with 9router groups](https://github.com/Yoganataa/alphaway/pull/14) merged at `61b5489bba4f05c1d45806984c9abc0c61941b82`. Groups now follow Main, Advanced Features, and System, containing only implemented AlphaWay destinations. Backend-gap destinations (Combos, CLI Tools, Media Providers, Skills, Terminal) remain absent. PR CI [#41771053548](https://github.com/Yoganataa/alphaway/actions/runs/41771053548), PR CodeQL [#41771046849](https://github.com/Yoganataa/alphaway/actions/runs/41771046849), post-merge CI [#41771264497](https://github.com/Yoganataa/alphaway/actions/runs/41771264497), and post-merge CodeQL [#41771264335](https://github.com/Yoganataa/alphaway/actions/runs/41771264335) all passed.
- The active default dashboard view is `EndpointView.svelte` (the Overview tab aliases it); `OverviewView.svelte` is not rendered. Do not implement a feature only in the unused Overview component.
- Sidebar/TopBar now derive health, TLS profile, gate metadata, and dashboard origin from runtime state. Providers shows actual registered/configured state and reported tool/header anchors rather than static cipher/anchor claims. Endpoint cards call the gate a local retry/abuse gate, not a live upstream probe. TopBar and Command Palette copy the current `window.location.origin`.
- Profile identifies the API key as browser-session client state, not a server master key. SQLite journal/engine/size/path diagnostics use the actual database stats endpoint instead of static WAL/concurrency claims.
- E2E intercepts `/health` with a distinct TLS sentinel so a hardcoded former TLS label cannot pass; it checks live host, gate, configured anchors, and DB stats.
- PR CI [#41769338132](https://github.com/Yoganataa/alphaway/actions/runs/41769338132) passed all four required jobs and both CodeQL analyzers. Post-merge CI [#41769488886](https://github.com/Yoganataa/alphaway/actions/runs/41769488886) and CodeQL [#41769489120](https://github.com/Yoganataa/alphaway/actions/runs/41769489120) both passed.
- **Connections/Providers detailed audit completed:** [PHASE6_CONNECTIONS_PROVIDERS_AUDIT.md](PHASE6_CONNECTIONS_PROVIDERS_AUDIT.md). The 9router-go provider-node/provider-connection model has no 1:1 AlphaWay equivalent. AlphaWay currently has fixed OpenCode/CodeBuddy adapters and one custom-provider row/credential per provider ID. Provider-node CRUD, multiple credentials per node, per-connection auth/priority/failover, per-connection proxy binding, node-level limits, per-connection model discovery/capabilities/batch actions, and per-connection usage are missing.
- **Resolved probe feedback defect (PR #18):** `ProvidersView` now reports the returned upstream HTTP status (or AlphaWay request status), sends one configured/default probe model, and explicitly states that the model list was not validated. No synthetic latency or model-count claim remains; route and browser regressions passed.
- **TokenSaver reliability (PR #24):** the POST client unwraps `{ ok, config }` and validates the returned configuration; the view disables controls until initial load succeeds, exposes load retry and save errors, and reflects actual outbound DLP status. Persisted `sanitizeMarkdownImages` and `blockDangerousCommands` now control the existing inbound sanitizer, preserving explicit call overrides and system-delimiter stripping. The local preview applies secret/path masking only when outbound DLP master is enabled; browser coverage verifies that disabling the master does not mask preview secrets/paths despite enabled sub-options.
- **Quota Tracker load recovery (PR #22):** usage load failures no longer masquerade as an empty key list. The page preserves the last successful rows, provides an inline retry while retaining the toast, and keeps the recorded-usage column labelled with the last successfully loaded window until a new window load succeeds. Browser coverage forces both initial 24h and subsequent 7d failures, checks stale-window messaging, and verifies retries.
- **Usage trend-window scope corrected (PR #20):** the range selector filters only `GET /api/usage/chart?period=...`; KPI/distribution summaries remain all recorded totals since the last reset. The duplicate `All` option was removed because the current backend maps it to the same 60-day range as `60D`. Browser regression covers initial and changed chart-period requests.
- **Provider-domain decision required before backend expansion:** decide whether AlphaWay needs provider nodes plus multiple credential connections. If yes, design SQLite entities, encrypted credential lifecycle, probe state, model registry/import, egress binding, and usage attribution before exposing matching controls.
- **Remaining Phase 6 scope:** continue the component-by-component UI parity audit against existing endpoints; distinguish existing endpoint semantics from backend gaps before adding controls. PR #14 remains a UI/navigation-only change; no backend capability was added. Do not treat the local TokenSaver sandbox as full gateway execution or provider-tokenizer output.


## 6. Working Rules for the Next Session

- Read `CHECKPOINT.md` first, then `ROADMAP.md`, then inspect live GitHub state.
- Live repository/PR/workflow state takes precedence over this checkpoint when newer commits exist.
- Keep the backend Bun >=1.4.4 + TypeScript + Hono + native SQLite. Do not port the Go backend from 9router-go; use it only as a behavioral/UI reference.
- SQLite is the only canonical application-state store. Do not reintroduce flat-file JSON persistence or import paths.
- Do not weaken or delete tests to make CI green. Do not claim checks passed unless the exact workflow/job result has been inspected.
- Phase 0–5 are complete and merged. Phase 6 is in progress. PR #12 established the first runtime-truthfulness baseline; PR #22 extended Quota Tracker recovery, PR #24 corrected TokenSaver contracts and inbound guardrails, PR #26 exposed outbound DLP master control in Security, and PR #28 made Console Log polling failures recoverable. Continue from the capability matrix and do not reopen completed Phase 0–5 work without a verified regression.
- Preserve the existing SOUL behavior and TokenSaver features. Avoid rebuilding existing Phase 0–3 capabilities.
- Update this checkpoint and roadmap after meaningful work, including exact branch/PR state, changed paths, verification evidence, open risks, and next action.
- Branch protection is mandatory: use PRs, resolve review threads, and do not force-push.

## 7. Prompt to Resume in a New Chat

```text
Lanjutkan AlphaWay dari https://github.com/Yoganataa/alphaway.
Baca CHECKPOINT.md terlebih dahulu, kemudian ROADMAP.md. Periksa live main, branch, PR, Ruleset Protect main, dan workflow GitHub sebelum mengubah apa pun.

Main saat checkpoint ini: 8f1c54e48abcf9da720be8a9924dd38bb13f44ad. Phase 0–5 sudah merged. Phase 6 merged slices:
- PR #12 runtime-truthfulness.
- PR #14 sidebar grouping/navigation parity.
- PR #17 Connections/Providers capability audit.
- PR #18 custom-provider probe feedback correction.
- PR #15 Command Palette/TopBar parity.
- PR #19 checkpoint/roadmap/audit synchronization.
- PR #20 Usage trend-window scope correction.
- PR #22 Quota Tracker recoverable load failures and accurate stale-window labels.
- PR #24 TokenSaver config-response correctness, recoverable load/save errors, persisted inbound guardrails, and DLP-preview alignment.
- PR #26 Security outbound-DLP master switch, truthful status, safe loading/retry, and persisted-state browser coverage.
- PR #28 Console Log polling recovery, last-successful snapshot retention, explicit initial/empty/filter states, and E2E coverage.

Semua PR tersebut lulus empat required CI jobs dan dua CodeQL analyzers pada exact PR head masing-masing. Untuk PR #20, CI #41777048203 dan CodeQL #41777045751 lulus. PR #22 CI #41781165999 dan CodeQL #41781159798 lulus pada exact head. PR #24 CI #41782878278 dan CodeQL #41782872712 lulus pada exact head. PR #26 CI #41783742216 dan CodeQL #41783736352 lulus pada exact head. PR #28 CI #41790027313 melewati empat required jobs dan CodeQL #41790022117 lulus kedua analyzers; merge commit terbaru saat checkpoint ini `8f1c54e48abcf9da720be8a9924dd38bb13f44ad`.

UsageView: pilihan Today/24h/7D/30D/60D hanya memfilter `/api/usage/chart`; KPI dan breakdown berasal dari agregat total sejak reset melalui `/api/usage`. Jangan mengembalikan pilihan All, karena backend saat ini memetakannya ke 60 hari yang sama dengan 60D.

Baca PHASE6_CONNECTIONS_PROVIDERS_AUDIT.md sebelum mengubah Providers. Jangan mengimplementasikan provider-node/multiple-connection schema sampai keputusan produk eksplisit. Pertahankan backend Bun >=1.4.4 + TypeScript + Hono + native SQLite; 9router-go hanya referensi UI/behavior, bukan backend port. Backend gaps seperti Combos, CLI Tools, Media Providers, Skills, dan Terminal tetap tersembunyi sebagai fitur yang belum tersedia.

Next: lanjutkan audit UI-only parity pada layar AlphaWay yang memiliki endpoint nyata. Untuk setiap slice, verifikasi kontrak API/persistence, loading/empty/error states, keyboard/responsive behavior, E2E coverage, empat required CI jobs, dan CodeQL. Jangan mengulang Phase 0–5 tanpa regression terverifikasi.

Known limitations: /health menunjukkan konfigurasi public URL, bukan koneksi tunnel aktif; daemon PID/lifecycle tidak diekspos. TokenSaver browser sandbox adalah ilustrasi lokal. Inbound Security Rule matching lintas batas SSE delta belum dijamin. Persona URL/repository/file import memerlukan desain SSRF-safe. Model catalog autocomplete/batch binding ditunda. Windows ACL verification tetap Phase 7.
```
