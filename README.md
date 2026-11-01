# AlphaWay `v0.0.1`

> **The High-Performance Universal AI Gateway & Security Router**  
> Tri-Protocol Routing (OpenAI · Anthropic Claude · OpenAI Codex) · Multi-Provider Backend (OpenCode Free-Tier · CodeBuddy International · 3rd-Party Custom Providers) · TokenSaver & DLP Infostealer Defense · 9Router-Go Mature Analytics · Bun + Svelte 5 Single Binary.

---

## 🌟 Core Architecture & Key Features

- **Tri-Protocol AI Gateway**:
  - **OpenAI Compatible** (`/v1/chat/completions` & `/v1/models`): Fully compatible with Cursor, Continue.dev, Cline, Roo-Code, Aider, and the standard OpenAI SDK.
  - **Anthropic Claude Protocol** (`/v1/messages` & `/messages`): Native support for Anthropic Claude request/response formats (with `x-api-key` and `anthropic-version: 2023-06-01` headers).
  - **OpenAI Codex Responses** (`/response`): Native support for legacy Codex completion format for code-completion tools.
- **Multi-Provider Backend Engine**:
  - **OpenCode Free-Tier Provider** (`src/providers/opencode.ts`): Adaptive handshake, AST Effect tool schemas, session LRU cache, and BoringSSL TLS parity.
  - **CodeBuddy International** (`src/providers/codebuddy.ts`): WorkBuddy 5.8.4 identity channel, W3C trace headers, RFC 9562 UUIDv7, and automatic OAuth login flow.
  - **3rd-Party Custom Providers** (`src/core/custom-providers.ts`): Connect any commercial or self-hosted provider (DeepSeek, Groq, OpenRouter, Together AI, Ollama, vLLM) using OpenAI or Anthropic formats.
- **TokenSaver & DLP Infostealer Defense**:
  - **DLP Secret Masking**: Automatically detects and masks high-entropy API keys, database connection strings, and private keys before forwarding upstream.
  - **Anti-Infostealer Defense**: Blocks prompt-injection attacks targeting browser session cookies, local database credentials (Chrome/Firefox/Edge `Login Data`), DPAPI master keys, and operating system keychains.
  - **RTK (Response Token Killer)**: Smart truncation and deduplication of repetitive lines, compiler diagnostics, and large tool outputs.
  - **Caveman & ADHD Personas**: Concise, high-density responses with *Auto-Clarity Guard* that automatically disengages upon detecting sensitive or dangerous commands.
- **SOUL.md Engine & Soul Studio (SoulSpec Standard)**:
  - **Persistent Personality Injection**: Anchor the AI model to a unified character sheet (`SOUL.md`), eradicating corporate fluff, sycophancy, and filler phrases across all tri-protocol endpoints.
  - **Cascading Auto-Discovery**: Automatic hierarchical resolution: Local Project (`./SOUL.md`) → Global Default (`~/.alphaway/SOUL.md`) → Built-in Presets (`Atlas`, `Minimalist`, `Socratic`).
  - **Interactive Soul Studio**: Dashboard markdown editor with live token estimation and interactive prompt framing preview sandbox.
- **Comprehensive 9Router-Go UI/UX Architecture (Svelte 5 + Tailwind CSS v4)**:
  - **Endpoint View (`/dashboard/endpoint`)**: Origin endpoint (`http://127.0.0.1:20129/v1`), Cloudflare Named & Quick Tunnel status, API key gate switch, API key table management (issue, reveal, copy, revoke), and multi-client snippet tabs (Cursor, Continue, Claude Code, Roo-Code, Python, Node, cURL).
  - **Providers & Custom Engines (`/dashboard/providers`)**: Dedicated control panels for OpenCode Free-Tier (8 models, dual-lane, BoringSSL 17 ciphers), CodeBuddy International (WorkBuddy 5.8.4 OAuth device login), and 3rd-Party Custom Providers (DeepSeek, Groq, Ollama, etc.).
  - **Usage & Token Analytics (`/dashboard/usage`)**: 5 KPI summary cards, pure SVG stacked area trend charts (24h, 7d, 30d), 3D breakdown table, 12-week GitHub-style heatmap, and request audit log table with clickable **Inspect Drawer Modal**.
  - **Quota & Rate Limit Tracker (`/dashboard/quota`)**: Real-time RPM/TPM capacity gauges, color-coded capacity progress bars, rolling session reset countdowns, and 30-second auto-refresh timer.
  - **TokenSaver Optimization (`/dashboard/token-saver`)**: RTK compression engine (Minimal, Standard, Aggressive), category filters, Caveman and ADHD prompt efficiency modes, and interactive real-time compression test bench.
  - **Security Armor & DLP Guard (`/dashboard/security`)**: Enterprise Data Loss Prevention secret masking, Anti-Infostealer prompt defense (browser cookies, DPAPI vault, macOS Keychain), keyword guardrails, and live sandbox evaluation.
  - **Egress Proxy Pools (`/dashboard/proxy-pools`)**: Multi-node proxy rotation pool, latency checks, single add & bulk import modal, and routing strategies (Latency-First, Round-Robin, Failover-Only).
  - **Console Log Stream (`/dashboard/console-log`)**: Live streaming gateway event log with severity chips (`[ALL]`, `[ERR]`, `[WRN]`, `[INF]`, `[DBG]`), search query filter, auto-scroll follow switch, copy to clipboard, and `.log` file export.
  - **Profile & Storage Settings (`/dashboard/profile`)**: Master key configuration, dark/light theme switch (Obsidian Slate / Crisp Porcelain), native Bun SQLite engine statistics (WAL mode, database size, indexed record counts, VACUUM optimization), and maintenance reset controls.
  - **Soul Studio (`/dashboard/soul`)**: In-browser personality editor with live token estimation and interactive prompt framing preview sandbox.
  - **Interactive Playground (`/dashboard/playground`)**: Multi-model prompt test suite with streaming SSE output and real-time reasoning content.
- **Embedded SQLite Storage Engine**:
  - Native Bun SQLite (`bun:sqlite`) ACID persistence with WAL mode concurrency (`~/.alphaway/alphaway.sqlite`).
  - Indexed queries for request logs, custom providers, and settings with automated fallback and migration.
- **100% Bun-Native Architecture & BoringSSL TLS Parity**:
  - Engineered from the ground up exclusively for the **Bun** runtime (zero Node.js dependencies, native `bun:sqlite` engine, and high-performance Hono on Bun HTTP).
  - Official ClientHello BoringSSL parity (17 cipher suites & 12 extensions) to bypass upstream gate `403 FreeTierError` fingerprint detection.
- **Single Binary Packaging**:
  - Compiles into a single self-contained executable (`alphaway.exe` / `alphaway`) ready to run without requiring Node.js or Bun installed on target machines!

---

## 📌 Repository & Attribution

- **Official Repository**: [**github.com/Yoganataa/alphaway**](https://github.com/Yoganataa/alphaway)
- **Credits & Open-Source Attribution**: **AlphaWay** is an original AI gateway engineered from scratch in TypeScript on top of Bun and Hono.js. It cleanly adapts specialized algorithms and schemas from open-source contributors:
  - **[opencode-free-bridge](https://github.com/azrinaldi/opencode-free-bridge)**: BoringSSL TLS ClientHello fingerprinting profile & gate contract.
  - **[9router-go](https://github.com/successtar/9router-go)**: RTK line deduplication and token saving patterns.
  - **[WorkBuddy AI](https://workbuddy.ai)**: CodeBuddy International protocol headers & RFC 9562 UUIDv7 telemetry.
  - **[SoulSpec Standard](https://github.com/openclaw/soulspec)**: Agent personality specification standard (`SOUL.md`).
- Full legal disclosures, license notices, and explicit architectural boundaries are documented in [**THIRD_PARTY_NOTICES.md**](./THIRD_PARTY_NOTICES.md).

---

## 🚀 Getting Started

### 1. Running Directly with Bun (Developer Mode)

**Runtime requirement:** Bun 1.4.4 or newer. AlphaWay's OpenCode transport profile is verified against Bun 1.4.4 (17 TLS cipher suites, 12 extensions); run `bun run fingerprint:check` before adopting a newer runtime.

```bash
# Clone the repository
git clone https://github.com/Yoganataa/alphaway.git
cd alphaway

# Install the locked dependencies and build the dashboard
bun install --frozen-lockfile
bun run build:ui

# Run AlphaWay Gateway
bun src/index.ts

# Run with Cloudflare Named Tunnel
bun src/index.ts --tunnel

# Run in Background (Daemon Mode)
bun src/index.ts --tunnel -d
```

### 2. Install as a Local Service (Linux / macOS)

The installer downloads a complete source snapshot, builds the dashboard and Bun executable, checks the TLS fingerprint, and only then replaces the installed application. Configuration and SQLite state remain outside the replaceable application directory.

```bash
curl -fsSL https://raw.githubusercontent.com/Yoganataa/alphaway/main/install.sh | bash
```

By default, the application is installed under `~/.alphaway/app`, configuration is stored in `~/.alphaway/.env`, and database state remains under `~/.alphaway`. Set `BINDIR`, `PORT`, or `HOST` to customize the installation. To run an isolated install smoke test from a local checkout without starting a service, use `BINDIR="$(mktemp -d)" SOURCE=local NO_START=1 bash install.sh`.

Windows is not supported by this shell installer. A Windows executable can be cross-compiled from Bun using the command below.

### 3. Service Management
```bash
# Check daemon service status
bun src/index.ts --status

# Stop background daemon
bun src/index.ts --stop
```

### 4. Compiling Standalone Executable
AlphaWay can be compiled into a standalone executable. The production build embeds the generated `dist/` dashboard assets into the executable using Bun's asset embedding support:
```bash
# For Windows x64 (alphaway.exe):
bun run build:bin:win

# For the current Linux / macOS host (alphaway):
bun run build:bin

# Build the dashboard and host-platform executable:
bun run build
```
Once compiled, simply execute:
```cmd
alphaway.exe
```

---

## ⚙️ Environment Configuration (`.env`)

```ini
# Standard API Key (default: sk-alphaway-free)
API_KEY=sk-alphaway-free

# CodeBuddy International Credentials (optional, or login via OAuth)
CODEBUDDY_API_KEY=

# Cloudflare Named Tunnel (optional for secure public access)
PUBLIC_URL=https://gateway.example.com
CLOUDFLARE_TUNNEL_TOKEN=
CLOUDFLARE_TUNNEL_ID=
CLOUDFLARE_ACCOUNT_TAG=
CLOUDFLARE_TUNNEL_SECRET=

# TokenSaver & Security DLP
RTK_ENABLED=true
RTK_MAX_LINES=250
CAVEMAN_ENABLED=false
ADHD_ENABLED=false
DLP_REDACTION=true

# Port & Host Bind
PORT=20129
HOST=127.0.0.1
```

---

## 🔌 Client Integration Guide (Tri-Protocol)

### 1. OpenAI Chat Completions Format
Use the following settings in Cursor, Continue.dev, Cline, Roo-Code, or OpenAI SDKs:
- **Base URL:** `http://127.0.0.1:20129/v1`
- **API Key:** `sk-alphaway-free` (or match `API_KEY` in `.env`)
- **Endpoint:** `POST http://127.0.0.1:20129/v1/chat/completions`

```bash
curl -s http://127.0.0.1:20129/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-alphaway-free" \
  -d '{
    "model": "mimo-v2.6-flash-free",
    "messages": [{"role": "user", "content": "Hello AlphaWay!"}]
  }'
```

### 2. Anthropic Claude Messages Format
Can be invoked directly from Claude Code or Anthropic SDK:
- **Endpoint:** `POST http://127.0.0.1:20129/v1/messages`
- **Headers:** `x-api-key: sk-alphaway-free`, `anthropic-version: 2023-06-01`

```bash
curl -s http://127.0.0.1:20129/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-alphaway-free" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-7-sonnet",
    "messages": [{"role": "user", "content": "Hello from Claude format!"}],
    "max_tokens": 1024
  }'
```

### 3. OpenAI Codex Responses Format
- **Endpoint:** `POST http://127.0.0.1:20129/response`
- **Headers:** `Authorization: Bearer sk-alphaway-free`

```bash
curl -s http://127.0.0.1:20129/response \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-alphaway-free" \
  -d '{
    "model": "mimo-v2.6-flash-free",
    "prompt": "Write a TypeScript function to reverse a string"
  }'
```

---

## 🧪 Testing & Quality Standards

AlphaWay enforces a strict **Zero Weakened Tests Policy**:
```bash
Run deterministic unit/integration tests and browser E2E tests separately:

```bash
bun run test:unit
bunx playwright install --with-deps chromium
bun run test:e2e
```

The test suite covers:
- BoringSSL `ClientHello` TLS fingerprint parity
- Upstream gate contracts and adaptive handshakes
- Tri-Protocol translators (OpenAI, Anthropic Claude, Codex)
- Egress proxy rotation and Cloudflare tunnel relay
- TokenSaver & DLP Infostealer defenses
- Bun SQLite database engine & WAL mode persistence
- Playwright End-to-End web dashboard browser tests
