<script lang="ts">
  import Modal from "../lib/ui/Modal.svelte";
  import { notifications } from "../lib/notifications";

  let {
    isOpen = $bindable(false),
    onNavigate,
  }: {
    isOpen?: boolean;
    onNavigate?: (tab: string) => void;
  } = $props();

  let query = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);
  let activeIndex = $state(0);

  interface CommandItem {
    id: string;
    label: string;
    description: string;
    icon: string;
    category: "Navigation" | "Actions" | "Security";
    action: () => void;
  }

  const items: CommandItem[] = [
    {
      id: "overview",
      label: "Overview & Endpoints",
      description: "Gateway status, BoringSSL parity, and quick endpoints",
      icon: "hub",
      category: "Navigation",
      action: () => {
        onNavigate?.("overview");
        isOpen = false;
      },
    },
    {
      id: "playground",
      label: "Interactive Playground",
      description: "Test prompt completions with streaming and reasoning tokens",
      icon: "terminal",
      category: "Navigation",
      action: () => {
        onNavigate?.("playground");
        isOpen = false;
      },
    },
    {
      id: "usage",
      label: "Usage & Token Analytics",
      description: "Real-time token metrics, KPI cards, trends, and request log",
      icon: "monitoring",
      category: "Navigation",
      action: () => {
        onNavigate?.("usage");
        isOpen = false;
      },
    },
    {
      id: "quota",
      label: "Quota & Rate Limits",
      description: "RPM, TPM, capacity limits, and auto-refresh countdown",
      icon: "speed",
      category: "Navigation",
      action: () => {
        onNavigate?.("quota");
        isOpen = false;
      },
    },
    {
      id: "providers",
      label: "Providers & Custom Engines",
      description: "OpenCode dual-lane, CodeBuddy OAuth, and 3rd-party providers",
      icon: "dns",
      category: "Navigation",
      action: () => {
        onNavigate?.("providers");
        isOpen = false;
      },
    },
    {
      id: "tokensaver",
      label: "TokenSaver & DLP Guard",
      description: "RTK line compression, Caveman mode, ADHD mode, and secret redactor",
      icon: "bolt",
      category: "Security",
      action: () => {
        onNavigate?.("tokensaver");
        isOpen = false;
      },
    },
    {
      id: "security",
      label: "Security Armor & DLP",
      description: "Data Loss Prevention secret masking and anti-infostealer shields",
      icon: "shield",
      category: "Security",
      action: () => {
        onNavigate?.("security");
        isOpen = false;
      },
    },
    {
      id: "proxy",
      label: "Egress Proxy & Pools",
      description: "Configure proxy rotation pool, failover, and Cloudflare relays",
      icon: "vpn_lock",
      category: "Navigation",
      action: () => {
        onNavigate?.("proxy");
        isOpen = false;
      },
    },
    {
      id: "consolelog",
      label: "Console Log Stream",
      description: "Real-time streaming gateway logs with severity filters and export",
      icon: "receipt_long",
      category: "Navigation",
      action: () => {
        onNavigate?.("consolelog");
        isOpen = false;
      },
    },
    {
      id: "tunnel",
      label: "Tunnel & Daemon",
      description: "Cloudflare Named Tunnel ingress and background daemon supervisor",
      icon: "cloud",
      category: "Navigation",
      action: () => {
        onNavigate?.("tunnel");
        isOpen = false;
      },
    },
    {
      id: "soul",
      label: "Soul Studio",
      description: "Universal persona engine, SOUL.md editor, and live sandbox",
      icon: "auto_awesome",
      category: "Navigation",
      action: () => {
        onNavigate?.("soul");
        isOpen = false;
      },
    },
    {
      id: "settings",
      label: "Settings & Storage",
      description: "Database WAL mode status, API key config, and port",
      icon: "settings",
      category: "Navigation",
      action: () => {
        onNavigate?.("settings");
        isOpen = false;
      },
    },
    {
      id: "copy-baseurl",
      label: "Copy OpenAI Base URL",
      description: "http://127.0.0.1:20129/v1",
      icon: "content_copy",
      category: "Actions",
      action: () => {
        if (typeof navigator !== "undefined") {
          navigator.clipboard.writeText("http://127.0.0.1:20129/v1");
          notifications.success("OpenAI Base URL copied to clipboard");
        }
        isOpen = false;
      },
    },
  ];

  let filteredItems = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  });

  $effect(() => {
    if (isOpen) {
      query = "";
      activeIndex = 0;
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      isOpen = false;
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % filteredItems.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + filteredItems.length) % filteredItems.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[activeIndex]) {
        filteredItems[activeIndex].action();
      }
    }
  }
</script>

<Modal bind:isOpen size="lg" title="Command Palette" icon="search" showTrafficLights={false}>
  <div class="space-y-4">
    <!-- Search Input -->
    <div class="relative">
      <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted text-[20px]">
        search
      </span>
      <input
        bind:this={inputEl}
        bind:value={query}
        onkeydown={handleKeydown}
        type="text"
        placeholder="Type a command, page name, or action..."
        class="w-full pl-11 pr-4 py-2.5 rounded-[10px] bg-bg border border-border text-sm text-text-main placeholder:text-text-subtle focus:outline-hidden focus:border-brand-500 transition-colors"
      />
      <div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-mono text-text-subtle bg-surface-2 px-1.5 py-0.5 rounded border border-border-subtle">
        <span>ESC</span>
      </div>
    </div>

    <!-- Results List -->
    <div class="max-h-[360px] overflow-y-auto space-y-1 divide-y divide-border-subtle/40 pr-1">
      {#if filteredItems.length === 0}
        <div class="py-8 text-center text-text-muted text-sm">
          No matching commands or pages found.
        </div>
      {:else}
        {#each filteredItems as item, idx}
          {@const isSelected = activeIndex === idx}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            onclick={() => item.action()}
            class="flex items-center justify-between p-3 rounded-[10px] text-sm cursor-pointer transition-colors {isSelected
              ? 'bg-brand-500/10 text-brand-500 border border-brand-500/30 font-medium'
              : 'text-text-muted hover:text-text-main hover:bg-surface-2 border border-transparent'}"
          >
            <div class="flex items-center gap-3 min-w-0">
              <span class="material-symbols-outlined text-[20px] shrink-0 {isSelected ? 'text-brand-500' : 'text-text-subtle'}">
                {item.icon}
              </span>
              <div class="min-w-0">
                <div class="text-sm font-medium text-text-main truncate">{item.label}</div>
                <div class="text-xs text-text-muted truncate">{item.description}</div>
              </div>
            </div>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-2 text-text-subtle shrink-0">
              {item.category}
            </span>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</Modal>
