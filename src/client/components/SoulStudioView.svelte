<script lang="ts">
  import { onMount } from "svelte";
  import { fetchSoulConfig, updateSoulConfig, previewSoulPrompt } from "../lib/api";
  import type { SoulInfoResponse } from "../lib/types";
  import Card from "../lib/ui/Card.svelte";
  import Button from "../lib/ui/Button.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Toggle from "../lib/ui/Toggle.svelte";

  let loading = $state(true);
  let loaded = $state(false);
  let loadError = $state<string | null>(null);
  let lastLoadedAt = $state<number | null>(null);
  let loadInFlight = false;
  let saving = $state(false);
  let testing = $state(false);
  let statusMessage = $state<{ type: "success" | "error"; text: string } | null>(null);

  let soul = $state<SoulInfoResponse>({
    ok: true,
    enabled: true,
    mode: "auto",
    preset: "atlas",
    source: "preset",
    filePath: null,
    content: "",
    tokenEstimate: 0,
    presets: {
      atlas: "",
      minimalist: "",
      socratic: "",
    },
  });

  let editContent = $state("");
  let selectedMode = $state<"auto" | "preset" | "custom">("auto");
  let selectedPreset = $state("atlas");
  let customFilePath = $state("");

  let testPrompt = $state("Can you please help me write a quick function to validate an email address?");
  let testResult = $state<{
    prompt: string;
    formattedSoul: string;
    enrichedMessages: any[];
    tokenEstimate: number;
  } | null>(null);

  const wordCount = $derived(editContent.trim() ? editContent.trim().split(/\s+/).length : 0);
  const lineCount = $derived(editContent.split("\n").length);
  const tokenEst = $derived(Math.ceil(editContent.length / 4));
  const writesBlocked = () => !loaded || loading || loadError !== null || saving;

  function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function formatLoadedTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  onMount(() => {
    void loadData();
  });

  async function loadData(): Promise<boolean> {
    if (loadInFlight) return false;
    loadInFlight = true;
    loading = true;
    loadError = null;
    statusMessage = null;
    try {
      const res = await fetchSoulConfig();
      soul = res;
      editContent = res.content;
      selectedMode = res.mode;
      selectedPreset = res.preset || "atlas";
      customFilePath = res.filePath || "";
      loaded = true;
      lastLoadedAt = Date.now();
      return true;
    } catch (error) {
      loadError = getErrorMessage(error, "Unknown SOUL configuration loading error");
      return false;
    } finally {
      loading = false;
      loadInFlight = false;
    }
  }

  async function handleToggle(enabled: boolean) {
    if (writesBlocked()) return;
    saving = true;
    try {
      const res = await updateSoulConfig({ enabled });
      soul = { ...res, presets: res.presets ?? soul.presets };
      notifications.success(enabled ? "SOUL.md personality injection enabled" : "SOUL.md personality injection disabled");
      statusMessage = null;
    } catch (error) {
      const message = getErrorMessage(error, "SOUL configuration update failed");
      await loadData();
      statusMessage = { type: "error", text: message };
    } finally {
      saving = false;
    }
  }

  function applyPreset(presetKey: "atlas" | "minimalist" | "socratic") {
    if (writesBlocked()) return;
    selectedMode = "preset";
    selectedPreset = presetKey;
    if (soul.presets && soul.presets[presetKey]) {
      editContent = soul.presets[presetKey];
    }
    showStatus("success", `Loaded preset: ${presetKey.toUpperCase()}`);
  }

  async function handleSave(saveToDisk: boolean = false) {
    if (writesBlocked()) return;
    saving = true;
    try {
      const targetPath = saveToDisk ? (customFilePath || "./SOUL.md") : undefined;
      const res = await updateSoulConfig({
        enabled: soul.enabled,
        mode: selectedMode,
        preset: selectedPreset,
        filePath: customFilePath,
        customContent: editContent,
        saveToFile: saveToDisk,
        targetPath,
        content: editContent,
      });

      // POST /api/soul intentionally returns the resolved config without the
      // preset catalog. Preserve the last validated GET catalog for the editor.
      soul = { ...res, presets: res.presets ?? soul.presets };
      editContent = res.content;
      selectedMode = res.mode;
      selectedPreset = res.preset || "atlas";
      customFilePath = res.filePath || customFilePath;
      lastLoadedAt = Date.now();
      showStatus(
        "success",
        saveToDisk
          ? `Saved to disk (${res.filePath || targetPath}) and applied live!`
          : "SOUL configuration applied live!",
      );
    } catch (error) {
      const message = getErrorMessage(error, "SOUL configuration could not be saved");
      await loadData();
      showStatus("error", message);
    } finally {
      saving = false;
    }
  }

  async function runSandboxTest() {
    if (!loaded || loading || loadError !== null || testing) return;
    try {
      testing = true;
      const res = await previewSoulPrompt(testPrompt, editContent);
      testResult = res;
    } catch (error) {
      showStatus("error", `Sandbox preview failed: ${getErrorMessage(error, "Unknown preview error")}`);
    } finally {
      testing = false;
    }
  }

  function showStatus(type: "success" | "error", text: string) {
    statusMessage = { type, text };
    setTimeout(() => {
      if (statusMessage?.text === text) statusMessage = null;
    }, 4000);
  }
</script>

<div class="space-y-6">
  <!-- Header Bar -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
    <div>
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span class="text-2xl">✨</span> Soul Studio
        </h2>
        <Badge variant={!loaded ? "neutral" : soul.enabled ? "success" : "neutral"}>
          {!loaded ? "SOUL Status Unknown" : soul.enabled ? "Active Personality Injection" : "Injection Disabled"}
        </Badge>
        {#if soul.source === "workspace"}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span>📁</span> ./SOUL.md (Workspace)
          </span>
        {:else if soul.source === "global"}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <span>🌍</span> $DATA_DIR/SOUL.md (Global)
          </span>
        {:else if soul.source === "preset"}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span>⚡</span> Preset: {soul.preset.toUpperCase()}
          </span>
        {/if}
      </div>
      <p class="text-sm text-muted-foreground mt-1">
        Define your AI agent's persistent character sheet, communicative voice, and behavioral boundaries using the open <strong class="text-foreground">SoulSpec</strong> standard.
      </p>
    </div>

    <!-- Master Switch -->
    <div class="flex items-center gap-3 bg-card border border-border px-4 py-2 rounded-xl shadow-xs">
      <span class="text-sm font-medium text-foreground">SOUL.md Injection</span>
      <Toggle
        checked={soul.enabled}
        onchange={handleToggle}
        disabled={writesBlocked()}
      />
    </div>
  </div>

  {#if loadError}
    <div id="soul-load-error" role="alert" class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div class="min-w-0">
        <p class="text-xs font-semibold text-amber-400">
          {loaded
            ? "SOUL configuration refresh failed. The last successful configuration is shown; editing and saving are blocked."
            : "SOUL configuration could not be loaded. The editor and Save to Disk action are blocked to protect the existing SOUL.md."}
        </p>
        <p class="mt-1 break-words text-xs text-text-muted">{loadError}</p>
        {#if lastLoadedAt !== null}
          <p class="mt-1 text-[11px] text-text-muted">Last successful load: {formatLoadedTime(lastLoadedAt)}</p>
        {/if}
      </div>
      <Button id="soul-load-retry" variant="secondary" onclick={loadData} disabled={loading || saving}>
        {loading ? "Retrying…" : "Retry Load"}
      </Button>
    </div>
  {:else if loading && loaded}
    <p id="soul-refreshing" role="status" class="text-xs text-muted-foreground">Refreshing saved SOUL configuration…</p>
  {/if}
  {#if statusMessage}
    <div
      id="soul-action-status"
      role={statusMessage.type === "error" ? "alert" : "status"}
      class="p-4 rounded-xl border text-sm font-medium transition-all {statusMessage.type === 'success'
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}"
    >
      {statusMessage.text}
    </div>
  {/if}

  {#if loading && !loaded}
    <p id="soul-loading" role="status" class="text-sm text-muted-foreground">Loading persisted SOUL.md configuration…</p>
  {:else if !loaded && loadError}
    <p id="soul-unavailable" class="text-sm text-muted-foreground">The saved SOUL.md state is unavailable. Retry the load before editing or saving to disk.</p>
  {:else if loaded}
    <div class="mb-3 flex justify-end">
      <Button id="soul-refresh" variant="secondary" onclick={loadData} disabled={loading || saving}>
        {loading ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
    <!-- Main Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <!-- Left Column: Editor & Presets (7 cols) -->
    <div class="lg:col-span-7 space-y-6">
      <Card class="p-5 space-y-5">
        <!-- Preset Quick Switcher -->
        <div>
          <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-between">
            <span>Select Persona Preset</span>
            <span class="text-xs font-mono lowercase font-normal">{tokenEst} est. tokens</span>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              onclick={() => applyPreset("atlas")} disabled={writesBlocked()}
              class="px-3 py-2.5 rounded-lg border text-left transition-all text-xs {selectedPreset === 'atlas'
                ? 'bg-primary/10 border-primary text-primary font-semibold'
                : 'bg-muted/40 border-border text-foreground hover:bg-muted/80'}"
            >
              <div class="font-medium text-sm flex items-center gap-1.5">
                <span>⚡</span> Atlas
              </div>
              <div class="text-muted-foreground text-[11px] mt-0.5 line-clamp-1">Pragmatic Engineer (Default)</div>
            </button>

            <button
              type="button"
              onclick={() => applyPreset("minimalist")} disabled={writesBlocked()}
              class="px-3 py-2.5 rounded-lg border text-left transition-all text-xs {selectedPreset === 'minimalist'
                ? 'bg-primary/10 border-primary text-primary font-semibold'
                : 'bg-muted/40 border-border text-foreground hover:bg-muted/80'}"
            >
              <div class="font-medium text-sm flex items-center gap-1.5">
                <span>🎯</span> Minimalist
              </div>
              <div class="text-muted-foreground text-[11px] mt-0.5 line-clamp-1">Zero-fluff code-first</div>
            </button>

            <button
              type="button"
              onclick={() => applyPreset("socratic")} disabled={writesBlocked()}
              class="px-3 py-2.5 rounded-lg border text-left transition-all text-xs {selectedPreset === 'socratic'
                ? 'bg-primary/10 border-primary text-primary font-semibold'
                : 'bg-muted/40 border-border text-foreground hover:bg-muted/80'}"
            >
              <div class="font-medium text-sm flex items-center gap-1.5">
                <span>🏛️</span> Socratic
              </div>
              <div class="text-muted-foreground text-[11px] mt-0.5 line-clamp-1">Architectural Mentor</div>
            </button>
          </div>
        </div>

        <!-- Markdown Editor -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label for="soul-editor" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              SOUL.md Specification (Markdown)
            </label>
            <div class="text-xs font-mono text-muted-foreground space-x-2">
              <span>{wordCount} words</span>
              <span>·</span>
              <span>{lineCount} lines</span>
              <span>·</span>
              <span class="text-foreground font-semibold">{tokenEst} tokens</span>
            </div>
          </div>

          <div class="relative rounded-xl border border-border bg-muted/20 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
            <textarea
              id="soul-editor"
              bind:value={editContent}
              disabled={writesBlocked()}
              rows="14"
              placeholder="# Core Truths&#10;- Be genuinely helpful, not performatively helpful...&#10;&#10;# Tone & Style&#10;- Ultra-concise, active voice..."
              class="w-full bg-transparent p-4 font-mono text-xs sm:text-sm text-foreground focus:outline-hidden resize-y leading-relaxed"
            ></textarea>
          </div>
        </div>

        <!-- Action Controls -->
        <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
          <div class="flex items-center gap-2">
            <Button
              variant="primary"
              onclick={() => handleSave(false)}
              disabled={writesBlocked()}
            >
              <span>💾</span> {saving ? "Saving..." : "Apply Live (In-Memory)"}
            </Button>
            <Button
              variant="outline"
              onclick={() => handleSave(true)}
              disabled={writesBlocked()}
              title="Writes content to ./SOUL.md file on disk"
            >
              <span>📁</span> Save to ./SOUL.md
            </Button>
          </div>

          <Button
            variant="ghost"
            onclick={() => loadData()}
            disabled={loading || saving}
          >
            <span>🔄</span> Reload from Disk
          </Button>
        </div>
      </Card>

      <!-- Discovery Hierarchy Card -->
      <Card class="p-5 space-y-3 bg-muted/10">
        <h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <span>ℹ️</span> Discovery Hierarchy & Precedence
        </h4>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div class="p-3 rounded-lg bg-card border border-border">
            <div class="font-bold text-foreground mb-1">1. Workspace Local</div>
            <code class="text-[11px] text-muted-foreground">./SOUL.md</code>
            <p class="text-[11px] text-muted-foreground mt-1">Highest priority. Tailors personality directly to the active project.</p>
          </div>
          <div class="p-3 rounded-lg bg-card border border-border">
            <div class="font-bold text-foreground mb-1">2. Global Default</div>
            <code class="text-[11px] text-muted-foreground">$DATA_DIR/SOUL.md</code>
            <p class="text-[11px] text-muted-foreground mt-1">Applies globally across all coding directories without local souls.</p>
          </div>
          <div class="p-3 rounded-lg bg-card border border-border">
            <div class="font-bold text-foreground mb-1">3. Built-in Atlas</div>
            <code class="text-[11px] text-muted-foreground">Atlas Preset</code>
            <p class="text-[11px] text-muted-foreground mt-1">Automatic fallback persona with zero-filler pragmatic principles.</p>
          </div>
        </div>
      </Card>
    </div>

    <!-- Right Column: Interactive Sandbox & Prompt Framing (5 cols) -->
    <div class="lg:col-span-5 space-y-6">
      <Card class="p-5 space-y-4">
        <div>
          <h3 class="text-base font-semibold text-foreground flex items-center gap-2">
            <span>🧪</span> Persona Sandbox Preview
          </h3>
          <p class="text-xs text-muted-foreground mt-1">
            Test how the current SOUL specification will be wrapped and injected into upstream model system prompts.
          </p>
        </div>

        <div>
          <label for="test-prompt-input" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
            Test User Input
          </label>
          <textarea
            id="test-prompt-input"
            bind:value={testPrompt}
            disabled={!loaded || loading || loadError !== null || testing}
            rows="3"
            class="w-full rounded-lg border border-border bg-card p-3 text-xs text-foreground focus:outline-hidden focus:border-primary"
            placeholder="Type sample prompt..."
          ></textarea>
        </div>

        <Button
          variant="primary"
          class="w-full"
          onclick={runSandboxTest}
          disabled={testing || !loaded || loading || loadError !== null}
        >
          {testing ? "Analyzing Framing..." : "Preview System Prompt Framing"}
        </Button>

        {#if testResult}
          <div class="space-y-3 pt-3 border-t border-border">
            <div class="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>Formatted SoulSpec Demarcation</span>
              <span class="font-mono text-emerald-400">+{testResult.tokenEstimate} total tokens</span>
            </div>

            <div class="rounded-lg border border-border bg-card p-3 overflow-x-auto max-h-[360px] text-xs font-mono">
              <pre class="text-muted-foreground text-[11px] whitespace-pre-wrap">{testResult.formattedSoul}</pre>
            </div>

            <div class="p-3 rounded-lg bg-muted/20 border border-border text-xs space-y-1">
              <div class="font-semibold text-foreground flex items-center gap-1.5">
                <span>🛡️</span> Security & Persona Guard Active
              </div>
              <p class="text-muted-foreground text-[11px]">
                DLP secret masking and Auto-Clarity run automatically alongside SoulSpec prompt injection across all tri-protocol endpoints.
              </p>
            </div>
          </div>
        {/if}
      </Card>
    </div>
    </div>
  {/if}
</div>
