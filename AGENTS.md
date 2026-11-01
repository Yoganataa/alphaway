# AGENTS.md: AI Agent Playbook for `AlphaWay`

This file gives AI coding agents (OpenCode, Claude Code, Cursor, Codex, Cline, Aider, etc.) exact instructions for installing, running, connecting, troubleshooting, and modifying `AlphaWay`.

---

## 1. Critical Rules (Read First)

1. **Runtime MUST be Bun 1.4.4 or newer** (`bun src/index.ts` or a standalone Bun executable).
   - Do **not** run production provider traffic under Node.js. The OpenCode free-tier path depends on a compatible TLS `ClientHello` fingerprint (BoringSSL).
   - `ALLOW_NODE=1` is not a supported runtime mode; never use it for production or live provider requests.
   - Keep the Bun version used in CI aligned with the recorded transport fingerprint baseline. Do not upgrade it without running `bun run fingerprint:check` and reviewing the result.
2. **Strict TypeScript & Architecture Parity.**
   - All server, router, and provider code is written in clean, modular TypeScript located in `src/`.
   - Built on top of Hono.js runtime engine and Svelte 5 modern dashboard.
   - Zero weakened tests: do not delete, skip, or relax assertions to make CI green. Run the current unit/integration and E2E scripts listed below.
3. **Tri-Protocol Support.**
   - AlphaWay exposes three standard client protocols:
     - OpenAI Chat (`POST /v1/chat/completions`)
     - Anthropic Claude Messages (`POST /v1/messages` & `POST /messages`)
     - OpenAI Codex Completions (`POST /response`)
   - All incoming client protocols are translated transparently to upstream models.
4. **Never hardcode model IDs or aliases.**
   - Model availability changes frequently upstream. Always query `GET http://127.0.0.1:20129/v1/models` to see active free models.
   - Custom provider models can be addressed directly or via prefix namespace (`providerId:modelName`).
5. **Upstream inference requires `stream: true`.**
   - Upstream rejects non-streaming inference requests with `403 FreeTierError`. `src/routes/chat.ts` always sends `stream: true` upstream and folds SSE back into JSON when a client requests `stream: false`. Any direct diagnostic probe (`src/cli/verify.ts`, `src/cli/gate-drill.ts`) must keep `stream: true`.

---

## 2. Installing & Running AlphaWay

### Running Directly with Bun
```bash
# Foreground developer mode
bun src/index.ts

# Background daemon mode with Cloudflare Tunnel
bun src/index.ts --tunnel -d

# Check daemon status
bun src/index.ts --status

# Stop daemon
bun src/index.ts --stop
```

### Installing a built application (Linux / macOS)
```bash
curl -fsSL https://raw.githubusercontent.com/Yoganataa/alphaway/main/install.sh | bash
```

The installer stages the current TypeScript project, installs the frozen dependency graph, verifies the TLS fingerprint, builds the dashboard and standalone executable, and then swaps the application directory. By default, application files live in `~/.alphaway/app`; configuration and SQLite state remain under `~/.alphaway`. Use `BINDIR="$(mktemp -d)" SOURCE=local NO_START=1 bash install.sh` for an isolated install-only check from a local checkout.

### Compiling Standalone Executable
```bash
# Windows x64 binary (alphaway.exe):
bun run build:bin:win

# Current Linux / macOS host (alphaway):
bun run build:bin

# Dashboard + host-platform binary:
bun run build
```

The build embeds the generated `dist/` dashboard assets into the standalone executable. Verify the artifact itself; do not assume an arbitrary compiled binary contains assets unless it was built with the repository's production build script.

### Verification Endpoints
```bash
# 1. Health & upstream gate status
curl -s http://127.0.0.1:20129/health

# 2. List all available models (OpenCode + CodeBuddy + Custom Providers)
curl -s http://127.0.0.1:20129/v1/models

# 3. Test OpenAI completion
curl -s http://127.0.0.1:20129/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-alphaway-free" \
  -d '{"model":"mimo-v2.6-flash-free","messages":[{"role":"user","content":"Hello AlphaWay"}]}'

# 4. Test Anthropic completion
curl -s http://127.0.0.1:20129/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-alphaway-free" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-7-sonnet","messages":[{"role":"user","content":"Hello"}]}'

# 5. Test Codex /response completion
curl -s http://127.0.0.1:20129/response \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-alphaway-free" \
  -d '{"model":"mimo-v2.6-flash-free","prompt":"echo hello"}'
```

---

## SQLite Migrations and Persistent State

- The canonical application database is native Bun SQLite at `~/.alphaway/alphaway.sqlite` (or the configured `ALPHAWAY_DB_PATH`). Keep WAL mode enabled for file-backed databases.
- All schema changes MUST be introduced as a new ordered migration under `src/core/migrations/`. Do not add production `CREATE TABLE` blocks to `getDatabase()` or reintroduce ad-hoc schema creation outside the migration registry.
- Migration versions are contiguous and immutable after release. Never rewrite an already-shipped migration; add a new migration instead.
- Each migration's DDL/data changes and its `schema_migrations` row execute in one SQLite transaction. A failed migration must leave the version unapplied so startup can retry safely.
- Mark destructive migrations with `destructive: true`. The runner refuses to execute them without a backup callback. Production startup supplies a `VACUUM INTO` backup under `<database-directory>/backups/` before applying destructive changes.
- SQLite is the source of truth for application settings, custom providers, TokenSaver settings, proxy configuration, request logs, and usage snapshots. Do not add JSON write mirrors or silently fall back to a second source of truth.
- Legacy JSON files are read only by `src/core/legacy-imports.ts`. Imports are transactional, checksum-ledgered in `legacy_imports`, preserve existing SQLite values, and leave source files untouched. Never delete source files as part of import.
- Add tests for fresh DBs, pre-migration DB adoption, repeated startup, failure/rollback/retry, SQLite precedence, and import idempotency whenever persistent schemas or formats change.
- Caller API-key hashing and recoverable encryption/key management for upstream credentials are separate security work. Do not mistake restrictive filesystem permissions for a completed credential-security design.

## 3. Connecting Clients & Coding Assistants

Use these connection details in Cursor, Continue.dev, Cline, Roo-Code, Claude Code, or OpenAI/Anthropic SDKs:

- **OpenAI Base URL:** `http://127.0.0.1:20129/v1`
- **Anthropic Base URL:** `http://127.0.0.1:20129`
- **Default API Key:** `sk-alphaway-free` (or any `sk-...` string matching `API_KEY` in `.env`)
- **Web Dashboard:** `http://127.0.0.1:20129/`

### Web Dashboard (Svelte 5 + Tailwind 4)
- **Overview & Endpoints**: Live status, BoringSSL TLS parity badge, integration code snippets.
- **Interactive Playground**: Multi-model streaming tester with live reasoning accordion.
- **Usage & Token Analytics (9Router-Go Architecture)**: Native SVG stacked trends, 5 KPI cards, 3D breakdown tables (by Model, Provider, Protocol), GitHub-style 12-week activity heatmap, and modal payload inspect drawer.
- **Providers & Custom Engines**: Manage OpenCode, CodeBuddy (OAuth), and 3rd-party custom providers.
- **TokenSaver & DLP Guard**: Manage RTK deduplication, Caveman mode, ADHD mode, and DLP secret masking.
- **Egress Proxy**: Multi-proxy rotation pool, health tracker, and latency tester.
- **Tunnel & Daemon**: Cloudflare Named Tunnel controls and background service management.

---

## 4. Troubleshooting Guide for Agents

| Symptom | Root Cause | Action to Take |
|---|---|---|
| `node src/index.ts` exits with `AlphaWay requires Bun` | Server was launched with Node.js instead of Bun | Launch with `bun src/index.ts` (or run `./alphaway.exe` standalone binary). |
| `HTTP 403` whose message names `abusive traffic` or `Detect Abuse Traffic` | The gateway flagged the egress IP. Unrelated to account. | Do **not** edit headers or retry repeatedly. Switch egress proxy in dashboard or `.env`, or wait for IP cooldown. |
| `src/cli/verify.ts` exits `1` with `TLS fingerprint drift detected` | Runtime's TLS `ClientHello` does not match baseline | Run `bun src/core/transport-fingerprint.ts --check` and ensure service runs under Bun 1.4+. |
| `HTTP 429` in `verify.ts` | Upstream model/IP capacity throttled | Switch model ID from `GET /v1/models` or route via Custom Provider. |
| `HTTP 404 Model '<id>' has been retired upstream` | Client requested a deprecated model | Fetch `GET /v1/models` and update client to an active model ID. |

---

## 5. Repository Architecture & Codebase Guide

| Path | Responsibility |
|---|---|
| `src/index.ts` | Application bootstrap, Bun runtime guard, banner, background model discovery, and updater loop. |
| `src/app.ts` | Hono.js application instance, CORS middleware, error handling, and route mounting. |
| `src/providers/opencode.ts` | Complete OpenCode provider logic: anti-burst queue, reactive retry, and dual-lane routing. |
| `src/providers/codebuddy.ts` | CodeBuddy (Tencent Hunyuan / WorkBuddy 5.8.4) provider implementation with OAuth lifecycle. |
| `src/core/custom-providers.ts`| 3rd-Party Custom Providers engine (OpenAI & Anthropic formats, bearer auth). |
| `src/core/protocol-translator.ts` | Bidirectional translation between OpenAI, Anthropic Claude, and Codex Responses formats. |
| `src/core/security-guard.ts` | DLP secret masking, Anti-Infostealer defense (browser cookies, DPAPI, keychain), and prompt injection guard. |
| `src/core/usage-tracker.ts` | Realtime usage accounting, native SVG chart bucket generation, activity heatmap, and persistence. |
| `src/routes/` | Modular route handlers: `chat.ts`, `messages.ts`, `response.ts`, `usage.ts`, `custom-providers.ts`, `health.ts`, `models.ts`, `dashboard.ts`, `proxy.ts`, `tokensaver.ts`. |
| `src/client/` | Svelte 5 + Tailwind 4 Modern Web Dashboard with 9Router-Go analytics architecture. |
| `test/` | Bun unit/integration tests plus Playwright browser E2E tests. |

### Mandatory verification before committing changes
```bash
bun install --frozen-lockfile
bun run test:unit
bun run fingerprint:check
bun run test:e2e
bun run build
bash -n install.sh
```

The live gate drill (`bun run drill`) sends requests to the real upstream service and may consume upstream allowance or be affected by IP throttling. It is intentionally excluded from normal CI and should be run manually when a live upstream verdict is needed.

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read these installed skill files directly (use these paths even if a same-named global skill exists):
- Core filter, always on: `antislop`: `.agents/skills/antislop/SKILL.md`
- UI / visual: `antislop-ui`: `.agents/skills/antislop-ui/SKILL.md`
- Copy & text: `antislop-copywriting`: `.agents/skills/antislop-copywriting/SKILL.md`
- People: `antislop-human`: `.agents/skills/antislop-human/SKILL.md`
- Mobile / responsive: `antislop-layoutmobile`: `.agents/skills/antislop-layoutmobile/SKILL.md`
- Code comments: `antislop-code`: `.agents/skills/antislop-code/SKILL.md`
Before starting, follow the core's "Two Usage Modes" section in strict order: explicit session instruction first, then global preference, then ask. A session instruction always wins. For a resolved mode, say `antislop active: <mode> (session override).` or `antislop active: <mode> (global preference).` once before presenting findings or making edits, using the actual mode and source. Acknowledging the user's request without naming the source does not replace this notice.
Only an explicit choice of antislop during or after selects a session mode. A request to review, audit, or avoid file edits does not select a mode; read the global preference in that case. Another skill's mode does not select antislop's mode.
If the mode is unresolved, ask during/after and end the response; wait for the answer before any UI review, planning, or concept. For read-only tasks, put the active-mode notice only at the start of the final answer, never in progress messages. For editing tasks, announce before the first edit and omit it from the final answer.
To update antislop later: `npx antislop-ai --update`, or run `npx antislop-ai` and pick Overwrite them.
<!-- antislop:end -->
