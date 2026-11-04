<script lang="ts">
  import { onMount } from "svelte";
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import ApiKeysTable from "./keys/ApiKeysTable.svelte";
  import { getActiveApiKey } from "../lib/api";
  import { notifications } from "../lib/notifications";
  import type { HealthResponse } from "../lib/types";

  let { health = null }: { health?: HealthResponse | null } = $props();

  let localOrigin = $state(typeof window !== "undefined" ? window.location.origin : "");
  let showLocalUrl = $state(true);
  let showTunnelUrl = $state(true);
  let showKey = $state(false);
  let copiedId = $state<string | null>(null);

  const publicEndpointUrl = $derived(health?.endpoint?.tunnel ? health.endpoint.publicUrl : "");
  const publicEndpointConfigured = $derived(publicEndpointUrl.length > 0);
  const requiresApiKey = $derived(health?.auth?.required ?? health?.authRequired ?? false);
  const gateStatus = $derived(health?.identity?.gate?.status ?? "unknown");
  const gateTone = $derived(gateStatus === "open" ? "success" : gateStatus === "unknown" ? "neutral" : "warning");
  const gateLabel = $derived(
    gateStatus === "open"
      ? "No active local block"
      : gateStatus === "ip-blocked"
        ? "IP blocked"
        : gateStatus === "throttled"
          ? "Throttled"
          : "Not reported"
  );

  let activeCodeTab = $state<"cursor" | "continue" | "claude" | "curl" | "anthropic" | "python" | "node">("cursor");
  let copiedSnippet = $state(false);

  const localEndpoint = $derived(localOrigin ? `${localOrigin}/v1` : "/v1");
  const apiKey = $derived(getActiveApiKey() || "<YOUR_API_KEY>");

  onMount(() => {
    if (typeof window !== "undefined") {
      localOrigin = window.location.origin;
    }
  });

  function copyText(id: string, text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      copiedId = id;
      notifications.success("Copied to clipboard");
      setTimeout(() => {
        if (copiedId === id) copiedId = null;
      }, 2000);
    }
  }

  function maskKey(key: string): string {
    if (!key || key.length <= 10) return "sk-••••••••••••";
    return `${key.slice(0, 7)}••••••••${key.slice(-4)}`;
  }

  const snippets = $derived({
    cursor: `// Cursor / Cline / Roo Code Settings:
// 1. Set Provider: OpenAI Compatible
// 2. Base URL: ${localEndpoint}
// 3. API Key: ${apiKey}
// 4. Model: mimo-v2.6-flash-free (or any model from /v1/models)`,
    continue: `{
  "models": [
    {
      "title": "AlphaWay",
      "provider": "openai",
      "model": "mimo-v2.6-flash-free",
      "apiBase": "${localEndpoint}",
      "apiKey": "${apiKey}"
    }
  ]
}`,
    claude: `# Claude Code CLI configuration:
export ANTHROPIC_BASE_URL="${localOrigin}"
export ANTHROPIC_API_KEY="${apiKey}"
claude --model mimo-v2.6-flash-free`,
    curl: `curl -s ${localEndpoint}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "mimo-v2.6-flash-free",
    "messages": [{"role": "user", "content": "Hello AlphaWay!"}]
  }'`,
    anthropic: `curl -s ${localOrigin}/v1/messages \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey}" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "mimo-v2.6-flash-free",
    "messages": [{"role": "user", "content": "Hello via Anthropic Claude format!"}],
    "max_tokens": 1024
  }'`,
    python: `from openai import OpenAI

client = OpenAI(
    base_url="${localEndpoint}",
    api_key="${apiKey}",
)

response = client.chat.completions.create(
    model="mimo-v2.6-flash-free",
    messages=[{"role": "user", "content": "Hello AlphaWay!"}],
)
print(response.choices[0].message.content)`,
    node: `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${localEndpoint}",
  apiKey: "${apiKey}",
});

const res = await openai.chat.completions.create({
  model: "mimo-v2.6-flash-free",
  messages: [{ role: "user", content: "Hello AlphaWay!" }],
});
console.log(res.choices[0].message.content);`,
  });

  function copyCurrentSnippet() {
    copyText("snippet", snippets[activeCodeTab]);
    copiedSnippet = true;
    setTimeout(() => (copiedSnippet = false), 2000);
  }

  const egressProxyDisplay = $derived.by(() => {
    if (!health?.egress) return "Direct Local Connection";
    if (health.egress.mode === "direct" || !health.egress.proxy) return "Direct Local Connection";
    const proxy = health.egress.proxy;
    if (proxy.mode === "pool") return `${proxy.pool.ready}/${proxy.pool.enabled} pool entries ready`;
    return proxy.proxy || "Proxy configured";
  });
</script>

<div class="space-y-6">
  <!-- Gateway metrics backed by the health response -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <Card padding="md" hover>
      <div class="flex items-center justify-between text-xs text-text-muted mb-2">
        <span class="font-medium">TLS Profile</span>
        <span class="w-2 h-2 rounded-full {health?.tls ? 'bg-emerald-500' : 'bg-zinc-500'}"></span>
      </div>
      <div class="text-lg font-bold text-text-main tracking-tight">
        {health?.tls || "Not reported"}
      </div>
      <p class="text-xs text-text-muted mt-1">
        Runtime health metadata; not an upstream connectivity test.
      </p>
    </Card>

    <Card padding="md" hover>
      <div class="flex items-center justify-between text-xs text-text-muted mb-2">
        <span class="font-medium">Local Retry Gate</span>
        <span class="w-2 h-2 rounded-full {gateTone === 'success' ? 'bg-emerald-500' : gateTone === 'warning' ? 'bg-amber-500' : 'bg-zinc-500'}"></span>
      </div>
      <div class="text-lg font-bold text-text-main tracking-tight flex items-center gap-2">
        <span>{gateStatus.toUpperCase()}</span>
        <Badge tone={gateTone} size="sm">{gateLabel}</Badge>
      </div>
      <p class="text-xs text-text-muted mt-1">
        Local retry/abuse state; it does not probe upstream availability.
      </p>
    </Card>

    <Card padding="md" hover>
      <div class="flex items-center justify-between text-xs text-text-muted mb-2">
        <span class="font-medium">Egress Mode</span>
        <span class="w-2 h-2 rounded-full bg-cyan-500"></span>
      </div>
      <div class="text-lg font-bold text-text-main tracking-tight capitalize">
        {health?.egress?.mode || "Unknown"}
      </div>
      <p class="text-xs text-text-muted truncate mt-1 font-mono" title={egressProxyDisplay}>
        {egressProxyDisplay}
      </p>
    </Card>

    <Card padding="md" hover>
      <div class="flex items-center justify-between text-xs text-text-muted mb-2">
        <span class="font-medium">Model Catalog</span>
        <span class="w-2 h-2 rounded-full bg-purple-500"></span>
      </div>
      <div class="text-lg font-bold text-text-main tracking-tight">
        {(health?.discoveredModels ?? 0) + (health?.providers?.codebuddy?.models ?? 0)} Models
      </div>
      <p class="text-xs text-text-muted mt-1 font-mono">
        {health?.discoveredModels ?? 0} OpenCode · {health?.providers?.codebuddy?.models ?? 0} CodeBuddy
      </p>
    </Card>
  </div>

  <!-- Gateway Endpoint Cards (9Router-Go Architecture) -->
  <Card padding="md" elev class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <h2 class="text-lg font-bold text-text-main tracking-tight flex items-center gap-2">
          <span class="material-symbols-outlined text-brand-500 text-[22px]">hub</span>
          <span>Gateway Endpoints</span>
        </h2>
        <p class="text-xs text-text-muted mt-0.5">
          Universal reverse proxy entrypoints for IDEs, coding agents, and automation pipelines.
        </p>
      </div>

      <div class="flex items-center gap-3 bg-surface-2 px-3 py-2 rounded-[8px] border border-border">
        <div class="text-right">
          <span class="text-xs font-semibold text-text-main block">Gateway Authentication</span>
          <span class="text-[10px] text-text-muted">Read-only server policy</span>
        </div>
        <Badge tone={requiresApiKey ? "success" : "warning"} size="sm">
          {requiresApiKey ? "Required" : "Not required"}
        </Badge>
      </div>
    </div>

    <!-- Endpoint Rows -->
    <div class="space-y-3 font-mono text-xs">
      <!-- Row 1: Local Endpoint -->
      <div class="p-3.5 rounded-[10px] bg-surface-2 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 font-sans font-semibold text-text-main">
              <span>Current Dashboard Origin (OpenAI v1)</span>
              <Badge tone="neutral" size="xs">Current origin</Badge>
            </div>
            <div class="text-text-muted truncate mt-0.5 select-all">
              {showLocalUrl ? localEndpoint : "••••••••••••/v1"}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0 font-sans">
          <Button
            variant="ghost"
            size="xs"
            onclick={() => (showLocalUrl = !showLocalUrl)}
            title={showLocalUrl ? "Mask URL" : "Reveal URL"}
          >
            <span class="material-symbols-outlined text-[14px]">
              {showLocalUrl ? "visibility_off" : "visibility"}
            </span>
          </Button>
          <Button
            variant="secondary"
            size="xs"
            onclick={() => copyText("local", localEndpoint)}
          >
            <span class="material-symbols-outlined text-[14px]">
              {copiedId === "local" ? "check" : "content_copy"}
            </span>
            <span>{copiedId === "local" ? "Copied" : "Copy"}</span>
          </Button>
        </div>
      </div>

      <!-- Row 2: Cloudflare Tunnel -->
      <div class="p-3.5 rounded-[10px] bg-surface-2 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-2.5 h-2.5 rounded-full {publicEndpointConfigured ? 'bg-emerald-500' : 'bg-zinc-500'} shrink-0"></div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 font-sans font-semibold text-text-main">
              <span>Public Endpoint</span>
              <Badge tone={publicEndpointConfigured ? "success" : "neutral"} size="xs">
                {publicEndpointConfigured ? "Configured" : "Not configured"}
              </Badge>
            </div>
            <div class="text-text-muted truncate mt-0.5 select-all">
              {#if publicEndpointConfigured}
                {showTunnelUrl ? publicEndpointUrl : "••••••••••••••••"}
              {:else}
                <span class="font-sans text-text-muted">Not configured. Start the ingress process with <code class="font-mono text-brand-400">bun src/index.ts --tunnel</code> and set a public endpoint variable to publish its URL.</span>
              {/if}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0 font-sans">
          {#if publicEndpointConfigured}
            <Button
              variant="ghost"
              size="xs"
              onclick={() => (showTunnelUrl = !showTunnelUrl)}
            >
              <span class="material-symbols-outlined text-[14px]">
                {showTunnelUrl ? "visibility_off" : "visibility"}
              </span>
            </Button>
            <Button
              variant="secondary"
              size="xs"
              onclick={() => copyText("tunnel", publicEndpointUrl)}
            >
              <span class="material-symbols-outlined text-[14px]">
                {copiedId === "tunnel" ? "check" : "content_copy"}
              </span>
              <span>{copiedId === "tunnel" ? "Copied" : "Copy"}</span>
            </Button>
          {:else}
            <span class="text-[11px] text-text-muted font-sans">No public endpoint configured</span>
          {/if}
        </div>
      </div>
    </div>
  </Card>

  <!-- Client Integration Snippets -->
  <Card padding="none" elev class="overflow-hidden border-border-subtle">
    <div class="p-5 border-b border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-2/40">
      <div>
        <h2 class="text-base md:text-lg font-bold text-text-main tracking-tight flex items-center gap-2">
          <span class="material-symbols-outlined text-brand-500 text-[22px]">terminal</span>
          <span>OpenAI Client Integration</span>
        </h2>
        <p class="text-xs text-text-muted mt-0.5">
          Plug AlphaWay into Cursor, Continue.dev, Claude Code, Cline, Python, or Node SDKs.
        </p>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-1 overflow-x-auto p-1 rounded-[8px] bg-surface-1 border border-border">
        {#each [
          { id: "cursor", label: "Cursor / Cline" },
          { id: "continue", label: "Continue.dev" },
          { id: "claude", label: "Claude Code" },
          { id: "curl", label: "cURL" },
          { id: "anthropic", label: "Anthropic" },
          { id: "python", label: "Python SDK" },
          { id: "node", label: "Node.js" },
        ] as tab}
          <button
            type="button"
            onclick={() => (activeCodeTab = tab.id as any)}
            class="px-2.5 py-1 text-xs rounded-[6px] font-medium transition-colors whitespace-nowrap {activeCodeTab === tab.id
              ? 'bg-brand-500 text-bg-deep font-bold shadow-xs'
              : 'text-text-muted hover:text-text-main'}"
          >
            {tab.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Code Display Area -->
    <div class="p-4 bg-surface-1 relative group font-mono text-xs">
      <div class="absolute top-3 right-3 z-10">
        <Button
          variant="secondary"
          size="xs"
          onclick={copyCurrentSnippet}
        >
          <span class="material-symbols-outlined text-[14px]">
            {copiedSnippet ? "check" : "content_copy"}
          </span>
          <span>{copiedSnippet ? "Copied" : "Copy Snippet"}</span>
        </Button>
      </div>
      <pre class="p-4 rounded-[8px] bg-surface-2 text-text-main overflow-x-auto selection:bg-brand-500/30"><code>{snippets[activeCodeTab]}</code></pre>
    </div>
  </Card>

  <!-- API Keys Management Table -->
  <Card padding="md" elev>
    <ApiKeysTable />
  </Card>
</div>
