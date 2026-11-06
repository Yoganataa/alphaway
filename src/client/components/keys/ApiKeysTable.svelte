<script lang="ts">
  import { onMount } from "svelte";
  import Badge from "../../lib/ui/Badge.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Modal from "../../lib/ui/Modal.svelte";
  import ConfirmModal from "../../lib/ui/ConfirmModal.svelte";
  import { notifications } from "../../lib/notifications";
  import {
    fetchApiKeys,
    createApiKey,
    deleteApiKey,
    updateApiKeyLabel,
    rotateApiKey,
    setActiveApiKey,
    fetchPlans,
    setApiKeyPolicy,
    type PlanRecord,
    type APIKeyRecord,
    type IssuedAPIKey,
  } from "../../lib/api";

  let keys = $state<APIKeyRecord[]>([]);
  let plans = $state<PlanRecord[]>([]);
  let updatingPlanKeyId = $state<string | null>(null);
  let loading = $state(true);
  let isCreateModalOpen = $state(false);
  let newKeyName = $state("");
  let isCreating = $state(false);
  let createdKeyResult = $state<IssuedAPIKey | null>(null);
  let renameKey = $state<APIKeyRecord | null>(null);
  let renameValue = $state("");
  let isRenaming = $state(false);
  let revokeKey = $state<APIKeyRecord | null>(null);
  let isRevoking = $state(false);
  let rotateKeyTarget = $state<APIKeyRecord | null>(null);
  let isRotating = $state(false);

  async function loadKeys() {
    loading = true;
    try {
      const [keyRecords, planRecords] = await Promise.all([fetchApiKeys(), fetchPlans()]);
      keys = keyRecords;
      plans = planRecords;
    } catch (error: any) {
      keys = [];
      notifications.error(error.message || "Failed to load API keys");
    } finally {
      loading = false;
    }
  }

  onMount(loadKeys);

  async function copySecret(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setActiveApiKey(text);
      notifications.success("API key copied and selected for this browser");
    } catch {
      notifications.error("Failed to copy API key");
    }
  }

  async function handleCreateKey() {
    if (!newKeyName.trim()) return;
    isCreating = true;
    try {
      createdKeyResult = await createApiKey(newKeyName.trim());
      await loadKeys();
      notifications.success(`Created API key '${createdKeyResult.name}'`);
    } catch (error: any) {
      notifications.error(error.message || "Failed to create API key");
    } finally {
      isCreating = false;
    }
  }

  function openRename(key: APIKeyRecord) {
    renameKey = key;
    renameValue = key.name;
  }

  function closeRename() {
    if (isRenaming) return;
    renameKey = null;
    renameValue = "";
  }

  async function submitRename() {
    if (!renameKey || !renameValue.trim() || renameValue.trim() === renameKey.name) return;
    isRenaming = true;
    try {
      await updateApiKeyLabel(renameKey.id, renameValue.trim());
      await loadKeys();
      notifications.success("API key label updated");
      renameKey = null;
      renameValue = "";
    } catch (error: any) {
      notifications.error(error.message || "Failed to rename API key");
    } finally {
      isRenaming = false;
    }
  }

  async function confirmRevoke() {
    if (!revokeKey) return;
    isRevoking = true;
    try {
      await deleteApiKey(revokeKey.id);
      await loadKeys();
      notifications.success("API key revoked");
      revokeKey = null;
    } catch (error: any) {
      notifications.error(error.message || "Failed to revoke API key");
    } finally {
      isRevoking = false;
    }
  }

  function openRotateConfirmation(key: APIKeyRecord) {
    if (isRotating) return;
    rotateKeyTarget = key;
  }

  async function confirmRotate() {
    const key = rotateKeyTarget;
    if (!key) return;
    isRotating = true;
    try {
      createdKeyResult = await rotateApiKey(key.id);
      isCreateModalOpen = true;
      await loadKeys();
      notifications.success(`Rotated API key '${key.name}'`);
      rotateKeyTarget = null;
    } catch (error: any) {
      notifications.error(error.message || "Failed to rotate API key");
    } finally {
      isRotating = false;
    }
  }

  async function handlePlanChange(key: APIKeyRecord, planId: string) {
    updatingPlanKeyId = key.id;
    try {
      await setApiKeyPolicy(key.id, { planId: planId || null });
      await loadKeys();
      notifications.success(planId ? "Plan assigned to API key" : "Plan removed; key is unrestricted by Plan");
    } catch (error: any) {
      notifications.error(error.message || "Failed to update API key Plan");
      await loadKeys();
    } finally {
      updatingPlanKeyId = null;
    }
  }

  function closeModal() {
    isCreateModalOpen = false;
    createdKeyResult = null;
    newKeyName = "";
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
        Secrets are shown only when created or rotated. Existing credentials cannot be retrieved.
      </p>
    </div>
    <Button id="api-key-create-trigger" variant="primary" size="sm" onclick={() => { closeModal(); isCreateModalOpen = true; }}>
      <span class="material-symbols-outlined text-[16px]">add</span>
      <span>Create Key</span>
    </Button>
  </div>

  <div class="overflow-x-auto rounded-[10px] border border-border-subtle bg-surface-1">
    <table class="w-full text-left text-xs">
      <thead class="bg-surface-2 text-text-muted uppercase tracking-wider font-mono border-b border-border-subtle">
        <tr>
          <th class="px-4 py-3 font-semibold">Key Name</th>
          <th class="px-4 py-3 font-semibold">Prefix</th>
          <th class="px-4 py-3 font-semibold">Status</th>
          <th class="px-4 py-3 font-semibold">Plan</th>
          <th class="px-4 py-3 font-semibold">Created</th>
          <th class="px-4 py-3 font-semibold">Last Used</th>
          <th class="px-4 py-3 font-semibold">Requests</th>
          <th class="px-4 py-3 font-semibold text-right">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border-subtle font-mono">
        {#each keys as key (key.id)}
          <tr class="hover:bg-surface-2/50 transition-colors">
            <td class="px-4 py-3 font-sans font-medium text-text-main">{key.name}</td>
            <td class="px-4 py-3 text-text-muted">{key.prefix}…</td>
            <td class="px-4 py-3">
              <Badge tone={key.status === "active" ? "success" : "neutral"} size="sm" dot>{key.status}</Badge>
            </td>
            <td class="px-4 py-3">
              {#if key.status === "active"}
                <select
                  aria-label={"Plan for " + key.name}
                  value={key.planId || ""}
                  disabled={updatingPlanKeyId === key.id}
                  onchange={(event) => handlePlanChange(key, event.currentTarget.value)}
                  class="max-w-36 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text-main"
                >
                  <option value="">Unassigned</option>
                  {#each plans as plan (plan.id)}
                    <option value={plan.id}>{plan.name}</option>
                  {/each}
                </select>
              {:else}
                <span class="text-text-muted">—</span>
              {/if}
            </td>
            <td class="px-4 py-3 text-text-muted">{new Date(key.createdAt).toLocaleDateString()}</td>
            <td class="px-4 py-3 text-text-muted">
              {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}
            </td>
            <td class="px-4 py-3 text-text-muted">{key.requestsCount}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-1.5 font-sans">
                {#if key.status === "active"}
                  <Button variant="ghost" size="xs" onclick={() => openRename(key)} title="Rename key" ariaLabel={"Rename " + key.name}>
                    <span class="material-symbols-outlined text-[14px]">edit</span>
                  </Button>
                  <Button variant="ghost" size="xs" onclick={() => openRotateConfirmation(key)} title="Rotate key" ariaLabel={"Rotate " + key.name}>
                    <span class="material-symbols-outlined text-[14px]">autorenew</span>
                  </Button>
                  <Button variant="ghost" size="xs" class="text-red-400 hover:text-red-300" onclick={() => revokeKey = key} title="Revoke key" ariaLabel={"Revoke " + key.name}>
                    <span class="material-symbols-outlined text-[14px]">block</span>
                  </Button>
                {/if}
              </div>
            </td>
          </tr>
        {/each}
        {#if keys.length === 0 && !loading}
          <tr><td colspan="8" class="px-4 py-6 text-center text-text-muted font-sans">
            No managed API keys have been created.
          </td></tr>
        {/if}
        {#if loading}
          <tr><td colspan="8" class="px-4 py-6 text-center text-text-muted font-sans">Loading keys…</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>

<Modal
  isOpen={isCreateModalOpen}
  title={createdKeyResult ? "Copy Your API Key" : "Create New API Key"}
  onClose={closeModal}
>
  {#if createdKeyResult}
    <div class="space-y-4">
      <div class="p-3.5 rounded-[8px] bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-1">
        <p class="font-bold">This is the only time the full secret is available.</p>
        <p>Copy it to your password manager or client now. AlphaWay stores only its hash.</p>
      </div>
      <div class="space-y-1.5">
        <span class="text-xs font-semibold text-text-muted">Secret API Key</span>
        <div class="p-2.5 rounded-[8px] bg-surface-2 border border-border font-mono text-xs text-brand-400 break-all select-all">
          {createdKeyResult.secret}
        </div>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <Button variant="primary" onclick={() => copySecret(createdKeyResult!.secret)}>
          <span class="material-symbols-outlined text-[16px]">content_copy</span>
          <span>Copy & Select for Dashboard</span>
        </Button>
        <Button variant="ghost" onclick={closeModal}>Close</Button>
      </div>
    </div>
  {:else}
    <form class="space-y-4" onsubmit={(event) => { event.preventDefault(); handleCreateKey(); }}>
      <div class="space-y-1.5">
        <label for="new-key-name" class="text-xs font-semibold text-text-muted">Key label</label>
        <input id="new-key-name" type="text" bind:value={newKeyName}
          placeholder="e.g. Cursor Desktop, CI runner, Work Laptop"
          maxlength="80" required
          class="w-full px-3 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main focus:outline-hidden focus:border-brand-500" />
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onclick={closeModal}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={isCreating || !newKeyName.trim()}>
          {isCreating ? "Generating…" : "Generate Key"}
        </Button>
      </div>
    </form>
  {/if}
</Modal>

<Modal
  isOpen={renameKey !== null}
  title="Rename API Key"
  onClose={closeRename}
>
  <form class="space-y-4" onsubmit={(event) => { event.preventDefault(); void submitRename(); }}>
    <div class="space-y-1.5">
      <label for="rename-api-key" class="text-xs font-semibold text-text-muted">Key label</label>
      <input
        id="rename-api-key"
        type="text"
        bind:value={renameValue}
        maxlength="80"
        required
        disabled={isRenaming}
        class="w-full px-3 py-2 text-xs rounded-[8px] bg-surface-2 border border-border text-text-main focus:outline-hidden focus:border-brand-500"
      />
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <Button variant="ghost" type="button" onclick={closeRename} disabled={isRenaming}>Cancel</Button>
      <Button variant="primary" type="submit" disabled={isRenaming || !renameValue.trim() || renameValue.trim() === renameKey?.name}>
        {isRenaming ? "Saving…" : "Save Changes"}
      </Button>
    </div>
  </form>
</Modal>

<ConfirmModal
  isOpen={rotateKeyTarget !== null}
  title="Rotate API Key?"
  message={rotateKeyTarget ? "Rotate '" + rotateKeyTarget.name + "'? The old secret will stop working immediately." : ""}
  confirmLabel={isRotating ? "Rotating…" : "Rotate Key"}
  danger={true}
  onConfirm={() => void confirmRotate()}
  onClose={() => { if (!isRotating) rotateKeyTarget = null; }}
/>

<ConfirmModal
  isOpen={revokeKey !== null}
  title="Revoke API Key?"
  message={revokeKey ? "Revoke '" + revokeKey.name + "'? Clients using this key will lose access immediately." : ""}
  confirmLabel={isRevoking ? "Revoking…" : "Revoke Key"}
  danger={true}
  onConfirm={() => void confirmRevoke()}
  onClose={() => { if (!isRevoking) revokeKey = null; }}
/>
