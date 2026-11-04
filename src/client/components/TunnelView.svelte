<script lang="ts">
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import type { HealthResponse } from "../lib/types";

  let { health }: { health: HealthResponse | null } = $props();
  let copiedUrl = $state(false);

  const publicEndpointUrl = $derived(
    health?.endpoint?.tunnel ? health.endpoint.publicUrl : ""
  );
  const publicEndpointConfigured = $derived(publicEndpointUrl.length > 0);

  async function copyPublicEndpoint() {
    if (!publicEndpointUrl || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(publicEndpointUrl);
      copiedUrl = true;
      setTimeout(() => (copiedUrl = false), 2000);
    } catch {
      copiedUrl = false;
    }
  }
</script>

<div class="space-y-6">
  <Card padding="md" elev class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-text-main tracking-tight">Cloudflare Named Tunnel</h2>
          <Badge tone={publicEndpointConfigured ? "success" : "neutral"} size="sm" dot>
            {publicEndpointConfigured ? "Configured" : "Not configured"}
          </Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          The health contract reports whether a public endpoint is configured. It does not verify that a Cloudflare tunnel process is currently connected.
        </p>
      </div>
    </div>

    {#if publicEndpointConfigured}
      <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="space-y-1 min-w-0">
          <span class="text-xs text-text-muted font-medium">Configured public API endpoint:</span>
          <p class="text-xs font-mono text-brand-400 font-semibold break-all">{publicEndpointUrl}</p>
        </div>
        <Button variant="secondary" size="sm" onclick={copyPublicEndpoint}>
          {#if copiedUrl}
            <span class="material-symbols-outlined text-[16px] text-emerald-400">check</span>
            <span class="text-emerald-400">Copied</span>
          {:else}
            <span class="material-symbols-outlined text-[16px]">content_copy</span>
            <span>Copy Endpoint</span>
          {/if}
        </Button>
      </div>
    {:else}
      <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle text-xs text-text-muted leading-relaxed">
        No public endpoint URL is configured. To start Cloudflare Quick Tunnel, install <code class="font-mono bg-surface-3 px-1.5 py-0.5 rounded text-brand-400 font-semibold">cloudflared</code> and run <code class="font-mono bg-surface-3 px-1.5 py-0.5 rounded text-brand-400 font-semibold">bun src/index.ts --tunnel</code>. Set <code class="font-mono bg-surface-3 px-1.5 py-0.5 rounded text-brand-400 font-semibold">PUBLIC_URL</code> or one of the supported tunnel URL variables when the public URL is known.
      </div>
    {/if}
  </Card>

  <Card padding="md" elev class="space-y-4">
    <div class="pb-4 border-b border-border-subtle">
      <h2 class="text-lg font-bold text-text-main tracking-tight">Daemon Process Lifecycle</h2>
      <p class="text-xs text-text-muted mt-1">
        The dashboard health endpoint does not expose daemon mode or PID information. Use the CLI to inspect and control an AlphaWay daemon; do not infer daemon state from the dashboard session.
      </p>
    </div>

    <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle space-y-3 text-xs font-mono">
      <div class="text-text-muted font-sans font-semibold">Process commands:</div>
      <div class="p-3.5 rounded-[10px] bg-[#0c1017] border border-border-subtle text-brand-400 space-y-2 leading-relaxed overflow-x-auto">
        <div><span class="text-gray-200">bun src/index.ts --daemon</span> <span class="text-text-subtle"># Start background daemon</span></div>
        <div><span class="text-gray-200">bun src/index.ts --status</span> <span class="text-text-subtle"># Check daemon PID status</span></div>
        <div><span class="text-gray-200">bun src/index.ts --stop</span> <span class="text-text-subtle"># Stop background daemon</span></div>
      </div>
      <p class="text-text-muted font-sans">
        Processes launched by systemd, launchd, or a foreground terminal remain under their respective process supervisors.
      </p>
    </div>
  </Card>
</div>
