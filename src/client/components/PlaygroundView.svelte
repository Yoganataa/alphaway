<script lang="ts">
  import { onMount } from "svelte";
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import { fetchModels, streamChatCompletion } from "../lib/api";
  import type { ModelItem, ChatMessage } from "../lib/types";

  let models = $state<ModelItem[]>([]);
  let selectedModel = $state<string>("mimo-v2.6-flash-free");
  let systemPrompt = $state<string>("<env>\nWorking directory: /workspace\n</env>\nYou are a helpful and concise coding assistant.");
  let userPrompt = $state<string>("Write a quick explanation of how BoringSSL TLS ClientHello fingerprinting works in Bun.");
  let isStreaming = $state<boolean>(false);
  let assistantResponse = $state<string>("");
  let reasoningContent = $state<string>("");
  let errorMessage = $state<string | null>(null);
  let ttftMs = $state<number | null>(null);
  let totalTimeMs = $state<number | null>(null);
  let copiedResponse = $state<boolean>(false);

  onMount(async () => {
    try {
      models = await fetchModels();
      if (models.length > 0 && !models.some((m) => m.id === selectedModel)) {
        selectedModel = models[0].id;
      }
    } catch (err: any) {
      errorMessage = err.message;
    }
  });

  async function handleSend() {
    if (!userPrompt.trim() || isStreaming) return;

    isStreaming = true;
    assistantResponse = "";
    reasoningContent = "";
    errorMessage = null;
    ttftMs = null;
    totalTimeMs = null;

    const startTime = performance.now();
    let firstTokenTime: number | null = null;

    const messages: ChatMessage[] = [];
    if (systemPrompt.trim()) {
      messages.push({ role: "system", content: systemPrompt.trim() });
    }
    messages.push({ role: "user", content: userPrompt.trim() });

    try {
      const stream = streamChatCompletion({
        model: selectedModel,
        messages,
      });

      for await (const chunk of stream) {
        if (!firstTokenTime && (chunk.content || chunk.reasoning_content)) {
          firstTokenTime = performance.now();
          ttftMs = Math.round(firstTokenTime - startTime);
        }

        if (chunk.reasoning_content) {
          reasoningContent += chunk.reasoning_content;
        }
        if (chunk.content) {
          assistantResponse += chunk.content;
        }
      }
      totalTimeMs = Math.round(performance.now() - startTime);
    } catch (err: any) {
      errorMessage = err.message;
    } finally {
      isStreaming = false;
    }
  }

  function insertHarnessEnv() {
    const harness = "<env>\nWorking directory: /workspace\n</env>\n";
    if (!systemPrompt.includes("<env>")) {
      systemPrompt = harness + systemPrompt;
    }
  }

  function copyResponse() {
    if (typeof navigator !== "undefined" && navigator.clipboard && assistantResponse) {
      navigator.clipboard.writeText(assistantResponse);
      copiedResponse = true;
      setTimeout(() => (copiedResponse = false), 2000);
    }
  }
</script>

<div class="space-y-6">
  <!-- Controls Bar Card -->
  <Card padding="md">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <label for="playground-model" class="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Model:
        </label>
        <select
          id="playground-model"
          bind:value={selectedModel}
          class="bg-surface-2 border border-border-subtle rounded-[10px] px-3.5 py-2 text-xs text-text-main focus:outline-none focus:border-brand-500 font-mono transition-colors shadow-xs"
        >
          {#if models.length === 0}
            <option value={selectedModel}>{selectedModel}</option>
          {:else}
            {#each models as model}
              <option value={model.id}>
                {model.id} ({model.owned_by})
              </option>
            {/each}
          {/if}
        </select>
      </div>

      <!-- Live Performance Metrics -->
      <div class="flex items-center gap-3 text-xs font-mono">
        {#if ttftMs !== null}
          <div class="px-2.5 py-1 rounded-[8px] bg-surface-2 border border-border-subtle text-text-muted flex items-center gap-1.5">
            <span>TTFT:</span>
            <strong class="text-brand-500 dark:text-brand-400">{ttftMs}ms</strong>
          </div>
        {/if}
        {#if totalTimeMs !== null}
          <div class="px-2.5 py-1 rounded-[8px] bg-surface-2 border border-border-subtle text-text-muted flex items-center gap-1.5">
            <span>Total:</span>
            <strong class="text-emerald-500">{totalTimeMs}ms</strong>
          </div>
        {/if}
        {#if isStreaming}
          <Badge tone="warning" size="sm" dot>Streaming...</Badge>
        {:else}
          <Badge tone="neutral" size="sm">Idle</Badge>
        {/if}
      </div>
    </div>
  </Card>

  <!-- Chat Completion Form & Output Columns -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Input Column -->
    <div class="space-y-4">
      <!-- System Prompt Card -->
      <Card padding="md">
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs">
            <label for="playground-system" class="font-semibold text-text-main flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-text-muted">settings</span>
              <span>System Prompt</span>
            </label>
            <button
              type="button"
              class="text-xs text-brand-500 dark:text-brand-400 hover:underline font-mono font-medium flex items-center gap-1 cursor-pointer"
              onclick={insertHarnessEnv}
            >
              <span class="material-symbols-outlined text-[14px]">add_circle</span>
              <span>Add Harness &lt;env&gt;</span>
            </button>
          </div>
          <textarea
            id="playground-system"
            bind:value={systemPrompt}
            rows="4"
            class="w-full bg-surface-2 border border-border-subtle rounded-[10px] p-3 text-xs text-text-main font-mono focus:outline-none focus:border-brand-500 resize-none leading-relaxed transition-colors shadow-xs"
            placeholder="System prompt instructions..."
          ></textarea>
        </div>
      </Card>

      <!-- User Message Card -->
      <Card padding="md">
        <div class="space-y-3">
          <label for="playground-user" class="font-semibold text-text-main text-xs flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px] text-text-muted">chat</span>
            <span>User Message</span>
          </label>
          <textarea
            id="playground-user"
            bind:value={userPrompt}
            rows="6"
            class="w-full bg-surface-2 border border-border-subtle rounded-[10px] p-3 text-xs text-text-main font-mono focus:outline-none focus:border-brand-500 resize-none leading-relaxed transition-colors shadow-xs"
            placeholder="Enter message to test completions..."
          ></textarea>

          <Button
            variant="primary"
            size="md"
            className="w-full justify-center"
            id="playground-send-btn"
            disabled={isStreaming || !userPrompt.trim()}
            onclick={handleSend}
          >
            {#if isStreaming}
              <span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              <span>Generating Response...</span>
            {:else}
              <span class="material-symbols-outlined text-[18px]">send</span>
              <span>Send Completion Request</span>
            {/if}
          </Button>
        </div>
      </Card>

      {#if errorMessage}
        <div class="p-4 rounded-[12px] bg-red-500/10 border border-red-500/30 text-xs text-red-400 font-mono flex items-start gap-2">
          <span class="material-symbols-outlined text-[18px] shrink-0 text-red-400">error</span>
          <span class="leading-relaxed">{errorMessage}</span>
        </div>
      {/if}
    </div>

    <!-- Output Column -->
    <div class="space-y-4">
      <Card padding="md" className="flex flex-col h-full">
        <div class="flex items-center justify-between pb-3 border-b border-border-subtle mb-4">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] text-text-muted">terminal</span>
            <span class="text-xs font-semibold text-text-main">Assistant Output (SSE Stream)</span>
          </div>
          {#if assistantResponse}
            <Button variant="ghost" size="sm" onclick={copyResponse}>
              {#if copiedResponse}
                <span class="material-symbols-outlined text-[14px] text-emerald-400">check</span>
                <span class="text-emerald-400">Copied</span>
              {:else}
                <span class="material-symbols-outlined text-[14px]">content_copy</span>
                <span>Copy</span>
              {/if}
            </Button>
          {/if}
        </div>

        <!-- Reasoning Process Accordion -->
        {#if reasoningContent}
          <details class="mb-4 p-3.5 rounded-[10px] bg-purple-500/10 border border-purple-500/30 text-xs font-mono text-purple-300 open:pb-4 transition-all" open>
            <summary class="font-semibold text-purple-400 cursor-pointer select-none flex items-center justify-between">
              <span class="flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[16px]">psychology</span>
                <span>Thinking / Reasoning Process</span>
              </span>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-950/60 border border-purple-800 text-purple-300 font-normal">
                {reasoningContent.length} chars
              </span>
            </summary>
            <div class="mt-3 pt-3 border-t border-purple-500/20 text-text-muted whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
              {reasoningContent}
            </div>
          </details>
        {/if}

        <!-- Main Assistant Response Area -->
        <div
          id="playground-response-area"
          class="flex-1 min-h-[300px] p-4 rounded-[10px] bg-surface-2 border border-border-subtle text-xs text-text-main font-mono overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner"
        >
          {#if assistantResponse}
            {assistantResponse}
          {:else if isStreaming}
            <span class="text-text-muted animate-pulse flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-brand-500 animate-ping"></span>
              Waiting for tokens from upstream SSE stream...
            </span>
          {:else}
            <span class="text-text-subtle">Send a request to see live streaming completion output here.</span>
          {/if}
        </div>
      </Card>
    </div>
  </div>
</div>
