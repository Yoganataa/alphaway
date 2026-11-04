<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import Toggle from "../lib/ui/Toggle.svelte";
  import { fetchConsoleLogs, clearConsoleLogs, type ConsoleLogItem } from "../lib/api";
  import { notifications } from "../lib/notifications";

  type LogLevel = "all" | "error" | "warn" | "info" | "debug";

  let entries = $state<ConsoleLogItem[]>([]);
  let loading = $state(true);
  let hasLoaded = $state(false);
  let loadError = $state<string | null>(null);
  let lastUpdatedAt = $state<number | null>(null);
  let requestInFlight = false;
  let activeLevel = $state<LogLevel>("all");
  let searchQuery = $state("");
  let followScroll = $state(true);
  let pollHandle: any = null;
  let logViewport = $state<HTMLDivElement | null>(null);

  function formatUpdateTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  async function loadLogs() {
    // setInterval must not allow slow requests to overlap and overwrite newer state.
    if (requestInFlight) return;
    requestInFlight = true;
    loading = true;
    try {
      entries = await fetchConsoleLogs();
      hasLoaded = true;
      loadError = null;
      lastUpdatedAt = Date.now();
      if (followScroll && logViewport) {
        setTimeout(() => {
          if (logViewport) logViewport.scrollTop = logViewport.scrollHeight;
        }, 50);
      }
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Unknown console log refresh error";
    } finally {
      loading = false;
      requestInFlight = false;
    }
  }

  onMount(() => {
    void loadLogs();
    pollHandle = setInterval(() => void loadLogs(), 3000);
  });

  onDestroy(() => {
    if (pollHandle) clearInterval(pollHandle);
  });

  const counts = $derived.by(() => {
    const res = { all: entries.length, error: 0, warn: 0, info: 0, debug: 0 };
    for (const e of entries) {
      if (e.level in res) {
        res[e.level]++;
      }
    }
    return res;
  });

  const filteredEntries = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    return entries.filter((e) => {
      const matchLevel = activeLevel === "all" || e.level === activeLevel;
      const matchQuery = !q || e.line.toLowerCase().includes(q) || e.time.toLowerCase().includes(q);
      return matchLevel && matchQuery;
    });
  });

  async function copyLogs() {
    const text = filteredEntries.map((e) => `[${e.time}] [${e.level.toUpperCase()}] ${e.line}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      notifications.success(`Copied ${filteredEntries.length} log lines`);
    } catch {
      notifications.error("Failed to copy logs");
    }
  }

  function downloadLogs() {
    const text = filteredEntries.map((e) => `[${e.time}] [${e.level.toUpperCase()}] ${e.line}`).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alphaway-gateway-${Date.now()}.log`;
    link.click();
    URL.revokeObjectURL(url);
    notifications.success("Downloaded log export");
  }

  async function handleClear() {
    if (!confirm("Clear server console log buffer?")) return;
    try {
      await clearConsoleLogs();
      entries = [];
      notifications.info("Console buffer cleared");
    } catch {
      notifications.error("Failed to clear console logs");
    }
  }
</script>

<div class="space-y-6">
  <!-- Console Controls Header -->
  <Card padding="md" elev class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-text-main tracking-tight">Console & Gateway Log Stream</h2>
          <Badge tone="primary" size="sm" dot>Live Buffer</Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          Real-time diagnostics, upstream TLS handshakes, anti-burst queuing, and routing events.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="ghost" size="xs" onclick={copyLogs} disabled={filteredEntries.length === 0}>
          <span class="material-symbols-outlined text-[14px]">content_copy</span>
          <span>Copy</span>
        </Button>
        <Button variant="ghost" size="xs" onclick={downloadLogs} disabled={filteredEntries.length === 0}>
          <span class="material-symbols-outlined text-[14px]">download</span>
          <span>Export</span>
        </Button>
        <Button variant="ghost" size="xs" class="text-red-400" onclick={handleClear}>
          <span class="material-symbols-outlined text-[14px]">delete</span>
          <span>Clear</span>
        </Button>
      </div>
    </div>

    <!-- Filters Bar -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <!-- Severity Chips -->
      <div class="flex items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          onclick={() => (activeLevel = "all")}
          class="px-2.5 py-1 text-xs rounded-[6px] font-mono border transition-colors {activeLevel === 'all'
            ? 'bg-brand-500 text-bg-deep border-brand-500 font-bold'
            : 'bg-surface-2 text-text-muted border-border hover:text-text-main'}"
        >
          ALL ({counts.all})
        </button>
        <button
          type="button"
          onclick={() => (activeLevel = "error")}
          class="px-2.5 py-1 text-xs rounded-[6px] font-mono border transition-colors {activeLevel === 'error'
            ? 'bg-red-500/20 text-red-400 border-red-500 font-bold'
            : 'bg-surface-2 text-text-muted border-border hover:text-text-main'}"
        >
          ERR ({counts.error})
        </button>
        <button
          type="button"
          onclick={() => (activeLevel = "warn")}
          class="px-2.5 py-1 text-xs rounded-[6px] font-mono border transition-colors {activeLevel === 'warn'
            ? 'bg-amber-500/20 text-amber-400 border-amber-500 font-bold'
            : 'bg-surface-2 text-text-muted border-border hover:text-text-main'}"
        >
          WRN ({counts.warn})
        </button>
        <button
          type="button"
          onclick={() => (activeLevel = "info")}
          class="px-2.5 py-1 text-xs rounded-[6px] font-mono border transition-colors {activeLevel === 'info'
            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500 font-bold'
            : 'bg-surface-2 text-text-muted border-border hover:text-text-main'}"
        >
          INF ({counts.info})
        </button>
        <button
          type="button"
          onclick={() => (activeLevel = "debug")}
          class="px-2.5 py-1 text-xs rounded-[6px] font-mono border transition-colors {activeLevel === 'debug'
            ? 'bg-sky-500/20 text-sky-400 border-sky-500 font-bold'
            : 'bg-surface-2 text-text-muted border-border hover:text-text-main'}"
        >
          DBG ({counts.debug})
        </button>
      </div>

      <!-- Search & Follow Scroll -->
      <div class="flex items-center gap-3">
        <div class="relative w-full sm:w-64">
          <span class="material-symbols-outlined absolute left-2.5 top-2 text-text-muted text-[16px]">search</span>
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search log output..."
            class="w-full pl-8 pr-3 py-1.5 text-xs rounded-[6px] bg-surface-2 border border-border text-text-main font-mono focus:outline-hidden focus:border-brand-500"
          />
        </div>

        <div class="flex items-center gap-2 text-xs font-mono text-text-muted shrink-0">
          <span>Follow:</span>
          <Toggle checked={followScroll} onchange={(v) => (followScroll = v)} />
        </div>
      </div>
    </div>
  </Card>

  <!-- Live Terminal Window (Obsidian Slate Console) -->
  <Card padding="none" elev class="overflow-hidden border-border-subtle bg-[#080B11]">
    <!-- Console Title Bar -->
    <div class="px-4 py-2.5 bg-[#0B0F17] border-b border-border-subtle flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-2.5 h-2.5 rounded-full bg-[#FF5F56]"></div>
        <div class="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]"></div>
        <div class="w-2.5 h-2.5 rounded-full bg-[#27C93F]"></div>
        <span class="text-xs font-mono text-text-muted ml-2">alphaway-gateway.log</span>
      </div>

      <span class="text-[11px] font-mono flex items-center gap-1 {loadError ? 'text-amber-400' : 'text-emerald-400'}">
        <span class="w-1.5 h-1.5 rounded-full {loadError ? 'bg-amber-500' : 'bg-emerald-500'} {loadError || loading ? '' : 'animate-pulse'}"></span>
        <span id="console-log-poll-status" role="status" aria-live="polite">
          {#if loading}
            Refreshing...
          {:else if loadError}
            Refresh failed
          {:else if lastUpdatedAt !== null}
            Polling · updated {formatUpdateTime(lastUpdatedAt)}
          {:else}
            Waiting for first refresh
          {/if}
        </span>
      </span>
    </div>

    {#if loadError}
    <div
      id="console-log-refresh-error"
      role="alert"
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[10px] border border-amber-500/30 bg-amber-500/5 p-3"
    >
      <div class="min-w-0">
        <p class="text-xs font-semibold text-amber-400">
          {hasLoaded ? "Console refresh failed. Showing the last successful buffer." : "Console buffer could not be loaded."}
        </p>
        <p class="mt-1 break-words text-xs text-text-muted">{loadError}</p>
        {#if lastUpdatedAt !== null}
          <p class="mt-1 text-[11px] text-text-muted">Last successful refresh: {formatUpdateTime(lastUpdatedAt)}</p>
        {/if}
      </div>
      <Button variant="secondary" size="sm" onclick={loadLogs} disabled={loading}>
        Retry Load
      </Button>
    </div>
  {/if}

  <!-- Terminal Output Viewport -->
    <div
      bind:this={logViewport}
      class="p-4 h-[480px] overflow-y-auto font-mono text-xs leading-relaxed space-y-1 select-text"
    >
      {#each filteredEntries as item (item.seq)}
        <div class="flex items-start gap-3 hover:bg-white/5 px-1.5 py-0.5 rounded transition-colors">
          <span class="text-zinc-500 shrink-0 select-none">{item.time}</span>
          <span class="px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 uppercase {item.level === 'error'
            ? 'bg-red-500/20 text-red-400'
            : item.level === 'warn'
              ? 'bg-amber-500/20 text-amber-400'
              : item.level === 'debug'
                ? 'bg-sky-500/20 text-sky-400'
                : 'bg-emerald-500/20 text-emerald-400'}">
            {item.level.slice(0, 3)}
          </span>
          <span class="text-zinc-300 break-all">{item.line}</span>
        </div>
      {/each}

      {#if !hasLoaded && loading}
        <div role="status" class="p-8 text-center text-zinc-500 font-sans italic">
          Loading server console buffer...
        </div>
      {:else if !hasLoaded}
        <div class="p-8 text-center text-amber-400 font-sans">
          Console buffer unavailable. Retry the last refresh to load server logs.
        </div>
      {:else if entries.length === 0}
        <div class="p-8 text-center text-zinc-500 font-sans italic">
          No server console events are currently buffered.
        </div>
      {:else if filteredEntries.length === 0}
        <div class="p-8 text-center text-zinc-500 font-sans italic">
          No log events matched the current level and search filters.
        </div>
      {/if}
    </div>
  </Card>
</div>
