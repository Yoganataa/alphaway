<script lang="ts">
  import type { HealthResponse } from "../lib/types";

  let { activeTab = $bindable(), health }: { activeTab: string; health: HealthResponse | null } = $props();

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "playground", label: "Playground" },
    { id: "providers", label: "Providers & Models" },
    { id: "tokensaver", label: "TokenSaver" },
    { id: "proxy", label: "Egress Proxy" },
    { id: "tunnel", label: "Tunnel & Daemon" },
  ];
</script>

<header class="border-b border-[#2d333b] bg-[#161b22] px-6 py-3.5 sticky top-0 z-40">
  <div class="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
    <!-- Brand & Status Badges -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
        <h1 class="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
          <span>AlphaWay</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-[#21262d] text-gray-300 font-mono">v0.0.1</span>
        </h1>
      </div>

      <div class="hidden sm:flex items-center gap-2">
        <span class="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          {health?.tls || "BoringSSL Native Parity"}
        </span>

        <span class="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800 font-mono">
          :20129
        </span>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <nav class="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
      {#each tabs as tab}
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap {activeTab === tab.id
            ? 'bg-[#30363d] text-white shadow-sm'
            : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]'}"
          onclick={() => (activeTab = tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </nav>
  </div>
</header>
