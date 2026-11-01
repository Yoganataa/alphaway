<script lang="ts">
  import { onMount } from "svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import TopBar from "./components/TopBar.svelte";
  import OverviewView from "./components/OverviewView.svelte";
  import EndpointView from "./components/EndpointView.svelte";
  import PlaygroundView from "./components/PlaygroundView.svelte";
  import UsageView from "./components/UsageView.svelte";
  import QuotaTrackerView from "./components/QuotaTrackerView.svelte";
  import SoulStudioView from "./components/SoulStudioView.svelte";
  import ProvidersView from "./components/ProvidersView.svelte";
  import TokenSaverView from "./components/TokenSaverView.svelte";
  import SecurityView from "./components/SecurityView.svelte";
  import ProxyView from "./components/ProxyView.svelte";
  import ProxyPoolsView from "./components/ProxyPoolsView.svelte";
  import ConsoleLogStream from "./components/ConsoleLogStream.svelte";
  import TunnelView from "./components/TunnelView.svelte";
  import SettingsView from "./components/SettingsView.svelte";
  import ProfileSettingsView from "./components/ProfileSettingsView.svelte";
  import CommandPalette from "./components/CommandPalette.svelte";
  import Toasts from "./lib/ui/Toasts.svelte";
  import { fetchHealth, fetchAdminAuthStatus, fetchAdminSession, logoutAdmin, setActiveApiKey } from "./lib/api";
  import AdminAccessView from "./components/AdminAccessView.svelte";
  import type { HealthResponse } from "./lib/types";

  let authMode = $state<"loading" | "bootstrap" | "login" | "authenticated">("loading");
  let activeTab = $state<string>("overview");
  let health = $state<HealthResponse | null>(null);
  let pollTimer: any = null;
  let isPaletteOpen = $state(false);
  let isMobileMenuOpen = $state(false);

  async function loadHealth() {
    try {
      health = await fetchHealth();
    } catch {}
  }

  async function refreshAdminAuth() {
    try {
      const status = await fetchAdminAuthStatus();
      if (!status.configured) {
        authMode = "bootstrap";
        return;
      }
      const session = await fetchAdminSession();
      if (!session.authenticated) {
        authMode = "login";
        return;
      }
      authMode = "authenticated";
      await loadHealth();
      if (!pollTimer) pollTimer = setInterval(loadHealth, 10000);
    } catch {
      authMode = "login";
    }
  }

  async function handleLogout() {
    try { await logoutAdmin(); } catch {}
    setActiveApiKey("");
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    health = null;
    authMode = "login";
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      isPaletteOpen = !isPaletteOpen;
    }
  }

  onMount(() => {
    // Initial theme check
    const stored = localStorage.getItem("alphaway-theme") || localStorage.getItem("theme");
    if (stored === "light") {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    }

    void refreshAdminAuth();
    window.addEventListener("keydown", handleKeydown);

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      window.removeEventListener("keydown", handleKeydown);
    };
  });
</script>

{#if authMode === "authenticated"}
<div class="min-h-screen bg-bg text-text-main font-sans flex selection:bg-brand-500/30 selection:text-white relative">
  <!-- Left Sidebar (9Router-Go Architecture) -->
  <Sidebar
    bind:activeTab
    {health}
    isMobileOpen={isMobileMenuOpen}
    onCloseMobile={() => (isMobileMenuOpen = false)}
  />

  <!-- Right Content Area with Sticky TopBar -->
  <div class="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative isolate">
    <!-- Subtle AlphaWay background landing grid -->
    <div class="landing-grid absolute inset-0 pointer-events-none -z-10" aria-hidden="true"></div>

    <!-- TopBar -->
    <TopBar
      {activeTab}
      {health}
      onRefresh={loadHealth}
      onOpenSearch={() => (isPaletteOpen = true)}
      onToggleMobileMenu={() => (isMobileMenuOpen = !isMobileMenuOpen)}
      onLogout={handleLogout}
    />

    <!-- Scrollable Main View -->
    <main class="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
      {#if activeTab === "endpoint" || activeTab === "overview"}
        <EndpointView {health} />
      {:else if activeTab === "playground"}
        <PlaygroundView />
      {:else if activeTab === "usage"}
        <UsageView />
      {:else if activeTab === "quota"}
        <QuotaTrackerView />
      {:else if activeTab === "soul"}
        <SoulStudioView />
      {:else if activeTab === "providers"}
        <ProvidersView {health} />
      {:else if activeTab === "tokensaver"}
        <TokenSaverView />
      {:else if activeTab === "security"}
        <SecurityView />
      {:else if activeTab === "proxy" || activeTab === "proxypools"}
        <ProxyPoolsView />
      {:else if activeTab === "consolelog"}
        <ConsoleLogStream />
      {:else if activeTab === "tunnel"}
        <TunnelView {health} />
      {:else if activeTab === "profile" || activeTab === "settings"}
        <ProfileSettingsView />
      {/if}
    </main>
  </div>

  <!-- Global Command Palette (Ctrl+K) -->
  <CommandPalette bind:isOpen={isPaletteOpen} onNavigate={(tab) => (activeTab = tab)} />

  <!-- Global Toast Notifications -->
  <Toasts />
</div>
{:else if authMode === "loading"}
  <div class="min-h-screen bg-bg text-text-main flex items-center justify-center">
    <p class="text-sm text-text-muted">Checking administrator session…</p>
  </div>
{:else}
  <AdminAccessView mode={authMode} onAuthenticated={refreshAdminAuth} />
{/if}
