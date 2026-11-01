<script lang="ts">
  import type { Snippet } from "svelte";
  import { pushEscapeHandler } from "./escapeStack";
  import { portal } from "./portal";

  let {
    isOpen = false,
    onClose,
    title = "",
    icon = "",
    size = "md",
    closeOnOverlay = true,
    showTrafficLights = true,
    class: klass = "",
    children,
    footer,
  }: {
    isOpen?: boolean;
    onClose?: () => void;
    title?: string;
    icon?: string;
    size?: "sm" | "md" | "lg" | "xl" | "full";
    closeOnOverlay?: boolean;
    showTrafficLights?: boolean;
    class?: string;
    children?: Snippet;
    footer?: Snippet;
  } = $props();

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    full: "max-w-4xl",
  };

  // Lock background scroll while modal is open
  $effect(() => {
    if (!isOpen || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  });

  // Escape closes only topmost dialog
  $effect(() => {
    if (!isOpen) return;
    return pushEscapeHandler(() => onClose?.());
  });
</script>

{#if isOpen}
  <div use:portal class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Overlay backdrop with subtle 2px blur cap (Anti-slop compliant) -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-150"
      onclick={() => closeOnOverlay && onClose?.()}
    ></div>

    <!-- Modal Box -->
    <div
      class="relative w-full {sizes[size]} bg-surface border border-border rounded-[14px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10 animate-in fade-in zoom-in-95 duration-150 {klass}"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <!-- Modal Header -->
      <div class="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-2/40">
        <div class="flex items-center gap-3">
          {#if showTrafficLights}
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onclick={() => onClose?.()}
                aria-label="Close dialog"
                class="w-2.5 h-2.5 rounded-full bg-[#FF5F56] hover:opacity-80 transition-opacity cursor-pointer"
              ></button>
              <div class="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] opacity-60"></div>
              <div class="w-2.5 h-2.5 rounded-full bg-[#27C93F] opacity-60"></div>
            </div>
          {/if}

          <div class="flex items-center gap-2">
            {#if icon}
              <span class="material-symbols-outlined text-brand-500 text-[18px]">{icon}</span>
            {/if}
            {#if title}
              <h2 class="text-sm font-semibold text-text-main tracking-tight">{title}</h2>
            {/if}
          </div>
        </div>

        <button
          type="button"
          onclick={() => onClose?.()}
          aria-label="Close modal"
          class="text-text-muted hover:text-text-main p-1 rounded-md hover:bg-surface-2 transition-colors cursor-pointer"
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-5 overflow-y-auto flex-1 text-sm text-text-main">
        {@render children?.()}
      </div>

      <!-- Modal Footer -->
      {#if footer}
        <div class="px-5 py-3.5 border-t border-border-subtle bg-surface-2/30 flex items-center justify-end gap-2.5">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
