<script lang="ts">
  import { onMount } from "svelte";
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import { fetchProxyStatus, updateProxy, testProxy } from "../lib/api";
  import type { ProxyStatus, ProxyTestResult } from "../lib/types";

  let proxyStatus = $state<ProxyStatus>({
    url: null,
    mode: "direct",
    locked: false,
    source: "none",
  });

  let proxyInput = $state<string>("");
  let isTesting = $state<boolean>(false);
  let isSaving = $state<boolean>(false);
  let testResult = $state<ProxyTestResult | null>(null);
  let statusMessage = $state<string | null>(null);

  onMount(async () => {
    try {
      proxyStatus = await fetchProxyStatus();
      if (proxyStatus.url) proxyInput = proxyStatus.url;
    } catch {}
  });

  async function handleTestProxy() {
    if (!proxyInput.trim()) return;
    isTesting = true;
    testResult = null;
    statusMessage = null;
    try {
      testResult = await testProxy(proxyInput.trim());
    } catch (err: any) {
      testResult = { ok: false, error: err.message };
    } finally {
      isTesting = false;
    }
  }

  async function handleSaveProxy() {
    isSaving = true;
    statusMessage = null;
    try {
      await updateProxy(proxyInput.trim());
      proxyStatus = await fetchProxyStatus();
      statusMessage = proxyInput.trim() ? "Proxy updated successfully!" : "Switched to Direct Egress.";
      setTimeout(() => (statusMessage = null), 3000);
    } catch (err: any) {
      statusMessage = `Error: ${err.message}`;
    } finally {
      isSaving = false;
    }
  }

  async function handleClearProxy() {
    proxyInput = "";
    await handleSaveProxy();
  }
</script>

<div class="space-y-6">
  <!-- Egress Proxy Card -->
  <Card padding="md" elev class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-text-main tracking-tight">Egress Proxy Configuration</h2>
          <Badge tone={proxyStatus.mode === "direct" ? "neutral" : "primary"} size="sm" dot>
            {proxyStatus.mode === "direct" ? "Direct Connection" : "Proxy Routed"}
          </Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          Route all upstream inference and discovery requests through an egress tunnel to prevent IP fatigue.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs px-2.5 py-1 rounded-[8px] bg-surface-2 text-text-muted font-mono border border-border capitalize">
          Mode: {proxyStatus.mode}
        </span>
      </div>
    </div>

    {#if proxyStatus.locked}
      <div class="p-3.5 rounded-[10px] bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
        Proxy is currently locked by the <code class="font-mono bg-black/40 px-1 py-0.5 rounded">UPSTREAM_PROXY_URL</code> environment variable.
      </div>
    {/if}

    <!-- Proxy Input Form -->
    <div class="space-y-4">
      <div class="space-y-1.5">
        <label for="proxy-url-input" class="text-xs font-medium text-text-muted">Proxy URL (HTTP / HTTPS)</label>
        <div class="flex flex-col sm:flex-row gap-3">
          <input
            id="proxy-url-input"
            type="text"
            bind:value={proxyInput}
            placeholder="http://user:pass@proxy-host:port"
            disabled={proxyStatus.locked || isSaving || isTesting}
            class="flex-1 bg-surface-2 border border-border-subtle rounded-[10px] px-4 py-2.5 text-xs text-text-main font-mono focus:outline-none focus:border-brand-500/50 disabled:opacity-50"
          />

          <div class="flex items-center gap-2">
            <button
              type="button"
              id="proxy-test-btn"
              class="px-4 py-2.5 rounded-[10px] bg-surface-2 hover:bg-surface-3 text-text-main text-xs font-medium border border-border transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              disabled={!proxyInput.trim() || isTesting}
              onclick={handleTestProxy}
            >
              {#if isTesting}
                <span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                <span>Testing...</span>
              {:else}
                <span class="material-symbols-outlined text-[16px]">network_check</span>
                <span>Test Connection</span>
              {/if}
            </button>

            <button
              type="button"
              id="proxy-save-btn"
              class="px-4 py-2.5 rounded-[10px] bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              disabled={proxyStatus.locked || isSaving}
              onclick={handleSaveProxy}
            >
              {#if isSaving}
                <span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                <span>Saving...</span>
              {:else}
                <span class="material-symbols-outlined text-[16px]">save</span>
                <span>Save Proxy</span>
              {/if}
            </button>

            {#if proxyInput}
              <button
                type="button"
                onclick={handleClearProxy}
                disabled={proxyStatus.locked || isSaving}
                class="px-3 py-2.5 rounded-[10px] bg-surface-2 hover:bg-surface-3 text-text-muted hover:text-red-400 text-xs font-medium border border-border transition-colors cursor-pointer"
                title="Reset to Direct"
              >
                Direct
              </button>
            {/if}
          </div>
        </div>
      </div>

      {#if statusMessage}
        <div class="p-3 rounded-[10px] bg-surface-2 border border-border-subtle text-xs font-mono text-emerald-400 flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px]">info</span>
          <span>{statusMessage}</span>
        </div>
      {/if}

      <!-- Test Result Box -->
      {#if testResult}
        <div class="p-4 rounded-[12px] border text-xs font-mono space-y-2 {testResult.ok ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}">
          <div class="flex items-center justify-between font-semibold">
            <span class={testResult.ok ? 'text-emerald-400' : 'text-red-400'}>
              {testResult.ok ? "✓ Connection Successful" : "✗ Connection Failed"}
            </span>
            {#if testResult.rttMs}
              <span class="text-text-muted">{testResult.rttMs}ms</span>
            {/if}
          </div>

          {#if testResult.exitIp}
            <div class="text-text-main">
              Exit IP: <span class="text-brand-400 font-bold">{testResult.exitIp}</span>
              {#if testResult.loc} ({testResult.loc}){/if}
            </div>
          {/if}

          {#if testResult.error}
            <div class="text-red-400 font-sans">
              {testResult.error}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </Card>
</div>
