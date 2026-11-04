<script lang="ts">
  import { onMount } from "svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import type { HealthResponse } from "../lib/types";

  let {
    activeTab = $bindable("overview"),
    health = null,
    isMobileOpen = false,
    onCloseMobile,
  }: {
    activeTab: string;
    health?: HealthResponse | null;
    isMobileOpen?: boolean;
    onCloseMobile?: () => void;
  } = $props();

  let currentHost = $state("Current host");
  const healthAvailable = $derived(health?.status === "ok");
  const localGateStatus = $derived(health?.identity?.gate?.status ?? "unknown");
  const toolAnchorCount = $derived(health?.identity?.gate?.anchors.tools.length ?? 0);
  const headerAnchorCount = $derived(health?.identity?.gate?.anchors.headers.length ?? 0);

  onMount(() => {
    currentHost = window.location.host;
  });

  interface NavItem {
    id: string;
    label: string;
    icon: string;
    badge?: string;
  }

  interface NavSection {
    title: string;
    items: NavItem[];
  }

  const sections: NavSection[] = [
    {
      title: "Main",
      items: [
        { id: "endpoint", label: "Endpoint & Key", icon: "hub" },
        { id: "providers", label: "Providers", icon: "dns" },
        { id: "usage", label: "Usage", icon: "monitoring" },
        { id: "quota", label: "Quota Tracker", icon: "speed" },
        { id: "tokensaver", label: "Token Saver", icon: "bolt", badge: "RTK" },
      ],
    },
    {
      title: "Advanced Features",
      items: [
        { id: "security", label: "Security", icon: "shield", badge: "DLP" },
        { id: "persona", label: "Persona", icon: "masks", badge: "AI" },
        { id: "plans", label: "Plans", icon: "layers" },
      ],
    },
    {
      title: "System",
      items: [
        { id: "proxy", label: "Proxy Pools", icon: "vpn_lock" },
        { id: "playground", label: "Playground", icon: "terminal" },
        { id: "consolelog", label: "Console Log", icon: "receipt_long" },
        { id: "tunnel", label: "Tunnel & Daemon", icon: "cloud" },
        { id: "profile", label: "Profile & Settings", icon: "settings" },
      ],
    },
  ];

  function selectTab(id: string) {
    activeTab = id;
    if (onCloseMobile) onCloseMobile();
  }
</script>

<!-- Mobile Overlay Backdrop -->
{#if isMobileOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40 md:hidden"
    onclick={onCloseMobile}
  ></div>
{/if}

<aside
  class="w-64 shrink-0 bg-sidebar border-r border-border-subtle flex flex-col h-screen fixed md:sticky top-0 select-none z-50 transition-transform duration-200 {isMobileOpen
    ? 'translate-x-0'
    : '-translate-x-full md:translate-x-0'}"
>
  <!-- macOS window control / traffic lights (9router-go style) -->
  <div class="flex items-center justify-between px-5 pt-4 pb-1 shrink-0">
    <div class="flex items-center gap-2">
      <div class="w-2.5 h-2.5 rounded-full bg-[#FF5F56] shadow-xs"></div>
      <div class="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] shadow-xs"></div>
      <div class="w-2.5 h-2.5 rounded-full bg-[#27C93F] shadow-xs"></div>
    </div>
    {#if onCloseMobile}
      <button
        type="button"
        onclick={onCloseMobile}
        class="md:hidden text-text-muted hover:text-text-main p-1"
        aria-label="Close sidebar"
      >
        <span class="material-symbols-outlined text-[18px]">close</span>
      </button>
    {/if}
  </div>

  <!-- Brand Header -->
  <div class="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
    <div class="flex items-center gap-2.5">
      <div class="w-8 h-8 rounded-[9px] bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-500 font-mono font-bold text-sm shadow-[var(--shadow-warm)]">
        AW
      </div>
      <div>
        <div class="flex items-center gap-1.5">
          <span class="font-bold text-base text-text-main tracking-tight">AlphaWay</span>
          <span class="w-2 h-2 rounded-full {healthAvailable ? 'bg-emerald-500' : 'bg-zinc-500'}"></span>
        </div>
        <p class="text-[11px] text-text-muted font-mono">{health?.version ? `v${health.version}` : "v0.0.1"}</p>
      </div>
    </div>
    <Badge tone={healthAvailable ? "success" : "neutral"} size="sm" dot>{healthAvailable ? "API RESPONDING" : "UNKNOWN"}</Badge>
  </div>

  <!-- Grouped Navigation Menu (9Router-Go Architecture) -->
  <div class="flex-1 py-4 px-3 space-y-5 overflow-y-auto">
    {#each sections as section}
      <div class="space-y-1">
        <div class="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
          {section.title}
        </div>
        {#each section.items as item}
          {@const isActive =
            activeTab === item.id ||
            (item.id === "endpoint" && activeTab === "overview") ||
            (item.id === "profile" && activeTab === "settings") ||
            (item.id === "proxy" && activeTab === "proxypools")}
          <button
            type="button"
            onclick={() => selectTab(item.id)}
            class="w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-sm font-medium transition-all duration-150 cursor-pointer {isActive
              ? 'bg-brand-500/10 text-brand-500 dark:text-brand-400 border border-brand-500/30 font-semibold shadow-xs'
              : 'text-text-muted hover:text-text-main hover:bg-surface-2 border border-transparent'}"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="material-symbols-outlined text-[19px] shrink-0 {isActive ? 'text-brand-500 dark:text-brand-400' : 'text-text-muted'}">{item.icon}</span>
              <span class="truncate">{item.label}</span>
            </div>
            {#if item.badge}
              <span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-surface border border-border-subtle {isActive ? 'text-brand-500 border-brand-500/30' : 'text-text-subtle'}">
                {item.badge}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/each}
  </div>

  <!-- Runtime metadata reported by the health endpoint -->
  <div class="p-3 m-3 rounded-[12px] bg-surface border border-border-subtle space-y-1.5 text-xs">
    <div class="flex items-center justify-between gap-3 font-medium text-text-muted">
      <span>TLS profile</span>
      <span class="text-text-main font-mono text-[11px] text-right">{health?.tls || "Not reported"}</span>
    </div>
    <div class="flex items-center justify-between gap-3 font-medium text-text-muted">
      <span>Local retry gate</span>
      <span class="text-text-main font-mono text-[11px]">{localGateStatus.toUpperCase()}</span>
    </div>
    <div class="flex items-center justify-between gap-3 font-medium text-text-muted">
      <span>Configured anchors</span>
      <span class="text-text-main font-mono text-[11px]">{toolAnchorCount} tools · {headerAnchorCount} headers</span>
    </div>
    <div class="flex items-center justify-between gap-3 font-medium text-text-muted">
      <span>Dashboard origin</span>
      <span class="text-text-main font-mono text-[11px] text-right break-all">{currentHost}</span>
    </div>
  </div>

  <!-- Sidebar Footer -->
  <div class="p-3.5 border-t border-border-subtle flex items-center justify-between text-xs text-text-subtle">
    <a
      href="https://github.com/Yoganataa/alphaway"
      target="_blank"
      rel="noopener noreferrer"
      class="hover:text-text-main flex items-center gap-1 transition-colors"
    >
      <span class="material-symbols-outlined text-[16px]">code</span>
      <span>GitHub</span>
    </a>
    <div class="flex items-center gap-2">
      <a href="/health" target="_blank" class="hover:text-text-main transition-colors font-mono">/health</a>
      <span>&middot;</span>
      <a href="/v1/models" target="_blank" class="hover:text-text-main transition-colors font-mono">/v1/models</a>
    </div>
  </div>
</aside>
