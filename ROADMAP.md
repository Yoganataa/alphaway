# AlphaWay Roadmap

> Canonical engineering roadmap for AlphaWay. Update this file when scope, sequencing, or acceptance criteria change.
>
> **Last updated:** 2026-11-01  
> **Planning baseline:** `main` at `9805d2335293539424fd66af3c047b493edad630`  
> **Current state:** Phase 0 is merged into `main` at `9805d2335293539424fd66af3c047b493edad630`. Phase 1 is complete for all existing persistence-backed features and passed GitHub Actions run `41328662898` on current code HEAD `cc6eaf7bfa42993300757725cb0ec728fda48bbd`. PR #3 is open, non-draft, and mergeable. Plans and Persona/Jailbreak persistence are introduced with their domain features in Phases 3 and 4.

## 1. Product Direction

AlphaWay is a Bun + TypeScript + Hono AI gateway. The target is to retain AlphaWay's existing gateway and provider capabilities while bringing its dashboard to **the same UI/UX standard and visual behavior as [9router-go](https://github.com/successtar/9router-go)**.

The 9router-go repository is the frontend design and interaction reference. It is **not** a backend migration target: do not port its Go backend or reorganize AlphaWay into a Go-style project structure. Build and maintain the application backend in idiomatic TypeScript for Bun/Hono.

### Product outcomes

1. Preserve and stabilize AlphaWay's existing gateway capabilities.
2. Deliver a dashboard with 9router-go visual and interaction parity, adapted to AlphaWay's own feature set.
3. Complete backend contracts for every dashboard control. No mock-only controls, random metrics, or decorative actions presented as functional features.
4. Add first-class **Plans** and **Persona / Jailbreak** management.
5. Make authentication, persistence, quotas, usage accounting, installation, CI, and release behavior reliable.
6. Keep existing client protocol compatibility and provider-specific transport behavior.

## 2. Non-negotiable Engineering Decisions

- **Runtime:** Bun is the supported production runtime. Do not switch live provider traffic to Node.js; preserve the OpenCode TLS/BoringSSL fingerprint behavior.
- **Backend:** TypeScript + Hono. Keep the current idiomatic `src/` organization. Do not introduce a generic Go-style `controllers/`, `services/`, `repositories/`, `interfaces/` hierarchy everywhere.
- **Frontend:** Svelte 5 + Tailwind CSS 4. The replacement dashboard belongs in `web/` and should follow the 9router-go frontend design system and interaction patterns.
- **Scope of upstream reuse:** Reuse/copy the frontend only after inspecting and pinning the upstream revision. Do not copy the Go server. Preserve upstream license and attribution notices.
- **Existing gateway contracts:** Preserve OpenAI Chat Completions, Anthropic Messages, and Codex Responses behavior. Changes to protocol translation, provider handshake, request streaming, or TLS fingerprinting require regression tests.
- **Persistence:** SQLite is the canonical application store. JSON files may be supported as legacy import sources, not competing live sources of truth.
- **Security:** Dashboard administration authentication must be separate from caller API-key authentication. Host/Origin/CSRF checks are defense-in-depth, not user authentication.
- **Data integrity:** Never fabricate provider quota, RPM/TPM, usage, latency, or token/cost data. Clearly distinguish upstream-reported, locally measured, estimated, and unavailable values.
- **Testing:** Do not weaken or delete tests to make CI green. Record the exact command and result for every verification claim.
- **Dependencies:** Prefer secure, supported versions, but do not blindly upgrade every dependency without checking compatibility, runtime support, and lockfile reproducibility.

## 3. Target Dashboard Information Architecture

The target sidebar contains these 12 destinations:

| Group | Page | Responsibility |
|---|---|---|
| Main | Endpoint & Key | Local/public endpoint, API key lifecycle, client integration snippets, Cloudflare Tunnel status |
| Main | Providers | OpenCode, CodeBuddy, and custom provider configuration and status |
| Main | Playground | Multi-model request testing, streaming output, protocol selection |
| Main | Usage | Request history, usage analytics, model/provider/protocol breakdown |
| Main | Quota Tracker | Actual upstream limits and reset data when available; otherwise explicit unavailable status |
| Main | Token Saver | RTK, deduplication, Caveman/ADHD modes, compression test bench |
| System | Security | DLP, secret masking, anti-infostealer protections, persistent guard rules and rule testing |
| System | Proxy Pools | Real proxy pool CRUD, health checks, and routing strategy controls |
| System | Persona | Model Personas, Jailbreak/Persona presets, and SOUL Studio |
| System | Plans | Plan definitions, budgets, limits, assignments, and enforcement |
| System | Console Log | Live gateway logs, filtering, copy, and export |
| System | Settings | Runtime, daemon, database, diagnostics, and application settings |

### Placement rules

- Cloudflare Named/Quick Tunnel controls belong under **Endpoint & Key**.
- SOUL Studio remains available inside **Persona**; it does not need a separate top-level sidebar item.
- Daemon lifecycle, SQLite maintenance, runtime diagnostics, and application-wide preferences belong under **Settings**.
- Preserve every meaningful AlphaWay capability even when 9router-go has no exact page for it. Extend the appropriate AlphaWay page rather than removing the capability.
- Remove Go-only navigation/features that do not map to AlphaWay. Do not expose dead menu items.

## 4. Architecture Direction

Keep the current architecture and extract only where a real boundary is needed:

```text
src/
  app.ts
  index.ts
  cli/
  core/
    database.ts
    migrations/
    protocol-translator.ts
    identity.ts
    transport-fingerprint.ts
    ...
  providers/
    opencode.ts
    codebuddy.ts
  features/
    tokensaver.ts
    soul-engine.ts
    plans/
    personas/
    security/
  routes/
    ...
  types/
web/
  ... Svelte 5 dashboard copied/adapted from the pinned 9router-go frontend
test/
  ...
```

This is a direction, not a requirement to move every existing file. Keep small, cohesive features as single TypeScript modules. Use feature folders for domains with meaningful state, policies, or multiple files, such as Plans and Personas.

Routes should remain thin HTTP adapters. For complex gateway behavior, extract focused use-case functions from the large chat dispatcher without changing protocol semantics. Do not perform a broad rewrite of working provider implementations.

## 5. Phased Delivery Plan

The phases are sequential. A phase is not complete until its acceptance criteria are met and the checkpoint records evidence. Work should be delivered in focused commits/PRs.

### Phase 0 — Repository Baseline, CI, and Distribution Integrity

**Status:** Complete (Linux x86_64 CI verified)  
**Priority:** P0 — unblock all further work

- [x] Inspect the latest baseline CI run on `main`; the Bun test step and Node compatibility job failed because their commands were stale. A local clean install/test/build was not available in this environment.
- [x] Repair `.github/workflows/ci.yml`: use the actual TypeScript test paths and package scripts.
- [x] Remove the Node compatibility job; Node is not a supported live runtime and the referenced `test:node` script does not exist.
- [x] Define separate CI jobs for unit/integration tests, dashboard/binary build, installer/embedded-dashboard smoke tests, browser E2E tests, and the transport fingerprint check. Keep the live upstream drill manual.
- [x] Set the supported Bun floor to `>=1.4.4` and pin CI to Bun 1.4.4; its ClientHello matches the recorded 17-cipher / 12-extension baseline.
- [x] Align `build`, `build:ui`, `build:bin`, and `build:bin:win`; the host build emits `alphaway` and the explicit Windows x64 target emits `alphaway.exe`.
- [x] Verify the compiled binary serves embedded dashboard assets without an external `dist/` directory. CI removes the physical `app/dist/` directory after build, then verifies `/health`, dashboard HTML, and the generated JavaScript asset from the standalone executable.
- [x] Rewrite `install.sh` for the current TypeScript source archive, frozen dependency install, fingerprint validation, embedded-asset build, staged replacement, persistent state/config, and service registration. CI verifies fresh install, upgrade preservation of `.env` and SQLite data, detached background startup, and HTTP health.
- [x] Reconcile `README.md`, `AGENTS.md`, and `.env.example` with the current Bun build, installer, supported runtime, and test commands.
- [x] Record the observed failing `main` CI run and disclose that local Bun/test/build/installer commands could not be executed in this environment.

**Acceptance criteria**

- [x] CI runs valid commands against the current repository and fails on real regressions.
- [x] A clean Linux x86_64 checkout can install dependencies, run checks, build the UI, and produce the documented standalone executable.
- [x] The installer installs/upgrades the current application layout safely while preserving `.env` and SQLite state.
- [x] The executable serves its dashboard and built JS asset without an external `dist/` directory.
- [x] No documentation claims that tests or packaging pass without recorded evidence.

**Verification evidence (2026-11-01)**

GitHub Actions [run `41325262197`](https://github.com/Yoganataa/alphaway/actions/runs/41325262197) completed successfully on Bun 1.4.4 after the legacy-service retirement fix:
- Unit and protocol tests: **271 passed, 0 failed** across 25 files.
- Transport fingerprint: Bun 1.4.4 matched the 17-cipher / 12-extension baseline.
- Dashboard and standalone binary build: passed.
- Installer smoke: passed fresh install, upgrade preservation of `.env` and SQLite row, detached background startup, and embedded dashboard/JS asset serving after physical `dist/` removal.
- Legacy service retirement: `opencode-bridge.service` and `opencode-free-bridge.service` are disabled and local unit definitions are moved out of systemd's active search path before replacing the app; regression assertion passed. The prior P1 Codex review thread is resolved.
- Browser E2E: **8 passed, 0 failed**.
- Live upstream gate drill: intentionally skipped; it is an explicit manual workflow action, not a deterministic CI check.

**Platform boundary:** CI verified the Linux x86_64 path. The launchd/macOS service branch and Windows x64 cross-compiled binary are not exercised by this workflow yet; add platform-specific release checks before claiming those targets are verified.

### Phase 1 — Database Migrations and Canonical Persistence

**Status:** Implementation complete for existing persistence-backed features; CI verified on Bun 1.4.4; PR #3 ready for review.  
**Priority:** P1

- [x] Introduce a versioned SQLite migration mechanism with ordered migrations, a `schema_migrations` ledger, registry validation, and transactional DDL/history writes.
- [x] Add tests for fresh databases, adoption of pre-migration databases without data loss, repeated startup, rollback after a failed migration, retry, invalid registry versions, and destructive-migration backup guards.
- [x] Make SQLite canonical for custom providers, TokenSaver configuration, usage snapshots/events, and proxy pool configuration. Proxy health remains a credential-free runtime cache.
- [x] Convert legacy custom-provider, usage, TokenSaver, and proxy JSON files into one-time imports tracked by checksums and `legacy_imports`; retain source files as backups.
- [x] Preserve `ALPHAWAY_HOME` as a legacy JSON import location without changing the existing SQLite database root; add regression coverage to prevent apparent database loss on upgrade.
- [x] Persist each usage request event and its aggregate snapshot atomically in one SQLite transaction.
- [x] Add a pre-destructive-migration backup hook using SQLite `VACUUM INTO` and owner-only backup permissions.
- [x] Retain API key configuration in SQLite `app_settings` (credential-verification and secret-at-rest hardening remain Phase 2 work).
- [x] Persist custom DLP/security rule configuration in SQLite `app_settings` and connect Security page CRUD to the backend. Runtime enforcement of custom rules remains a separate Security phase.
- [x] Add an end-to-end file-backed backup and restore test: create a `VACUUM INTO` backup, simulate destructive data change, restore the saved snapshot, and preserve the pre-restore database copy.
- [x] Keep all existing application settings and API key records in SQLite `app_settings` as the canonical store.
- [ ] Credential storage hardening is intentionally Phase 2: caller API keys must be verifiable without storing raw secrets; upstream credentials that must be replayed need authenticated encryption and a documented key-management strategy.

**Scope boundary:** AlphaWay does not yet implement Plans or Persona/Jailbreak domain models. Their schemas and persistence are intentionally added alongside their feature implementations in Phases 3 and 4 rather than creating unused tables in Phase 1. Existing SOUL configuration is persisted with the TokenSaver settings.
- [x] Keep native Bun SQLite and WAL behavior; do not introduce a second database engine without a concrete requirement.

**Acceptance criteria**

- [x] A fresh database and an existing pre-migration database converge to the initial schema without losing existing rows.
- [x] Migrations are safe to rerun; failed DDL/history transactions roll back together.
- [x] All existing persistence-backed features use SQLite as the canonical source, including API key records and Security rule configuration. Plans and Persona/Jailbreak are not yet implemented and will add persistence with their own domain models.
- [x] File-backed backup/restore and recovery behavior is verified end to end, including integrity validation and preservation of the pre-restore database.

### Phase 2 — Authentication, API Keys, and Administrative Access

**Status:** Not started  
**Priority:** P1 — security-critical

- [ ] Separate gateway caller authentication from dashboard/admin authentication.
- [ ] Implement a real authenticated administrative session/bootstrap mechanism. Origin, Host, and CSRF checks remain additional protections, not the identity mechanism.
- [ ] Protect all administrative read/write routes consistently, including settings, keys, providers, proxy pools, security, plans, personas, usage exports, logs, and maintenance operations.
- [ ] Store caller API keys as strong hashes with a non-secret lookup prefix; show the raw key only at issuance time.
- [ ] Add key lifecycle operations: create, list metadata, revoke, rotate, label, status, and last-used metadata.
- [ ] Replace predictable `Math.random()` key generation and timestamp-only IDs with cryptographically secure generation and collision-resistant identifiers.
- [ ] Add per-key metadata and policy/plan assignment without coupling dashboard sessions to inference credentials.
- [ ] Add negative tests for missing, malformed, revoked, wrong-scope, and unauthorized credentials.
- [ ] Ensure administrative secrets and API key material never appear in logs, error messages, or analytics payloads.

**Acceptance criteria**

- Newly issued keys authenticate gateway requests; revoked keys immediately stop working.
- The dashboard cannot perform admin operations without an authenticated admin session.
- Existing documented gateway protocols continue to accept their expected authorization headers.
- Secrets are not retrievable from persisted records or logs.

### Phase 3 — Plans, Limits, and Request Enforcement

**Status:** Not started  
**Priority:** P1

- [ ] Define a typed plan model with lifecycle state, name, description, and configurable limits.
- [ ] Support limits for request count, tokens, RPM, TPM, concurrency, allowed models/providers, and time windows where meaningful.
- [ ] Support hard limits and configurable warning thresholds.
- [ ] Assign plans to API keys; define deterministic precedence between plan defaults and per-key overrides.
- [ ] Enforce policy consistently across OpenAI Chat, Anthropic Messages, and Codex Responses before forwarding upstream.
- [ ] Implement atomic quota reservation and settlement so concurrent requests cannot overspend limits.
- [ ] Account correctly for streaming success, upstream errors, cancellations, client disconnects, and unknown usage.
- [ ] Provide plan CRUD, assignment, usage visibility, and reset information through typed admin APIs.
- [ ] Introduce a model/provider pricing registry only if monetary limits are required. Mark costs as estimated when provider pricing or actual usage is unavailable; never treat TokenSaver savings estimates as authoritative billing data.

**Acceptance criteria**

- A request is allowed or rejected according to the same policy regardless of incoming protocol.
- Concurrent requests cannot bypass a hard quota due to race conditions.
- Token usage is settled from actual upstream usage when present; estimates are explicitly identified.
- All plan limit decisions have deterministic, tested outcomes.

### Phase 4 — Persona, Jailbreak Presets, SOUL, and Security Rules

**Status:** Not started  
**Priority:** P1

- [ ] Implement persistent Persona preset CRUD and a built-in preset catalog.
- [ ] Support explicit activation, model/provider or key scope, exclusions, and deterministic precedence.
- [ ] Add the Jailbreak/Persona authoring experience as controlled prompt/persona configuration. It must not disable AlphaWay's DLP, secret masking, or other gateway security controls.
- [ ] Preserve the existing SOUL.md engine, built-in presets, local/global discovery, and SOUL Studio editor/preview.
- [ ] Provide one canonical prompt-transformation pipeline so SOUL, Persona, TokenSaver, and security processing do not inject or rewrite the same request unpredictably.
- [ ] Add a preview/explain mode that shows which transformations and presets will apply without forwarding a request upstream.
- [ ] Use one backend DLP/keyword rule engine for dashboard sandbox testing and live gateway traffic; custom-rule persistence is completed in Phase 1.
- [ ] If remote persona/Markdown import is added, enforce SSRF protections, redirect revalidation, private/link-local IP blocking, response-size limits, and timeouts. Prefer local Markdown import for the first implementation.

**Acceptance criteria**

- Persona and security rules survive restarts and are applied consistently to all supported protocols.
- Preview and live execution use the same transformation logic.
- Explicit opt-out/exclusion rules work and precedence is deterministic.
- SOUL functionality is preserved rather than replaced.

### Phase 5 — Accurate Backend Feature Contracts

**Status:** Not started  
**Priority:** P1

- [ ] Connect Proxy Pools UI operations to the real pool persistence and routing APIs; remove hardcoded sample pools and local-only CRUD.
- [ ] Remove fabricated/random latency values. Return actual probe results or an explicit unavailable/error state.
- [ ] Replace hardcoded/random Quota Tracker values with provider-specific quota adapters. Display unavailable when the upstream exposes no supported quota data.
- [ ] Consolidate usage event persistence in SQLite and remove inconsistent JSON summary/history mirrors after migration.
- [ ] Correct streaming token accounting. Do not substitute fixed completion-token counts for unknown usage.
- [ ] Label estimated metrics and savings separately from actual request usage and provider-reported cost.
- [ ] Route Security sandbox testing and live gateway requests through the same backend DLP implementation; do not maintain divergent frontend-only rule logic.
- [ ] Add typed frontend API contracts and consistent error responses for every dashboard action.
- [ ] Verify Console Log streaming, filtering, and export against actual server events.
- [ ] Verify Cloudflare Tunnel, daemon lifecycle, provider OAuth, and custom provider management end-to-end.

**Acceptance criteria**

- Every visible dashboard control has a real backend operation or is clearly disabled as unsupported.
- No production metric is generated with `Math.random()` or fabricated constants.
- Usage and quota screens distinguish actual, estimated, and unavailable values.
- Proxy, security, provider, tunnel, and daemon operations persist and survive restart.

### Phase 6 — 9router-go Dashboard Migration and UI/UX Parity

**Status:** Not started  
**Priority:** P1 — deliver after backend contracts are defined

- [ ] Inspect the current 9router-go frontend and record the exact upstream commit/revision used as the visual reference.
- [ ] Copy/adapt the frontend into AlphaWay's `web/` directory. Copy the frontend only; do not port the Go backend.
- [ ] Preserve the upstream visual language, layout, navigation behavior, typography, spacing, component patterns, responsive behavior, loading states, empty states, and interaction details.
- [ ] Replace Go-specific API calls with typed AlphaWay Hono API adapters. Do not blindly reuse backend routes or payload assumptions.
- [ ] Implement the 12-page AlphaWay navigation defined in Section 3.
- [ ] Integrate AlphaWay-only features into the appropriate pages: CodeBuddy/OpenCode/custom providers, tri-protocol Playground, Cloudflare Tunnel, TokenSaver, SOUL Studio, Plans, and Persona/Jailbreak.
- [ ] Remove Go-only pages and controls that have no AlphaWay equivalent.
- [ ] Keep the existing `src/client/` dashboard until the replacement is complete and verified; remove it only after the new dashboard is served by default and E2E checks pass.
- [ ] Update Vite build output and `src/routes/dashboard.ts` together so production serves one deterministic dashboard artifact and cannot silently fall back to stale assets.
- [ ] Preserve and update `THIRD_PARTY_NOTICES.md` with the exact upstream license/attribution required by copied frontend code.
- [ ] Add Playwright visual/interaction coverage for navigation, key workflows, responsive layouts, loading/error states, and critical forms.

**Acceptance criteria**

- Dashboard visual and interaction behavior matches the pinned 9router-go frontend reference, except for deliberate AlphaWay-specific information architecture and capabilities.
- Every AlphaWay feature remains accessible in the new UI.
- No Go backend dependency is introduced.
- Production serves the new dashboard deterministically; no legacy UI appears due to stale build output.
- E2E tests exercise real AlphaWay APIs rather than mock-only success paths for critical features.

### Phase 7 — Hardening, Documentation, and Release

**Status:** Not started  
**Priority:** P2

- [ ] Run the complete test suite, type checks, UI build, binary build, fingerprint check, and deterministic offline drills.
- [ ] Run cross-platform install/upgrade smoke tests for the supported targets.
- [ ] Run security review for admin auth, key storage, SSRF, proxy egress, DLP, file import, and log redaction.
- [ ] Validate backward compatibility for the three client protocols and all preserved provider handshakes.
- [ ] Update README, AGENTS, CHANGELOG, environment examples, installer docs, and THIRD_PARTY_NOTICES to match the shipped implementation.
- [ ] Document backup/restore, admin bootstrap, API key lifecycle, Plans, Persona, quota semantics, and known provider limitations.
- [ ] Prepare a release checklist and a rollback path.

**Acceptance criteria**

- All required checks pass on a clean checkout and on the release artifact.
- Release documentation matches actual behavior.
- Known limitations are explicit; no feature is described as complete when it is only a UI placeholder.
- The release can be installed, upgraded, configured, used, and recovered using documented steps.

## 6. Cross-Cutting Definition of Done

A feature is not complete merely because its UI exists. Every feature must satisfy the relevant items below:

- Typed request/response contracts and validation are present.
- Authentication and authorization are correct for the route.
- State persists in SQLite and survives restart.
- Failure states are explicit and do not leak secrets.
- Unit/integration tests cover normal, invalid, concurrent, and failure paths where applicable.
- E2E tests cover the critical user workflow.
- Metrics are sourced and labeled correctly.
- Documentation and `CHECKPOINT.md` reflect the implementation and verification evidence.

## 7. Known Audit Findings at Planning Baseline

These are audit findings from the baseline repository review; re-check the relevant code before implementing because the repository may change.

| Area | Finding to address |
|---|---|
| Authentication | Gateway middleware uses an environment key, while dashboard-issued keys are stored separately; issued keys are not wired into gateway authentication. |
| Admin access | Existing host/origin/CSRF guards do not provide authenticated administrator identity. |
| API key storage | Key records are JSON in `app_settings`, contain plaintext secrets, and use predictable ID/key generation. |
| Database | SQLite tables are initialized with `CREATE TABLE IF NOT EXISTS`; no versioned migration mechanism was found. |
| Chat handler | `src/routes/chat.ts` is a large multi-protocol dispatcher combining several responsibilities. Refactor narrowly and preserve semantics. |
| Usage | JSON mirrors coexist with SQLite; some streaming paths use fixed completion-token values. |
| Quota Tracker | Current UI contains hardcoded provider limits and randomized RPM/TPM values. |
| Proxy Pools | Backend pool engine exists, but the UI uses sample/local state and does not fully persist pool configuration. |
| Security UI | Custom rules are local UI state; live backend and sandbox behavior need one persisted rule source. |
| Dashboard | Current dashboard is in `src/client/`; it is not yet the intended 9router-go frontend replacement. |
| CI | Current workflow references stale test/script paths and an absent Node test script. |
| Installer/build | `install.sh` references legacy file paths; UI asset serving and binary packaging need a verified single contract. |
| Documentation | README/AGENTS contain claims (including test count/pass status) that were not independently verified during the planning audit. |

## 8. Change Control

- Keep this roadmap as the single source of truth for planned scope and sequencing.
- When scope or implementation order changes, update this file and explain the reason in the active PR.
- Mark a task complete only after its acceptance criteria have evidence.
- Update `CHECKPOINT.md` after every coherent implementation block, at every phase boundary, and before ending a work session.
- Do not reset the checkpoint just because a new chat session starts; reconcile it with the current GitHub branch/commit first.
