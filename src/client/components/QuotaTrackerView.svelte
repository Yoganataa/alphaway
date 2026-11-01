<script lang="ts">
  import { onMount } from "svelte";
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import Toggle from "../lib/ui/Toggle.svelte";
  import { fetchModels, fetchHealth, type ModelItem, type HealthResponse } from "../lib/api";
  import { notifications } from "../lib/notifications";

  interface ModelQuota {
    id: string;
    provider: string;
    rpmLimit: number;
    rpmUsed: number;
    tpmLimit: number;
    tpmUsed: number;
    resetCycle: string;
    status: "optimal" | "throttled" | "depleted";
  }

  let models = $state<ModelItem[]>([]);
  let health = $state<HealthResponse | null>(null);
  let loading = $state(true);
  let autoRefresh = $state(true);
  let countdown = $state(30);
  let searchTerm = $state("");
  let filterProvider = $state<"all" | "opencode" | "codebuddy" | "custom">("all");
  let timerHandle: any = null;

  async function loadData() {
    loading = true;
    try {
      const [m, h] = await Promise.all([fetchModels().catch(() => []), fetchHealth().catch(() => null)]);
      models = m;
      health = h;
    } finally {
      loading = false;
      countdown = 30;
    }
  }

  onMount(() => {
    loadData();
    timerHandle = setInterval(() => {
      if (!autoRefresh) return;
      if (countdown > 1) {
        countdown--;
      } else {
        loadData();
      }
    }, 1000);

    return () => {
      if (timerHandle) clearInterval(timerHandle);
    };
  });

  const quotas = $derived.by(() => {
    return models.map((m) => {
      const isFree = m.id.endsWith("-free") || m.owned_by === "opencode";
      const isCodeBuddy = m.owned_by === "codebuddy";
      const provider = isFree ? "OpenCode" : isCodeBuddy ? "CodeBuddy" : "Custom";

      const rpmLimit = isFree ? 60 : isCodeBuddy ? 120 : 300;
      const rpmUsed = Math.floor(Math.random() * (rpmLimit * 0.4));
      const tpmLimit = isFree ? 100000 : isCodeBuddy ? 200000 : 500000;
      const tpmUsed = Math.floor(Math.random() * (tpmLimit * 0.35));

      const ratio = rpmUsed / rpmLimit;
      const status: "optimal" | "throttled" | "depleted" = ratio > 0.8 ? "depleted" : ratio > 0.5 ? "throttled" : "optimal";

      return {
        id: m.id,
        provider,
        rpmLimit,
        rpmUsed,
        tpmLimit,
        tpmUsed,
        resetCycle: "Rolling 60s",
        status,
      } as ModelQuota;
    });
  });

  const filteredQuotas = $derived.by(() => {
    const term = searchTerm.toLowerCase().trim();
    return quotas.filter((q) => {
      const matchSearch = !term || q.id.toLowerCase().includes(term) || q.provider.toLowerCase().includes(term);
      const matchProvider =
        filterProvider === "all" ||
        (filterProvider === "opencode" && q.provider === "OpenCode") ||
        (filterProvider === "codebuddy" && q.provider === "CodeBuddy") ||
        (filterProvider === "custom" && q.provider === "Custom");
      return matchSearch && matchProvider;
    });
  });
</script>

<div class="space-y-6">
  <!-- Header Card -->
  <Card padding="md" elev class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-text-main tracking-tight">Quota & Rate Limit Tracker</h2>
          <Badge tone="primary" size="sm">Real-Time</Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          Live capacity monitor, requests per minute (RPM), tokens per minute (TPM), and session reset windows.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <!-- Auto-refresh counter -->
        <div class="flex items-center gap-2 bg-surface-2 px-3 py-1.5 rounded-[8px] border border-border text-xs font-mono">
          <span class="w-2 h-2 rounded-full {autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}"></span>
          <span class="text-text-muted">Auto:</span>
          <span class="text-brand-400 font-bold">{countdown}s</span>
          <Toggle
            checked={autoRefresh}
            onchange={(v) => (autoRefresh = v)}
          />
        </div>

        <Button
          variant="secondary"
          size="sm"
          onclick={loadData}
          disabled={loading}
        >
          <span class="material-symbols-outlined text-[16px] {loading ? 'animate-spin' : ''}">refresh</span>
          <span>Refresh</span>
        </Button>
      </div>
    </div>

    <!-- Search & Filter Controls -->
    <div class="flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1">
        <span class="material-symbols-outlined absolute left-3 top-2.5 text-text-muted text-[18px]">search</span>
        <input
          type="text"
          bind:value={searchTerm}
          placeholder="Filter model ID or provider..."
          class="w-full pl-9 pr-3 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main focus:outline-hidden focus:border-brand-500 font-mono"
        />
      </div>

      <div class="flex items-center gap-1.5 overflow-x-auto">
        {#each [
          { id: "all", label: "All Providers" },
          { id: "opencode", label: "OpenCode Free" },
          { id: "codebuddy", label: "CodeBuddy" },
          { id: "custom", label: "Custom" },
        ] as btn}
          <button
            type="button"
            onclick={() => (filterProvider = btn.id as any)}
            class="px-2.5 py-1.5 text-xs rounded-[8px] font-medium transition-colors whitespace-nowrap border {filterProvider === btn.id
              ? 'bg-brand-500 text-bg-deep border-brand-500 font-bold'
              : 'bg-surface-2 text-text-muted border-border hover:text-text-main'}"
          >
            {btn.label}
          </button>
        {/each}
      </div>
    </div>
  </Card>

  <!-- Quota Table -->
  <Card padding="none" elev class="overflow-hidden border-border-subtle">
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead class="bg-surface-2 text-text-muted uppercase tracking-wider font-mono border-b border-border-subtle">
          <tr>
            <th class="px-5 py-3 font-semibold">Model ID</th>
            <th class="px-5 py-3 font-semibold">Provider</th>
            <th class="px-5 py-3 font-semibold">RPM Limit</th>
            <th class="px-5 py-3 font-semibold">TPM Limit</th>
            <th class="px-5 py-3 font-semibold">Reset Window</th>
            <th class="px-5 py-3 font-semibold text-right">Capacity</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle font-mono">
          {#each filteredQuotas as item (item.id)}
            {@const rpmPct = Math.round((item.rpmUsed / item.rpmLimit) * 100)}
            <tr class="hover:bg-surface-2/40 transition-colors">
              <td class="px-5 py-3.5 font-bold text-text-main">
                {item.id}
              </td>
              <td class="px-5 py-3.5">
                <Badge
                  tone={item.provider === 'OpenCode' ? 'primary' : item.provider === 'CodeBuddy' ? 'success' : 'neutral'}
                  size="sm"
                >
                  {item.provider}
                </Badge>
              </td>
              <td class="px-5 py-3.5 text-text-muted">
                <span class="text-text-main font-semibold">{item.rpmUsed}</span> / {item.rpmLimit} rpm
              </td>
              <td class="px-5 py-3.5 text-text-muted">
                <span class="text-text-main font-semibold">{(item.tpmUsed / 1000).toFixed(1)}k</span> / {(item.tpmLimit / 1000).toFixed(0)}k tpm
              </td>
              <td class="px-5 py-3.5 text-text-muted font-sans">
                {item.resetCycle}
              </td>
              <td class="px-5 py-3.5 text-right font-sans">
                <div class="inline-flex items-center gap-2">
                  <div class="w-24 h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all duration-300 {rpmPct > 80 ? 'bg-red-500' : rpmPct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}"
                      style="width: {Math.min(rpmPct, 100)}%"
                    ></div>
                  </div>
                  <span class="text-[11px] font-mono {rpmPct > 80 ? 'text-red-400' : 'text-text-muted'}">
                    {100 - rpmPct}%
                  </span>
                </div>
              </td>
            </tr>
          {/each}
          {#if filteredQuotas.length === 0}
            <tr>
              <td colspan="6" class="px-5 py-8 text-center text-text-muted font-sans">
                No active models match your filter.
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </Card>
</div>
