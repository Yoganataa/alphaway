<script lang="ts">
  import Card from "../lib/ui/Card.svelte";
  import Button from "../lib/ui/Button.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import ConfirmModal from "../lib/ui/ConfirmModal.svelte";
  import { notifications } from "../lib/notifications";
  import { clearLogs, resetUsage } from "../lib/api";
  import type { HealthResponse } from "../lib/types";

  let { health }: { health?: HealthResponse | null } = $props();

  let isClearLogsConfirm = $state(false);
  let isResetConfirm = $state(false);
  let isClearing = $state(false);

  async function handleClearLogs() {
    isClearing = true;
    try {
      await clearLogs();
      notifications.success("Request audit logs cleared from SQLite database");
    } catch (err: any) {
      notifications.error("Failed to clear logs: " + (err.message || String(err)));
    } finally {
      isClearing = false;
    }
  }

  async function handleResetUsage() {
    isClearing = true;
    try {
      await resetUsage();
      notifications.success("Token counters and summary metrics reset successfully");
    } catch (err: any) {
      notifications.error("Failed to reset metrics: " + (err.message || String(err)));
    } finally {
      isClearing = false;
    }
  }
</script>

<div class="space-y-6 max-w-5xl">
  <!-- Page Header -->
  <div class="flex items-center justify-between pb-2 border-b border-border-subtle">
    <div>
      <h2 class="text-xl font-bold tracking-tight text-text-main flex items-center gap-2">
        <span class="material-symbols-outlined text-brand-500 text-[24px]">settings</span>
        System & Storage Settings
      </h2>
      <p class="text-xs text-text-muted mt-1">
        Configure database persistence, server parameters, API authentication, and telemetry maintenance
      </p>
    </div>
    <Badge tone="primary" size="sm">AlphaWay v0.0.1</Badge>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <!-- Embedded SQLite Engine -->
    <Card title="Embedded SQLite Database" padding="md">
      {#snippet icon()}
        <span class="material-symbols-outlined text-emerald-400">database</span>
      {/snippet}

      <div class="space-y-4 text-xs">
        <div class="p-3 rounded-[10px] bg-bg border border-border-subtle space-y-2 font-mono">
          <div class="flex justify-between items-center">
            <span class="text-text-muted">Engine:</span>
            <span class="text-emerald-400 font-semibold">bun:sqlite (Native)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-text-muted">Journal Mode:</span>
            <span class="text-brand-500 font-semibold">WAL (Write-Ahead Log)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-text-muted">Synchronous:</span>
            <span class="text-text-main">NORMAL (Optimal I/O)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-text-muted">Database File:</span>
            <span class="text-text-subtle truncate max-w-[180px]">~/.alphaway/alphaway.sqlite</span>
          </div>
        </div>

        <p class="text-text-muted leading-relaxed">
          High-performance embedded persistence compiled statically into the AlphaWay binary.
          Stores request logs, custom provider configurations, and settings with microsecond ACID transactions.
        </p>
      </div>
    </Card>

    <!-- Network & TLS Parity -->
    <Card title="Network & BoringSSL TLS" padding="md">
      {#snippet icon()}
        <span class="material-symbols-outlined text-brand-500">lock</span>
      {/snippet}

      <div class="space-y-4 text-xs">
        <div class="p-3 rounded-[10px] bg-bg border border-border-subtle space-y-2 font-mono">
          <div class="flex justify-between items-center">
            <span class="text-text-muted">Runtime:</span>
            <span class="text-text-main">{health?.runtime || "Bun 1.4.x"}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-text-muted">TLS Fingerprint:</span>
            <span class="text-emerald-400 font-semibold">BoringSSL (17 Ciphers)</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-text-muted">Gateway Port:</span>
            <span class="text-text-main">:20129</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-text-muted">Egress Mode:</span>
            <span class="text-text-main">Direct / Multi-Proxy Pool</span>
          </div>
        </div>

        <p class="text-text-muted leading-relaxed">
          The upstream free-tier gate strictly inspects the TLS ClientHello fingerprint.
          AlphaWay runs on native Bun to guarantee 100% parity and prevent 403 FreeTierError rejections.
        </p>
      </div>
    </Card>

    <!-- API Authentication -->
    <Card title="API Keys & Access Control" padding="md">
      {#snippet icon()}
        <span class="material-symbols-outlined text-amber-400">key</span>
      {/snippet}

      <div class="space-y-4 text-xs">
        <div class="space-y-1.5">
          <label for="settings-api-key" class="text-text-muted font-medium">Default Master API Key</label>
          <div class="flex items-center gap-2">
            <input
              id="settings-api-key"
              type="password"
              readonly
              value="sk-alphaway-free"
              class="flex-1 px-3 py-2 rounded-[8px] bg-bg border border-border font-mono text-text-main text-xs"
            />
            <Button
              variant="secondary"
              size="sm"
              onclick={() => {
                if (typeof navigator !== "undefined") {
                  navigator.clipboard.writeText("sk-alphaway-free");
                  notifications.success("API Key copied to clipboard");
                }
              }}
            >
              Copy
            </Button>
          </div>
        </div>

        <p class="text-text-muted leading-relaxed">
          Clients (Cursor, Continue, Cline, Claude Code) connect using either Bearer token Authorization or x-api-key header.
          Configurable via <code class="text-brand-500 font-mono bg-surface-2 px-1 py-0.5 rounded">API_KEY</code> in environment.
        </p>
      </div>
    </Card>

    <!-- Telemetry Maintenance -->
    <Card title="Telemetry & Database Maintenance" padding="md">
      {#snippet icon()}
        <span class="material-symbols-outlined text-red-400">delete_sweep</span>
      {/snippet}

      <div class="space-y-4 text-xs">
        <p class="text-text-muted leading-relaxed">
          Manage stored historical telemetry, SQLite request audit logs, and token accounting counters.
        </p>

        <div class="flex flex-wrap items-center gap-3 pt-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={isClearing}
            onclick={() => (isClearLogsConfirm = true)}
          >
            Clear Audit Logs
          </Button>

          <Button
            variant="danger"
            size="sm"
            disabled={isClearing}
            onclick={() => (isResetConfirm = true)}
          >
            Reset All Usage
          </Button>
        </div>
      </div>
    </Card>
  </div>
</div>

<!-- Confirm Modals -->
<ConfirmModal
  isOpen={isClearLogsConfirm}
  title="Clear Request Audit Logs"
  message="Are you sure you want to delete all stored request logs from the SQLite database? This cannot be undone."
  confirmLabel="Clear Logs"
  danger={true}
  onConfirm={handleClearLogs}
  onClose={() => (isClearLogsConfirm = false)}
/>

<ConfirmModal
  isOpen={isResetConfirm}
  title="Reset All Usage Metrics"
  message="Are you sure you want to reset all token counters, USD savings estimates, and activity history to zero?"
  confirmLabel="Reset Everything"
  danger={true}
  onConfirm={handleResetUsage}
  onClose={() => (isResetConfirm = false)}
/>
