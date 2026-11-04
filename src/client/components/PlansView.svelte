<script lang="ts">
  import { onMount } from "svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import { notifications } from "../lib/notifications";
  import {
    fetchPlans,
    createPlan,
    updatePlan,
    deletePlan,
    type PlanRecord,
    type PlanInput,
  } from "../lib/api";

  let plans = $state<PlanRecord[]>([]);
  let loading = $state(true);
  let hasLoaded = $state(false);
  let loadError = $state<string | null>(null);
  let lastLoadedAt = $state<number | null>(null);
  let refreshInFlight = false;
  let saving = $state(false);
  let editingId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);
  let name = $state("");
  let description = $state("");
  let rpmLimit = $state("0");
  let tpmLimit = $state("0");
  let concurrencyLimit = $state("0");
  let tokenQuota = $state("0");
  let allowedModels = $state("");

  const modelList = () => allowedModels.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  const limitLabel = (value: number) => value > 0 ? value.toLocaleString() : "Unlimited";
  const writesBlocked = () => !hasLoaded || loading || loadError !== null || saving;

  function formatLoadedTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  async function loadPlans(): Promise<boolean> {
    if (refreshInFlight) return false;
    refreshInFlight = true;
    loading = true;
    try {
      const nextPlans = await fetchPlans();
      plans = nextPlans;
      hasLoaded = true;
      loadError = null;
      lastLoadedAt = Date.now();
      return true;
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Unknown Plans loading error";
      return false;
    } finally {
      loading = false;
      refreshInFlight = false;
    }
  }

  onMount(loadPlans);

  function resetForm() {
    editingId = null;
    name = "";
    description = "";
    rpmLimit = "0";
    tpmLimit = "0";
    concurrencyLimit = "0";
    tokenQuota = "0";
    allowedModels = "";
  }

  function startEdit(plan: PlanRecord) {
    if (writesBlocked()) return;
    editingId = plan.id;
    name = plan.name;
    description = plan.description;
    rpmLimit = String(plan.rpmLimit);
    tpmLimit = String(plan.tpmLimit);
    concurrencyLimit = String(plan.concurrencyLimit);
    tokenQuota = String(plan.tokenQuota);
    allowedModels = plan.allowedModels.join("\n");
  }

  function buildInput(): PlanInput {
    const values = [rpmLimit, tpmLimit, concurrencyLimit, tokenQuota];
    if (values.some((value) => !/^\d+$/.test(value))) {
      throw new Error("Limits must be non-negative whole numbers. Use 0 for unlimited.");
    }
    return {
      name: name.trim(),
      description: description.trim(),
      rpmLimit: Number(rpmLimit),
      tpmLimit: Number(tpmLimit),
      concurrencyLimit: Number(concurrencyLimit),
      tokenQuota: Number(tokenQuota),
      allowedModels: modelList(),
    };
  }

  async function savePlan(event: SubmitEvent) {
    event.preventDefault();
    if (writesBlocked()) return;
    saving = true;
    const wasEditing = Boolean(editingId);
    try {
      const input = buildInput();
      if (editingId) await updatePlan(editingId, input);
      else await createPlan(input);
      const refreshed = await loadPlans();
      resetForm();
      notifications.success(
        refreshed
          ? (wasEditing ? "Plan updated" : "Plan created")
          : "Plan saved, but the list could not be refreshed. Retry to sync the current state.",
      );
    } catch (error: any) {
      notifications.error(error.message || "Plan could not be saved");
    } finally {
      saving = false;
    }
  }

  async function removePlan(plan: PlanRecord) {
    if (writesBlocked()) return;
    if (!confirm("Delete Plan '" + plan.name + "'? Plans assigned to API keys cannot be deleted.")) return;
    saving = true;
    deletingId = plan.id;
    try {
      await deletePlan(plan.id);
      const refreshed = await loadPlans();
      if (editingId === plan.id) resetForm();
      notifications.success(
        refreshed
          ? "Plan deleted"
          : "Plan deleted, but the list could not be refreshed. Retry to sync the current state.",
      );
    } catch (error: any) {
      notifications.error(error.message || "Plan could not be deleted");
    } finally {
      saving = false;
      deletingId = null;
    }
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-2">
      <h2 class="text-lg font-bold text-text-main">Plans</h2>
      {#if hasLoaded}
        <Badge tone="primary" size="sm">{plans.length} configured</Badge>
      {:else if loading}
        <Badge tone="neutral" size="sm">Loading</Badge>
      {:else}
        <Badge tone="warning" size="sm">Unavailable</Badge>
      {/if}
    </div>
    <p class="text-xs text-text-muted">Reusable policies for managed API keys. Unassigned keys remain unrestricted.</p>
  </div>

  {#if loadError}
    <div
      id="plans-load-error"
      role="alert"
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
    >
      <div class="min-w-0">
        <p class="text-xs font-semibold text-amber-400">
          {hasLoaded
            ? "Plan refresh failed. Showing the last successful snapshot; changes are blocked until the list is refreshed."
            : "Saved Plans could not be loaded. The empty state is unavailable until the server returns a valid list."}
        </p>
        <p class="mt-1 break-words text-xs text-text-muted">{loadError}</p>
        {#if lastLoadedAt !== null}
          <p class="mt-1 text-[11px] text-text-muted">Last successful load: {formatLoadedTime(lastLoadedAt)}</p>
        {/if}
      </div>
      <Button id="plans-load-retry" variant="secondary" size="sm" onclick={loadPlans} disabled={loading || saving}>
        {loading ? "Retrying..." : "Retry Load"}
      </Button>
    </div>
  {:else if loading && hasLoaded}
    <p id="plans-refreshing" role="status" class="text-xs text-text-muted">Refreshing saved Plans…</p>
  {/if}

  <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)] gap-5">
    <section class="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
      <div class="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <h3 class="text-sm font-semibold text-text-main">Configured Plans</h3>
        <Button id="plans-refresh" variant="secondary" size="sm" onclick={loadPlans} disabled={loading || saving}>
          Refresh
        </Button>
      </div>
      <div class="divide-y divide-border-subtle">
        {#if loading && !hasLoaded}
          <p class="p-5 text-xs text-text-muted">Loading Plans…</p>
        {:else if !hasLoaded && loadError}
          <p id="plans-unavailable" class="p-5 text-xs text-text-muted">The saved Plan list is unavailable. Retry the load before creating or editing policies.</p>
        {:else if hasLoaded && plans.length === 0}
          <p class="p-5 text-xs text-text-muted">No Plans yet. Create a reusable policy to assign to managed API keys.</p>
        {:else if hasLoaded}
          {#each plans as plan (plan.id)}
            <article class="p-4 space-y-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h4 class="font-semibold text-sm text-text-main">{plan.name}</h4>
                  <p class="text-xs text-text-muted mt-1">{plan.description || "No description"}</p>
                </div>
                <div class="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onclick={() => startEdit(plan)} disabled={writesBlocked()}>Edit</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => removePlan(plan)}
                    disabled={writesBlocked()}
                    loading={deletingId === plan.id}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div class="rounded-lg bg-surface-2 p-2"><p class="text-text-subtle">RPM</p><p class="font-semibold text-text-main">{limitLabel(plan.rpmLimit)}</p></div>
                <div class="rounded-lg bg-surface-2 p-2"><p class="text-text-subtle">Prompt TPM</p><p class="font-semibold text-text-main">{limitLabel(plan.tpmLimit)}</p></div>
                <div class="rounded-lg bg-surface-2 p-2"><p class="text-text-subtle">Concurrency</p><p class="font-semibold text-text-main">{limitLabel(plan.concurrencyLimit)}</p></div>
                <div class="rounded-lg bg-surface-2 p-2"><p class="text-text-subtle">Token quota</p><p class="font-semibold text-text-main">{limitLabel(plan.tokenQuota)}</p></div>
              </div>
              <div class="flex flex-wrap gap-1">
                {#if plan.allowedModels.length === 0}
                  <Badge tone="neutral" size="sm">All models</Badge>
                {:else}
                  {#each plan.allowedModels as model (model)}
                    <Badge tone="neutral" size="sm">{model}</Badge>
                  {/each}
                {/if}
              </div>
            </article>
          {/each}
        {/if}
      </div>
    </section>

    <section class="rounded-xl border border-border-subtle bg-surface-1 p-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-text-main">{editingId ? "Edit Plan" : "Create Plan"}</h3>
        {#if editingId}
          <Button variant="ghost" size="sm" onclick={resetForm} disabled={saving}>Cancel</Button>
        {/if}
      </div>
      {#if !hasLoaded || loadError}
        <p class="mb-3 text-xs text-text-muted">Plan changes are disabled until a valid saved Plan list has loaded.</p>
      {/if}
      <form class="space-y-3" onsubmit={savePlan}>
        <fieldset disabled={writesBlocked()} class="space-y-3 disabled:opacity-60">
          <label class="block space-y-1">
            <span class="text-xs text-text-muted">Name</span>
            <input bind:value={name} maxlength="80" required class="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-main" placeholder="Starter" />
          </label>
          <label class="block space-y-1">
            <span class="text-xs text-text-muted">Description</span>
            <input bind:value={description} maxlength="256" class="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-main" placeholder="Optional policy description" />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="block space-y-1"><span class="text-xs text-text-muted">RPM (0 = unlimited)</span><input bind:value={rpmLimit} inputmode="numeric" class="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-main" /></label>
            <label class="block space-y-1"><span class="text-xs text-text-muted">Prompt TPM (0 = unlimited)</span><input bind:value={tpmLimit} inputmode="numeric" class="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-main" /></label>
            <label class="block space-y-1"><span class="text-xs text-text-muted">Concurrency (0 = unlimited)</span><input bind:value={concurrencyLimit} inputmode="numeric" class="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-main" /></label>
            <label class="block space-y-1"><span class="text-xs text-text-muted">Lifetime tokens (0 = unlimited)</span><input bind:value={tokenQuota} inputmode="numeric" class="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-main" /></label>
          </div>
          <label class="block space-y-1">
            <span class="text-xs text-text-muted">Allowed models (one per line; exact ID or prefix ending in *)</span>
            <textarea bind:value={allowedModels} rows="4" class="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-main font-mono" placeholder={"gpt-4.1-mini\nclaude-3-5-*"}></textarea>
          </label>
          <p class="text-[11px] text-text-subtle">An empty model list allows all models. USD spend budgets are not shown because AlphaWay does not yet have authoritative provider pricing data.</p>
          <div class="flex justify-end gap-2 pt-1">
            {#if editingId}
              <Button variant="secondary" size="sm" onclick={resetForm} disabled={saving}>New Plan</Button>
            {/if}
            <Button id="plans-submit" variant="primary" size="sm" type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Create Plan"}
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  </div>
</div>
