<script lang="ts">
  import { onMount } from "svelte";
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import SummaryKpiCards from "./analytics/SummaryKpiCards.svelte";
  import UsageChart from "./analytics/UsageChart.svelte";
  import UsageBreakdownTable from "./analytics/UsageBreakdownTable.svelte";
  import RequestDetailsTab from "./analytics/RequestDetailsTab.svelte";
  import { fetchUsageStats, resetUsageStats, clearRecentLogs } from "../lib/api";
  import type { UsageStats, RequestLogEntry } from "../lib/types";

  let stats = $state<UsageStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Tab & Period state
  let activeTab = $state<"overview" | "details">("overview");
  let period = $state<string>("7d");

  const PERIODS = [
    { value: "today", label: "Today" },
    { value: "24h", label: "24h" },
    { value: "7d", label: "7D" },
    { value: "30d", label: "30D" },
    { value: "60d", label: "60D" },
  ];

  let autoRefresh = $state(true);
  let refreshTimer: any = null;

  async function loadData() {
    try {
      stats = await fetchUsageStats();
      error = null;
    } catch (err: any) {
      error = err.message || "Failed to load usage data";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
    refreshTimer = setInterval(() => {
      if (autoRefresh) loadData();
    }, 4000);

    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
    };
  });

  async function handleResetStats() {
    if (!confirm("Are you sure you want to reset all usage statistics? This will clear historical counters.")) return;
    try {
      await resetUsageStats();
      await loadData();
    } catch (err: any) {
      alert(`Reset failed: ${err.message}`);
    }
  }

  async function handleClearLogs() {
    if (!confirm("Clear all recent request audit logs?")) return;
    try {
      await clearRecentLogs();
      await loadData();
    } catch (err: any) {
      alert(`Clear logs failed: ${err.message}`);
    }
  }

  function exportCsv() {
    if (!stats?.recentLogs?.length) {
      alert("No logs available to export.");
      return;
    }
    const headers = [
      "Timestamp",
      "ID",
      "Protocol",
      "Model",
      "Provider",
      "Status",
      "LatencyMs",
      "PromptTokens",
      "CompletionTokens",
      "TotalTokens",
      "SavedTokens",
      "Stream",
    ];
    const rows = stats.recentLogs.map((l) => [
      l.timestamp,
      l.id,
      l.protocol,
      l.model,
      l.provider,
      l.status,
      l.latencyMs,
      l.promptTokens,
      l.completionTokens,
      l.totalTokens,
      l.savedTokens,
      l.stream ? "true" : "false",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `alphaway-usage-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function formatTimestamp(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return iso;
    }
  }
</script>

<div class="space-y-6">
  <!-- Top Navigation & Global Controls -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
    <!-- Tab Switcher (9router / 9router-go Architecture) -->
    <div class="flex items-center gap-1 bg-surface-2 p-1 rounded-[12px] border border-border-subtle self-start sm:self-auto">
      <button
        type="button"
        onclick={() => (activeTab = "overview")}
        class="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-[8px] transition-all {activeTab === 'overview'
          ? 'bg-surface text-brand-400 shadow-sm border border-border-subtle'
          : 'text-text-muted hover:text-text-main'}"
      >
        <span class="material-symbols-outlined text-[16px]">dashboard</span>
        <span>Overview</span>
      </button>

      <button
        type="button"
        onclick={() => (activeTab = "details")}
        class="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-[8px] transition-all {activeTab === 'details'
          ? 'bg-surface text-brand-400 shadow-sm border border-border-subtle'
          : 'text-text-muted hover:text-text-main'}"
      >
        <span class="material-symbols-outlined text-[16px]">manage_search</span>
        <span>Request Details</span>
      </button>
    </div>

    <!-- Actions Toolbar -->
    <div class="flex items-center gap-2 flex-wrap">
      <label class="flex items-center gap-2 text-xs text-text-muted cursor-pointer px-2.5 py-1.5 rounded-[8px] bg-surface border border-border-subtle hover:border-brand-500/40 transition-colors">
        <input type="checkbox" bind:checked={autoRefresh} class="rounded text-brand-500" />
        <span class="font-mono text-[11px]">Live Poll</span>
      </label>

      <Button variant="outline" size="sm" onclick={loadData}>
        <span class="material-symbols-outlined text-[15px]">refresh</span>
        <span>Refresh</span>
      </Button>

      <Button variant="outline" size="sm" onclick={exportCsv} disabled={!stats?.recentLogs?.length}>
        <span class="material-symbols-outlined text-[15px]">download</span>
        <span>Export CSV</span>
      </Button>

      <Button variant="ghost" size="sm" onclick={handleClearLogs} disabled={!stats?.recentLogs?.length}>
        <span class="material-symbols-outlined text-[15px]">cleaning_services</span>
        <span>Clear Logs</span>
      </Button>

      <Button variant="ghost" size="sm" class="text-rose-400 hover:text-rose-300" onclick={handleResetStats}>
        <span class="material-symbols-outlined text-[15px]">restart_alt</span>
        <span>Reset Stats</span>
      </Button>
    </div>
  </div>

  {#if error}
    <div class="p-4 rounded-[12px] bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px]">error</span>
      <span>{error}</span>
    </div>
  {/if}

  <!-- TAB 1: OVERVIEW -->
  {#if activeTab === "overview"}
    <!-- The API exposes a period-filtered chart, while KPI and breakdown totals
         are lifetime-since-reset aggregates from GET /api/usage. -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-border-subtle rounded-[12px] p-3 px-4 shadow-[var(--shadow-soft)]">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px] text-brand-400" aria-hidden="true">tune</span>
          <span class="text-xs font-semibold text-text-main">Trend Chart Window</span>
        </div>
        <p class="text-[11px] text-text-muted mt-1">
          This range changes the chart only. KPI cards and breakdowns show all recorded totals since the last reset.
        </p>
      </div>

      <div
        role="group"
        aria-label="Usage trend chart range"
        class="flex flex-wrap items-center gap-1 bg-surface-2 p-1 rounded-[8px] border border-border-subtle shrink-0"
      >
        {#each PERIODS as p}
          <button
            type="button"
            aria-pressed={period === p.value}
            title={p.value === "60d" ? "Last 60 days" : undefined}
            onclick={() => (period = p.value)}
            class="px-2.5 py-1 text-xs font-semibold rounded-[6px] transition-all font-mono {period === p.value
              ? 'bg-surface text-brand-400 shadow-sm border border-border-subtle'
              : 'text-text-muted hover:text-text-main'}"
          >
            {p.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- 5 Summary KPI Cards -->
    <SummaryKpiCards {stats} />

    <!-- Native SVG Multi-Series Trend Chart -->
    <UsageChart {period} />

    <!-- Distributions: Tri-Protocol & Provider Inferences -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Protocol Distribution -->
      <Card padding="md" elev class="space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[20px] text-brand-400">sync_alt</span>
            <h3 class="font-bold text-text-main text-sm">Protocol Distribution</h3>
          </div>
          <span class="text-xs font-mono text-text-muted">Tri-Protocol Gateway</span>
        </div>

        <div class="space-y-3">
          <!-- OpenAI Chat -->
          <div class="space-y-1 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-text-main flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                OpenAI (/v1/chat/completions)
              </span>
              <span class="font-mono text-text-muted">
                {stats?.byProtocol?.openai?.requests || 0} reqs · {(stats?.byProtocol?.openai?.tokens || 0).toLocaleString()} tok
              </span>
            </div>
            <div class="w-full bg-surface-2 rounded-full h-2 overflow-hidden border border-border-subtle">
              <div
                class="bg-emerald-400 h-2 rounded-full transition-all duration-300"
                style="width: {stats?.totalRequests ? Math.round(((stats.byProtocol?.openai?.requests || 0) / stats.totalRequests) * 100) : 0}%"
              ></div>
            </div>
          </div>

          <!-- Anthropic Claude -->
          <div class="space-y-1 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-text-main flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-brand-400"></span>
                Anthropic Claude (/v1/messages)
              </span>
              <span class="font-mono text-text-muted">
                {stats?.byProtocol?.anthropic?.requests || 0} reqs · {(stats?.byProtocol?.anthropic?.tokens || 0).toLocaleString()} tok
              </span>
            </div>
            <div class="w-full bg-surface-2 rounded-full h-2 overflow-hidden border border-border-subtle">
              <div
                class="bg-brand-400 h-2 rounded-full transition-all duration-300"
                style="width: {stats?.totalRequests ? Math.round(((stats.byProtocol?.anthropic?.requests || 0) / stats.totalRequests) * 100) : 0}%"
              ></div>
            </div>
          </div>

          <!-- Codex Responses -->
          <div class="space-y-1 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-text-main flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-sky-400"></span>
                OpenAI Codex (/response)
              </span>
              <span class="font-mono text-text-muted">
                {stats?.byProtocol?.responses?.requests || 0} reqs · {(stats?.byProtocol?.responses?.tokens || 0).toLocaleString()} tok
              </span>
            </div>
            <div class="w-full bg-surface-2 rounded-full h-2 overflow-hidden border border-border-subtle">
              <div
                class="bg-sky-400 h-2 rounded-full transition-all duration-300"
                style="width: {stats?.totalRequests ? Math.round(((stats.byProtocol?.responses?.requests || 0) / stats.totalRequests) * 100) : 0}%"
              ></div>
            </div>
          </div>
        </div>
      </Card>

      <!-- Provider Distribution -->
      <Card padding="md" elev class="space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[20px] text-brand-400">dns</span>
            <h3 class="font-bold text-text-main text-sm">Provider Inferences</h3>
          </div>
          <span class="text-xs font-mono text-text-muted">Backend Engines</span>
        </div>

        <div class="space-y-3">
          <!-- OpenCode -->
          <div class="space-y-1 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-text-main flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                OpenCode Free-Tier (BoringSSL)
              </span>
              <span class="font-mono text-text-muted">
                {stats?.byProvider?.opencode?.requests || 0} reqs · {(stats?.byProvider?.opencode?.tokens || 0).toLocaleString()} tok
              </span>
            </div>
            <div class="w-full bg-surface-2 rounded-full h-2 overflow-hidden border border-border-subtle">
              <div
                class="bg-emerald-400 h-2 rounded-full transition-all duration-300"
                style="width: {stats?.totalRequests ? Math.round(((stats.byProvider?.opencode?.requests || 0) / stats.totalRequests) * 100) : 0}%"
              ></div>
            </div>
          </div>

          <!-- CodeBuddy -->
          <div class="space-y-1 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-text-main flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-violet-400"></span>
                CodeBuddy International (WorkBuddy)
              </span>
              <span class="font-mono text-text-muted">
                {stats?.byProvider?.codebuddy?.requests || 0} reqs · {(stats?.byProvider?.codebuddy?.tokens || 0).toLocaleString()} tok
              </span>
            </div>
            <div class="w-full bg-surface-2 rounded-full h-2 overflow-hidden border border-border-subtle">
              <div
                class="bg-violet-400 h-2 rounded-full transition-all duration-300"
                style="width: {stats?.totalRequests ? Math.round(((stats.byProvider?.codebuddy?.requests || 0) / stats.totalRequests) * 100) : 0}%"
              ></div>
            </div>
          </div>

          <!-- Custom 3rd Party -->
          <div class="space-y-1 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-text-main flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                3rd-Party Custom Providers
              </span>
              <span class="font-mono text-text-muted">
                {stats?.byProvider?.custom?.requests || 0} reqs · {(stats?.byProvider?.custom?.tokens || 0).toLocaleString()} tok
              </span>
            </div>
            <div class="w-full bg-surface-2 rounded-full h-2 overflow-hidden border border-border-subtle">
              <div
                class="bg-amber-400 h-2 rounded-full transition-all duration-300"
                style="width: {stats?.totalRequests ? Math.round(((stats.byProvider?.custom?.requests || 0) / stats.totalRequests) * 100) : 0}%"
              ></div>
            </div>
          </div>
        </div>
      </Card>
    </div>

    <!-- Usage Breakdown Table (by Model / Provider / Protocol) -->
    <UsageBreakdownTable {stats} />

    <!-- Recent Request Audit Log Preview -->
    <Card padding="md" elev class="space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-border-subtle">
        <div>
          <h3 class="font-bold text-text-main text-sm">Recent Request Audit Log</h3>
          <p class="text-xs text-text-muted">Showing latest 8 executions. Switch to Request Details for full filtering & inspection drawer.</p>
        </div>

        <Button variant="outline" size="sm" onclick={() => (activeTab = "details")}>
          <span>View All Details</span>
          <span class="material-symbols-outlined text-[15px]">arrow_forward</span>
        </Button>
      </div>

      {#if !stats?.recentLogs || stats.recentLogs.length === 0}
        <div class="p-8 text-center text-xs text-text-muted">
          No requests recorded yet.
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-border-subtle text-text-subtle font-semibold uppercase tracking-wider text-[10px]">
                <th class="py-2 px-3">Time</th>
                <th class="py-2 px-3">Protocol</th>
                <th class="py-2 px-3">Model</th>
                <th class="py-2 px-3">Provider</th>
                <th class="py-2 px-3">Status</th>
                <th class="py-2 px-3">Latency</th>
                <th class="py-2 px-3">Tokens</th>
                <th class="py-2 px-3">Saved</th>
                <th class="py-2 px-3 text-center">Stream</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-subtle font-mono text-[11px]">
              {#each stats.recentLogs.slice(0, 8) as log}
                <tr class="hover:bg-surface-2/60 transition-colors">
                  <td class="py-2 px-3 text-text-subtle whitespace-nowrap">{formatTimestamp(log.timestamp)}</td>
                  <td class="py-2 px-3">
                    <Badge
                      tone={log.protocol === "anthropic" ? "primary" : log.protocol === "responses" ? "info" : "success"}
                      size="sm"
                    >
                      {log.protocol.toUpperCase()}
                    </Badge>
                  </td>
                  <td class="py-2 px-3 font-semibold text-text-main truncate max-w-[180px]" title={log.model}>{log.model}</td>
                  <td class="py-2 px-3 text-text-muted text-[11px]">{log.provider}</td>
                  <td class="py-2 px-3">
                    <span
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold {log.status >= 200 && log.status < 300
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'}"
                    >
                      {log.status}
                    </span>
                  </td>
                  <td class="py-2 px-3 text-text-muted">{log.latencyMs}ms</td>
                  <td class="py-2 px-3 font-semibold text-text-main">{log.totalTokens.toLocaleString()}</td>
                  <td class="py-2 px-3 text-emerald-400">{log.savedTokens > 0 ? `+${log.savedTokens}` : "—"}</td>
                  <td class="py-2 px-3 text-center">
                    {#if log.stream}
                      <span class="material-symbols-outlined text-[15px] text-brand-400" title="SSE Stream">stream</span>
                    {:else}
                      <span class="material-symbols-outlined text-[15px] text-text-subtle" title="Standard JSON">data_object</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </Card>
  {/if}

  <!-- TAB 2: REQUEST DETAILS & AUDIT DRAWER -->
  {#if activeTab === "details"}
    <RequestDetailsTab {stats} onRefresh={loadData} />
  {/if}
</div>
