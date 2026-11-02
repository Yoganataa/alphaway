<script lang="ts">
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
      subtitle: "Live capacity monitor, requests per minute (RPM), tokens per minute (TPM), and session reset windows",
      icon: "speed",
    },
    providers: {
      title: "Providers & Models",
      subtitle: "Upstream identity status, anti-burst dual-lane routing, and custom engine CRUD",
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
      subtitle: "Live streaming server logs with severity filters, search, and export",
      icon: "receipt_long",
    },
    tunnel: {
      title: "Tunnel & Daemon Lifecycle",
      subtitle: "Cloudflare Named Tunnel ingress and native background daemon supervisor",
      icon: "cloud",
    },
    soul: {
      title: "Soul Studio",
      subtitle: "Universal SOUL.md specification engine, persona presets, and real-time sandbox test",
      icon: "auto_awesome",
    },
    settings: {
      title: "System & Storage Settings",
      subtitle: "Embedded SQLite engine with WAL mode concurrency, API key management, and log purge",
      icon: "settings",
    },
    profile: {
      title: "Profile & Storage Settings",
      subtitle: "Embedded SQLite engine with WAL mode concurrency, API key management, and log purge",
      icon: "settings",
    },
  };

  const currentMeta = $derived(titles[activeTab] || titles.overview);

  function copyBaseUrl() {
    const url = "http://127.0.0.1:20129/v1";
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      copied = true;
      notifications.success("OpenAI Base URL copied to clipboard");
      setTimeout(() => (copied = false), 2000);
    }
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
        <Badge tone="success" size="sm" dot>BoringSSL Native Parity</Badge>
        <span class="text-xs font-mono text-text-subtle hidden sm:inline">:20129</span>
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
