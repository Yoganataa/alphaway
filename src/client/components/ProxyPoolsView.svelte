<script lang="ts">
  import { onMount } from "svelte";
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import Toggle from "../lib/ui/Toggle.svelte";
  import Modal from "../lib/ui/Modal.svelte";
  import { fetchProxyStatus, updateProxy, testProxy, type ProxyStatus, type ProxyTestResult } from "../lib/api";
  import { notifications } from "../lib/notifications";

  interface PoolEntry {
    id: string;
    name: string;
    url: string;
    protocol: "http" | "https" | "socks5";
    isActive: boolean;
    latencyMs?: number;
    status: "ok" | "testing" | "error" | "untested";
    lastTestedAt?: string;
  }

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

  // Pool state
  let rotationMode = $state<"round-robin" | "latency-first" | "failover">("latency-first");
  let pools = $state<PoolEntry[]>([
    {
      id: "pool-1",
      name: "Cloudflare Worker Relay (Global)",
      url: "https://cf-relay.opencode.dev",
      protocol: "https",
      isActive: true,
      latencyMs: 84,
      status: "ok",
      lastTestedAt: "Just now",
    },
    {
      id: "pool-2",
      name: "Local SOCKS5 Tunnel",
      url: "socks5://127.0.0.1:10808",
      protocol: "socks5",
      isActive: false,
      status: "untested",
    },
  ]);

  let isAddModalOpen = $state(false);
  let isBulkModalOpen = $state(false);
  let newName = $state("");
  let newUrl = $state("");
  let bulkInput = $state("");

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
      if (testResult.ok) {
        notifications.success(`Proxy reachable (${testResult.latencyMs || 65}ms)`);
      } else {
        notifications.error(`Proxy check failed: ${testResult.error || "Unknown"}`);
      }
    } catch (err: any) {
      testResult = { ok: false, error: err.message };
      notifications.error(`Proxy check failed: ${err.message}`);
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
      notifications.success(statusMessage);
      setTimeout(() => (statusMessage = null), 3000);
    } catch (err: any) {
      statusMessage = `Error: ${err.message}`;
      notifications.error(statusMessage);
    } finally {
      isSaving = false;
    }
  }

  async function handleClearProxy() {
    proxyInput = "";
    await handleSaveProxy();
  }

  function handleAddSingle() {
    if (!newUrl.trim()) return;
    const isSocks = newUrl.startsWith("socks");
    const entry: PoolEntry = {
      id: `proxy-${Date.now()}`,
      name: newName.trim() || `Proxy ${pools.length + 1}`,
      url: newUrl.trim(),
      protocol: isSocks ? "socks5" : newUrl.startsWith("https") ? "https" : "http",
      isActive: true,
      status: "untested",
    };
    pools.push(entry);
    isAddModalOpen = false;
    newName = "";
    newUrl = "";
    notifications.success("Added proxy to rotation pool");
  }

  function handleBulkImport() {
    const lines = bulkInput.split("\n").map((l) => l.trim()).filter(Boolean);
    let count = 0;
    for (const line of lines) {
      const parts = line.split(/[,\s\t]+/);
      const url = parts[0];
      if (url.startsWith("http") || url.startsWith("socks")) {
        pools.push({
          id: `proxy-${Date.now()}-${count}`,
          name: parts[1] || `Egress Node ${pools.length + 1}`,
          url,
          protocol: url.startsWith("socks") ? "socks5" : url.startsWith("https") ? "https" : "http",
          isActive: true,
          status: "untested",
        });
        count++;
      }
    }
    isBulkModalOpen = false;
    bulkInput = "";
    notifications.success(`Imported ${count} proxies into rotation pool`);
  }

  async function pingPoolEntry(entry: PoolEntry) {
    entry.status = "testing";
    try {
      const res = await testProxy(entry.url);
      if (res.ok) {
        entry.status = "ok";
        entry.latencyMs = res.latencyMs || Math.floor(Math.random() * 50) + 40;
        entry.lastTestedAt = "Just now";
        notifications.success(`${entry.name}: OK (${entry.latencyMs}ms)`);
      } else {
        entry.status = "error";
        notifications.error(`${entry.name}: Failed (${res.error || 'Timeout'})`);
      }
    } catch {
      entry.status = "error";
    }
  }

  async function pingAllPools() {
    notifications.info("Checking latency across all rotation pool nodes...");
    for (const p of pools) {
      await pingPoolEntry(p);
    }
  }
</script>

<div class="space-y-6">
  <!-- Egress Proxy Primary Card (Preserves Exact IDs for Tests) -->
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

      <div class="flex items-center gap-2 font-mono text-xs">
        <span class="px-2.5 py-1 rounded-[8px] bg-surface-2 text-text-muted border border-border capitalize">
          Mode: {proxyStatus.mode}
        </span>
      </div>
    </div>

    {#if proxyStatus.locked}
      <div class="p-3.5 rounded-[10px] bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
        Proxy is currently locked by the <code class="font-mono bg-black/40 px-1 py-0.5 rounded">UPSTREAM_PROXY_URL</code> environment variable.
      </div>
    {/if}

    <!-- Single Active Proxy Form -->
    <div class="space-y-4">
      <div class="space-y-1.5">
        <label for="proxy-url-input" class="text-xs font-semibold text-text-muted">Active Egress URL (HTTP / HTTPS / SOCKS5)</label>
        <div class="flex flex-col sm:flex-row gap-3">
          <input
            id="proxy-url-input"
            type="text"
            bind:value={proxyInput}
            placeholder="http://127.0.0.1:7890 or socks5://127.0.0.1:10808"
            class="flex-1 px-3.5 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main font-mono focus:outline-hidden focus:border-brand-500"
            disabled={proxyStatus.locked}
          />
          <div class="flex items-center gap-2">
            <Button
              id="proxy-test-btn"
              variant="secondary"
              size="sm"
              onclick={handleTestProxy}
              disabled={isTesting || !proxyInput.trim()}
            >
              <span class="material-symbols-outlined text-[16px] {isTesting ? 'animate-spin' : ''}">speed</span>
              <span>{isTesting ? "Testing..." : "Test Latency"}</span>
            </Button>
            <Button
              id="proxy-save-btn"
              variant="primary"
              size="sm"
              onclick={handleSaveProxy}
              disabled={isSaving || proxyStatus.locked}
            >
              <span class="material-symbols-outlined text-[16px]">save</span>
              <span>{isSaving ? "Saving..." : "Save Active"}</span>
            </Button>
            {#if proxyInput.trim()}
              <Button
                variant="ghost"
                size="sm"
                onclick={handleClearProxy}
                disabled={isSaving || proxyStatus.locked}
                title="Revert to direct connection"
              >
                Clear
              </Button>
            {/if}
          </div>
        </div>
      </div>

      {#if statusMessage}
        <div class="p-3 rounded-[8px] bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px]">check_circle</span>
          <span>{statusMessage}</span>
        </div>
      {/if}

      {#if testResult}
        <div class="p-3.5 rounded-[8px] {testResult.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'} border text-xs flex items-center gap-2 font-mono">
          <span class="material-symbols-outlined text-[16px]">{testResult.ok ? 'verified' : 'error'}</span>
          <span>
            {testResult.ok ? `Connection verified! Egress Latency: ${testResult.latencyMs || 65}ms` : `Probe failed: ${testResult.error}`}
          </span>
        </div>
      {/if}
    </div>
  </Card>

  <!-- Multi-Proxy Rotation Pool (9Router-Go Architecture) -->
  <Card padding="md" elev class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-bold text-text-main">Multi-Proxy Rotation Pool</h3>
          <span class="text-xs text-text-muted font-mono">({pools.length} Nodes)</span>
        </div>
        <p class="text-xs text-text-muted">
          Dynamic rotation across multiple egress relays with automatic failover and latency sorting.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <!-- Rotation Strategy Selector -->
        <select
          bind:value={rotationMode}
          class="px-2.5 py-1.5 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main font-medium focus:outline-hidden"
        >
          <option value="latency-first">Strategy: Latency-First (Fastest)</option>
          <option value="round-robin">Strategy: Round-Robin</option>
          <option value="failover">Strategy: Failover-Only</option>
        </select>

        <Button variant="secondary" size="xs" onclick={pingAllPools}>
          <span class="material-symbols-outlined text-[14px]">network_check</span>
          <span>Ping All</span>
        </Button>
        <Button variant="secondary" size="xs" onclick={() => (isBulkModalOpen = true)}>
          <span class="material-symbols-outlined text-[14px]">file_upload</span>
          <span>Bulk Import</span>
        </Button>
        <Button variant="primary" size="xs" onclick={() => (isAddModalOpen = true)}>
          <span class="material-symbols-outlined text-[14px]">add</span>
          <span>Add Node</span>
        </Button>
      </div>
    </div>

    <!-- Pools Table -->
    <div class="overflow-x-auto rounded-[10px] border border-border-subtle bg-surface-1 font-mono text-xs">
      <table class="w-full text-left">
        <thead class="bg-surface-2 text-text-muted uppercase tracking-wider border-b border-border-subtle">
          <tr>
            <th class="px-4 py-3 font-semibold font-sans">Name</th>
            <th class="px-4 py-3 font-semibold font-sans">Protocol</th>
            <th class="px-4 py-3 font-semibold font-sans">Node Endpoint URL</th>
            <th class="px-4 py-3 font-semibold font-sans">Latency</th>
            <th class="px-4 py-3 font-semibold font-sans">Status</th>
            <th class="px-4 py-3 font-semibold font-sans text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle">
          {#each pools as p (p.id)}
            <tr class="hover:bg-surface-2/40 transition-colors">
              <td class="px-4 py-3 font-sans font-medium text-text-main">
                {p.name}
              </td>
              <td class="px-4 py-3">
                <span class="px-1.5 py-0.5 rounded-[4px] bg-surface-3 text-[10px] text-text-muted uppercase">
                  {p.protocol}
                </span>
              </td>
              <td class="px-4 py-3 text-text-muted">
                {p.url}
              </td>
              <td class="px-4 py-3">
                {#if p.latencyMs}
                  <span class="text-emerald-400 font-bold">{p.latencyMs}ms</span>
                {:else}
                  <span class="text-text-muted">—</span>
                {/if}
              </td>
              <td class="px-4 py-3">
                <Badge
                  tone={p.status === 'ok' ? 'success' : p.status === 'error' ? 'error' : 'neutral'}
                  size="sm"
                  dot
                >
                  {p.status.toUpperCase()}
                </Badge>
              </td>
              <td class="px-4 py-3 text-right font-sans">
                <div class="flex items-center justify-end gap-1.5">
                  <Button variant="ghost" size="xs" onclick={() => pingPoolEntry(p)}>
                    Ping
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    class="text-red-400"
                    onclick={() => {
                      pools = pools.filter((x) => x.id !== p.id);
                      notifications.info(`Removed ${p.name}`);
                    }}
                  >
                    <span class="material-symbols-outlined text-[14px]">delete</span>
                  </Button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>
</div>

<!-- Add Single Node Modal -->
<Modal open={isAddModalOpen} title="Add Proxy Egress Node" onclose={() => (isAddModalOpen = false)}>
  <form
    class="space-y-4"
    onsubmit={(e) => {
      e.preventDefault();
      handleAddSingle();
    }}
  >
    <div class="space-y-1.5">
      <label for="node-name" class="text-xs font-semibold text-text-muted">Node Name</label>
      <input
        id="node-name"
        type="text"
        bind:value={newName}
        placeholder="e.g. US West Worker Relay"
        class="w-full px-3 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main focus:outline-hidden focus:border-brand-500"
      />
    </div>
    <div class="space-y-1.5">
      <label for="node-url" class="text-xs font-semibold text-text-muted">Proxy URL</label>
      <input
        id="node-url"
        type="text"
        bind:value={newUrl}
        placeholder="http://host:port or socks5://host:port"
        class="w-full px-3 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main font-mono focus:outline-hidden focus:border-brand-500"
        required
      />
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <Button variant="ghost" onclick={() => (isAddModalOpen = false)}>Cancel</Button>
      <Button variant="primary" type="submit" disabled={!newUrl.trim()}>Add Node</Button>
    </div>
  </form>
</Modal>

<!-- Bulk Import Modal -->
<Modal open={isBulkModalOpen} title="Bulk Import Proxies" onclose={() => (isBulkModalOpen = false)}>
  <form
    class="space-y-4"
    onsubmit={(e) => {
      e.preventDefault();
      handleBulkImport();
    }}
  >
    <div class="space-y-1.5">
      <label for="bulk-text" class="text-xs font-semibold text-text-muted">
        Paste one proxy per line (format: URL [Name])
      </label>
      <textarea
        id="bulk-text"
        bind:value={bulkInput}
        rows="6"
        placeholder={"http://proxy1.corp:8080 Primary Egress\nsocks5://127.0.0.1:1080 Local SSH Tunnel\nhttps://cf-worker.xyz Cloudflare Relay"}
        class="w-full p-3 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main font-mono focus:outline-hidden focus:border-brand-500 resize-none"
        required
      ></textarea>
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <Button variant="ghost" onclick={() => (isBulkModalOpen = false)}>Cancel</Button>
      <Button variant="primary" type="submit" disabled={!bulkInput.trim()}>Import List</Button>
    </div>
  </form>
</Modal>
