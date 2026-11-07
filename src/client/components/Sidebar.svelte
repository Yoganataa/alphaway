<script lang="ts">
  import { onMount } from "svelte";
  import Badge from "../lib/ui/Badge.svelte";
  import type { HealthResponse } from "../lib/types";
  import { pushEscapeHandler } from "../lib/ui/escapeStack";

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
  let isMobileViewport = $state(false);
  let collapsedSections = $state<Set<string>>(new Set());
  let isIconRail = $state(false);
  const collapsedSectionsStorageKey = "alphaway-sidebar-collapsed-sections";
  const iconRailStorageKey = "alphaway-sidebar-icon-rail";
  let mobileCloseButton = $state<HTMLButtonElement | null>(null);
  const healthAvailable = $derived(health?.status === "ok");
  const localGateStatus = $derived(health?.identity?.gate?.status ?? "unknown");
  const toolAnchorCount = $derived(health?.identity?.gate?.anchors.tools.length ?? 0);
  const headerAnchorCount = $derived(health?.identity?.gate?.anchors.headers.length ?? 0);

  onMount(() => {
    currentHost = window.location.host;

    try {
      const iconRailRaw = localStorage.getItem(iconRailStorageKey);
      if (iconRailRaw === "true") isIconRail = true;

      const raw = localStorage.getItem(collapsedSectionsStorageKey);
      if (raw) {
        const stored: unknown = JSON.parse(raw);
        if (Array.isArray(stored)) {
          const validIds = new Set(sections.map((section) => section.id));
          collapsedSections = new Set(
            stored.filter((id): id is string => typeof id === "string" && validIds.has(id))
          );
        }
      }
    } catch {
      // Invalid or unavailable browser storage keeps every section expanded.
      collapsedSections = new Set();
    }

    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => {
      isMobileViewport = mobileQuery.matches;
      if (isMobileViewport) {
        isIconRail = false;
      } else {
        try {
          isIconRail = localStorage.getItem(iconRailStorageKey) === "true";
        } catch {
          isIconRail = false;
        }
      }
      if (!isMobileViewport && isMobileOpen) onCloseMobile?.();
    };

    syncViewport();
    mobileQuery.addEventListener("change", syncViewport);
    return () => mobileQuery.removeEventListener("change", syncViewport);
  });

  $effect(() => {
    if (!isMobileViewport || !isMobileOpen || !onCloseMobile) return;
    return pushEscapeHandler(() => onCloseMobile?.());
  });

  $effect(() => {
    if (!isMobileViewport || !isMobileOpen) return;
    const frame = requestAnimationFrame(() => mobileCloseButton?.focus());
    return () => cancelAnimationFrame(frame);
  });

  interface NavItem {
    id: string;
    label: string;
    icon: string;
    badge?: string;
  }

  interface NavSection {
    id: string;
    title: string;
    items: NavItem[];
  }

  const sections: NavSection[] = [
    {
      id: "main",
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
      id: "advanced-features",
      title: "Advanced Features",
      items: [
        { id: "security", label: "Security", icon: "shield", badge: "DLP" },
        { id: "persona", label: "Persona", icon: "masks", badge: "AI" },
        { id: "plans", label: "Plans", icon: "layers" },
      ],
    },
    {
      id: "system",
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

  const renderedSections = $derived.by(() =>
    sections.map((section) => {
      const containsActiveTab = section.items.some((item) =>
        activeTab === item.id ||
        (item.id === "endpoint" && activeTab === "overview") ||
        (item.id === "profile" && activeTab === "settings") ||
        (item.id === "proxy" && activeTab === "proxypools")
      );
      return {
        ...section,
        isOpen: isIconRail || containsActiveTab || !collapsedSections.has(section.id),
      };
    })
  );

  function toggleIconRail() {
    isIconRail = !isIconRail;
    try {
      localStorage.setItem(iconRailStorageKey, String(isIconRail));
    } catch {
      // Storage-restricted browsers still get the session state.
    }
  }

  function toggleSection(sectionId: string) {
    const next = new Set(collapsedSections);
    if (next.has(sectionId)) next.delete(sectionId);
    else next.add(sectionId);
    collapsedSections = next;

    try {
      localStorage.setItem(collapsedSectionsStorageKey, JSON.stringify([...next]));
    } catch {
      // A storage-restricted browser still gets this session's collapsed state.
    }
  }

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
  id="primary-navigation"
  aria-label="Primary navigation"
  aria-hidden={isMobileViewport && !isMobileOpen ? "true" : undefined}
  inert={isMobileViewport && !isMobileOpen}
  class="{isIconRail ? 'w-14' : 'w-64'} shrink-0 bg-sidebar border-r border-border-subtle flex flex-col h-screen fixed md:sticky top-0 select-none z-50 transition-all duration-200 {isMobileOpen
    ? 'translate-x-0'
    : '-translate-x-full md:translate-x-0'}"
>
  <!-- macOS window control / traffic lights (9router-go style) -->
  <div class="flex items-center justify-between px-5 pt-4 pb-1 shrink-0">
    <div class="flex items-center gap-2 {isIconRail ? 'hidden' : ''}">
      <div class="w-2.5 h-2.5 rounded-full bg-[#FF5F56] shadow-xs"></div>
      <div class="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] shadow-xs"></div>
      <div class="w-2.5 h-2.5 rounded-full bg-[#27C93F] shadow-xs"></div>
    </div>
    {#if onCloseMobile}
      <button
        bind:this={mobileCloseButton}
        id="close-mobile-sidebar"
        type="button"
        onclick={onCloseMobile}
        class="md:hidden text-text-muted hover:text-text-main p-1"
        aria-label="Close sidebar"
      >
        <span class="material-symbols-outlined text-[18px]">close</span>
      </button>
    {/if}
  </div>
  {#if !isIconRail && !isMobileViewport}
    <button type="button" onclick={toggleIconRail} aria-label="Collapse sidebar" title="Collapse sidebar" class="mx-5 mb-1 self-end text-text-muted hover:text-text-main p-1 rounded-md hover:bg-surface-2 transition-colors">
      <span class="material-symbols-outlined text-[18px]">left_panel_close</span>
    </button>
  {/if}

  <!-- Brand Header -->
  <div class="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
    <div class="flex items-center gap-2.5">
      <div class="w-8 h-8 rounded-[9px] bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-500 font-mono font-bold text-sm shadow-[var(--shadow-warm)]">
        AW
      </div>
      <div class="min-w-0 {isIconRail ? 'hidden' : ''}">
        <div class="flex items-center gap-1.5">
          <span class="font-bold text-base text-text-main tracking-tight">AlphaWay</span>
          <span class="w-2 h-2 rounded-full {healthAvailable ? 'bg-emerald-500' : 'bg-zinc-500'}"></span>
        </div>
        <p class="text-[11px] text-text-muted font-mono">{health?.version ? `v${health.version}` : "v0.0.1"}</p>
      </div>
    </div>
    {#if !isIconRail}<Badge tone={healthAvailable ? "success" : "neutral"} size="sm" dot>{healthAvailable ? "API RESPONDING" : "UNKNOWN"}</Badge>{/if}
  </div>

  <!-- Grouped Navigation Menu (9Router-Go Architecture) -->
  <div class="flex-1 py-4 {isIconRail ? 'px-1.5' : 'px-3'} space-y-5 overflow-y-auto">
    {#each renderedSections as section (section.id)}
      <div class="space-y-1" data-nav-section={section.title}>
        <button
          type="button"
          data-section-toggle={section.id}
          aria-expanded={section.isOpen}
          aria-controls={`nav-section-${section.id}-items`}
          onclick={() => toggleSection(section.id)}
          class="w-full flex items-center justify-between px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-subtle hover:text-text-muted transition-colors {isIconRail ? 'hidden' : ''}"
        >
          <span>{section.title}</span>
          <span
            aria-hidden="true"
            class="material-symbols-outlined text-[14px] transition-transform duration-150 {section.isOpen ? '' : '-rotate-90'}"
          >expand_more</span>
        </button>
        {#if section.isOpen}
          <div id={`nav-section-${section.id}-items`} data-nav-items={section.id} class="space-y-1">
            {#each section.items as item}
              {@const isActive =
                activeTab === item.id ||
                (item.id === "endpoint" && activeTab === "overview") ||
                (item.id === "profile" && activeTab === "settings") ||
                (item.id === "proxy" && activeTab === "proxypools")}
              <button
                type="button"
                onclick={() => selectTab(item.id)}
                title={isIconRail ? item.label : undefined}
                class="w-full flex items-center justify-between {isIconRail ? 'justify-center px-2' : 'px-3'} py-2 rounded-[10px] text-sm font-medium transition-all duration-150 cursor-pointer {isActive
                  ? 'bg-brand-500/10 text-brand-500 dark:text-brand-400 border border-brand-500/30 font-semibold shadow-xs'
                  : 'text-text-muted hover:text-text-main hover:bg-surface-2 border border-transparent'}"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="material-symbols-outlined text-[19px] shrink-0 {isActive ? 'text-brand-500 dark:text-brand-400' : 'text-text-muted'}">{item.icon}</span>
                  {#if !isIconRail}<span class="truncate">{item.label}</span>{/if}
                </div>
                {#if item.badge && !isIconRail}
                  <span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-surface border border-border-subtle {isActive ? 'text-brand-500 border-brand-500/30' : 'text-text-subtle'}">
                    {item.badge}
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Runtime metadata reported by the health endpoint -->
  {#if !isIconRail}
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
  {/if}

  <!-- Sidebar Footer -->
  <div class="p-3.5 border-t border-border-subtle flex items-center justify-between text-xs text-text-subtle">
    <a
      href="https://github.com/Yoganataa/alphaway"
      target="_blank"
      rel="noopener noreferrer"
      class="hover:text-text-main flex items-center gap-1 transition-colors"
    >
      <span class="material-symbols-outlined text-[16px]">code</span>
      {#if !isIconRail}<span>GitHub</span>{/if}
    </a>
    <div class="flex items-center gap-2">
      <a href="/health" target="_blank" class="hover:text-text-main transition-colors font-mono">/health</a>
      <span>&middot;</span>
      <a href="/v1/models" target="_blank" class="hover:text-text-main transition-colors font-mono">/v1/models</a>
    </div>
  </div>
  {#if isIconRail && !isMobileViewport}
    <button type="button" onclick={toggleIconRail} aria-label="Expand sidebar" title="Expand sidebar" class="mx-auto mb-3 text-text-muted hover:text-text-main p-1 rounded-md hover:bg-surface-2 transition-colors">
      <span class="material-symbols-outlined text-[18px]">left_panel_open</span>
    </button>
  {/if}
</aside>
