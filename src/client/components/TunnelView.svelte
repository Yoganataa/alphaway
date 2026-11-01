<script lang="ts">
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import type { HealthResponse } from "../lib/types";

  let { health }: { health: HealthResponse | null } = $props();

  let copiedUrl = $state<boolean>(false);

  function copyTunnelUrl() {
    if (health?.tunnel?.url && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(health.tunnel.url);
      copiedUrl = true;
      setTimeout(() => (copiedUrl = false), 2000);
    }
  }
</script>

<div class="space-y-6">
  <!-- Cloudflare Tunnel Card -->
  <Card padding="md" elev class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-text-main tracking-tight">Cloudflare Named Tunnel</h2>
          <Badge tone={health?.tunnel?.enabled ? "success" : "neutral"} size="sm" dot>
            {health?.tunnel?.enabled ? "Active" : "Disabled"}
          </Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          Expose your local bridge to external coding environments without opening router ports.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs px-2.5 py-1 rounded-[8px] bg-surface-2 text-text-muted font-mono border border-border">
          Status: {health?.tunnel?.enabled ? "Active" : "Disabled"}
        </span>
      </div>
    </div>

    <div class="space-y-4">
      {#if health?.tunnel?.url}
        <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="space-y-1">
            <span class="text-xs text-text-muted font-medium">Public Tunnel Endpoint:</span>
            <p class="text-xs font-mono text-brand-400 font-semibold">{health.tunnel.url}</p>
          </div>
          <Button variant="secondary" size="sm" onclick={copyTunnelUrl}>
            {#if copiedUrl}
              <span class="material-symbols-outlined text-[16px] text-emerald-400">check</span>
              <span class="text-emerald-400">Copied!</span>
            {:else}
              <span class="material-symbols-outlined text-[16px]">content_copy</span>
              <span>Copy Endpoint</span>
            {/if}
          </Button>
        </div>
      {:else}
        <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle text-xs text-text-muted leading-relaxed">
          Cloudflare tunnel is not currently running. Start it with <code class="font-mono bg-surface-3 px-1.5 py-0.5 rounded text-brand-400 font-semibold">bun src/index.ts --tunnel</code> or provide <code class="font-mono bg-surface-3 px-1.5 py-0.5 rounded text-brand-400 font-semibold">TUNNEL_TOKEN</code>.
        </div>
      {/if}
    </div>
  </Card>

  <!-- Background Daemon Card -->
  <Card padding="md" elev class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-text-main tracking-tight">Daemon Process Lifecycle</h2>
          <Badge tone={health?.daemon?.running ? "success" : "neutral"} size="sm" dot>
            {health?.daemon?.running ? "Background Daemon" : "Standalone"}
          </Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          Persistent background service management and CLI process controllers.
        </p>
      </div>

      <span class="text-xs px-2.5 py-1 rounded-[8px] bg-surface-2 text-text-muted font-mono border border-border">
        {health?.daemon?.running ? `Running (PID: ${health.daemon.pid})` : "Foreground / Standalone"}
      </span>
    </div>

    <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle space-y-3 text-xs font-mono">
      <div class="text-text-muted font-sans font-semibold">CLI Daemon Commands:</div>
      <div class="p-3.5 rounded-[10px] bg-[#0c1017] border border-border-subtle text-brand-400 space-y-1.5 leading-relaxed">
        <div><span class="text-gray-200">bun src/index.ts --daemon</span> &nbsp;&nbsp;<span class="text-text-subtle"># Start background daemon</span></div>
        <div><span class="text-gray-200">bun src/index.ts --status</span> &nbsp;&nbsp;<span class="text-text-subtle"># Check daemon status</span></div>
        <div><span class="text-gray-200">bun src/index.ts --stop</span> &nbsp;&nbsp;&nbsp;&nbsp;<span class="text-text-subtle"># Stop daemon process</span></div>
      </div>
    </div>
  </Card>
</div>
