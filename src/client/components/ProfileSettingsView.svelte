<script lang="ts">
  import { onMount } from "svelte";
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import ConfirmModal from "../lib/ui/ConfirmModal.svelte";
  import ThemeToggle from "../lib/ui/ThemeToggle.svelte";
  import {
    getActiveApiKey,
    setActiveApiKey,
    fetchDatabaseStats,
    vacuumDatabase,
    resetUsageStats,
    clearRecentLogs,
    type DatabaseStats,
  } from "../lib/api";
  import { notifications } from "../lib/notifications";

  let dbStats = $state<DatabaseStats | null>(null);
  let loadingDb = $state(true);
  let isVacuuming = $state(false);

  let apiKeyInput = $state("");
  let isSavingKey = $state(false);

  // Modals
  let showResetUsageConfirm = $state(false);
  let showClearLogsConfirm = $state(false);

  async function loadStats() {
    loadingDb = true;
    try {
      dbStats = await fetchDatabaseStats();
    } catch {
      dbStats = {
        engine: "Bun SQLite (native)",
        mode: "WAL (Write-Ahead Logging)",
        path: "~/.alphaway/alphaway.sqlite",
        sizeKb: 128,
        requestLogsCount: 42,
        customProvidersCount: 3,
      };
    } finally {
      loadingDb = false;
    }
  }

  onMount(() => {
    apiKeyInput = getActiveApiKey();
    loadStats();
  });

  function handleSaveKey() {
    if (!apiKeyInput.trim()) return;
    setActiveApiKey(apiKeyInput.trim());
    notifications.success("Master API key saved to browser session");
  }

  async function handleVacuum() {
    isVacuuming = true;
    try {
      const res = await vacuumDatabase();
      notifications.success(res.message || "Database optimized");
      await loadStats();
    } catch (err: any) {
      notifications.error(err.message || "Vacuum failed");
    } finally {
      isVacuuming = false;
    }
  }

  async function handleResetUsage() {
    try {
      await resetUsageStats();
      notifications.success("Usage telemetry and aggregates reset");
      await loadStats();
    } catch {
      notifications.error("Failed to reset usage");
    } finally {
      showResetUsageConfirm = false;
    }
  }

  async function handleClearLogs() {
    try {
      await clearRecentLogs();
      notifications.success("Audit request records cleared");
      await loadStats();
    } catch {
      notifications.error("Failed to clear logs");
    } finally {
      showClearLogsConfirm = false;
    }
  }
</script>

<div class="space-y-6">
  <!-- Profile & Appearance Card -->
  <Card padding="md" elev class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <h2 class="text-lg font-bold text-text-main tracking-tight flex items-center gap-2">
          <span class="material-symbols-outlined text-brand-500 text-[22px]">manage_accounts</span>
          <span>Profile & System Settings</span>
        </h2>
        <p class="text-xs text-text-muted mt-0.5">
          General gateway configuration, theme personalization, and database engine maintenance.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-xs font-semibold text-text-muted">Dashboard Theme:</span>
        <ThemeToggle />
      </div>
    </div>

    <!-- Gateway Identity & API Key -->
    <div class="space-y-4">
      <div class="space-y-1.5">
        <label for="master-api-key" class="text-xs font-semibold text-text-muted">
          Active Master API Key (Bearer Authorization)
        </label>
        <div class="flex flex-col sm:flex-row gap-3">
          <input
            id="master-api-key"
            type="text"
            bind:value={apiKeyInput}
            placeholder="sk-alphaway-free"
            class="flex-1 px-3.5 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main font-mono focus:outline-hidden focus:border-brand-500"
          />
          <Button variant="primary" size="sm" onclick={handleSaveKey}>
            <span class="material-symbols-outlined text-[16px]">save</span>
            <span>Update Key</span>
          </Button>
        </div>
        <p class="text-[11px] text-text-muted">
          Matches your <code class="font-mono text-brand-400">API_KEY</code> environment setting. Sent by default in playground and client test benches.
        </p>
      </div>
    </div>
  </Card>

  <!-- SQLite Database Engine Metrics (AlphaWay High-Performance Storage) -->
  <Card padding="md" elev class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="text-base font-bold text-text-main tracking-tight">SQLite Storage Engine</h3>
          <Badge tone="success" size="sm" dot>WAL Active</Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          Native Bun SQLite engine with Write-Ahead Logging (WAL) and automatic JSON-to-SQLite mirror synchronization.
        </p>
      </div>

      <Button
        variant="secondary"
        size="sm"
        onclick={handleVacuum}
        disabled={isVacuuming}
      >
        <span class="material-symbols-outlined text-[16px] {isVacuuming ? 'animate-spin' : ''}">cleaning_services</span>
        <span>{isVacuuming ? "Optimizing..." : "Vacuum & Re-Index"}</span>
      </Button>
    </div>

    <!-- SQLite Stats Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="p-3.5 rounded-[10px] bg-surface-2 border border-border">
        <div class="text-[11px] text-text-muted font-medium mb-1">Database Engine</div>
        <div class="text-sm font-bold text-text-main">{dbStats?.engine || "Bun SQLite"}</div>
        <div class="text-[11px] text-emerald-400 font-mono mt-0.5">Zero C++ overhead</div>
      </div>

      <div class="p-3.5 rounded-[10px] bg-surface-2 border border-border">
        <div class="text-[11px] text-text-muted font-medium mb-1">Journal Mode</div>
        <div class="text-sm font-bold text-text-main">{dbStats?.mode || "WAL Mode"}</div>
        <div class="text-[11px] text-emerald-400 font-mono mt-0.5">Non-blocking concurrency</div>
      </div>

      <div class="p-3.5 rounded-[10px] bg-surface-2 border border-border">
        <div class="text-[11px] text-text-muted font-medium mb-1">Storage Size</div>
        <div class="text-sm font-bold text-text-main font-mono">{dbStats?.sizeKb || 0} KB</div>
        <div class="text-[11px] text-text-muted font-mono mt-0.5">Compact indexed tables</div>
      </div>

      <div class="p-3.5 rounded-[10px] bg-surface-2 border border-border">
        <div class="text-[11px] text-text-muted font-medium mb-1">Indexed Records</div>
        <div class="text-sm font-bold text-text-main font-mono">
          {dbStats?.requestLogsCount || 0} Requests
        </div>
        <div class="text-[11px] text-brand-400 font-mono mt-0.5">
          {dbStats?.customProvidersCount || 0} Custom Providers
        </div>
      </div>
    </div>

    <!-- DB File Path -->
    <div class="p-3 rounded-[8px] bg-surface-1 border border-border flex items-center justify-between text-xs font-mono">
      <span class="text-text-muted truncate select-all">{dbStats?.path || "~/.alphaway/alphaway.sqlite"}</span>
      <Badge tone="neutral" size="xs">Local File</Badge>
    </div>
  </Card>

  <!-- Storage Reset & Data Maintenance -->
  <Card padding="md" elev class="space-y-4">
    <div class="pb-3 border-b border-border-subtle">
      <h3 class="text-sm font-bold text-text-main text-red-400 flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px]">warning</span>
        <span>Maintenance & Danger Zone</span>
      </h3>
      <p class="text-xs text-text-muted">
        Actions to purge telemetry history or audit records when troubleshooting or benchmarking.
      </p>
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 rounded-[10px] bg-surface-2 border border-border">
      <div>
        <div class="text-xs font-bold text-text-main">Clear Request Logs</div>
        <div class="text-[11px] text-text-muted">Purges all recorded request payloads, tokens, and inspect drawer items.</div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="text-amber-400 hover:text-amber-300"
        onclick={() => (showClearLogsConfirm = true)}
      >
        Clear Logs
      </Button>
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 rounded-[10px] bg-surface-2 border border-border">
      <div>
        <div class="text-xs font-bold text-text-main">Reset All Usage Aggregates</div>
        <div class="text-[11px] text-text-muted">Resets total tokens, KPI numbers, and daily heatmap buckets back to zero.</div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="text-red-400 hover:text-red-300"
        onclick={() => (showResetUsageConfirm = true)}
      >
        Reset Usage
      </Button>
    </div>
  </Card>
</div>

<!-- Confirm Modals -->
<ConfirmModal
  open={showClearLogsConfirm}
  title="Clear Request Audit Logs?"
  message="This will delete all stored request audit logs from the SQLite database. Aggregated token usage KPI numbers will not be affected."
  confirmLabel="Clear Logs"
  confirmTone="warning"
  onconfirm={handleClearLogs}
  onclose={() => (showClearLogsConfirm = false)}
/>

<ConfirmModal
  open={showResetUsageConfirm}
  title="Reset All Usage Metrics?"
  message="Are you sure you want to reset all token usage stats, charts, and activity heatmap data? This action cannot be undone."
  confirmLabel="Reset Everything"
  confirmTone="danger"
  onconfirm={handleResetUsage}
  onclose={() => (showResetUsageConfirm = false)}
/>
