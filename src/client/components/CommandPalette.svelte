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

  type CommandCategory = "Main" | "Advanced Features" | "System" | "Actions";

  interface CommandItem {
    id: string;
    label: string;
    description: string;
    icon: string;
    category: CommandCategory;
    action: () => void | Promise<void>;
  }

  function navigateTo(tab: string) {
    onNavigate?.(tab);
    isOpen = false;
  }

  async function copyBaseUrl() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      notifications.error("Clipboard access is unavailable in this browser context");
      isOpen = false;
      return;
    }

    try {
      await navigator.clipboard.writeText(`${window.location.origin}/v1`);
      notifications.success("OpenAI Base URL copied to clipboard");
    } catch {
      notifications.error("Could not copy the OpenAI Base URL");
    } finally {
      isOpen = false;
    }
  }

  // Keep the palette aligned with implemented dashboard navigation.
  // Backend-gap screens stay out of this list until they have real contracts.
  const items: CommandItem[] = [
    {
      id: "endpoint",
      label: "Endpoint & Key",
      description: "Gateway endpoint, managed API keys, and client integration snippets",
      icon: "hub",
      category: "Main",
      action: () => navigateTo("endpoint"),
    },
    {
      id: "providers",
      label: "Providers",
      description: "Provider registration, CodeBuddy credential state, and custom provider configuration",
      icon: "dns",
      category: "Main",
      action: () => navigateTo("providers"),
    },
    {
      id: "usage",
      label: "Usage",
      description: "Recorded request activity, token usage, trends, and audit details",
      icon: "monitoring",
      category: "Main",
      action: () => navigateTo("usage"),
    },
    {
      id: "quota",
      label: "Quota Tracker",
      description: "AlphaWay-enforced managed-key RPM, TPM, concurrency, and recorded usage",
      icon: "speed",
      category: "Main",
      action: () => navigateTo("quota"),
    },
    {
      id: "tokensaver",
      label: "Token Saver",
      description: "RTK compression, Caveman and ADHD prompt modes, and DLP configuration",
      icon: "bolt",
      category: "Main",
      action: () => navigateTo("tokensaver"),
    },
    {
      id: "security",
      label: "Security",
      description: "Persisted Security Rules, runtime enforcement, and rule inspection",
      icon: "shield",
      category: "Advanced Features",
      action: () => navigateTo("security"),
    },
    {
      id: "persona",
      label: "Persona",
      description: "Model-bound presets, exact bindings, keyword rules, and SOUL Studio",
      icon: "masks",
      category: "Advanced Features",
      action: () => navigateTo("persona"),
    },
    {
      id: "plans",
      label: "Plans",
      description: "Managed-key policy plans, model allowlists, and request limits",
      icon: "layers",
      category: "Advanced Features",
      action: () => navigateTo("plans"),
    },
    {
      id: "proxy",
      label: "Proxy Pools",
      description: "Persisted egress entries, proxy rotation, failover, relay configuration, and live probes",
      icon: "vpn_lock",
      category: "System",
      action: () => navigateTo("proxy"),
    },
    {
      id: "playground",
      label: "Playground",
      description: "Send prompt requests through the AlphaWay gateway and inspect responses",
      icon: "terminal",
      category: "System",
      action: () => navigateTo("playground"),
    },
    {
      id: "consolelog",
      label: "Console Log",
      description: "Inspect the recent bounded, in-process gateway log buffer",
      icon: "receipt_long",
      category: "System",
      action: () => navigateTo("consolelog"),
    },
    {
      id: "tunnel",
      label: "Tunnel & Daemon",
      description: "View configured public endpoint details and CLI lifecycle guidance",
      icon: "cloud",
      category: "System",
      action: () => navigateTo("tunnel"),
    },
    {
      id: "profile",
      label: "Profile & Settings",
      description: "Browser-scoped dashboard key, SQLite diagnostics, backup, and maintenance",
      icon: "settings",
      category: "System",
      action: () => navigateTo("profile"),
    },
    {
      id: "copy-baseurl",
      label: "Copy OpenAI Base URL",
      description: "Copy the API base URL for this dashboard origin",
      icon: "content_copy",
      category: "Actions",
      action: copyBaseUrl,
    },
  ];

  let filteredItems = $derived.by(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;

    return items.filter((item) =>
      item.label.toLowerCase().includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery) ||
      item.category.toLowerCase().includes(normalizedQuery)
    );
  });

  $effect(() => {
    if (!isOpen) return;

    query = "";
    activeIndex = 0;
    requestAnimationFrame(() => inputEl?.focus());
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      isOpen = false;
      return;
    }

    const resultCount = filteredItems.length;
    if (resultCount === 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter") {
        event.preventDefault();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % resultCount;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + resultCount) % resultCount;
    } else if (event.key === "Enter") {
      event.preventDefault();
      filteredItems[activeIndex]?.action();
    }
  }
</script>

<Modal bind:isOpen size="lg" title="Command Palette" icon="search" showTrafficLights={false}>
  <div class="space-y-4">
    <div class="relative">
      <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted text-[20px]">
        search
      </span>
      <input
        bind:this={inputEl}
        bind:value={query}
        oninput={() => (activeIndex = 0)}
        onkeydown={handleKeydown}
        type="text"
        placeholder="Search implemented pages and actions…"
        aria-label="Search commands and pages"
        aria-controls="command-palette-results"
        aria-activedescendant={filteredItems[activeIndex] ? `command-option-${filteredItems[activeIndex].id}` : undefined}
        class="w-full pl-11 pr-4 py-2.5 rounded-[10px] bg-bg border border-border text-sm text-text-main placeholder:text-text-subtle focus:outline-hidden focus:border-brand-500 transition-colors"
      />
      <div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-mono text-text-subtle bg-surface-2 px-1.5 py-0.5 rounded border border-border-subtle">
        <span>ESC</span>
      </div>
    </div>

    <div
      id="command-palette-results"
      role="listbox"
      aria-label="Command palette results"
      class="max-h-[360px] overflow-y-auto space-y-1 divide-y divide-border-subtle/40 pr-1"
    >
      {#if filteredItems.length === 0}
        <div class="py-8 text-center text-text-muted text-sm" role="status">
          No implemented pages or actions match this search.
        </div>
      {:else}
        {#each filteredItems as item, index (item.id)}
          {@const isSelected = activeIndex === index}
          <button
            id={`command-option-${item.id}`}
            type="button"
            role="option"
            aria-selected={isSelected}
            onmouseenter={() => (activeIndex = index)}
            onclick={() => item.action()}
            class="w-full flex items-center justify-between p-3 rounded-[10px] text-sm text-left transition-colors {isSelected
              ? 'bg-brand-500/10 text-brand-500 border border-brand-500/30 font-medium'
              : 'text-text-muted hover:text-text-main hover:bg-surface-2 border border-transparent'}"
          >
            <span class="flex items-center gap-3 min-w-0">
              <span class="material-symbols-outlined text-[20px] shrink-0 {isSelected ? 'text-brand-500' : 'text-text-subtle'}">
                {item.icon}
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-medium text-text-main truncate">{item.label}</span>
                <span class="block text-xs text-text-muted truncate">{item.description}</span>
              </span>
            </span>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-2 text-text-subtle shrink-0">
              {item.category}
            </span>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</Modal>
