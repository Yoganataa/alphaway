<script lang="ts">
  import {
    bootstrapAdmin,
    loginAdmin,
  } from "../lib/api";

  let {
    mode,
    onAuthenticated,
  }: {
    mode: "bootstrap" | "login";
    onAuthenticated: () => void | Promise<void>;
  } = $props();

  let bootstrapToken = $state("");
  let username = $state("");
  let password = $state("");
  let loading = $state(false);
  let errorMessage = $state("");

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    try {
      if (mode === "bootstrap") {
        await bootstrapAdmin({ bootstrapToken, username, password });
      }
      await loginAdmin(username, password);
      await onAuthenticated();
    } catch (error: any) {
      errorMessage = error.message || "Authentication failed";
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen bg-bg text-text-main flex items-center justify-center p-4">
  <div class="w-full max-w-md rounded-2xl border border-border-subtle bg-surface-1 p-6 md:p-8 shadow-xl space-y-6">
    <div class="space-y-2">
      <div class="flex items-center gap-2 text-brand-500">
        <span class="material-symbols-outlined text-2xl">shield_lock</span>
        <span class="font-mono font-bold tracking-wide">AlphaWay</span>
      </div>
      <h1 class="text-xl font-bold text-text-main">
        {mode === "bootstrap" ? "Set up administrator" : "Administrator sign in"}
      </h1>
      <p class="text-sm text-text-muted">
        {mode === "bootstrap"
          ? "Create the first administrator account. Setup is available only once per database."
          : "Sign in to manage gateway settings, providers, logs, and API credentials."}
      </p>
    </div>

    {#if mode === "bootstrap"}
      <div class="rounded-lg border border-border-subtle bg-surface-2 p-3 text-xs text-text-muted space-y-2">
        <p>Run this command on the machine hosting AlphaWay and paste the printed one-time token below:</p>
        <code class="block rounded bg-bg px-2 py-2 text-brand-400 break-all">bun src/index.ts --show-admin-bootstrap-token</code>
        <p>The token is stored in a local file with restricted permissions and is never returned by the HTTP API.</p>
      </div>
    {/if}

    <form class="space-y-4" onsubmit={handleSubmit}>
      {#if mode === "bootstrap"}
        <div class="space-y-1.5">
          <label for="bootstrap-token" class="block text-xs font-semibold text-text-muted">One-time bootstrap token</label>
          <input id="bootstrap-token" type="password" bind:value={bootstrapToken}
            autocomplete="off" required
            class="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm font-mono text-text-main focus:border-brand-500 focus:outline-none" />
        </div>
      {/if}

      <div class="space-y-1.5">
        <label for="admin-username" class="block text-xs font-semibold text-text-muted">Username</label>
        <input id="admin-username" type="text" bind:value={username}
          autocomplete="username" minlength="1" maxlength="32" required
          pattern="[A-Za-z0-9._-]+"
          class="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text-main focus:border-brand-500 focus:outline-none" />
      </div>

      <div class="space-y-1.5">
        <label for="admin-password" class="block text-xs font-semibold text-text-muted">Password</label>
        <input id="admin-password" type="password" bind:value={password}
          autocomplete={mode === "bootstrap" ? "new-password" : "current-password"}
          minlength={mode === "bootstrap" ? 12 : 1} maxlength="1024" required
          class="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text-main focus:border-brand-500 focus:outline-none" />
        {#if mode === "bootstrap"}
          <p class="text-[11px] text-text-subtle">Use at least 12 characters. Store the password securely.</p>
        {/if}
      </div>

      {#if errorMessage}
        <p role="alert" class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{errorMessage}</p>
      {/if}

      <button type="submit" disabled={loading}
        class="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? "Please wait…" : mode === "bootstrap" ? "Create administrator" : "Sign in"}
      </button>
    </form>
  </div>
</div>
