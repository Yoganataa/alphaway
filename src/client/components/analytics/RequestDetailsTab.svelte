<script lang="ts">
  /**
   * Request Details Tab and Payload Inspection Drawer ported from 9router-go.
   */
  import Badge from "../../lib/ui/Badge.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Card from "../../lib/ui/Card.svelte";
  import ActivityHeatmap from "./ActivityHeatmap.svelte";
  import { notifications } from "../../lib/notifications";
  import type { RequestLogEntry, UsageStats } from "../../lib/types";

  interface Props {
    stats: UsageStats | null;
    onRefresh: () => void;
  }

  let { stats, onRefresh }: Props = $props();

  let searchQuery = $state("");
  let protocolFilter = $state<string>("all");
  let statusFilter = $state<string>("all");
  let currentPage = $state(1);
  const PAGE_SIZE = 15;

  let selectedRequest = $state<RequestLogEntry | null>(null);
  let copiedId = $state(false);
  let copiedJson = $state(false);
  let copying = $state<"id" | "json" | null>(null);

  function fmtNumber(n: number | undefined): string {
    if (!n) return "0";
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

  function formatFullTime(iso: string | undefined): string {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }

  const filteredLogs = $derived.by(() => {
    if (!stats?.recentLogs) return [];
    return stats.recentLogs.filter((entry) => {
      if (protocolFilter !== "all" && entry.protocol !== protocolFilter) return false;
      if (statusFilter === "success" && (entry.status < 200 || entry.status >= 300)) return false;
      if (statusFilter === "error" && entry.status >= 200 && entry.status < 300) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          entry.model.toLowerCase().includes(q) ||
          entry.provider.toLowerCase().includes(q) ||
          entry.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  });

  const totalPages = $derived(Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE)));
  const paginatedLogs = $derived(
    filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  );

  function openDetail(entry: RequestLogEntry) {
    selectedRequest = entry;
    copiedId = false;
    copiedJson = false;
    copying = null;
  }

  function closeDetail() {
    selectedRequest = null;
  }

  async function copyText(text: string, target: "id" | "json") {
    if (copying !== null) return;

    copying = target;
    if (target === "id") copiedId = false;
    else copiedJson = false;

    try {
      if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(text);

      if (target === "id") {
        copiedId = true;
        notifications.success("Request ID copied to clipboard");
        setTimeout(() => (copiedId = false), 2000);
      } else {
        copiedJson = true;
        notifications.success("Request audit JSON copied to clipboard");
        setTimeout(() => (copiedJson = false), 2000);
      }
    } catch (error) {
      const reason = error instanceof Error && error.message ? `: ${error.message}` : "";
      const label = target === "id" ? "request ID" : "request audit JSON";
      notifications.error(`Could not copy ${label}${reason}`);
    } finally {
      copying = null;
    }
  }
</script>

<div class="space-y-6">
  <!-- Top Activity Heatmap -->
  <ActivityHeatmap />

  <!-- Request Details Card -->
  <div class="bg-surface border border-border-subtle rounded-[14px] shadow-[var(--shadow-soft)] overflow-hidden">
    <!-- Header with Filters -->
    <div class="p-5 border-b border-border-subtle flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-surface-2/40">
      <div>
        <h3 class="font-bold text-text-main text-sm">Recent Request Audits</h3>
        <p class="text-xs text-text-muted">
          Showing {filteredLogs.length} of {stats?.recentLogs?.length || 0} recorded requests
        </p>
      </div>

      <!-- Search & Filters -->
      <div class="flex items-center gap-2 flex-wrap">
        <div class="relative">
          <span class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-text-subtle">
            search
          </span>
          <input
            type="text"
            placeholder="Search model, id..."
            bind:value={searchQuery}
            class="w-36 sm:w-48 rounded-[8px] border border-border bg-surface pl-8 pr-3 py-1.5 text-xs text-text-main focus:outline-none focus:border-brand-500 font-mono"
          />
        </div>

        <select
          bind:value={protocolFilter}
          class="rounded-[8px] border border-border bg-surface px-2.5 py-1.5 text-xs text-text-main focus:outline-none font-mono"
        >
          <option value="all">All Protocols</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="responses">Responses</option>
        </select>

        <select
          bind:value={statusFilter}
          class="rounded-[8px] border border-border bg-surface px-2.5 py-1.5 text-xs text-text-main focus:outline-none font-mono"
        >
          <option value="all">All Status</option>
          <option value="success">Success (2xx)</option>
          <option value="error">Errors (4xx/5xx)</option>
        </select>

        <Button variant="outline" size="sm" onclick={onRefresh}>
          <span class="material-symbols-outlined text-[15px]">refresh</span>
          <span>Refresh</span>
        </Button>
      </div>
    </div>

    {#if paginatedLogs.length === 0}
      <div class="py-16 text-center text-xs text-text-muted">
        No request entries found matching filters.
      </div>
    {:else}
      <!-- Audit Table -->
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-border-subtle text-text-subtle font-semibold uppercase tracking-wider text-[10px] bg-surface-1">
              <th class="py-2.5 px-3">Time</th>
              <th class="py-2.5 px-3">Protocol</th>
              <th class="py-2.5 px-3">Model</th>
              <th class="py-2.5 px-3">Provider</th>
              <th class="py-2.5 px-3">Status</th>
              <th class="py-2.5 px-3">Latency</th>
              <th class="py-2.5 px-3">Tokens</th>
              <th class="py-2.5 px-3">Saved</th>
              <th class="py-2.5 px-3 text-center">Stream</th>
              <th class="py-2.5 px-3 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-subtle font-mono text-[11px]">
            {#each paginatedLogs as log (log.id)}
              <tr
                class="hover:bg-surface-2/60 transition-colors cursor-pointer"
                onclick={() => openDetail(log)}
              >
                <td class="py-2.5 px-3 text-text-subtle whitespace-nowrap">
                  {formatTime(log.timestamp)}
                </td>
                <td class="py-2.5 px-3">
                  <Badge
                    tone={log.protocol === "anthropic" ? "primary" : log.protocol === "responses" ? "info" : "success"}
                    size="sm"
                  >
                    {log.protocol.toUpperCase()}
                  </Badge>
                </td>
                <td class="py-2.5 px-3 font-semibold text-text-main truncate max-w-[160px]" title={log.model}>
                  {log.model}
                </td>
                <td class="py-2.5 px-3 text-text-muted text-[11px]">
                  {log.provider}
                </td>
                <td class="py-2.5 px-3">
                  <span
                    class="px-1.5 py-0.5 rounded text-[10px] font-bold {log.status >= 200 && log.status < 300
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'}"
                  >
                    {log.status}
                  </span>
                </td>
                <td class="py-2.5 px-3 text-text-muted">
                  {log.latencyMs}ms
                </td>
                <td class="py-2.5 px-3 text-text-main">
                  {fmtNumber(log.totalTokens)}
                  <span class="text-[10px] text-text-subtle">({log.promptTokens}+{log.completionTokens})</span>
                </td>
                <td class="py-2.5 px-3 text-emerald-400 font-semibold">
                  {log.savedTokens > 0 ? `+${log.savedTokens}` : "—"}
                </td>
                <td class="py-2.5 px-3 text-center">
                  {#if log.stream}
                    <span class="material-symbols-outlined text-[15px] text-brand-400" title="SSE Stream">stream</span>
                  {:else}
                    <span class="material-symbols-outlined text-[15px] text-text-subtle" title="Standard JSON">data_object</span>
                  {/if}
                </td>
                <td class="py-2.5 px-3 text-right">
                  <button
                    type="button"
                    class="px-2 py-0.5 rounded-[6px] bg-surface-2 border border-border-subtle text-[11px] font-sans font-semibold text-text-muted hover:text-text-main hover:border-brand-500/50 transition-colors"
                    onclick={(e) => {
                      e.stopPropagation();
                      openDetail(log);
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div class="p-3 border-t border-border-subtle flex items-center justify-between text-xs text-text-muted bg-surface-2/30 font-mono">
        <span>Page {currentPage} of {totalPages}</span>
        <div class="flex items-center gap-1 font-sans">
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage <= 1}
            onclick={() => (currentPage = Math.max(1, currentPage - 1))}
          >
            Previous
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage >= totalPages}
            onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Detail Modal Drawer -->
  {#if selectedRequest}
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onclick={closeDetail}
      onkeydown={(e) => e.key === "Escape" && closeDetail()}
      role="dialog"
      tabindex="-1"
    >
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="bg-surface border border-border rounded-[16px] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
        onclick={(e) => e.stopPropagation()}
        role="document"
      >
        <!-- Modal Header -->
        <div class="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/60">
          <div class="flex items-center gap-3">
            <span class="font-mono text-sm font-bold text-text-main">{selectedRequest.id}</span>
            <Button
              id="usage-copy-request-id"
              variant="ghost"
              size="sm"
              title="Copy Request ID"
              disabled={copying !== null}
              loading={copying === "id"}
              onclick={() => copyText(selectedRequest.id, "id")}
            >
              <span>{copying === "id" ? "Copying..." : copiedId ? "Copied!" : "Copy ID"}</span>
            </Button>
            <span
              class="px-2 py-0.5 rounded text-[11px] font-bold font-mono {selectedRequest.status >= 200 && selectedRequest.status < 300
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'}"
            >
              HTTP {selectedRequest.status}
            </span>
          </div>

          <button
            type="button"
            onclick={closeDetail}
            class="text-text-muted hover:text-text-main p-1 rounded-lg hover:bg-surface-3 transition-colors"
          >
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="p-6 space-y-6 overflow-y-auto">
          <!-- Metadata Cards Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
            <div class="p-3 rounded-[10px] bg-surface-2 border border-border-subtle">
              <span class="text-text-muted text-[10px] uppercase font-semibold block">Protocol</span>
              <span class="font-bold text-brand-400 uppercase">{selectedRequest.protocol}</span>
            </div>
            <div class="p-3 rounded-[10px] bg-surface-2 border border-border-subtle">
              <span class="text-text-muted text-[10px] uppercase font-semibold block">Model</span>
              <span class="font-bold text-text-main truncate block" title={selectedRequest.model}>
                {selectedRequest.model}
              </span>
            </div>
            <div class="p-3 rounded-[10px] bg-surface-2 border border-border-subtle">
              <span class="text-text-muted text-[10px] uppercase font-semibold block">Provider Lane</span>
              <span class="font-bold text-text-main capitalize">{selectedRequest.provider}</span>
            </div>
            <div class="p-3 rounded-[10px] bg-surface-2 border border-border-subtle">
              <span class="text-text-muted text-[10px] uppercase font-semibold block">Latency</span>
              <span class="font-bold text-text-main">{selectedRequest.latencyMs} ms</span>
            </div>
          </div>

          <!-- Tokens Breakdown -->
          <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle space-y-3 font-mono text-xs">
            <div class="flex items-center justify-between pb-2 border-b border-border-subtle">
              <span class="font-semibold text-text-main">Token Accounting</span>
              <span class="text-text-muted text-[11px]">{selectedRequest.stream ? "SSE Streaming" : "Standard JSON"}</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <span class="text-text-muted text-[10px] block">Prompt Tokens</span>
                <span class="text-brand-400 font-bold text-base">{fmtNumber(selectedRequest.promptTokens)}</span>
              </div>
              <div>
                <span class="text-text-muted text-[10px] block">Completion Tokens</span>
                <span class="text-sky-400 font-bold text-base">{fmtNumber(selectedRequest.completionTokens)}</span>
              </div>
              <div>
                <span class="text-text-muted text-[10px] block">Total Ingested</span>
                <span class="text-text-main font-bold text-base">{fmtNumber(selectedRequest.totalTokens)}</span>
              </div>
              <div>
                <span class="text-text-muted text-[10px] block">Saved via TokenSaver</span>
                <span class="text-emerald-400 font-bold text-base">+{fmtNumber(selectedRequest.savedTokens)}</span>
              </div>
            </div>
          </div>

          <!-- Full Audit JSON Payload -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-text-main uppercase tracking-wider text-[11px]">Audit Telemetry JSON</span>
              <Button
                id="usage-copy-request-json"
                variant="outline"
                size="sm"
                title="Copy request audit JSON"
                disabled={copying !== null}
                loading={copying === "json"}
                onclick={() => copyText(JSON.stringify(selectedRequest, null, 2), "json")}
              >
                {#if copying === "json"}
                  <span>Copying...</span>
                {:else}
                  <span class="material-symbols-outlined text-[14px]">
                    {copiedJson ? "check" : "content_copy"}
                  </span>
                  <span>{copiedJson ? "Copied!" : "Copy JSON"}</span>
                {/if}
              </Button>
            </div>
            <pre class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle text-xs font-mono text-text-muted overflow-x-auto max-h-56 leading-relaxed selection:bg-brand-500/30">
              {JSON.stringify(selectedRequest, null, 2)}
            </pre>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="p-4 px-6 border-t border-border flex items-center justify-between bg-surface-2/40 text-xs">
          <span class="text-text-muted font-mono">{formatFullTime(selectedRequest.timestamp)}</span>
          <Button variant="secondary" size="sm" onclick={closeDetail}>
            Close
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>
