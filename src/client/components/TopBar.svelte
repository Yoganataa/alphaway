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
    onLogout,
  }: {
    activeTab: string;
    health?: HealthResponse | null;
    onRefresh?: () => void;
    onOpenSearch?: () => void;
    onToggleMobileMenu?: () => void;
    onLogout?: () => void;
  } = $props();

  let copied = $state(false);
  let currentHost = $state("Current host");
  let currentOrigin = $state("");

  onMount(() => {
    currentHost = window.location.host;
    currentOrigin = window.location.origin;
  });

  const titles: Record<string, { title: string; subtitle: string; icon: string }> = {
    overview: {
      title: "Overview & Endpoint",
      subtitle: "Tri-protocol inference gateway for OpenCode, CodeBuddy & 3rd-Party custom engines",
      icon: "hub",
    },
    endpoint: {
      title: "Gateway Endpoint",
      subtitle: "Universal reverse proxy entrypoints for IDEs, coding agents, and automation pipelines",
      icon: "hub",
    },
    playground: {
      title: "Interactive Playground",
      subtitle: "Multi-model prompt test suite with streaming SSE output and real-time reasoning content",
      icon: "terminal",
    },
    usage: {
      title: "Usage & Token Analytics",
      subtitle: "Real-time token telemetry, SVG stacked trends, KPI summaries, and request audit drawer",
      icon: "monitoring",
    },
    quota: {
      title: "Quota & Rate Limits",
      subtitle: "AlphaWay-managed key limits and recorded request/token usage; not upstream provider quota.",
      icon: "speed",
    },
    providers: {
      title: "Providers & Models",
      subtitle: "OpenCode adapter registration, CodeBuddy credential state, and custom provider configuration.",
      icon: "dns",
    },
    tokensaver: {
      title: "TokenSaver Optimization",
      subtitle: "RTK line deduplication, Caveman mode, ADHD prompt, and token efficiency sandbox",
      icon: "bolt",
    },
    security: {
      title: "Security Armor & DLP",
      subtitle: "Data Loss Prevention secret masking, anti-infostealer protection, and keyword guardrails",
      icon: "shield",
    },
    proxy: {
      title: "Egress Proxy Pool",
      subtitle: "Multi-proxy pool rotation, round-robin/failover, latency testing, and Cloudflare relays",
      icon: "vpn_lock",
    },
    proxypools: {
      title: "Egress Proxy Pool",
      subtitle: "Multi-proxy pool rotation, round-robin/failover, latency testing, and Cloudflare relays",
      icon: "vpn_lock",
    },
    consolelog: {
      title: "Console & Gateway Log",
      subtitle: "Recent server log buffer with severity filters, search, and export.",
      icon: "receipt_long",
    },
    tunnel: {
      title: "Tunnel & Daemon Lifecycle",
      subtitle: "Public endpoint configuration and CLI lifecycle guidance; active process state is not reported here.",
      icon: "cloud",
    },
    persona: {
      title: "Persona",
      subtitle: "Model-bound prompt presets, keyword matching, exact bindings, and SOUL.md",
      icon: "masks",
    },
    soul: {
      title: "Persona",
      subtitle: "Model-bound prompt presets and SOUL.md configuration",
      icon: "masks",
    },
    settings: {
      title: "System & Storage Settings",
      subtitle: "SQLite storage diagnostics, browser client-key settings, and telemetry maintenance.",
      icon: "settings",
    },
    profile: {
      title: "Profile & Storage Settings",
      subtitle: "SQLite storage diagnostics, browser client-key settings, and telemetry maintenance.
      icon: "settings",
    },
  };

  const currentMeta = $derived(titles[activeTab] || titles.overview);

  function copyBaseUrl() {
    if (!currentOrigin || typeof navigator === "undefined" || !navigator.clipboard) {
      notifications.error("Current dashboard origin is not available");
      return;
    }
    const url = `${currentOrigin}/v1`;
    navigator.clipboard.writeText(url);
    copied = true;
    notifications.success("OpenAI Base URL copied to clipboard");
    setTimeout(() => (copied = false), 2000);
  }
</script>

<header class="h-16 shrink-0 border-b border-border-subtle bg-sidebar/90 backdrop-blur-[2px] px-4 md:px-8 flex items-center justify-between z-20 sticky top-0">
  <!-- Left Side: Mobile Menu Button + View Title & Subtitle -->
  <div class="flex items-center gap-3 min-w-0">
    <!-- Mobile hamburger button -->
    {#if onToggleMobileMenu}
      <button
        type="button"
        onclick={onToggleMobileMenu}
        class="md:hidden p-1.5 rounded-[8px] text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors cursor-pointer"
        aria-label="Toggle mobile menu"
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
      class="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-surface hover:bg-surface-2 border border-border-subtle text-xs font-mono text-text-muted hover:text-text-main transition-colors cursor-pointer"
      title="Click to copy OpenAI Base URL"
    >
      <span class="material-symbols-outlined text-[16px] text-text-subtle">content_copy</span>
      <span>{copied ? "Copied!" : "http://127.0.0.1:20129/v1"}</span>
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
