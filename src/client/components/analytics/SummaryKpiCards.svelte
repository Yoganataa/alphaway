<script lang="ts">
  import Card from "../../lib/ui/Card.svelte";
  import Badge from "../../lib/ui/Badge.svelte";
  import type { UsageStats } from "../../lib/types";

  let { stats }: { stats: UsageStats | null } = $props();

  function fmtNumber(n: number | undefined): string {
    if (n === undefined || n === null) return "0";
    return n.toLocaleString();
  }

  function fmtTokens(n: number | undefined): string {
    if (!n) return "0";
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toLocaleString();
  }

  const successRate = $derived.by(() => {
    if (!stats || stats.totalRequests === 0) return null;
    return Number(((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1));
  });

  const savedPercent = $derived.by(() => {
    if (!stats || (stats.totalTokens + stats.savedTokens) === 0) return 0;
    return Number(((stats.savedTokens / (stats.totalTokens + stats.savedTokens)) * 100).toFixed(1));
  });
</script>

<div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-4">
  <!-- 1. Total Requests -->
  <div class="bg-surface border border-border-subtle rounded-[14px] shadow-[var(--shadow-soft)] flex min-w-0 flex-col gap-1 px-4 py-3 hover:border-brand-500/40 transition-colors">
    <div class="flex items-center justify-between text-xs text-text-muted">
      <span class="uppercase font-semibold text-[11px] tracking-wider">Total Requests</span>
      <span class="w-2 h-2 rounded-full {stats?.totalRequests ? 'bg-emerald-400' : 'bg-text-subtle'}"></span>
    </div>
    <span class="truncate text-2xl font-bold font-mono text-text-main" title={fmtNumber(stats?.totalRequests)}>
      {fmtTokens(stats?.totalRequests)}
    </span>
    <div class="flex items-center justify-between text-[11px] text-text-muted mt-0.5">
      <span id="usage-success-rate" class="text-emerald-400 font-semibold">
        {successRate === null ? "—" : `${successRate}% Success`}
      </span>
      <span>{stats?.failedRequests || 0} err</span>
    </div>
  </div>

  <!-- 2. Total Input Tokens -->
  <div class="bg-surface border border-border-subtle rounded-[14px] shadow-[var(--shadow-soft)] flex min-w-0 flex-col gap-1 px-4 py-3 hover:border-brand-500/40 transition-colors">
    <div class="flex items-center justify-between text-xs text-text-muted">
      <span class="uppercase font-semibold text-[11px] tracking-wider">Total Tokens Processed</span>
      <span class="material-symbols-outlined text-[15px] text-brand-400">arrow_downward</span>
    </div>
    <span class="truncate text-2xl font-bold font-mono text-brand-400" title={fmtNumber(stats?.totalPromptTokens)}>
      {fmtTokens(stats?.totalPromptTokens)}
    </span>
    <span class="text-[11px] text-text-muted truncate">Prompt payload</span>
  </div>

  <!-- 3. Cached / Saved Tokens -->
  <div class="bg-surface border border-border-subtle rounded-[14px] shadow-[var(--shadow-soft)] flex min-w-0 flex-col gap-1 px-4 py-3 hover:border-brand-500/40 transition-colors">
    <div class="flex items-center justify-between text-xs text-text-muted">
      <span class="uppercase font-semibold text-[11px] tracking-wider">TokenSaver Savings</span>
      <Badge tone="success" size="sm">-{savedPercent}%</Badge>
    </div>
    <span class="truncate text-2xl font-bold font-mono text-emerald-400" title={fmtNumber(stats?.savedTokens)}>
      {fmtTokens(stats?.savedTokens)}
    </span>
    <span class="text-[11px] text-text-muted truncate">TokenSaver & RTK</span>
  </div>

  <!-- 4. Output Tokens -->
  <div class="bg-surface border border-border-subtle rounded-[14px] shadow-[var(--shadow-soft)] flex min-w-0 flex-col gap-1 px-4 py-3 hover:border-brand-500/40 transition-colors">
    <div class="flex items-center justify-between text-xs text-text-muted">
      <span class="uppercase font-semibold text-[11px] tracking-wider">Output Tokens</span>
      <span class="material-symbols-outlined text-[15px] text-sky-400">arrow_upward</span>
    </div>
    <span class="truncate text-2xl font-bold font-mono text-sky-400" title={fmtNumber(stats?.totalCompletionTokens)}>
      {fmtTokens(stats?.totalCompletionTokens)}
    </span>
    <span class="text-[11px] text-text-muted truncate">Completions & SSE</span>
  </div>

  <!-- 5. Est. Value Saved -->
  <div class="bg-surface border border-border-subtle rounded-[14px] shadow-[var(--shadow-soft)] flex min-w-0 flex-col gap-1 px-4 py-3 hover:border-brand-500/40 transition-colors">
    <div class="flex items-center justify-between text-xs text-text-muted">
      <span class="uppercase font-semibold text-[11px] tracking-wider">Est. Saved</span>
      <Badge tone="warning" size="sm">FREE TIER</Badge>
    </div>
    <span class="truncate text-2xl font-bold font-mono text-amber-400">
      ${stats ? stats.estimatedSavingsUsd.toFixed(2) : "0.00"}
    </span>
    <span class="text-[10px] text-text-muted truncate">vs commercial API pricing</span>
  </div>
</div>
