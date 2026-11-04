<script lang="ts">
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import { getActiveApiKey } from "../lib/api";
  import type { HealthResponse } from "../lib/types";

  let { health = null }: { health?: HealthResponse | null } = $props();

  let activeCodeTab = $state<"curl" | "anthropic" | "responses" | "continue" | "cursor" | "python" | "node">("curl");
  let copiedSnippet = $state(false);
  let copiedModel = $state<string | null>(null);
  let showKey = $state(false);
  let copiedKey = $state(false);

  function maskKey(key: string): string {
    if (!key || key.length <= 10) return "sk-••••••••••••";
    return `${key.slice(0, 7)}••••••••${key.slice(-4)}`;
  }

  function copyKey() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(apiKey);
      copiedKey = true;
      setTimeout(() => (copiedKey = false), 2000);
    }
  }

  function copyModel(name: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(name);
      copiedModel = name;
      setTimeout(() => (copiedModel = null), 2000);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:20129";
  const baseUrl = `${origin}/v1`;
  const apiKey = $derived(getActiveApiKey());

  const snippets = $derived({
    curl: `curl -s ${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "mimo-v2.6-flash-free",
    "messages": [{"role": "user", "content": "Hello AlphaWay!"}]
  }'`,
    anthropic: `curl -s ${origin}/v1/messages \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey}" \\
  -d '{
    "model": "mimo-v2.6-flash-free",
    "messages": [{"role": "user", "content": "Hello via Claude format!"}],
    "max_tokens": 1024
  }'`,
    responses: `curl -s ${origin}/response \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "mimo-v2.6-flash-free",
    "input": "Write a TypeScript function"
  }'`,
    continue: `{
  "models": [
    {
      "title": "AlphaWay (mimo)",
      "provider": "openai",
      "model": "mimo-v2.6-flash-free",
      "apiBase": "${baseUrl}",
      "apiKey": "${apiKey}"
    }
  ]
}`,
    cursor: `// Cursor / Cline / Roo Code Settings:
// 1. Set Provider to: OpenAI Compatible
// 2. Base URL: ${baseUrl}
// 3. API Key: ${apiKey}
// 4. Model ID: mimo-v2.6-flash-free (or any model from /v1/models)`,
    python: `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="${apiKey}",
)

response = client.chat.completions.create(
    model="mimo-v2.6-flash-free",
    messages=[{"role": "user", "content": "Hello AlphaWay!"}],
)
print(response.choices[0].message.content)`,
    node: `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${apiKey}",
});

const completion = await openai.chat.completions.create({
  model: "mimo-v2.6-flash-free",
  messages: [{ role: "user", content: "Hello AlphaWay!" }],
});

console.log(completion.choices[0].message.content);`,
  });

  function copyCurrentSnippet() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(snippets[activeCodeTab]);
      copiedSnippet = true;
      setTimeout(() => (copiedSnippet = false), 2000);
    }
  }

  // Safe string formatting for egress
  const egressProxyDisplay = $derived.by(() => {
    if (!health?.egress) return "Direct Local Connection";
    if (health.egress.mode === "direct") return "Direct Local Connection";
    const proxy = health.egress.proxy;
    if (proxy.mode === "pool") return `${proxy.pool.ready}/${proxy.pool.enabled} pool entries ready`;
    return proxy.proxy || "Proxy configured";
  });
</script>

<div class="space-y-6">
  <!-- Top 4 Metric Cards (9Router Card Style) -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- Card 1: TLS Fingerprint -->
    <Card padding="md" hover>
      <div class="flex items-center justify-between text-xs text-text-muted mb-2">
        <span class="font-medium">TLS Fingerprint</span>
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
      </div>
      <div class="text-lg font-bold text-text-main tracking-tight">
        BoringSSL Parity
      </div>
      <p class="text-xs text-emerald-400 font-mono mt-1 flex items-center gap-1">
        <span class="material-symbols-outlined text-[14px]">verified</span>
        <span>17 ciphers · 12 extensions</span>
      </p>
    </Card>

    <!-- Card 2: Upstream Gate -->
    <Card padding="md" hover>
      <div class="flex items-center justify-between text-xs text-text-muted mb-2">
        <span class="font-medium">Upstream Gate</span>
        <span class="w-2 h-2 rounded-full {health?.identity?.gate?.status === 'open' ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
      </div>
      <div class="text-lg font-bold text-text-main tracking-tight flex items-center gap-2">
        <span>{(health?.identity?.gate?.status || "unknown").toUpperCase()}</span>
        <Badge tone={health?.identity?.gate?.status === "open" ? "success" : "warning"} size="sm">
          {health?.identity?.gate?.status === "open" ? "Ready" : "Restricted"}
        </Badge>
      </div>
      <p class="text-xs text-text-muted mt-1 font-mono">
        Retry cooldown: {health?.identity?.gate?.cooldownMs ?? 0}ms
      </p>
    </Card>

    <!-- Card 3: Egress Mode (Fixed [object Object]) -->
    <Card padding="md" hover>
      <div class="flex items-center justify-between text-xs text-text-muted mb-2">
        <span class="font-medium">Egress Mode</span>
        <span class="w-2 h-2 rounded-full bg-cyan-500"></span>
      </div>
      <div class="text-lg font-bold text-text-main tracking-tight capitalize">
        {health?.egress?.mode || "Direct"}
      </div>
      <p class="text-xs text-text-muted truncate mt-1 font-mono" title={egressProxyDisplay}>
        {egressProxyDisplay}
      </p>
    </Card>

    <!-- Card 4: Model Catalog -->
    <Card padding="md" hover>
      <div class="flex items-center justify-between text-xs text-text-muted mb-2">
        <span class="font-medium">Model Catalog</span>
        <span class="w-2 h-2 rounded-full bg-purple-500"></span>
      </div>
      <div class="text-lg font-bold text-text-main tracking-tight">
        {(health?.discoveredModels ?? 0) + (health?.providers?.codebuddy?.models ?? 0)} Models
      </div>
      <p class="text-xs text-text-muted mt-1 font-mono">
        {health?.discoveredModels ?? 0} OpenCode &middot; {health?.providers?.codebuddy?.models ?? 0} CodeBuddy catalog entries
      </p>
    </Card>
  </div>

  <!-- Hero Quick Integration Card -->
  <Card padding="none" elev class="overflow-hidden border-border-subtle">
    <!-- Card Header -->
    <div class="p-5 md:p-6 border-b border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-2/40">
      <div>
        <h2 class="text-base md:text-lg font-bold text-text-main tracking-tight flex items-center gap-2">
          <span class="material-symbols-outlined text-brand-500 text-[22px]">api</span>
          <span>OpenAI Client Integration</span>
        </h2>
        <p class="text-xs text-text-muted mt-0.5">
          Configure your favorite IDE or coding assistant (Cursor, Continue, Aider, Claude Code, Cline)
        </p>
      </div>

      <!-- Endpoint & API Key Pills with Direct Copy (OpenAI Standard) -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1.5 bg-surface p-1.5 rounded-[10px] border border-border-subtle shrink-0">
          <span class="text-xs text-text-subtle font-mono px-1.5 font-medium">Base URL:</span>
          <code class="text-xs font-mono text-brand-400 bg-surface-2 px-2 py-0.5 rounded-[6px]">
            {baseUrl}
          </code>
        </div>

        <div class="flex items-center gap-1.5 bg-surface p-1.5 rounded-[10px] border border-border-subtle shrink-0">
          <span class="text-xs text-text-subtle font-mono px-1.5 font-medium">API Key:</span>
          <code class="text-xs font-mono text-emerald-400 bg-surface-2 px-2 py-0.5 rounded-[6px] flex items-center gap-1.5" title={apiKey}>
            <span>{showKey ? apiKey : maskKey(apiKey)}</span>
            <button
              type="button"
              onclick={() => (showKey = !showKey)}
              class="text-text-muted hover:text-text-main transition-colors cursor-pointer"
              title={showKey ? "Hide API Key" : "Reveal API Key"}
            >
              <span class="material-symbols-outlined text-[14px] leading-none">{showKey ? "visibility_off" : "visibility"}</span>
            </button>
            <button
              type="button"
              onclick={copyKey}
              class="text-text-muted hover:text-text-main transition-colors cursor-pointer"
              title="Copy OpenAI Standard API Key"
            >
              {#if copiedKey}
                <span class="material-symbols-outlined text-[14px] text-emerald-400 leading-none">check</span>
              {:else}
                <span class="material-symbols-outlined text-[14px] leading-none">content_copy</span>
              {/if}
            </button>
          </code>
        </div>
      </div>
    </div>

    <!-- Client Tabs & Snippet Body -->
    <div class="p-5 md:p-6 space-y-4">
      <!-- Tabs Switcher -->
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-1.5 p-1 bg-surface-2 rounded-[10px] border border-border-subtle overflow-x-auto max-w-full">
          <button
            type="button"
            onclick={() => (activeCodeTab = "curl")}
            class="px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all cursor-pointer {activeCodeTab === 'curl'
              ? 'bg-surface text-text-main shadow-xs font-semibold'
              : 'text-text-muted hover:text-text-main'}"
          >
            OpenAI (cURL)
          </button>
          <button
            type="button"
            onclick={() => (activeCodeTab = "anthropic")}
            class="px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all cursor-pointer {activeCodeTab === 'anthropic'
              ? 'bg-surface text-text-main shadow-xs font-semibold'
              : 'text-text-muted hover:text-text-main'}"
          >
            Anthropic (/messages)
          </button>
          <button
            type="button"
            onclick={() => (activeCodeTab = "responses")}
            class="px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all cursor-pointer {activeCodeTab === 'responses'
              ? 'bg-surface text-text-main shadow-xs font-semibold'
              : 'text-text-muted hover:text-text-main'}"
          >
            Codex (/response)
          </button>
          <button
            type="button"
            onclick={() => (activeCodeTab = "continue")}
            class="px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all cursor-pointer {activeCodeTab === 'continue'
              ? 'bg-surface text-text-main shadow-xs font-semibold'
              : 'text-text-muted hover:text-text-main'}"
          >
            Continue.dev
          </button>
          <button
            type="button"
            onclick={() => (activeCodeTab = "cursor")}
            class="px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all cursor-pointer {activeCodeTab === 'cursor'
              ? 'bg-surface text-text-main shadow-xs font-semibold'
              : 'text-text-muted hover:text-text-main'}"
          >
            Cursor / Cline
          </button>
          <button
            type="button"
            onclick={() => (activeCodeTab = "python")}
            class="px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all cursor-pointer {activeCodeTab === 'python'
              ? 'bg-surface text-text-main shadow-xs font-semibold'
              : 'text-text-muted hover:text-text-main'}"
          >
            Python (OpenAI)
          </button>
          <button
            type="button"
            onclick={() => (activeCodeTab = "node")}
            class="px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all cursor-pointer {activeCodeTab === 'node'
              ? 'bg-surface text-text-main shadow-xs font-semibold'
              : 'text-text-muted hover:text-text-main'}"
          >
            Node.js / TS
          </button>
        </div>

        <!-- Copy Snippet Button -->
        <Button variant="outline" size="sm" onclick={copyCurrentSnippet}>
          {#if copiedSnippet}
            <span class="material-symbols-outlined text-[16px] text-emerald-400">check</span>
            <span class="text-emerald-400">Copied to Clipboard!</span>
          {:else}
            <span class="material-symbols-outlined text-[16px]">content_copy</span>
            <span>Copy Snippet</span>
          {/if}
        </Button>
      </div>

      <!-- Code Snippet Display Box -->
      <div class="relative rounded-[12px] bg-[#0c1017] border border-border-subtle p-4 font-mono text-xs text-gray-200 overflow-x-auto shadow-inner leading-relaxed">
        <pre class="selection:bg-brand-500/30"><code>{snippets[activeCodeTab]}</code></pre>
      </div>

      <!-- Active Model Aliases Quick-Copy Strip (9router-go style) -->
      <div class="pt-2 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <span class="text-text-muted font-medium flex items-center gap-1.5 shrink-0">
          <span class="material-symbols-outlined text-[16px] text-brand-500">model_training</span>
          <span>Click model to copy ID:</span>
        </span>
        <div class="flex items-center gap-1.5 flex-wrap">
          {#each ["mimo-v2.6-flash-free", "minimax-m2.5-free", "kimi-k2.5-free", "deepseek-v3.1-free", "qwen-2.5-coder-free", "big-pickle"] as m}
            <button
              type="button"
              onclick={() => copyModel(m)}
              class="px-2 py-1 rounded-[6px] font-mono text-[11px] bg-surface-2 border border-border-subtle hover:border-brand-500/50 hover:text-brand-400 transition-colors cursor-pointer flex items-center gap-1"
              title="Click to copy model ID to clipboard"
            >
              <span>{m}</span>
              {#if copiedModel === m}
                <span class="material-symbols-outlined text-[12px] text-emerald-400">check</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </Card>

  <!-- Bottom System Information Cards -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <!-- Runtime -->
    <Card padding="sm" class="space-y-1">
      <div class="text-xs text-text-muted font-medium flex items-center justify-between">
        <span>Runtime Framework</span>
        <span class="material-symbols-outlined text-[16px] text-text-muted">memory</span>
      </div>
      <div class="text-sm font-semibold text-text-main font-mono">
        {health?.runtime || "Bun"} · {health?.framework || "Hono.js"}
      </div>
      <p class="text-[11px] text-emerald-400 font-medium">{health?.tls || "TLS details unavailable"}</p>
    </Card>

    <!-- System Uptime -->
    <Card padding="sm" class="space-y-1">
      <div class="text-xs text-text-muted font-medium flex items-center justify-between">
        <span>System Uptime</span>
        <span class="material-symbols-outlined text-[16px] text-text-muted">schedule</span>
      </div>
      <div class="text-sm font-semibold text-text-main font-mono">
        {Math.floor((health?.uptimeSeconds || 0) / 60)}m {Math.floor((health?.uptimeSeconds || 0) % 60)}s
      </div>
      <p class="text-[11px] text-text-muted">Current AlphaWay process uptime</p>
    </Card>

    <!-- Daemon & Tunnel -->
    <Card padding="sm" class="space-y-1">
      <div class="text-xs text-text-muted font-medium flex items-center justify-between">
        <span>Daemon & Tunnel</span>
        <span class="material-symbols-outlined text-[16px] text-text-muted">cloud_done</span>
      </div>
      <div class="text-sm font-semibold text-text-main">
        {health?.endpoint?.tunnel ? "Public endpoint configured" : "Local endpoint only"}
      </div>
      <p class="text-[11px] text-text-muted truncate">
        {health?.endpoint?.publicUrl || "http://127.0.0.1:20129/v1"}
      </p>
    </Card>
  </div>
</div>
