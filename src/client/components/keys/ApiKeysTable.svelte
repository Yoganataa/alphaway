<script lang="ts">
  import { onMount } from "svelte";
  import Badge from "../../lib/ui/Badge.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Modal from "../../lib/ui/Modal.svelte";
  import { notifications } from "../../lib/notifications";
  import { fetchApiKeys, createApiKey, deleteApiKey, type APIKeyRecord } from "../../lib/api";

  let keys = $state<APIKeyRecord[]>([]);
  let loading = $state(true);
  let revealedIds = $state<Set<string>>(new Set());
  let copiedId = $state<string | null>(null);

  // Create key modal
  let isCreateModalOpen = $state(false);
  let newKeyName = $state("");
  let isCreating = $state(false);
  let createdKeyResult = $state<APIKeyRecord | null>(null);

  async function loadKeys() {
    loading = true;
    try {
      keys = await fetchApiKeys();
    } catch {
      // Fallback default
      keys = [
        {
          id: "key-default",
          name: "Default Bridge Master Key",
          secret: "sk-alphaway-free",
          createdAt: Date.now() - 86400000 * 7,
          status: "active",
        },
      ];
    } finally {
      loading = false;
    }
  }

  onMount(loadKeys);

  function toggleReveal(id: string) {
    const next = new Set(revealedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    revealedIds = next;
  }

  function maskSecret(secret: string): string {
    if (!secret || secret.length <= 10) return "sk-••••••••••••";
    return `${secret.slice(0, 7)}••••••••${secret.slice(-4)}`;
  }

  async function copySecret(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      notifications.success("API Key copied to clipboard");
      setTimeout(() => {
        if (copiedId === id) copiedId = null;
      }, 2000);
    } catch {
      notifications.error("Failed to copy API key");
    }
  }

  async function handleCreateKey() {
    if (!newKeyName.trim()) return;
    isCreating = true;
    try {
      const created = await createApiKey(newKeyName.trim());
      createdKeyResult = created;
      await loadKeys();
      notifications.success(`Created API key '${created.name}'`);
    } catch (err: any) {
      notifications.error(err.message || "Failed to create API key");
    } finally {
      isCreating = false;
    }
  }

  async function handleDeleteKey(id: string, name: string) {
    if (id === "key-default") {
      notifications.warning("Default master key cannot be removed");
      return;
    }
    if (!confirm(`Are you sure you want to revoke and delete key '${name}'?`)) return;
    try {
      await deleteApiKey(id);
      notifications.success(`Revoked key '${name}'`);
      await loadKeys();
    } catch (err: any) {
      notifications.error(err.message || "Failed to delete key");
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-sm font-bold text-text-main flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px] text-brand-500">key</span>
        <span>Gateway API Keys</span>
      </h3>
      <p class="text-xs text-text-muted">
        Tokens accepted in Bearer auth, <code class="text-text-main font-mono">x-api-key</code>, and client configs.
      </p>
    </div>
    <Button
      variant="primary"
      size="sm"
      onclick={() => {
        newKeyName = "";
        createdKeyResult = null;
        isCreateModalOpen = true;
      }}
    >
      <span class="material-symbols-outlined text-[16px]">add</span>
      <span>Create Key</span>
    </Button>
  </div>

  <!-- Keys Table -->
  <div class="overflow-x-auto rounded-[10px] border border-border-subtle bg-surface-1">
    <table class="w-full text-left text-xs">
      <thead class="bg-surface-2 text-text-muted uppercase tracking-wider font-mono border-b border-border-subtle">
        <tr>
          <th class="px-4 py-3 font-semibold">Key Name</th>
          <th class="px-4 py-3 font-semibold">Secret Token</th>
          <th class="px-4 py-3 font-semibold">Status</th>
          <th class="px-4 py-3 font-semibold">Created</th>
          <th class="px-4 py-3 font-semibold text-right">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border-subtle font-mono">
        {#each keys as k (k.id)}
          <tr class="hover:bg-surface-2/50 transition-colors">
            <td class="px-4 py-3 font-sans font-medium text-text-main">
              {k.name}
            </td>
            <td class="px-4 py-3 text-text-muted">
              <div class="flex items-center gap-2">
                <span>{revealedIds.has(k.id) ? k.secret : maskSecret(k.secret)}</span>
                <button
                  type="button"
                  onclick={() => toggleReveal(k.id)}
                  class="text-text-muted hover:text-text-main p-0.5"
                  title={revealedIds.has(k.id) ? "Hide secret" : "Reveal secret"}
                >
                  <span class="material-symbols-outlined text-[14px]">
                    {revealedIds.has(k.id) ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </td>
            <td class="px-4 py-3">
              <Badge tone={k.status === "active" ? "success" : "neutral"} size="sm" dot>
                {k.status}
              </Badge>
            </td>
            <td class="px-4 py-3 text-text-muted">
              {new Date(k.createdAt).toLocaleDateString()}
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-1.5 font-sans">
                <Button
                  variant="ghost"
                  size="xs"
                  onclick={() => copySecret(k.id, k.secret)}
                  title="Copy API Key"
                >
                  <span class="material-symbols-outlined text-[14px]">
                    {copiedId === k.id ? "check" : "content_copy"}
                  </span>
                  <span>{copiedId === k.id ? "Copied" : "Copy"}</span>
                </Button>
                {#if k.id !== "key-default"}
                  <Button
                    variant="ghost"
                    size="xs"
                    class="text-red-400 hover:text-red-300"
                    onclick={() => handleDeleteKey(k.id, k.name)}
                    title="Revoke Key"
                  >
                    <span class="material-symbols-outlined text-[14px]">delete</span>
                  </Button>
                {/if}
              </div>
            </td>
          </tr>
        {/each}
        {#if keys.length === 0 && !loading}
          <tr>
            <td colspan="5" class="px-4 py-6 text-center text-text-muted font-sans">
              No API keys configured. Using public gateway mode.
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>

<!-- Create API Key Modal -->
<Modal
  open={isCreateModalOpen}
  title={createdKeyResult ? "API Key Created" : "Create New API Key"}
  onclose={() => (isCreateModalOpen = false)}
>
  {#if createdKeyResult}
    <div class="space-y-4">
      <div class="p-3.5 rounded-[8px] bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-1">
        <p class="font-bold flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[16px]">check_circle</span>
          <span>Copy your key now</span>
        </p>
        <p>This key will be masked after you close this modal.</p>
      </div>

      <div class="space-y-1.5">
        <span class="text-xs font-semibold text-text-muted">Secret API Key</span>
        <div class="flex items-center gap-2 p-2.5 rounded-[8px] bg-surface-2 border border-border font-mono text-xs text-brand-400 break-all select-all">
          <span>{createdKeyResult.secret}</span>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <Button
          variant="primary"
          onclick={() => {
            if (createdKeyResult) copySecret(createdKeyResult.id, createdKeyResult.secret);
            isCreateModalOpen = false;
          }}
        >
          <span class="material-symbols-outlined text-[16px]">content_copy</span>
          <span>Copy & Close</span>
        </Button>
      </div>
    </div>
  {:else}
    <form
      class="space-y-4"
      onsubmit={(e) => {
        e.preventDefault();
        handleCreateKey();
      }}
    >
      <div class="space-y-1.5">
        <label for="new-key-name" class="text-xs font-semibold text-text-muted">Key Identifier / Name</label>
        <input
          id="new-key-name"
          type="text"
          bind:value={newKeyName}
          placeholder="e.g. Cursor Pro Desktop, Cline CI, Work Laptop"
          class="w-full px-3 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main focus:outline-hidden focus:border-brand-500"
          required
        />
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onclick={() => (isCreateModalOpen = false)}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={isCreating || !newKeyName.trim()}>
          {isCreating ? "Generating..." : "Generate Key"}
        </Button>
      </div>
    </form>
  {/if}
</Modal>
