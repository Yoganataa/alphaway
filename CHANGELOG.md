# Changelog

All notable changes to AlphaWay will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] — 2026-11-01

### 🚀 Initial Release of AlphaWay
First release of **AlphaWay — High-Performance Universal AI Gateway & Security Router**, built from scratch in TypeScript on top of the Bun runtime, Hono.js framework, and Svelte 5 with Tailwind CSS v4.

#### 🔌 Tri-Protocol Gateway Engine
- **OpenAI Compatible (`POST /v1/chat/completions` & `GET /v1/models`)**: Real-time streaming SSE and non-streaming support for AI coding assistants (Cursor, Continue.dev, Cline, Roo-Code, Aider, and standard OpenAI SDKs).
- **Anthropic Claude Protocol (`POST /v1/messages` & `/messages`)**: Native support for Anthropic Claude request and response formats with `x-api-key` and `anthropic-version`.
- **OpenAI Codex Responses (`POST /response`)**: Backward-compatible prompt completion endpoint for code completion agents.

#### 🌐 Multi-Provider Backend & Custom Registry
- **OpenCode Free-Tier Provider**: Adaptive gate handshake, AST Effect tool schemas, and BoringSSL TLS ClientHello parity (17 ciphers & 12 extensions).
- **CodeBuddy International Provider**: WorkBuddy 5.8.4 identity channel, W3C trace headers, RFC 9562 UUIDv7, and automatic OAuth login flow.
- **3rd-Party Custom Providers Engine**: Dynamic provider management (DeepSeek, Groq, OpenRouter, Together AI, Ollama, vLLM) supporting OpenAI and Anthropic formats with scoped prefix namespacing (`providerId:modelName`).

#### 🛡️ TokenSaver, DLP Security Guard & Anti-Infostealer
- **Zero-Trust DLP Secret Masking**: Real-time redaction of high-entropy API keys (`sk-...`), JWTs, AWS credentials, database connection strings, and private keys.
- **Anti-Infostealer Prompt Defense**: Defense-in-depth sanitization blocking prompt-injection attempts targeting DPAPI keys, browser session cookies, and login databases (Chrome, Firefox, Edge `Login Data`).
- **Response Token Killer (RTK)**: Intelligent line deduplication and smart truncation for compiler diagnostics, git diffs, and tool outputs.
- **Auto-Clarity Guard**: Automatic disengagement of compression whenever sensitive operations or destructive terminal commands are detected.

#### ✨ SOUL.md Personality Engine & Soul Studio
- **Persistent Character Sheet**: Inject custom agent personality and guidelines adhering to the SoulSpec standard, eliminating corporate fluff and sycophancy.
- **Cascading Auto-Discovery**: Automatic hierarchical resolution: Local Project (`./SOUL.md`) → Global User (`~/.alphaway/SOUL.md`) → Built-in Presets (`Atlas`, `Minimalist`, `Socratic`).
- **Web Dashboard Soul Studio**: In-browser personality editor with live token estimation and interactive prompt framing sandbox.

#### 📊 Usage & Analytics Dashboard
- **Pure SVG Stacked Area Trends**: Real-time token consumption visualization stacked by model family with zero third-party chart library dependencies.
- **Summary KPI Cards**: Live metrics for Total Requests, Success Rate, Input Tokens, Saved Tokens, Output Tokens, and Estimated USD Savings.
- **3D Breakdown Table**: Pivot view `By Model`, `By Provider`, and `By Protocol` with sortable columns.
- **Activity Heatmap**: Trailing 12-week contribution heatmap with daily streak tracking.
- **Payload Inspect Drawer**: Modal inspector with latency analytics, token accounting, and raw JSON payload auditing.

#### 🖥️ Comprehensive 9Router-Go UI/UX Overhaul
- **Endpoint View (`/dashboard/endpoint`)**: Tailscale-free universal endpoint with local origin (`/v1`), Cloudflare Named/Quick Tunnel controls, API key enforcement toggle, full API key management table (generate, reveal, copy, revoke), and multi-client code snippets.
- **Quota & Rate Limits Tracker (`/dashboard/quota`)**: Real-time RPM/TPM gauges, capacity progress bars, rolling session reset countdowns, and 30-second auto-refresh timer.
- **Security Armor & DLP Guard (`/dashboard/security`)**: Dedicated security view combining DLP secret redaction (API keys, AWS credentials, SSH keys), Anti-Infostealer prompt defenses (browser cookies, DPAPI vault, Keychain), keyword guardrails, and live interactive evaluation sandbox.
- **Egress Proxy Pools (`/dashboard/proxy-pools`)**: Multi-node rotation pool, latency checks, single add & line-by-line bulk import modal, and routing strategies (Latency-First, Round-Robin, Failover-Only).
- **Console Log Stream (`/dashboard/console-log`)**: Live streaming gateway event log with severity chips (`[ALL]`, `[ERR]`, `[WRN]`, `[INF]`, `[DBG]`), search query filter, auto-scroll follow switch, copy to clipboard, and `.log` file export.
- **Profile & Storage Settings (`/dashboard/profile`)**: Native Bun SQLite engine statistics (WAL mode, database size, indexed record counts, VACUUM optimization button), theme customization (Obsidian Slate / Crisp Porcelain), and maintenance reset controls.

#### 🗄️ Embedded SQLite Storage Engine
- **Native Bun SQLite (`bun:sqlite`)**: High-performance, embedded ACID-compliant database (`alphaway.sqlite`) operating in WAL mode with indexed queries for request logs, custom provider configurations, and application settings.
- **Zero-Dependency Architecture**: Leverages Bun's native SQLite C-bindings compiled statically into `alphaway.exe`.
- **SQLite-only persistence (current architecture)**: The former startup importer for `custom_providers.json`, `usage_stats.json`, and `tokensaver.json` was retired in Phase 2; standalone JSON configuration files are no longer imported.

#### ⚡ Deployment & Packaging
- **Single Self-Contained Executable**: Automated compilation into standalone native binaries (`alphaway.exe` / `alphaway`) without external Node.js or Bun dependencies.
- **Background Daemon Mode**: Built-in background service supervisor with PID and log tracking (`bun src/index.ts -d`, `--status`, `--stop`).
- **Automated Cloudflare Named Tunnel**: Built-in secure public ingress via Cloudflare Named Tunnels.
