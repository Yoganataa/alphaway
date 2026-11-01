# Third-Party Notices & Attribution

AlphaWay is an independent, high-performance Universal AI Gateway engineered from scratch in TypeScript on top of the Bun runtime, Hono.js, and Svelte 5. 

To deliver unified interoperability, AlphaWay incorporates and adapts protocol schemas, cipher profiles, and compression algorithms originally created by open-source contributors and research projects. This document records the necessary licensing disclosures, attribution credits, and the explicit demarcation between upstream algorithms and AlphaWay's original codebase.

---

## 🏛️ Architectural Demarcation

### 1. Adapted Upstream Source Material
The following algorithms, protocol specifications, and fingerprint profiles were adapted or referenced into AlphaWay:
- **TLS BoringSSL Fingerprint Profile & Gate Verification**: Adapted from `azrinaldi/opencode-free-bridge` and `anomalyco/opencode` (MIT License). Used in `src/core/transport-fingerprint.ts` to ensure 17-cipher / 12-extension parity.
- **TokenSaver & RTK Compression Patterns**: Adapted from `successtar/9router-go` and `open-sse` (MIT / Apache 2.0). Line deduplication and telegraphic compression concepts used in `src/features/tokensaver.ts`.
- **CodeBuddy International Protocol**: Reverse-engineered protocol headers and RFC 9562 UUIDv7 telemetry matching WorkBuddy 5.8.4.
- **SoulSpec Specification Standard**: Standard demarcation format adapted from the OpenClaw / SoulSpec open agent specification.
- **Cloudflare Tunnel Binary Locator**: Interfaces with Cloudflare `cloudflared` (Apache 2.0).

### 2. Original AlphaWay Engineering (Built From Scratch)
The following subsystems and features were developed from scratch specifically for AlphaWay:
- **Unified TypeScript Architecture**: Entirely new codebase built on Bun + Hono.js with strict typing and domain modularity (`src/core/`, `src/routes/`, `src/providers/`, `src/features/`).
- **Tri-Protocol Real-Time AI Router**: Bidirectional translation engine connecting OpenAI Chat (`/v1/chat/completions`), Anthropic Claude Messages (`/v1/messages`), and OpenAI Codex Responses (`/response`).
- **3rd-Party Custom Providers Engine**: Dynamic provider registry supporting custom OpenAI/Anthropic backends (DeepSeek, Groq, OpenRouter, Together AI, Ollama, vLLM) with prefix namespacing (`providerId:modelName`) and live health probes.
- **DLP Security Guard & Anti-Infostealer Prompt Defense**: Zero-trust heuristic sanitizer redacting API keys, JWTs, database URLs, browser session cookies, and blocking infostealer shell cradles targeting DPAPI / Chrome login databases.
- **Modern Svelte 5 Web Dashboard**: Built from scratch using Svelte 5 Runes (`$state`, `$derived`, `$effect`) and Tailwind CSS v4.
- **Pure SVG Multi-Series Stacked Trend Charting**: Zero external charting libraries; native SVG math rendering stacked token consumption per model family.
- **Trailing 12-Week Contribution Heatmap & Request Inspect Drawer**: Telemetry tracking with streak counts and full JSON payload modal viewer.
- **Soul Studio & Hot-Reloading SoulSpec Engine**: In-browser personality editor with live token estimation and interactive sandbox preview.
- **Embedded SQLite Storage Engine**: ACID-compliant database architecture with WAL mode concurrency for request telemetry, custom providers, and settings (`src/core/database.ts`).
- **Single Self-Contained Executable Packaging**: Automated compilation into standalone native binaries (`alphaway.exe` / `alphaway`).

---

## 📜 Upstream Licenses & Copyright Notices

### 1. opencode-free-bridge & OpenCode
- Components: BoringSSL TLS profile, gate contract AST Effect tool definitions, and token-budget formulas.
- Copyright (c) 2026 azrinaldi / opencode contributors
- License: MIT License

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

---

### 2. 9router-go & open-sse
- Components: RTK line truncation patterns, Caveman telegraphic persona templates, and ADHD structured prompts.
- Copyright (c) 2025 successtar / 9router-go contributors
- License: MIT License / Apache License 2.0

---

### 3. Cloudflare cloudflared
- Components: Tunnel helper process locator and configuration generator.
- Copyright (c) Cloudflare, Inc.
- License: Apache License, Version 2.0

> Licensed under the Apache License, Version 2.0 (the "License");
> you may not use this file except in compliance with the License.
> You may obtain a copy of the License at
>
>     http://www.apache.org/licenses/LICENSE-2.0
>
> Unless required by applicable law or agreed to in writing, software
> distributed under the License is distributed on an "AS IS" BASIS,
> WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
> See the License for the specific language governing permissions and
> limitations under the License.
