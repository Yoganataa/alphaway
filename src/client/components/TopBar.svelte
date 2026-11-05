<script lang="ts">
  import { onMount } from "svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import Button from "../lib/ui/Button.svelte";
  import ThemeToggle from "../lib/ui/ThemeToggle.svelte";
  import { notifications } from "../lib/notifications";
  import type { HealthResponse } from "../lib/types";

  let {
    activeTab = "overview",
    health = null,
    onRefresh,
    onOpenSearch,
    onToggleMobileMenu,
    isMobileMenuOpen = false,
    onLogout,
  }: {
    activeTab: string;
    health?: HealthResponse | null;
    onRefresh?: () => void;
    onOpenSearch?: () => void;
    onToggleMobileMenu?: () => void;
    isMobileMenuOpen?: boolean;
    onLogout?: () => void;
  } = $props();

  let copied = $state(false);
  let copyingBaseUrl = $state(false);
  let currentHost = $state("Current host");
  let currentOrigin = $state("");

  onMount(() => {
    currentHost = window.location.host;
    currentOrigin = window.location.origin;
  });

  const titles: Record<string, { title: string; subtitle: string; icon: string }> = {
    overview: {
      title: "Endpoint & Key",
      subtitle: "Gateway endpoint, managed API keys, and client integration snippets.",
      icon: "hub",
    },
    endpoint: {
      title: "Endpoint & Key",
      subtitle: "Gateway endpoint, managed API keys, and client integration snippets.",
      icon: "hub",
    },
    providers: {
      title: "Providers",
      subtitle: "Provider registration, CodeBuddy credential state, and custom provider configuration.",
      icon: "dns",
    },
    usage: {
      title: "Usage",
      subtitle: "AlphaWay-recorded requests, token estimates, usage trends, and audit details.",
      icon: "monitoring",
    },
    quota: {
      title: "Quota Tracker",
      subtitle: "AlphaWay-enforced managed-key limits and recorded request/token usage; not upstream provider quota.",
      icon: "speed",
    },
    tokensaver: {
      title: "Token Saver",
      subtitle: "RTK compression, Caveman and ADHD prompt modes, and DLP configuration.",
      icon: "bolt",
    },
    security: {
      title: "Security",
      subtitle: "Manage persisted Security Rules and inspect the runtime matcher.",
      icon: "shield",
    },
    persona: {
      title: "Persona",
      subtitle: "Model-bound prompt presets, exact bindings, keyword rules, and SOUL Studio.",
      icon: "masks",
    },
    soul: {
      title: "Persona",
      subtitle: "Model-bound prompt presets and SOUL Studio.",
      icon: "masks",
    },
    plans: {
      title: "Plans",
      subtitle: "Manage per-key policy plans, model allowlists, and request limits.",
      icon: "layers",
    },
    proxy: {
      title: "Proxy Pools",
      subtitle: "Persisted egress entries, relay settings, rotation strategies, and bounded live probes.",
      icon: "vpn_lock",
    },
    proxypools: {
      title: "Proxy Pools",
      subtitle: "Persisted egress entries, relay settings, rotation strategies, and bounded live probes.",
      icon: "vpn_lock",
    },
    playground: {
      title: "Playground",
      subtitle: "Send prompt requests through the AlphaWay gateway and inspect responses.",
      icon: "terminal",
    },
    consolelog: {
      title: "Console Log",
      subtitle: "Inspect the recent bounded, in-process gateway log buffer.",
      icon: "receipt_long",
    },
    tunnel: {
      title: "Tunnel & Daemon",
      subtitle: "View public endpoint configuration and CLI lifecycle guidance; active process state is not reported.",
      icon: "cloud",
    },
    profile: {
      title: "Profile & Settings",
      subtitle: "Manage the browser-scoped dashboard key, SQLite diagnostics, backup, and maintenance.",
      icon: "settings",
    },
    settings: {
      title: "Profile & Settings",
      subtitle: "Manage the browser-scoped dashboard key, SQLite diagnostics, backup, and maintenance.",
      icon: "settings",
    },
  };

  const currentMeta = $derived(titles[activeTab] || titles.overview);

  async function copyBaseUrl() {
    if (!currentOrigin) {
      notifications.error("Current dashboard origin is not available");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      copied = false;
      notifications.error("Clipboard access is unavailable in this browser context");
      return;
    }

    copyingBaseUrl = true;
    try {
      await navigator.clipboard.writeText(`${currentOrigin}/v1`);
      copied = true;
      notifications.success("OpenAI Base URL copied to clipboard");
      setTimeout(() => (copied = false), 2000);
    } catch (error) {
      copied = false;
      notifications.error(
        `Could not copy OpenAI Base URL: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      copyingBaseUrl = false;
    }
  }
</script>

<header class="h-16 shrink-0 border-b border-border-subtle bg-sidebar/90 backdrop-blur-[2px] px-4 md:px-8 flex items-center justify-between z-20 sticky top-0">
  <!-- Left Side: Mobile Menu Button + View Title & Subtitle -->
  <div class="flex items-center gap-3 min-w-0">
    <!-- Mobile hamburger button -->
    {#if onToggleMobileMenu}
      <button
        id="mobile-menu-toggle"
        type="button"
        onclick={onToggleMobileMenu}
        class="md:hidden p-1.5 rounded-[8px] text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors cursor-pointer"
        aria-label="Toggle mobile menu"
        aria-expanded={isMobileMenuOpen}
        aria-controls="primary-navigation"
      >
        <span class="material-symbols-outlined text-[20px]">menu</span>
      </button>
    {/if}

    <div class="flex flex-col min-w-0">
      <div class="flex items-center gap-2.5">
        <h1 class="text-sm md:text-base font-bold text-text-main tracking-tight truncate flex items-center gap-1.5">
          <span class="text-brand-500 font-mono text-xs md:text-sm">AlphaWay</span>
          <span class="text-text-subtle">&middot;</span>
          <span>{currentMeta.title}</span>
        </h1>
        <Badge tone={health?.tls ? "neutral" : "warning"} size="sm" dot>{health?.tls || "TLS profile unavailable"}</Badge>
        <span class="text-xs font-mono text-text-subtle hidden sm:inline">{currentHost}</span>
      </div>
      <p class="text-xs text-text-muted truncate mt-0.5 hidden sm:block">
        {currentMeta.subtitle}
      </p>
    </div>
  </div>

  <!-- Right Actions: Global Search, Quick Copy, Theme Toggle, Refresh -->
  <div class="flex items-center gap-2 shrink-0">
    <!-- Command Palette Quick Launcher -->
    {#if onOpenSearch}
      <button
        type="button"
        onclick={onOpenSearch}
        class="flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] bg-surface hover:bg-surface-2 border border-border-subtle text-xs text-text-muted hover:text-text-main transition-colors cursor-pointer"
        title="Open Command Palette (Ctrl+K)"
      >
        <span class="material-symbols-outlined text-[16px] text-brand-500">search</span>
        <span class="hidden md:inline text-xs">Search</span>
        <kbd class="hidden md:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 border border-border-subtle text-text-subtle">
          Ctrl K
        </kbd>
      </button>
    {/if}

    <!-- Quick copy endpoint pill -->
    <button
      type="button"
      onclick={copyBaseUrl}
      data-testid="copy-base-url"
      disabled={copyingBaseUrl}
      aria-busy={copyingBaseUrl ? "true" : undefined}
      class="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-surface hover:bg-surface-2 border border-border-subtle text-xs font-mono text-text-muted hover:text-text-main transition-colors cursor-pointer"
      title="Click to copy OpenAI Base URL"
    >
      <span class="material-symbols-outlined text-[16px] text-text-subtle">content_copy</span>
      <span>{copied ? "Copied!" : copyingBaseUrl ? "Copying..." : currentOrigin ? `${currentOrigin}/v1` : "Resolving origin…"}</span>
    </button>

    {#if onLogout}
      <Button variant="ghost" size="sm" onclick={onLogout} title="Sign out of administrator session">
        <span class="material-symbols-outlined text-[16px]">logout</span>
        <span class="hidden sm:inline">Sign out</span>
      </Button>
    {/if}

    <!-- Theme Toggle -->
    <ThemeToggle />

    <!-- Manual Refresh -->
    {#if onRefresh}
      <Button variant="ghost" size="sm" onclick={onRefresh} title="Refresh bridge status">
        <span class="material-symbols-outlined text-[18px]">refresh</span>
      </Button>
    {/if}
  </div>
</header>
