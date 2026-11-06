<script lang="ts">
  import { onMount } from "svelte";
  import SoulStudioView from "./SoulStudioView.svelte";
  import ConfirmModal from "../lib/ui/ConfirmModal.svelte";
  import {
    fetchPersonaState,
    PersonaApiError,
    savePersonaPreset,
    deletePersonaPreset,
    setPersonaModelBinding,
    deletePersonaModelBinding,
    savePersonaGlobalExcludes,
    previewPersona,
    type PersonaKeyword,
    type PersonaPreset,
    type PersonaModelBinding,
    type PersonaResolution,
  } from "../lib/api";
  import Button from "../lib/ui/Button.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Card from "../lib/ui/Card.svelte";
  import { notifications } from "../lib/notifications";

  let section = $state<"presets" | "soul">("presets");
  let loading = $state(true);
  let loaded = $state(false);
  let loadError = $state<string | null>(null);
  let lastLoadedAt = $state<number | null>(null);
  let loadInFlight = false;
  let saving = $state(false);
  let mutating = $state(false);
  let deleteTarget = $state<string | null>(null);
  let presets = $state<PersonaPreset[]>([]);
  let bindings = $state<PersonaModelBinding[]>([]);
  let globalExcludes = $state<PersonaKeyword[]>([]);

  let selectedId = $state("");
  let draftId = $state("");
  let draftName = $state("");
  let draftPrompt = $state("");
  let draftKind = $state("");
  let draftSource = $state("");
  let draftKeywords = $state("");
  let draftExcludes = $state("");

  let modelId = $state("");
  let selectedPresetId = $state("");
  let bindingEnabled = $state(true);
  let excludeDraft = $state("");
  let previewModelId = $state("");
  let previewPrompt = $state("Explain the trade-offs in this implementation.");
  let previewResult = $state<{ resolution: PersonaResolution; messages: any[] } | null>(null);
  let statusError = $state("");

  const writesBlocked = () =>
    !loaded || loading || loadError !== null || saving || mutating;

  function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function formatLoadedTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  onMount(() => { void load(); });

  async function load(): Promise<boolean> {
    if (loadInFlight) return false;
    loadInFlight = true;
    loading = true;
    loadError = null;
    statusError = "";
    try {
      const state = await fetchPersonaState();
      presets = state.presets;
      bindings = state.bindings;
      globalExcludes = state.excludes;
      excludeDraft = globalExcludes
        .map((rule) => rule.mode === "partial" ? `partial:${rule.text}` : rule.text)
        .join(String.fromCharCode(10));
      loaded = true;
      lastLoadedAt = Date.now();
      if (selectedId) {
        if (presets.some((preset) => preset.id === selectedId)) {
          selectPreset(selectedId);
        } else {
          startNewPreset();
        }
      } else if (presets.length > 0) {
        selectPreset(presets[0].id);
      }
      return true;
    } catch (error) {
      loadError = getErrorMessage(error, "Failed to load Persona");
      return false;
    } finally {
      loading = false;
      loadInFlight = false;
    }
  }

  function selectPreset(id: string) {
    selectedId = id;
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    draftId = preset.id;
    draftName = preset.name;
    draftPrompt = preset.prompt;
    draftKind = preset.kind;
    draftSource = preset.source;
    draftKeywords = preset.keywords.map((rule) => rule.mode === "partial" ? `partial:${rule.text}` : rule.text).join("\n");
    draftExcludes = preset.excludes.map((rule) => rule.mode === "partial" ? `partial:${rule.text}` : rule.text).join("\n");
  }

  function startNewPreset() {
    selectedId = "";
    draftId = "";
    draftName = "";
    draftPrompt = "";
    draftKind = "PERSONA";
    draftSource = "";
    draftKeywords = "";
    draftExcludes = "";
  }

  function parseKeywords(value: string): PersonaKeyword[] {
    return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      if (line.toLowerCase().startsWith("partial:")) return { text: line.slice(8).trim(), mode: "partial" as const };
      return { text: line, mode: "word" as const };
    });
  }

  async function savePreset() {
    if (writesBlocked()) return;
    saving = true;
    statusError = "";
    try {
      const saved = await savePersonaPreset({
        id: draftId.trim().toLowerCase(),
        name: draftName.trim(),
        prompt: draftPrompt,
        kind: draftKind.trim(),
        source: draftSource.trim(),
        keywords: parseKeywords(draftKeywords),
        excludes: parseKeywords(draftExcludes),
        order: presets.find((item) => item.id === draftId)?.order || 0,
      });
      if (await load()) {
        selectPreset(saved.id);
        notifications.success("Persona preset saved");
      } else {
        notifications.warning("Persona preset was saved, but the library could not be refreshed. Retry before making further changes.");
      }
    } catch (error) {
      const message = getErrorMessage(error, "Failed to save Persona preset");
      await load();
      statusError = message;
    } finally {
      saving = false;
    }
  }

  async function removePreset(id: string) {
    if (writesBlocked()) return;
    if (!confirm(`Delete Persona preset "${id}"? Model bindings to this preset will be removed.`)) return;
    mutating = true;
    statusError = "";
    try {
      await deletePersonaPreset(id);
      if (selectedId === id) startNewPreset();
      if (await load()) notifications.info("Persona preset removed");
      else notifications.warning("Persona preset was deleted, but the library could not be refreshed. Retry before making further changes.");
    } catch (error) {
      const message = getErrorMessage(error, "Failed to delete preset");
      await load();
      statusError = message;
    } finally {
      mutating = false;
    }
  }

  async function saveBinding() {
    if (writesBlocked()) return;
    mutating = true;
    statusError = "";
    try {
      await setPersonaModelBinding({
        modelId: modelId.trim(),
        enabled: bindingEnabled,
        presetId: bindingEnabled ? selectedPresetId : null,
      });
      modelId = "";
      if (await load()) notifications.success("Model Persona binding saved");
      else notifications.warning("Model binding was saved, but the library could not be refreshed. Retry before making further changes.");
    } catch (error) {
      const message = getErrorMessage(error, "Failed to save model binding");
      await load();
      statusError = message;
    } finally {
      mutating = false;
    }
  }

  async function removeBinding(id: string) {
    if (writesBlocked()) return;
    mutating = true;
    statusError = "";
    try {
      await deletePersonaModelBinding(id);
      if (await load()) notifications.info("Model Persona binding removed");
      else notifications.warning("Model binding was removed, but the library could not be refreshed. Retry before making further changes.");
    } catch (error) {
      const message = getErrorMessage(error, "Failed to remove model binding");
      await load();
      statusError = message;
    } finally {
      mutating = false;
    }
  }

  async function saveGlobalExcludes() {
    if (writesBlocked()) return;
    mutating = true;
    statusError = "";
    try {
      globalExcludes = await savePersonaGlobalExcludes(parseKeywords(excludeDraft));
      excludeDraft = globalExcludes
        .map((rule) => rule.mode === "partial" ? `partial:${rule.text}` : rule.text)
        .join("\n");
      notifications.success("Global Persona exclusions saved");
    } catch (error) {
      const message = getErrorMessage(error, "Failed to save global exclusions");
      // Definitive 4xx responses reject the list without committing it; keep the
      // user's draft so they can correct it. Network/5xx/invalid-success outcomes
      // are uncertain for a full-replacement PUT, so reload canonical state.
      if (!(error instanceof PersonaApiError && error.status >= 400 && error.status < 500)) {
        await load();
      }
      statusError = message;
    } finally {
      mutating = false;
    }
  }

  async function runPreview() {
    if (!loaded || loading || loadError !== null) return;
    try {
      const result = await previewPersona([previewModelId.trim()], [{ role: "user", content: previewPrompt }]);
      previewResult = result;
    } catch (error) {
      statusError = getErrorMessage(error, "Persona preview failed");
    }
  }
</script>

<div class="space-y-6">
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h2 class="text-xl font-bold text-text-main">Persona</h2>
      <p class="text-sm text-text-muted mt-1">Attach an instruction preset to selected models. Injection is off unless a binding or keyword rule matches.</p>
    </div>
    <div class="flex rounded-lg border border-border bg-surface p-1">
      <button type="button" class="px-3 py-1.5 rounded-md text-sm {section === 'presets' ? 'bg-brand-500/15 text-brand-500' : 'text-text-muted'}" onclick={() => (section = "presets")}>Model Personas</button>
      <button type="button" class="px-3 py-1.5 rounded-md text-sm {section === 'soul' ? 'bg-brand-500/15 text-brand-500' : 'text-text-muted'}" onclick={() => (section = "soul")}>SOUL.md</button>
    </div>
  </div>

  {#if section === "soul"}
    <SoulStudioView />
  {:else}
    {#if statusError}
      <div id="persona-action-error" role="alert" class="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{statusError}</div>
    {/if}

    {#if loadError}
      <div id="persona-load-error" role="alert" class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div class="min-w-0">
          <p class="text-xs font-semibold text-amber-400">
            {loaded
              ? "Persona refresh failed. The last successful snapshot is shown; all changes are blocked until the library is refreshed."
              : "Saved Persona configuration could not be loaded. Changes are blocked until the complete state is available."}
          </p>
          <p class="mt-1 break-words text-xs text-text-muted">{loadError}</p>
          {#if lastLoadedAt !== null}
            <p class="mt-1 text-[11px] text-text-muted">Last successful load: {formatLoadedTime(lastLoadedAt)}</p>
          {/if}
        </div>
        <Button id="persona-load-retry" variant="secondary" size="sm" onclick={load} disabled={loading || saving || mutating}>
          {loading ? "Retrying…" : "Retry Load"}
        </Button>
      </div>
    {:else if loading && loaded}
      <p id="persona-refreshing" role="status" class="text-xs text-text-muted">Refreshing saved Persona configuration…</p>
    {/if}

    {#if loading && !loaded}
      <p id="persona-loading" role="status" class="text-sm text-text-muted">Loading Persona library…</p>
    {:else if !loaded && loadError}
      <p id="persona-unavailable" class="text-sm text-text-muted">The saved Persona library is unavailable. Presets, bindings, and exclusions cannot be changed until retry succeeds.</p>
    {:else if loaded}
      <div class="mb-3 flex justify-end">
        <Button id="persona-refresh" variant="secondary" size="sm" onclick={load} disabled={loading || saving || mutating}>Refresh</Button>
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-5">
        <div class="space-y-5">
          <Card padding="md" elev class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="font-semibold text-text-main">Preset Library</h3>
                <p class="text-xs text-text-muted">Prompts are inert until an exact model binding or keyword matches.</p>
              </div>
              <Button id="persona-new-preset" size="sm" variant="primary" onclick={startNewPreset} disabled={writesBlocked()}>New preset</Button>
            </div>
            {#if presets.length > 0}
              <div class="flex flex-wrap gap-2">
                {#each presets as preset (preset.id)}
                  <button type="button" class="rounded-lg border px-3 py-2 text-left {selectedId === preset.id ? 'border-brand-500 bg-brand-500/10' : 'border-border bg-surface-2'}" onclick={() => selectPreset(preset.id)}>
                    <span class="block text-sm font-medium text-text-main">{preset.name}</span>
                    <span class="block text-[11px] text-text-muted">{preset.id} · {preset.usageCount} injections</span>
                  </button>
                {/each}
              </div>
            {:else}
              <p class="text-sm text-text-muted">No presets yet. Create one to start.</p>
            {/if}
          </Card>

          <Card padding="md" elev class="space-y-4">
            <div class="flex items-center justify-between gap-2">
              <h3 class="font-semibold text-text-main">{selectedId ? 'Edit preset' : 'Create preset'}</h3>
              {#if selectedId}<Badge tone="success">Saved preset</Badge>{/if}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="space-y-1 text-xs text-text-muted">Preset ID
                <input bind:value={draftId} maxlength="64" placeholder="e.g. reviewer" class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text-main font-mono" />
              </label>
              <label class="space-y-1 text-xs text-text-muted">Name
                <input bind:value={draftName} maxlength="100" placeholder="Code Reviewer" class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text-main" />
              </label>
              <label class="space-y-1 text-xs text-text-muted">Instruction kind
                <input bind:value={draftKind} maxlength="32" placeholder="PERSONA, SOUL, AGENTS…" class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text-main" />
              </label>
              <label class="space-y-1 text-xs text-text-muted">Source (optional)
                <input bind:value={draftSource} maxlength="500" placeholder="Manual entry / file source" class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text-main" />
              </label>
            </div>
            <label class="space-y-1 text-xs text-text-muted block">Prompt
              <textarea bind:value={draftPrompt} rows="9" maxlength="100000" placeholder="Write the model-specific instructions…" class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text-main font-mono"></textarea>
            </label>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label class="space-y-1 text-xs text-text-muted block">Include keywords
                <textarea bind:value={draftKeywords} rows="4" placeholder="deepseek&#10;partial:coder" class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text-main font-mono"></textarea>
              </label>
              <label class="space-y-1 text-xs text-text-muted block">Preset exclusions
                <textarea bind:value={draftExcludes} rows="4" placeholder="deepseek-internal" class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text-main font-mono"></textarea>
              </label>
            </div>
            <p class="text-[11px] text-text-muted">One literal keyword per line. Prefix with <code>partial:</code> for substring matching. Default word matching requires a model-ID boundary. Regex is intentionally unsupported.</p>
            <div class="flex justify-end gap-2">
              {#if selectedId}<Button id="persona-delete-preset" size="sm" color="danger" variant="ghost" onclick={() => openDeleteConfirmation(selectedId)} disabled={writesBlocked()}>Delete</Button>{/if}
              <Button id="persona-save-preset" size="sm" variant="primary" loading={saving} onclick={savePreset} disabled={!draftId.trim() || !draftName.trim() || writesBlocked()}>Save preset</Button>
            </div>
          </Card>

          <Card padding="md" elev class="space-y-4">
            <div>
              <h3 class="font-semibold text-text-main">Global exclusions</h3>
              <p class="text-xs text-text-muted mt-1">A match here always prevents Persona injection, including exact bindings.</p>
            </div>
            <textarea id="persona-global-excludes" bind:value={excludeDraft} rows="3" placeholder="model-family-to-never-inject" disabled={writesBlocked()} class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text-main font-mono disabled:opacity-60"></textarea>
            <div class="flex justify-end"><Button id="persona-save-global-excludes" size="sm" variant="secondary" onclick={saveGlobalExcludes} disabled={writesBlocked()}>Save global exclusions</Button></div>
          </Card>
        </div>

        <div class="space-y-5">
          <Card padding="md" elev class="space-y-4">
            <div>
              <h3 class="font-semibold text-text-main">Exact model bindings</h3>
              <p class="text-xs text-text-muted mt-1">An exact binding outranks keyword rules. Enable it explicitly for each model.</p>
            </div>
            <label class="space-y-1 text-xs text-text-muted block">Model ID
              <input bind:value={modelId} placeholder="provider/model-id" class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text-main font-mono" />
            </label>
            <label class="space-y-1 text-xs text-text-muted block">Preset
              <select bind:value={selectedPresetId} class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text-main">
                <option value="">Choose preset</option>
                {#each presets as preset (preset.id)}<option value={preset.id}>{preset.name} ({preset.id})</option>{/each}
              </select>
            </label>
            <label class="flex items-center gap-2 text-sm text-text-main">
              <input type="checkbox" bind:checked={bindingEnabled} />
              Enable this binding
            </label>
            <div class="flex justify-end"><Button id="persona-save-binding" size="sm" variant="primary" onclick={saveBinding} disabled={!modelId.trim() || (bindingEnabled && !selectedPresetId) || writesBlocked()}>Save binding</Button></div>
            <div class="space-y-2">
              {#each bindings as binding (binding.modelId)}
                <div class="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
                  <div class="min-w-0">
                    <p class="text-xs font-mono text-text-main break-all">{binding.modelId}</p>
                    <p class="text-[11px] text-text-muted">{binding.enabled ? binding.presetId : 'Disabled'} · exact match</p>
                  </div>
                  <Button id={`persona-remove-binding-${binding.modelId}`} size="xs" variant="ghost" color="danger" onclick={() => removeBinding(binding.modelId)} disabled={writesBlocked()}>Remove</Button>
                </div>
              {/each}
              {#if bindings.length === 0}<p class="text-xs text-text-muted">No exact bindings configured.</p>{/if}
            </div>
          </Card>

          <Card padding="md" elev class="space-y-4">
            <div>
              <h3 class="font-semibold text-text-main">Resolution preview</h3>
              <p class="text-xs text-text-muted mt-1">Uses the same precedence resolver as live requests. No upstream request is sent.</p>
            </div>
            <label class="space-y-1 text-xs text-text-muted block">Model ID
              <input bind:value={previewModelId} placeholder="provider/deepseek-v4" class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text-main font-mono" />
            </label>
            <label class="space-y-1 text-xs text-text-muted block">Sample prompt
              <textarea bind:value={previewPrompt} rows="3" class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-text-main"></textarea>
            </label>
            <div class="flex justify-end"><Button size="sm" variant="secondary" onclick={runPreview} disabled={!previewModelId.trim() || !loaded || loading || loadError !== null}>Resolve and preview</Button></div>
            {#if previewResult}
              <div class="rounded-lg border border-border bg-surface-2 p-3 space-y-2">
                <Badge tone={previewResult.resolution.injected ? "success" : "neutral"}>{previewResult.resolution.reason}</Badge>
                <p class="text-xs text-text-muted">{previewResult.resolution.detail}</p>
                {#if previewResult.resolution.presetName}<p class="text-sm font-medium text-text-main">Preset: {previewResult.resolution.presetName}</p>{/if}
                <pre class="text-xs text-text-main whitespace-pre-wrap break-words">{JSON.stringify(previewResult.messages, null, 2)}</pre>
              </div>
            {/if}
          </Card>
        </div>
      </div>
    {/if}
  {/if}
</div>


<ConfirmModal
  isOpen={deleteTarget !== null}
  title="Delete Persona preset?"
  message={deleteTarget ? "Delete Persona preset \"" + deleteTarget + "\"? Model bindings to this preset will be removed." : ""}
  confirmLabel={mutating ? "Deleting…" : "Delete Preset"}
  danger={true}
  onConfirm={() => { if (deleteTarget) void removePreset(deleteTarget); }}
  onClose={() => { if (!mutating) deleteTarget = null; }}
/>
