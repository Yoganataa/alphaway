<script lang="ts">
  import { onMount } from "svelte";
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import Modal from "../lib/ui/Modal.svelte";
  import {
    fetchProxyStatus,
    updateProxy,
    updateProxyPool,
    testProxy,
    testProxyPool,
  } from "../lib/api";
  import type {
    ProxyStatus,
    ProxyTestResult,
    ProxyPoolEntryStatus,
    ProxyPoolStrategy,
    ProxyPoolTestEntryResult,
  } from "../lib/types";
  import { notifications } from "../lib/notifications";

  interface EditablePoolEntry extends ProxyPoolEntryStatus {
    url?: string;
    token?: string;
  }

  let proxyStatus = $state<ProxyStatus | null>(null);
  let pools = $state<EditablePoolEntry[]>([]);
  let rotationMode = $state<ProxyPoolStrategy>("round-robin");
  let proxyInput = $state("");
  let isLoading = $state(true);
  let hasLoaded = $state(false);
  let loadError = $state<string | null>(null);
  let lastLoadedAt = $state<number | null>(null);
  let refreshInFlight = false;
  let isTesting = $state(false);
  let isSaving = $state(false);
  let isPoolTesting = $state(false);
  let testResult = $state<ProxyTestResult | null>(null);
  let poolTestResults = $state<Record<string, ProxyPoolTestEntryResult>>({});
  let statusMessage = $state<string | null>(null);

  let isAddModalOpen = $state(false);
  let isBulkModalOpen = $state(false);
  let newName = $state("");
  let newUrl = $state("");
  let newToken = $state("");
  let bulkInput = $state("");

  onMount(() => {
    void refreshProxyStatus();
  });

  function formatProxyStatusTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  async function refreshProxyStatus() {
    // Pool reads can be triggered by both the initial load and a live probe.
    // Keep only one refresh in flight so an older response cannot overwrite a newer snapshot.
    if (refreshInFlight) return;
    refreshInFlight = true;
    isLoading = true;
    try {
      const status = await fetchProxyStatus();
      proxyStatus = status;
      pools = status.pool.entries;
      rotationMode = status.pool.strategy;
      hasLoaded = true;
      loadError = null;
      lastLoadedAt = Date.now();
    } catch (error: any) {
      // Never replace an unread/known persisted pool with an assumed empty list.
      // Retain the last successful snapshot until a fresh read succeeds.
      loadError = error instanceof Error ? error.message : "Unknown proxy configuration error";
    } finally {
      isLoading = false;
      refreshInFlight = false;
    }
  }

  function newPoolEntry(urlValue: string, labelValue: string, tokenValue = ""): EditablePoolEntry {
    const parsed = new URL(urlValue);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only HTTP and HTTPS proxy URLs are supported. SOCKS5 is not supported by Bun fetch.");
    }
    const hostname = parsed.hostname.toLowerCase();
    const relay = hostname.endsWith(".workers.dev") || hostname.endsWith(".pages.dev");
    const id = `proxy-${crypto.randomUUID()}`;
    return {
      id,
      label: labelValue.trim() || parsed.host,
      host: parsed.host,
      kind: relay ? "relay" : parsed.protocol.slice(0, -1) as "http" | "https",
      enabled: true,
      weight: 1,
      state: "ready",
      cooldownMsLeft: 0,
      cooldownUntil: 0,
      failures: 0,
      lastError: null,
      lastOkAt: null,
      lastUsedAt: null,
      url: urlValue.trim(),
      ...(tokenValue.trim() ? { token: tokenValue.trim() } : {}),
    };
  }

  async function savePool(nextEntries: EditablePoolEntry[] = pools): Promise<boolean> {
    if (!hasLoaded || loadError || isSaving) return false;
    isSaving = true;
    statusMessage = null;
    try {
      const entries = nextEntries.map((entry) => ({
        id: entry.id,
        label: entry.label,
        enabled: entry.enabled,
        weight: entry.weight,
        ...(entry.url ? { url: entry.url } : {}),
        ...(entry.token ? { token: entry.token } : {}),
      }));
      const updated = await updateProxyPool({ entries, strategy: rotationMode });
      proxyStatus = updated;
      pools = updated.pool.entries;
      poolTestResults = {};
      statusMessage = "Proxy pool configuration saved.";
      notifications.success(statusMessage);
      return true;
    } catch (error: any) {
      statusMessage = `Error: ${error.message}`;
      notifications.error(statusMessage);
      return false;
    } finally {
      isSaving = false;
    }
  }

  async function handleTestProxy() {
    if (!proxyInput.trim()) return;
    isTesting = true;
    testResult = null;
    try {
      testResult = await testProxy(proxyInput.trim());
      if (testResult.ok) {
        notifications.success(`Proxy reachable (${testResult.latencyMs ?? "latency unavailable"}ms)`);
      } else {
        notifications.error(`Proxy check failed: ${testResult.error || "Unknown error"}`);
      }
    } catch (error: any) {
      testResult = { ok: false, error: error.message };
      notifications.error(`Proxy check failed: ${error.message}`);
    } finally {
      isTesting = false;
    }
  }

  async function handleSaveProxy() {
    if (!hasLoaded || loadError || isSaving) return;
    isSaving = true;
    statusMessage = null;
    try {
      proxyStatus = await updateProxy(proxyInput.trim());
      statusMessage = proxyInput.trim() ? "Single proxy fallback updated." : "Single proxy fallback cleared.";
      notifications.success(statusMessage);
    } catch (error: any) {
      statusMessage = `Error: ${error.message}`;
      notifications.error(statusMessage);
    } finally {
      isSaving = false;
    }
  }

  async function handleAddSingle() {
    if (!newUrl.trim()) return;
    try {
      const entry = newPoolEntry(newUrl.trim(), newName, newToken);
      const saved = await savePool([...pools, entry]);
      if (!saved) return;
      isAddModalOpen = false;
      newName = "";
      newUrl = "";
      newToken = "";
    } catch (error: any) {
      notifications.error(error.message);
    }
  }

  async function handleBulkImport() {
    const lines = bulkInput.split("\n").map((line) => line.trim()).filter(Boolean);
    const additions: EditablePoolEntry[] = [];
    try {
      for (const line of lines) {
        const [url, ...labelParts] = line.split(/\s+/);
        additions.push(newPoolEntry(url, labelParts.join(" ")));
      }
      if (additions.length === 0) return;
      const saved = await savePool([...pools, ...additions]);
      if (!saved) return;
      isBulkModalOpen = false;
      bulkInput = "";
      notifications.success(`Imported ${additions.length} proxy entr${additions.length === 1 ? "y" : "ies"}.`);
    } catch (error: any) {
      notifications.error(error.message);
    }
  }

  async function handleRemoveEntry(entry: EditablePoolEntry) {
    const next = pools.filter((item) => item.id !== entry.id);
    await savePool(next);
  }

  async function handleToggleEntry(entry: EditablePoolEntry, enabled: boolean) {
    const next = pools.map((item) => item.id === entry.id ? { ...item, enabled } : item);
    await savePool(next);
  }

  async function handleStrategyChange() {
    await savePool();
  }

  async function runPoolTest(entryId?: string) {
    if (entryId) {
      poolTestResults = { ...poolTestResults, [entryId]: { id: entryId, label: "Testing", host: null, skipped: true, reason: "Testing…" } };
    }
    isPoolTesting = true;
    try {
      const result = await testProxyPool({ timeoutMs: 15000, ...(entryId ? { entryId } : {}) });
      poolTestResults = {
        ...poolTestResults,
        ...Object.fromEntries(result.entries.map((entry) => [entry.id, entry])),
      };
      await refreshProxyStatus();
      if (result.error) throw new Error(result.error);
      if (result.ok) {
        notifications.success(entryId ? "Proxy entry probe succeeded." : "At least one enabled pool entry passed its probe.");
      } else {
        notifications.error(entryId ? "Proxy entry probe did not pass." : "No enabled pool entry passed its probe.");
      }
    } catch (error: any) {
      notifications.error(`Proxy pool probe failed: ${error.message}`);
    } finally {
      isPoolTesting = false;
    }
  }
</script>

<div class="space-y-6">
  <Card padding="md" elev class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-text-main tracking-tight">Egress Proxy Configuration</h2>
          <Badge
            tone={!hasLoaded || loadError ? "warning" : proxyStatus?.mode === "direct" ? "neutral" : "primary"}
            size="sm"
            dot
          >
            {!hasLoaded ? (isLoading ? "Loading" : "Unavailable") : loadError ? "Stale Data" : proxyStatus?.mode === "pool" ? "Pool Routed" : proxyStatus?.mode === "proxy" ? "Single Proxy" : "Direct Connection"}
          </Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          Route all upstream inference and discovery requests through your configured single proxy or egress pool. Runtime credentials are never returned to the browser.
        </p>
      </div>
      <span class="text-xs px-2.5 py-1 rounded-[8px] bg-surface-2 text-text-muted border border-border font-mono">
        Mode: {proxyStatus?.mode ?? (isLoading ? "loading" : "unavailable")}
      </span>
    </div>

    {#if loadError}
      <div
        id="proxy-config-load-error"
        role="alert"
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[10px] border border-amber-500/30 bg-amber-500/5 p-3"
      >
        <div class="min-w-0">
          <p class="text-xs font-semibold text-amber-400">
            {hasLoaded
              ? "Proxy configuration refresh failed. Showing the last successful snapshot."
              : "Persisted proxy configuration could not be loaded. Changes are blocked until the saved state can be read."}
          </p>
          <p class="mt-1 break-words text-xs text-text-muted">{loadError}</p>
          {#if lastLoadedAt !== null}
            <p class="mt-1 text-[11px] text-text-muted">Last successful refresh: {formatProxyStatusTime(lastLoadedAt)}</p>
          {/if}
        </div>
        <Button id="proxy-config-retry" variant="secondary" size="sm" onclick={refreshProxyStatus} disabled={isLoading}>
          {isLoading ? "Retrying..." : "Retry Load"}
        </Button>
      </div>
    {/if}

    {#if proxyStatus?.locked}
      <div class="p-3.5 rounded-[10px] bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
        Egress configuration is locked by an environment override. Update <code class="font-mono">UPSTREAM_PROXY_URL</code> or <code class="font-mono">UPSTREAM_PROXY_POOL</code> and restart AlphaWay.
      </div>
    {/if}

    <div class="space-y-3">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-sm font-semibold text-text-main">Single Proxy / Fallback</h3>
          <p class="text-xs text-text-muted mt-0.5">
            Current endpoint: {proxyStatus?.proxy || "Direct egress"}
            {#if proxyStatus?.hasCredentials}
              <span> · credentials configured (hidden)</span>
            {/if}
          </p>
        </div>
        {#if proxyStatus?.source === "env"}
          <Badge tone="warning" size="sm">Environment managed</Badge>
        {:else if proxyStatus?.source === "database"}
          <Badge tone="success" size="sm">SQLite persisted</Badge>
        {/if}
      </div>
      <div class="flex flex-col sm:flex-row gap-3">
        <input
          id="proxy-url-input"
          type="password"
          bind:value={proxyInput}
          placeholder="Enter a replacement http(s)://[user:pass@]host:port"
          class="flex-1 px-3.5 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main font-mono focus:outline-hidden focus:border-brand-500"
          disabled={Boolean(proxyStatus?.locked) || isSaving}
          autocomplete="new-password"
        />
        <div class="flex items-center gap-2">
          <Button id="proxy-test-btn" variant="secondary" size="sm" onclick={handleTestProxy} disabled={isTesting || !proxyInput.trim()}>
            <span class="material-symbols-outlined text-[16px] {isTesting ? 'animate-spin' : ''}">speed</span>
            <span>{isTesting ? "Testing..." : "Test URL"}</span>
          </Button>
          <Button id="proxy-save-btn" variant="primary" size="sm" onclick={handleSaveProxy} disabled={!hasLoaded || Boolean(loadError) || isSaving || Boolean(proxyStatus?.locked)}>
            <span class="material-symbols-outlined text-[16px]">save</span>
            <span>{isSaving ? "Saving..." : "Save Fallback"}</span>
          </Button>
          {#if proxyInput.trim()}
            <Button variant="ghost" size="sm" onclick={() => { proxyInput = ""; void handleSaveProxy(); }} disabled={!hasLoaded || Boolean(loadError) || isSaving || Boolean(proxyStatus?.locked)}>
              Clear
            </Button>
          {/if}
        </div>
      </div>

      {#if testResult}
        <div class="p-3.5 rounded-[8px] border text-xs flex items-center gap-2 font-mono {testResult.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}">
          <span>{testResult.ok ? "Connection verified" : testResult.error || "Probe failed"}</span>
          {#if testResult.latencyMs !== undefined && testResult.latencyMs !== null}
            <span>· {testResult.latencyMs} ms</span>
          {/if}
        </div>
      {/if}
      {#if statusMessage}
        <p class="text-xs text-text-muted">{statusMessage}</p>
      {/if}
    </div>
  </Card>

  <Card padding="md" elev class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-bold text-text-main">Multi-Proxy Rotation Pool</h3>
          <span class="text-xs text-text-muted font-mono">({pools.length} configured)</span>
        </div>
        <p class="text-xs text-text-muted">
          Pool entries, strategy, and health are read from AlphaWay's persisted egress engine. HTTP, HTTPS, and configured relay endpoints are supported; SOCKS5 is rejected by the Bun runtime.
        </p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <select
          bind:value={rotationMode}
          onchange={handleStrategyChange}
          disabled={!hasLoaded || Boolean(loadError) || Boolean(proxyStatus?.locked) || isSaving}
          class="px-2.5 py-1.5 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main font-medium focus:outline-hidden"
        >
          <option value="round-robin">Strategy: Round-Robin</option>
          <option value="failover">Strategy: Failover</option>
          <option value="random">Strategy: Weighted Random</option>
        </select>
        <Button variant="secondary" size="xs" onclick={() => runPoolTest()} disabled={isPoolTesting || isLoading || pools.length === 0}>
          <span class="material-symbols-outlined text-[14px] {isPoolTesting ? 'animate-spin' : ''}">network_check</span>
          <span>{isPoolTesting ? "Probing..." : "Ping All"}</span>
        </Button>
        <Button variant="secondary" size="xs" onclick={() => (isBulkModalOpen = true)} disabled={!hasLoaded || Boolean(loadError) || Boolean(proxyStatus?.locked) || isSaving}>
          <span class="material-symbols-outlined text-[14px]">file_upload</span>
          <span>Bulk Import</span>
        </Button>
        <Button variant="primary" size="xs" onclick={() => (isAddModalOpen = true)} disabled={!hasLoaded || Boolean(loadError) || Boolean(proxyStatus?.locked) || isSaving}>
          <span class="material-symbols-outlined text-[14px]">add</span>
          <span>Add Node</span>
        </Button>
      </div>
    </div>

    {#if proxyStatus?.pool.error}
      <div class="p-3 rounded-[8px] bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
        {proxyStatus.pool.error}
      </div>
    {/if}

    {#if isLoading && !hasLoaded}
      <p class="p-6 text-center text-xs text-text-muted">Loading persisted proxy pool…</p>
    {:else if !hasLoaded}
      <div id="proxy-pool-unavailable" class="p-8 rounded-[12px] bg-surface-2 border border-border-subtle text-center space-y-2">
        <p class="text-sm font-semibold text-text-main">Persisted proxy pool is unavailable</p>
        <p class="text-xs text-text-muted">No configuration changes have been made. Retry loading the saved pool before adding, importing, or saving entries.</p>
      </div>
    {:else if pools.length === 0}
      <div class="p-8 rounded-[12px] bg-surface-2 border border-border-subtle text-center space-y-2">
        <p class="text-sm font-semibold text-text-main">No proxy pool entries configured</p>
        <p class="text-xs text-text-muted">Add an HTTP(S) proxy or relay endpoint. AlphaWay will keep the pool empty until an entry is saved.</p>
      </div>
    {:else}
      <div class="flex flex-wrap gap-3 text-xs text-text-muted">
        <span>Enabled: {proxyStatus?.pool.enabled ?? 0}</span>
        <span>Ready: {proxyStatus?.pool.ready ?? 0}</span>
        <span>Cooling: {proxyStatus?.pool.cooling ?? 0}</span>
        <span>Cooldown: {proxyStatus?.pool.cooldownMs ?? 0} ms</span>
      </div>
      <div class="overflow-x-auto rounded-[10px] border border-border-subtle bg-surface-1 font-mono text-xs">
        <table class="w-full text-left">
          <thead class="bg-surface-2 text-text-muted uppercase tracking-wider border-b border-border-subtle">
            <tr>
              <th class="px-4 py-3 font-semibold font-sans">Name</th>
              <th class="px-4 py-3 font-semibold font-sans">Type</th>
              <th class="px-4 py-3 font-semibold font-sans">Endpoint</th>
              <th class="px-4 py-3 font-semibold font-sans">Last probe</th>
              <th class="px-4 py-3 font-semibold font-sans">State</th>
              <th class="px-4 py-3 font-semibold font-sans text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-subtle">
            {#each pools as entry (entry.id)}
              {@const probe = poolTestResults[entry.id]}
              <tr class="hover:bg-surface-2/40 transition-colors">
                <td class="px-4 py-3 font-sans font-medium text-text-main">
                  {entry.label}
                  <div class="text-[10px] text-text-subtle font-mono">weight {entry.weight}</div>
                </td>
                <td class="px-4 py-3">
                  <span class="px-1.5 py-0.5 rounded-[4px] bg-surface-3 text-[10px] text-text-muted uppercase">{entry.kind}</span>
                </td>
                <td class="px-4 py-3 text-text-muted">{entry.host || "—"}</td>
                <td class="px-4 py-3 text-text-muted">
                  {#if probe?.latencyMs !== undefined && probe?.latencyMs !== null}
                    {probe.latencyMs} ms
                  {:else if probe?.skipped}
                    {probe.reason || "Skipped"}
                  {:else}
                    —
                  {/if}
                  {#if probe?.error}
                    <div class="text-[10px] text-rose-400 max-w-[220px] break-words">{probe.error}</div>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  <Badge tone={!entry.enabled ? "neutral" : entry.state === "ready" ? "success" : entry.state === "cooling" ? "warning" : "error"} size="sm" dot>
                    {!entry.enabled ? "DISABLED" : entry.state.toUpperCase()}
                  </Badge>
                  {#if entry.cooldownMsLeft > 0}
                    <div class="text-[10px] text-text-subtle">{Math.ceil(entry.cooldownMsLeft / 1000)}s cooldown</div>
                  {/if}
                </td>
                <td class="px-4 py-3 text-right font-sans">
                  <div class="flex items-center justify-end gap-1.5">
                    <label class="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
                      <input
                        type="checkbox"
                        checked={entry.enabled}
                        onchange={(event) => handleToggleEntry(entry, (event.currentTarget as HTMLInputElement).checked)}
                        disabled={!hasLoaded || Boolean(loadError) || Boolean(proxyStatus?.locked) || isSaving}
                      />
                      Enabled
                    </label>
                    <Button variant="ghost" size="xs" onclick={() => runPoolTest(entry.id)} disabled={isPoolTesting || !entry.enabled}>
                      Ping
                    </Button>
                    <Button variant="ghost" size="xs" class="text-red-400" onclick={() => handleRemoveEntry(entry)} disabled={!hasLoaded || Boolean(loadError) || Boolean(proxyStatus?.locked) || isSaving}>
                      <span class="material-symbols-outlined text-[14px]">delete</span>
                    </Button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Card>
</div>

<Modal open={isAddModalOpen} title="Add Proxy Egress Node" onclose={() => (isAddModalOpen = false)}>
  <form
    class="space-y-4"
    onsubmit={(event) => {
      event.preventDefault();
      void handleAddSingle();
    }}
  >
    <div class="space-y-1.5">
      <label for="node-name" class="text-xs font-semibold text-text-muted">Node Name</label>
      <input id="node-name" type="text" bind:value={newName} placeholder="e.g. US West Relay" class="w-full px-3 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main" />
    </div>
    <div class="space-y-1.5">
      <label for="node-url" class="text-xs font-semibold text-text-muted">HTTP(S) Proxy / Relay URL</label>
      <input id="node-url" type="text" bind:value={newUrl} placeholder="http://host:port or https://relay.workers.dev" class="w-full px-3 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main font-mono" required />
    </div>
    <div class="space-y-1.5">
      <label for="node-token" class="text-xs font-semibold text-text-muted">Relay token (optional)</label>
      <input id="node-token" type="password" bind:value={newToken} autocomplete="new-password" placeholder="Stored encrypted; never shown after saving" class="w-full px-3 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main font-mono" />
    </div>
    <p class="text-[11px] text-text-subtle">SOCKS5 is not supported by Bun fetch. Existing credentials remain in SQLite when editing or removing pool entries by ID.</p>
    <div class="flex justify-end gap-2 pt-2">
      <Button variant="ghost" onclick={() => (isAddModalOpen = false)}>Cancel</Button>
      <Button variant="primary" type="submit" disabled={!newUrl.trim() || !hasLoaded || Boolean(loadError) || isSaving || Boolean(proxyStatus?.locked)}>Add Node</Button>
    </div>
  </form>
</Modal>

<Modal open={isBulkModalOpen} title="Bulk Import Proxies" onclose={() => (isBulkModalOpen = false)}>
  <form
    class="space-y-4"
    onsubmit={(event) => {
      event.preventDefault();
      void handleBulkImport();
    }}
  >
    <div class="space-y-1.5">
      <label for="bulk-text" class="text-xs font-semibold text-text-muted">One HTTP(S) URL per line, optionally followed by a label</label>
      <textarea
        id="bulk-text"
        bind:value={bulkInput}
        rows="6"
        placeholder={"http://proxy1.corp:8080 Primary Egress\nhttps://relay.workers.dev Cloudflare Relay"}
        class="w-full p-3 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main font-mono resize-none"
        required
      ></textarea>
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <Button variant="ghost" onclick={() => (isBulkModalOpen = false)}>Cancel</Button>
      <Button variant="primary" type="submit" disabled={!bulkInput.trim() || !hasLoaded || Boolean(loadError) || isSaving || Boolean(proxyStatus?.locked)}>Import List</Button>
    </div>
  </form>
</Modal>
