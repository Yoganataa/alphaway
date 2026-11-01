<script lang="ts">
  /**
   * Usage Breakdown Table ported from 9router-go.
   * Provides segment switching (by Model, by Provider, by Endpoint/Protocol)
   * with clickable sortable columns and visual indicators.
   */
  import Card from "../../lib/ui/Card.svelte";
  import Badge from "../../lib/ui/Badge.svelte";
  import type { UsageStats, BreakdownUsageSummary, ModelUsageSummary } from "../../lib/types";

  interface Props {
    stats: UsageStats | null;
  }

  let { stats }: Props = $props();

  type TableView = "model" | "provider" | "endpoint";
  type SortKey = "name" | "requests" | "promptTokens" | "completionTokens" | "totalTokens" | "lastUsed";

  let tableView = $state<TableView>("model");
  let sortKey = $state<SortKey>("totalTokens");
  let sortDir = $state<"asc" | "desc">("desc");

  function fmtNumber(n: number | undefined): string {
    if (!n) return "0";
    return n.toLocaleString();
  }

  function fmtTokens(n: number | undefined): string {
    if (!n) return "0";
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toLocaleString();
  }

  function formatTime(iso: string | undefined): string {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return iso;
    }
  }

  interface ProcessedRow {
    key: string;
    label: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    lastUsed: string;
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = key === "name" ? "asc" : "desc";
    }
  }

  function arrow(key: SortKey): string {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  const rows = $derived.by((): ProcessedRow[] => {
    if (!stats) return [];

    let list: ProcessedRow[] = [];

    if (tableView === "model") {
      list = Object.entries(stats.byModel || {}).map(([key, item]) => ({
        key,
        label: key,
        requests: item.requests || 0,
        promptTokens: item.promptTokens || 0,
        completionTokens: item.completionTokens || 0,
        totalTokens: item.totalTokens || 0,
        lastUsed: item.lastUsed || "",
      }));
    } else if (tableView === "provider") {
      list = Object.entries(stats.byProvider || {}).map(([key, item]) => {
        const prompt = item.promptTokens || Math.round((item.tokens || 0) * 0.6);
        const completion = item.completionTokens || Math.round((item.tokens || 0) * 0.4);
        return {
          key,
          label:
            key === "opencode"
              ? "OpenCode Free-Tier (BoringSSL)"
              : key === "codebuddy"
                ? "CodeBuddy International"
                : "3rd-Party Custom Providers",
          requests: item.requests || 0,
          promptTokens: prompt,
          completionTokens: completion,
          totalTokens: item.tokens || 0,
          lastUsed: item.lastUsed || "",
        };
      });
    } else if (tableView === "endpoint") {
      list = Object.entries(stats.byProtocol || {}).map(([key, item]) => {
        const prompt = item.promptTokens || Math.round((item.tokens || 0) * 0.6);
        const completion = item.completionTokens || Math.round((item.tokens || 0) * 0.4);
        return {
          key,
          label:
            key === "openai"
              ? "OpenAI (/v1/chat/completions)"
              : key === "anthropic"
                ? "Anthropic Claude (/v1/messages)"
                : "Codex Responses (/response)",
          requests: item.requests || 0,
          promptTokens: prompt,
          completionTokens: completion,
          totalTokens: item.tokens || 0,
          lastUsed: item.lastUsed || "",
        };
      });
    }

    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.label.localeCompare(b.label);
        case "requests":
          return dir * (a.requests - b.requests);
        case "promptTokens":
          return dir * (a.promptTokens - b.promptTokens);
        case "completionTokens":
          return dir * (a.completionTokens - b.completionTokens);
        case "lastUsed":
          return dir * (a.lastUsed || "").localeCompare(b.lastUsed || "");
        default:
          return dir * (a.totalTokens - b.totalTokens);
      }
    });
  });

  const nameHeader = $derived(
    tableView === "model" ? "Model Name" : tableView === "provider" ? "Provider Lane" : "Endpoint Protocol"
  );
</script>

<div class="bg-surface border border-border-subtle rounded-[14px] p-5 shadow-[var(--shadow-soft)] flex flex-col gap-4">
  <!-- Table Header and Segmented Switcher -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
    <div>
      <h3 class="font-bold text-text-main text-sm">Ingestion Breakdown</h3>
      <p class="text-xs text-text-muted">Analyze token volume and request frequency by dimension</p>
    </div>

    <!-- View Switcher -->
    <div class="flex items-center gap-1 bg-surface-2 p-1 rounded-[10px] border border-border-subtle self-start sm:self-auto">
      <button
        type="button"
        onclick={() => (tableView = "model")}
        class="px-3 py-1 text-xs font-semibold rounded-[6px] transition-colors {tableView === 'model' ? 'bg-surface text-brand-400 shadow-sm' : 'text-text-muted hover:text-text-main'}"
      >
        By Model
      </button>
      <button
        type="button"
        onclick={() => (tableView = "provider")}
        class="px-3 py-1 text-xs font-semibold rounded-[6px] transition-colors {tableView === 'provider' ? 'bg-surface text-brand-400 shadow-sm' : 'text-text-muted hover:text-text-main'}"
      >
        By Provider
      </button>
      <button
        type="button"
        onclick={() => (tableView = "endpoint")}
        class="px-3 py-1 text-xs font-semibold rounded-[6px] transition-colors {tableView === 'endpoint' ? 'bg-surface text-brand-400 shadow-sm' : 'text-text-muted hover:text-text-main'}"
      >
        By Protocol
      </button>
    </div>
  </div>

  {#if rows.length === 0}
    <div class="py-12 text-center text-xs text-text-muted">
      No breakdown records available yet.
    </div>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="border-b border-border-subtle text-text-subtle font-semibold uppercase tracking-wider text-[11px]">
            <th class="py-2.5 px-3">
              <button
                type="button"
                onclick={() => toggleSort("name")}
                class="flex items-center gap-1 hover:text-text-main cursor-pointer uppercase font-semibold"
              >
                <span>{nameHeader}</span>
                <span class="font-mono {sortKey === 'name' ? 'text-brand-400 font-bold' : 'text-text-subtle'}">{arrow("name")}</span>
              </button>
            </th>
            <th class="py-2.5 px-3">
              <button
                type="button"
                onclick={() => toggleSort("requests")}
                class="flex items-center gap-1 hover:text-text-main cursor-pointer uppercase font-semibold"
              >
                <span>Requests</span>
                <span class="font-mono {sortKey === 'requests' ? 'text-brand-400 font-bold' : 'text-text-subtle'}">{arrow("requests")}</span>
              </button>
            </th>
            <th class="py-2.5 px-3">
              <button
                type="button"
                onclick={() => toggleSort("promptTokens")}
                class="flex items-center gap-1 hover:text-text-main cursor-pointer uppercase font-semibold"
              >
                <span>Prompt Tok</span>
                <span class="font-mono {sortKey === 'promptTokens' ? 'text-brand-400 font-bold' : 'text-text-subtle'}">{arrow("promptTokens")}</span>
              </button>
            </th>
            <th class="py-2.5 px-3">
              <button
                type="button"
                onclick={() => toggleSort("completionTokens")}
                class="flex items-center gap-1 hover:text-text-main cursor-pointer uppercase font-semibold"
              >
                <span>Completion Tok</span>
                <span class="font-mono {sortKey === 'completionTokens' ? 'text-brand-400 font-bold' : 'text-text-subtle'}">{arrow("completionTokens")}</span>
              </button>
            </th>
            <th class="py-2.5 px-3">
              <button
                type="button"
                onclick={() => toggleSort("totalTokens")}
                class="flex items-center gap-1 hover:text-text-main cursor-pointer uppercase font-semibold"
              >
                <span>Total Tokens</span>
                <span class="font-mono {sortKey === 'totalTokens' ? 'text-brand-400 font-bold' : 'text-text-subtle'}">{arrow("totalTokens")}</span>
              </button>
            </th>
            <th class="py-2.5 px-3 text-right">
              <button
                type="button"
                onclick={() => toggleSort("lastUsed")}
                class="inline-flex items-center gap-1 hover:text-text-main cursor-pointer uppercase font-semibold ml-auto"
              >
                <span>Last Used</span>
                <span class="font-mono {sortKey === 'lastUsed' ? 'text-brand-400 font-bold' : 'text-text-subtle'}">{arrow("lastUsed")}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle font-mono text-[11px]">
          {#each rows as r (r.key)}
            <tr class="hover:bg-surface-2/60 transition-colors">
              <td class="py-2.5 px-3 text-text-main font-semibold flex items-center gap-2">
                {#if tableView === "model"}
                  <span class="w-2 h-2 rounded-full bg-brand-400 shrink-0"></span>
                {:else if tableView === "provider"}
                  <span class="w-2 h-2 rounded-full {r.key === 'opencode' ? 'bg-emerald-400' : r.key === 'codebuddy' ? 'bg-violet-400' : 'bg-amber-400'} shrink-0"></span>
                {:else}
                  <span class="w-2 h-2 rounded-full {r.key === 'openai' ? 'bg-emerald-400' : r.key === 'anthropic' ? 'bg-brand-400' : 'bg-sky-400'} shrink-0"></span>
                {/if}
                <span class="truncate max-w-[240px]" title={r.label}>{r.label}</span>
              </td>
              <td class="py-2.5 px-3 text-text-muted">{fmtNumber(r.requests)}</td>
              <td class="py-2.5 px-3 text-brand-400/90">{fmtTokens(r.promptTokens)}</td>
              <td class="py-2.5 px-3 text-sky-400/90">{fmtTokens(r.completionTokens)}</td>
              <td class="py-2.5 px-3 font-bold text-emerald-400">{fmtTokens(r.totalTokens)}</td>
              <td class="py-2.5 px-3 text-right text-text-subtle">{formatTime(r.lastUsed)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
