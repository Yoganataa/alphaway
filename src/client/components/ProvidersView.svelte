<script lang="ts">
  import { onMount } from "svelte";
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import {
    fetchHealth,
    fetchModels,
    startCodeBuddyOAuth,
    pollCodeBuddyOAuth,
    fetchCustomProviders,
    saveCustomProvider,
    deleteCustomProvider,
    testCustomProvider,
  } from "../lib/api";
  import type { HealthResponse, ModelItem, CodeBuddyOAuthStart, CustomProviderConfig } from "../lib/types";

  let { health }: { health: HealthResponse | null } = $props();

  let models = $state<ModelItem[]>([]);
  let customProviders = $state<CustomProviderConfig[]>([]);
  let oauthData = $state<CodeBuddyOAuthStart | null>(null);
  let oauthPolling = $state<boolean>(false);
  let oauthStatusText = $state<string | null>(null);
  let pollIntervalHandle: any = null;

  const gateStatus = $derived(health?.identity?.gate?.status ?? "unknown");
  const toolAnchors = $derived(health?.identity?.gate?.anchors.tools ?? []);
  const headerAnchors = $derived(health?.identity?.gate?.anchors.headers ?? []);

  const trustedOAuthDomains = ["codebuddy.ai", "workbuddy.ai"];
  function safeCodeBuddyAuthUrl(value: string | undefined): string | null {
    if (!value || value.length > 2048) return null;
    try {
      const parsed = new URL(value);
      const hostname = parsed.hostname.toLowerCase();
      const trusted = trustedOAuthDomains.some((domain) =>
        hostname === domain || hostname.endsWith(`.${domain}`)
      );
      if (
        parsed.protocol !== "https:" ||
        !trusted ||
        parsed.username !== "" ||
        parsed.password !== "" ||
        (parsed.port !== "" && parsed.port !== "443")
      ) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  const oauthAuthUrl = $derived(oauthData ? safeCodeBuddyAuthUrl(oauthData.authUrl) : null);

  // Custom provider modal / form state
  let showProviderModal = $state(false);
  let isEditing = $state(false);
  let formId = $state("");
  let formName = $state("");
  let formBaseUrl = $state("https://api.deepseek.com/v1");
  let formApiKey = $state("");
  let formProtocol = $state<"openai" | "anthropic">("openai");
  let formModels = $state("deepseek-chat, deepseek-reasoner");
  let formEnabled = $state(true);
  let formError = $state<string | null>(null);
  let formSaving = $state(false);
  let testResult = $state<{ ok: boolean; message: string } | null>(null);
  let testing = $state(false);

  onMount(async () => {
    await refreshData();
  });

  async function refreshData() {
    try {
      models = await fetchModels();
    } catch {}
    try {
      customProviders = await fetchCustomProviders();
    } catch {}
  }

  const openCodeModels = $derived(models.filter((m) => m.owned_by === "opencode" || m.id.endsWith("-free") || m.id === "big-pickle"));
  const codeBuddyModels = $derived(models.filter((m) => m.owned_by === "codebuddy"));
  const customModels = $derived(models.filter((m) => m.owned_by === "custom" || (!openCodeModels.includes(m) && !codeBuddyModels.includes(m))));

  async function handleStartOAuth() {
    try {
      oauthStatusText = "Requesting CodeBuddy authorization link...";
      oauthData = await startCodeBuddyOAuth();
      oauthPolling = true;
      oauthStatusText = "Waiting for CodeBuddy authorization in the opened browser...";

      if (pollIntervalHandle) clearInterval(pollIntervalHandle);

      pollIntervalHandle = setInterval(async () => {
        if (!oauthData) return;
        try {
          const res = await pollCodeBuddyOAuth(oauthData.state);
          if (res.status === "success") {
            oauthStatusText = "Login successful! Tokens saved.";
            oauthPolling = false;
            clearInterval(pollIntervalHandle);
            await refreshData();
          } else if (res.status === "error") {
            oauthStatusText = res.message || "Authorization failed. Please try again.";
            oauthPolling = false;
            clearInterval(pollIntervalHandle);
          }
        } catch (err: any) {
          // keep polling until timeout
        }
      }, 2500);
    } catch (err: any) {
      oauthStatusText = `Error: ${err.message}`;
      oauthPolling = false;
    }
  }

  function openNewProviderModal(preset?: "deepseek" | "anthropic" | "openrouter" | "ollama") {
    isEditing = false;
    formError = null;
    testResult = null;
    if (preset === "deepseek") {
      formId = "deepseek";
      formName = "DeepSeek Official";
      formBaseUrl = "https://api.deepseek.com/v1";
      formApiKey = "";
      formProtocol = "openai";
      formModels = "deepseek-chat, deepseek-reasoner";
    } else if (preset === "anthropic") {
      formId = "anthropic";
      formName = "Anthropic Claude Upstream";
      formBaseUrl = "https://api.anthropic.com/v1";
      formApiKey = "";
      formProtocol = "anthropic";
      formModels = "claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022";
    } else if (preset === "openrouter") {
      formId = "openrouter";
      formName = "OpenRouter";
      formBaseUrl = "https://openrouter.ai/api/v1";
      formApiKey = "";
      formProtocol = "openai";
      formModels = "anthropic/claude-3.5-sonnet, meta-llama/llama-3.3-70b-instruct";
    } else if (preset === "ollama") {
      formId = "ollama";
      formName = "Ollama Local";
      formBaseUrl = "http://127.0.0.1:11434/v1";
      formApiKey = "";
      formProtocol = "openai";
      formModels = "llama3.2, qwen2.5-coder";
    } else {
      formId = "";
      formName = "";
      formBaseUrl = "https://api.openai.com/v1";
      formApiKey = "";
      formProtocol = "openai";
      formModels = "gpt-4o, gpt-4o-mini";
    }
    formEnabled = true;
    showProviderModal = true;
  }

  function editProvider(p: CustomProviderConfig) {
    isEditing = true;
    formError = null;
    testResult = null;
    formId = p.id;
    formName = p.name;
    formBaseUrl = p.baseUrl;
    formApiKey = "";
    formProtocol = p.protocol;
    formModels = p.models.join(", ");
    formEnabled = p.enabled;
    showProviderModal = true;
  }

  async function handleTestCurrent() {
    testing = true;
    testResult = null;
    try {
      const parsedModels = formModels.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await testCustomProvider({
        id: formId || "test-temp",
        name: formName || "Test",
        baseUrl: formBaseUrl,
        apiKey: formApiKey,
        protocol: formProtocol,
        models: parsedModels,
        enabled: formEnabled,
      });
      if (res.ok) {
        testResult = {
          ok: true,
          message: `Success! Latency: ${res.latencyMs || 0}ms (${res.modelsCount ?? parsedModels.length} models valid)`,
        };
      } else {
        testResult = {
          ok: false,
          message: `Failed: ${res.error || "Connection error"}`,
        };
      }
    } catch (err: any) {
      testResult = { ok: false, message: `Error: ${err.message}` };
    } finally {
      testing = false;
    }
  }

  async function handleSaveProvider() {
    if (!formId.trim() || !formName.trim() || !formBaseUrl.trim()) {
      formError = "Provider ID, Name, and Base URL are required.";
      return;
    }
    formSaving = true;
    formError = null;
    try {
      const parsedModels = formModels.split(",").map((s) => s.trim()).filter(Boolean);
      await saveCustomProvider({
        id: formId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ""),
        name: formName.trim(),
        baseUrl: formBaseUrl.trim(),
        apiKey: formApiKey.trim(),
        protocol: formProtocol,
        models: parsedModels,
        enabled: formEnabled,
      });
      showProviderModal = false;
      await refreshData();
    } catch (err: any) {
      formError = err.message;
    } finally {
      formSaving = false;
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Are you sure you want to delete custom provider "${id}"?`)) return;
    try {
      await deleteCustomProvider(id);
      await refreshData();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  }

  async function toggleProvider(p: CustomProviderConfig) {
    try {
      await saveCustomProvider({
        ...p,
        enabled: !p.enabled,
      });
      await refreshData();
    } catch (err: any) {
      alert(`Failed to update provider: ${err.message}`);
    }
  }
</script>

<div class="space-y-6">
  <!-- Provider 1: OpenCode Free-Tier -->
  <Card padding="md" elev class="space-y-5">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-text-main tracking-tight">OpenCode Free-Tier</h2>
          <Badge tone={health?.tls ? "neutral" : "warning"} size="sm">
            {health?.tls || "TLS profile not reported"}
          </Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          TLS profile and configured request anchors as reported by AlphaWay health. These values do not represent a live upstream connectivity probe.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-mono px-2.5 py-1 rounded-[8px] bg-surface-2 text-text-muted border border-border">
          Adapter: {health?.providers?.opencode?.status || "unknown"}
        </span>
        <Badge
          tone={gateStatus === "open" ? "success" : gateStatus === "unknown" ? "neutral" : "warning"}
          size="sm"
        >
          Local retry gate: {gateStatus.toUpperCase()}
        </Badge>
      </div>
    </div>

    <!-- Configured request anchors -->
    <div class="space-y-3">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-text-subtle">
        Configured Request Anchors
      </h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div class="p-3 rounded-[10px] bg-surface-2 border border-border-subtle space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-text-muted font-medium">Tool anchors</span>
            <span class="text-text-main font-mono">{toolAnchors.length}</span>
          </div>
          <p class="font-mono text-text-main break-all">
            {toolAnchors.length ? toolAnchors.join(", ") : "Not reported"}
          </p>
        </div>
        <div class="p-3 rounded-[10px] bg-surface-2 border border-border-subtle space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-text-muted font-medium">Header anchors</span>
            <span class="text-text-main font-mono">{headerAnchors.length}</span>
          </div>
          <p class="font-mono text-text-main break-all">
            {headerAnchors.length ? headerAnchors.join(", ") : "Not reported"}
          </p>
        </div>
      </div>
      <p class="text-[11px] text-text-muted">
        Anchor lists describe the request shape AlphaWay configures. They do not confirm acceptance by the upstream service.
      </p>
    </div>

    <!-- Models List -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-text-subtle">
          Free-Tier Models ({openCodeModels.length})
        </h3>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {#each openCodeModels as m}
          <div class="p-3 rounded-[10px] bg-surface-2 border border-border-subtle flex items-center justify-between text-xs hover:border-brand-500/40 transition-colors">
            <span class="font-mono text-text-main font-semibold truncate">{m.id}</span>
            <Badge tone="success" size="sm">FREE</Badge>
          </div>
        {:else}
          <div class="col-span-full p-4 rounded-[10px] bg-surface-2 border border-border-subtle text-center text-xs text-text-muted">
            No models discovered yet. Fetching upstream...
          </div>
        {/each}
      </div>
    </div>
  </Card>

  <!-- Provider 2: CodeBuddy International -->
  <Card padding="md" elev class="space-y-5">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-text-main tracking-tight">CodeBuddy International</h2>
          <Badge tone="primary" size="sm">WorkBuddy 5.8.4</Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          Tencent Hunyuan backend with OAuth Device Flow and RFC 9562 UUIDv7 session routing.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs font-mono px-2.5 py-1 rounded-[8px] bg-surface-2 text-text-muted border border-border">
          Credential: {health?.providers?.codebuddy?.status || "unknown"}
        </span>
      </div>
    </div>

    <!-- OAuth Actions -->
    <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-text-main">Device Authorization</h3>
          <p class="text-xs text-text-muted">
            Log in via Tencent OAuth to generate bearer tokens without manual web extraction.
          </p>
        </div>
        <Button variant="primary" size="sm" onclick={handleStartOAuth} disabled={oauthPolling}>
          {#if oauthPolling}
            <span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
            <span>Checking Authorization...</span>
          {:else}
            <span class="material-symbols-outlined text-[16px]">login</span>
            <span>Start OAuth Login</span>
          {/if}
        </Button>
      </div>

      {#if oauthData && oauthPolling && oauthAuthUrl}
        <div class="mt-3 p-3 rounded-[10px] bg-surface border border-brand-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div>
            <span class="text-text-muted">Open in browser:</span>
            <a href={oauthAuthUrl} target="_blank" rel="noopener noreferrer" class="ml-1 text-brand-400 font-semibold underline">
              {oauthData.authUrl}
            </a>
          </div>

        </div>
      {/if}

      {#if oauthStatusText}
        <p class="text-xs text-brand-400 font-mono">{oauthStatusText}</p>
      {/if}
    </div>

    <!-- Models List -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-text-subtle">
          Active Models ({codeBuddyModels.length})
        </h3>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {#each codeBuddyModels as m}
          <div class="p-3 rounded-[10px] bg-surface-2 border border-border-subtle flex items-center justify-between text-xs hover:border-brand-500/40 transition-colors">
            <span class="font-mono text-text-main font-semibold truncate">{m.id}</span>
            <Badge tone="info" size="sm">HUNYUAN</Badge>
          </div>
        {:else}
          <div class="col-span-full p-4 rounded-[10px] bg-surface-2 border border-border-subtle text-center text-xs text-text-muted">
            No CodeBuddy models active. Complete OAuth login above to activate.
          </div>
        {/each}
      </div>
    </div>
  </Card>

  <!-- Provider 3: 3rd-Party Custom Providers (OpenRouter, DeepSeek, Anthropic, Ollama, etc.) -->
  <Card padding="md" elev class="space-y-5">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-text-main tracking-tight">3rd-Party & Custom Upstream Providers</h2>
          <Badge tone="warning" size="sm">OpenAI & Anthropic Protocols</Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          Connect custom API upstreams (OpenRouter, DeepSeek, Anthropic, Ollama, Groq) with seamless auto-routing and DLP masking.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="primary" size="sm" onclick={() => openNewProviderModal()}>
          <span class="material-symbols-outlined text-[16px]">add</span>
          <span>Add Provider</span>
        </Button>
      </div>
    </div>

    <!-- Quick Presets -->
    <div class="p-3 rounded-[10px] bg-surface-2 border border-border-subtle flex flex-wrap items-center gap-2 text-xs">
      <span class="text-text-muted font-medium">Quick Presets:</span>
      <button onclick={() => openNewProviderModal("deepseek")} class="px-2.5 py-1 rounded-[6px] bg-surface hover:bg-surface-3 text-text-main border border-border transition-colors font-medium">
        DeepSeek
      </button>
      <button onclick={() => openNewProviderModal("anthropic")} class="px-2.5 py-1 rounded-[6px] bg-surface hover:bg-surface-3 text-text-main border border-border transition-colors font-medium">
        Anthropic Claude
      </button>
      <button onclick={() => openNewProviderModal("openrouter")} class="px-2.5 py-1 rounded-[6px] bg-surface hover:bg-surface-3 text-text-main border border-border transition-colors font-medium">
        OpenRouter
      </button>
      <button onclick={() => openNewProviderModal("ollama")} class="px-2.5 py-1 rounded-[6px] bg-surface hover:bg-surface-3 text-text-main border border-border transition-colors font-medium">
        Ollama Local
      </button>
    </div>

    <!-- Custom Providers List -->
    <div class="space-y-3">
      {#if customProviders.length === 0}
        <div class="p-8 rounded-[12px] bg-surface-2 border border-border-subtle text-center space-y-3">
          <span class="material-symbols-outlined text-4xl text-text-subtle">dns</span>
          <p class="text-xs text-text-muted max-w-md mx-auto">
            No 3rd-party custom providers configured yet. Click "Add Provider" or choose a Quick Preset above to connect external OpenAI or Anthropic format APIs.
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-3">
          {#each customProviders as p}
            <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-border transition-all">
              <div class="space-y-1.5 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-text-main text-sm">{p.name}</h3>
                  <code class="text-xs font-mono px-2 py-0.5 rounded bg-surface text-text-muted border border-border-subtle">
                    {p.id}
                  </code>
                  <Badge tone={p.protocol === "anthropic" ? "primary" : "info"} size="sm">
                    {p.protocol.toUpperCase()}
                  </Badge>
                  <Badge tone={p.enabled ? "success" : "neutral"} size="sm">
                    {p.enabled ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <div class="flex items-center gap-2 text-xs text-text-muted">
                  <span class="font-mono truncate">{p.baseUrl}</span>
                  <span>•</span>
                  <span>Key: {p.hasApiKey ? "Configured (secret hidden)" : "None"}</span>
                </div>
                <div class="flex items-center gap-1.5 flex-wrap pt-1">
                  {#each p.models as modelId}
                    <span class="text-[11px] font-mono px-2 py-0.5 rounded-[6px] bg-surface text-brand-400 border border-border-subtle">
                      {modelId}
                    </span>
                  {/each}
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="sm" onclick={() => toggleProvider(p)}>
                  <span class="material-symbols-outlined text-[16px]">
                    {p.enabled ? "pause_circle" : "play_circle"}
                  </span>
                  <span>{p.enabled ? "Disable" : "Enable"}</span>
                </Button>
                <Button variant="outline" size="sm" onclick={() => editProvider(p)}>
                  <span class="material-symbols-outlined text-[16px]">edit</span>
                  <span>Edit</span>
                </Button>
                <Button variant="ghost" size="sm" class="text-rose-400 hover:text-rose-300" onclick={() => handleDelete(p.id)}>
                  <span class="material-symbols-outlined text-[16px]">delete</span>
                </Button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </Card>
</div>

<!-- Modal Form for Add/Edit Provider -->
{#if showProviderModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
    <div class="w-full max-w-lg rounded-[16px] bg-surface-1 border border-border p-6 shadow-2xl space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-border-subtle">
        <h3 class="text-base font-bold text-text-main">
          {isEditing ? "Edit Custom Provider" : "Add 3rd-Party Upstream Provider"}
        </h3>
        <button onclick={() => (showProviderModal = false)} class="p-1 rounded-[6px] text-text-muted hover:text-text-main">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label for="provider-id" class="block font-medium text-text-muted mb-1">Provider ID (Namespace)</label>
          <input
            id="provider-id"
            type="text"
            bind:value={formId}
            disabled={isEditing}
            placeholder="e.g. deepseek, openrouter, custom"
            class="w-full px-3 py-2 rounded-[8px] bg-surface-2 border border-border text-text-main font-mono text-xs focus:outline-none focus:border-brand-500 disabled:opacity-60"
          />
        </div>

        <div>
          <label for="provider-name" class="block font-medium text-text-muted mb-1">Display Name</label>
          <input
            id="provider-name"
            type="text"
            bind:value={formName}
            placeholder="e.g. DeepSeek V3 Official"
            class="w-full px-3 py-2 rounded-[8px] bg-surface-2 border border-border text-text-main text-xs focus:outline-none focus:border-brand-500"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="provider-protocol" class="block font-medium text-text-muted mb-1">Protocol Format</label>
            <select
              id="provider-protocol"
              bind:value={formProtocol}
              class="w-full px-3 py-2 rounded-[8px] bg-surface-2 border border-border text-text-main text-xs focus:outline-none focus:border-brand-500 font-mono"
            >
              <option value="openai">OpenAI (/v1/chat/completions)</option>
              <option value="anthropic">Anthropic (/v1/messages)</option>
            </select>
          </div>
          <div>
            <span class="block font-medium text-text-muted mb-1">Status</span>
            <label class="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" bind:checked={formEnabled} class="rounded bg-surface-2 border-border text-brand-500" />
              <span class="text-text-main">Enabled for Routing</span>
            </label>
          </div>
        </div>

        <div>
          <label for="provider-baseurl" class="block font-medium text-text-muted mb-1">Base URL</label>
          <input
            id="provider-baseurl"
            type="text"
            bind:value={formBaseUrl}
            placeholder="https://api.deepseek.com/v1"
            class="w-full px-3 py-2 rounded-[8px] bg-surface-2 border border-border text-text-main font-mono text-xs focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label for="provider-apikey" class="block font-medium text-text-muted mb-1">API Key</label>
          <input
            id="provider-apikey"
            type="password"
            bind:value={formApiKey}
            placeholder="Paste an upstream key, or leave blank to keep the current key"
            class="w-full px-3 py-2 rounded-[8px] bg-surface-2 border border-border text-text-main font-mono text-xs focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label for="provider-models" class="block font-medium text-text-muted mb-1">Supported Models (comma-separated)</label>
          <input
            id="provider-models"
            type="text"
            bind:value={formModels}
            placeholder="deepseek-chat, deepseek-reasoner"
            class="w-full px-3 py-2 rounded-[8px] bg-surface-2 border border-border text-text-main font-mono text-xs focus:outline-none focus:border-brand-500"
          />
          <p class="text-[11px] text-text-subtle mt-1">
            Calls can use either direct model name (<code>deepseek-chat</code>) or namespaced (<code>{formId || "id"}/deepseek-chat</code>).
          </p>
        </div>

        {#if testResult}
          <div class="p-2.5 rounded-[8px] border text-xs font-mono {testResult.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}">
            {testResult.message}
          </div>
        {/if}

        {#if formError}
          <div class="p-2.5 rounded-[8px] bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            {formError}
          </div>
        {/if}
      </div>

      <div class="flex items-center justify-between pt-3 border-t border-border-subtle">
        <Button variant="ghost" size="sm" onclick={handleTestCurrent} disabled={testing || !formBaseUrl}>
          {#if testing}
            <span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
            <span>Testing...</span>
          {:else}
            <span class="material-symbols-outlined text-[16px]">bolt</span>
            <span>Test Connection</span>
          {/if}
        </Button>

        <div class="flex items-center gap-2">
          <Button variant="ghost" size="sm" onclick={() => (showProviderModal = false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onclick={handleSaveProvider} disabled={formSaving}>
            {#if formSaving}
              <span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
              <span>Saving...</span>
            {:else}
              <span class="material-symbols-outlined text-[16px]">save</span>
              <span>Save Provider</span>
            {/if}
          </Button>
        </div>
      </div>
    </div>
  </div>
{/if}