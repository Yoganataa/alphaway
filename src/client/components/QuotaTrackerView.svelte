<script lang="ts">
  import { onMount } from "svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import { notifications } from "../lib/notifications";
  import {
    fetchApiKeys,
    fetchManagedKeyUsageWindow,
    type APIKeyRecord,
    type ManagedKeyUsageWindowItem,
    type ManagedKeyUsageWindowName,
  } from "../lib/api";

  let keys = $state<APIKeyRecord[]>([]);
  let windowUsage = $state<ManagedKeyUsageWindowItem[]>([]);
  let usageWindow = $state<ManagedKeyUsageWindowName>("24h");
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let loadedUsageWindow = $state<ManagedKeyUsageWindowName | null>(null);
  let searchTerm = $state("");

  const usageByKey = $derived(new Map(windowUsage.map((item) => [item.clientApiKeyId, item])));
  const formatUsageWindowLabel = (windowName: ManagedKeyUsageWindowName) =>
    windowName === "1h" ? "Last hour" : windowName === "24h" ? "Last 24 hours" : windowName === "7d" ? "Last 7 days" : "Last 30 days";
  const usageWindowLabel = $derived(formatUsageWindowLabel(loadedUsageWindow ?? usageWindow));
  const limitLabel = (value: number | null) => value === null || value === 0 ? "Unlimited" : value.toLocaleString();
  const tokenLabel = (value: number) => value.toLocaleString();

  async function loadData(windowName: ManagedKeyUsageWindowName = usageWindow) {
    loading = true;
    loadError = null;
    try {
      const [keyRecords, usageRecords] = await Promise.all([
        fetchApiKeys(),
        fetchManagedKeyUsageWindow(windowName),
      ]);
      keys = keyRecords;
      windowUsage = usageRecords;
      loadedUsageWindow = windowName;
    } catch (error: any) {
      loadError = error.message || "Failed to load managed key policy usage";
      notifications.error(loadError);
    } finally {
      loading = false;
    }
  }

  onMount(loadData);

  const filteredKeys = $derived.by(() => {
    const term = searchTerm.toLowerCase().trim();
    return keys.filter((key) =>
      key.status === "active" &&
      (!term || key.name.toLowerCase().includes(term) || key.prefix.toLowerCase().includes(term) || (key.planName || "").toLowerCase().includes(term))
    );
  });
</script>

<div class="space-y-6">
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-bold text-text-main">Quota & Policy Tracker</h2>
        <Badge tone="primary" size="sm">AlphaWay managed keys</Badge>
      </div>
      <p class="text-xs text-text-muted mt-1">Configured limits and usage recorded by AlphaWay. This is not an upstream provider quota monitor.</p>
    </div>
    <Button variant="secondary" size="sm" onclick={() => loadData(usageWindow)} disabled={loading}>
      <span class="material-symbols-outlined text-[16px] {loading ? 'animate-spin' : ''}">refresh</span>
      <span>Refresh</span>
    </Button>
  </div>

  <div class="rounded-xl border border-border-subtle bg-surface-1 p-4 space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold text-text-main">Managed API key usage</h3>
        <p class="text-xs text-text-muted">Lifetime totals are stored per key. The selected window counts completed requests persisted by AlphaWay.</p>
      </div>
      <div class="flex items-center gap-3">
        <label class="text-xs text-text-muted flex items-center gap-2">
          Window
          <select
            aria-label="Usage window"
            class="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-text-main"
            value={usageWindow}
            onchange={(event) => {
              usageWindow = event.currentTarget.value as ManagedKeyUsageWindowName;
              void loadData(usageWindow);
            }}
          >
            <option value="1h">1 hour</option>
            <option value="24h">24 hours</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>
        </label>
        <span class="text-xs text-text-subtle">{filteredKeys.length} active keys</span>
      </div>
    </div>
    <input
      type="search"
      bind:value={searchTerm}
      placeholder="Search key, prefix, or Plan…"
      class="w-full sm:max-w-sm rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text-main"
    />
    <div class="overflow-x-auto">
      <table class="w-full min-w-[980px] text-left text-xs">
        <thead class="text-text-muted uppercase tracking-wider border-b border-border-subtle">
          <tr>
            <th class="py-3 pr-4 font-semibold">Key</th>
            <th class="py-3 pr-4 font-semibold">Plan</th>
            <th class="py-3 pr-4 font-semibold">Requests (lifetime)</th>
            <th class="py-3 pr-4 font-semibold">Tokens (lifetime)</th>
            <th class="py-3 pr-4 font-semibold">Recorded usage ({usageWindowLabel})</th>
            <th class="py-3 pr-4 font-semibold">Token quota</th>
            <th class="py-3 pr-4 font-semibold">RPM / prompt TPM</th>
            <th class="py-3 font-semibold">Concurrency</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle">
          {#each filteredKeys as key (key.id)}
            {@const quota = key.effectiveTokenQuota}
            {@const percent = quota > 0 ? Math.min(100, Math.round((key.totalTokensUsed / quota) * 100)) : 0}
            {@const activity = usageByKey.get(key.id)}
            <tr>
              <td class="py-3 pr-4">
                <p class="font-semibold text-text-main">{key.name}</p>
                <p class="mt-0.5 font-mono text-text-subtle">{key.prefix}…</p>
              </td>
              <td class="py-3 pr-4">
                {#if key.planName}
                  <Badge tone="primary" size="sm">{key.planName}</Badge>
                {:else}
                  <Badge tone="neutral" size="sm">Unassigned</Badge>
                {/if}
              </td>
              <td class="py-3 pr-4 tabular-nums text-text-main">{key.requestsCount.toLocaleString()}</td>
              <td class="py-3 pr-4 tabular-nums text-text-main">{tokenLabel(key.totalTokensUsed)}</td>
              <td class="py-3 pr-4 tabular-nums text-text-main">
                {(activity?.requests ?? 0).toLocaleString()} requests
                <p class="mt-0.5 text-text-muted">{tokenLabel(activity?.totalTokens ?? 0)} tokens</p>
              </td>
              <td class="py-3 pr-4 min-w-[150px]">
                {#if quota > 0}
                  <div class="flex items-center justify-between gap-2 text-text-main tabular-nums">
                    <span>{tokenLabel(key.totalTokensUsed)} / {tokenLabel(quota)}</span>
                    <span class="text-text-muted">{percent}%</span>
                  </div>
                  <div class="mt-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div class="h-full rounded-full bg-brand-500" style="width: {percent}%"></div>
                  </div>
                {:else}
                  <span class="text-text-muted">Unlimited</span>
                {/if}
              </td>
              <td class="py-3 pr-4 text-text-main tabular-nums">
                {limitLabel(key.effectiveRpmLimit)} rpm
                <p class="mt-0.5 text-text-muted">{limitLabel(key.effectiveTpmLimit)} prompt tpm</p>
              </td>
              <td class="py-3 text-text-main tabular-nums">{limitLabel(key.effectiveConcurrencyLimit)}</td>
            </tr>
          {/each}
          {#if loading}
            <tr><td colspan="8" class="py-8 text-center text-text-muted">Loading managed key usage…</td></tr>
          {:else if loadError}
            <tr>
              <td colspan="8" class="py-5 text-center">
                <div role="alert" class="flex flex-col sm:flex-row items-center justify-center gap-3 text-rose-400">
                  <span>
                    {#if loadedUsageWindow}
                      Could not refresh usage for {formatUsageWindowLabel(usageWindow)}: {loadError}. Values still shown use the {formatUsageWindowLabel(loadedUsageWindow)} window.
                    {:else}
                      Could not load usage for {formatUsageWindowLabel(usageWindow)}: {loadError}. No usage data is available yet.
                    {/if}
                  </span>
                  <button
                    type="button"
                    aria-label="Retry managed key usage"
                    onclick={() => void loadData(usageWindow)}
                    class="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-main hover:bg-surface-2 disabled:opacity-50"
                    disabled={loading}
                  >
                    Retry
                  </button>
                </div>
              </td>
            </tr>
          {:else if filteredKeys.length === 0}
            <tr><td colspan="8" class="py-8 text-center text-text-muted">No active managed API keys match this filter.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <div class="rounded-lg border border-border-subtle bg-surface-2 p-4 space-y-1">
    <h3 class="text-xs font-semibold text-text-main">Measurement boundaries</h3>
    <p class="text-xs text-text-muted">Token totals use provider-reported usage when available and AlphaWay's text estimator as a fallback. Streamed output is estimated from the text delivered. Recorded window totals count completed requests in SQLite; an in-flight request appears after its usage is finalized. RPM and prompt TPM enforcement windows are process-local and may reset on restart.</p>
    <p class="text-xs text-text-muted">Upstream provider RPM/TPM/quota values are not shown because AlphaWay does not have authoritative quota data for every provider.</p>
  </div>
</div>
