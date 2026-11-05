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

  let dialogElement: HTMLDivElement | null = null;
  let lastFocusedElement: HTMLElement | null = null;

  const focusableSelector = [
    "a[href]:not([tabindex^='-'])",
    "area[href]:not([tabindex^='-'])",
    "input:not([type='hidden']):not([disabled]):not([tabindex^='-'])",
    "select:not([disabled]):not([tabindex^='-'])",
    "textarea:not([disabled]):not([tabindex^='-'])",
    "button:not([disabled]):not([tabindex^='-'])",
    "iframe:not([tabindex^='-'])",
    "object:not([tabindex^='-'])",
    "embed:not([tabindex^='-'])",
    "[contenteditable='true']:not([tabindex^='-'])",
    "[tabindex]:not([tabindex^='-'])",
  ].join(", ");

  function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
    return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
      if (element.matches(":disabled") || element.closest("[hidden], [inert], [aria-hidden='true']")) {
        return false;
      }
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    });
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key !== "Tab" || !dialogElement) return;

    const dialog = dialogElement;
    const focusableElements = getFocusableElements(dialog);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && (activeElement === dialog || activeElement === first)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (activeElement === dialog || activeElement === last)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    full: "max-w-4xl",
  };

  // Track the last meaningful focus target while this Modal consumer is mounted.
  // Portaling the dialog can make document.activeElement unreliable during open.
  $effect(() => {
    if (typeof document === "undefined") return;

    const recordFocus = (event: FocusEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target !== document.body &&
        target !== document.documentElement
      ) {
        lastFocusedElement = target;
      }
    };

    document.addEventListener("focusin", recordFocus, true);
    return () => document.removeEventListener("focusin", recordFocus, true);
  });

  // Lock background scroll while modal is open
  $effect(() => {
    if (!isOpen || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  });

  // Move focus into the dialog and restore it to the invoker when the dialog closes.
  // A child component may schedule its own initial focus (for example, Command Palette search),
  // so only focus the dialog container when focus has not already moved inside it.
  $effect(() => {
    if (!isOpen || typeof document === "undefined") return;

    const activeElement = document.activeElement;
    const previouslyFocused =
      activeElement instanceof HTMLElement &&
      activeElement !== document.body &&
      activeElement !== document.documentElement
        ? activeElement
        : lastFocusedElement;
    const focusFrame = requestAnimationFrame(() => {
      const dialog = dialogElement;
      const activeElement = document.activeElement;
      if (dialog && (!activeElement || !dialog.contains(activeElement))) {
        dialog.focus({ preventScroll: true });
      }
    });

    return () => {
      cancelAnimationFrame(focusFrame);
      if (!previouslyFocused?.isConnected) return;
      requestAnimationFrame(() => {
        if (previouslyFocused.isConnected) previouslyFocused.focus({ preventScroll: true });
      });
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
      bind:this={dialogElement}
      class="relative w-full {sizes[size]} bg-surface border border-border rounded-[14px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10 animate-in fade-in zoom-in-95 duration-150 {klass}"
      role="dialog"
      aria-modal="true"
      aria-label={title || undefined}
      tabindex="-1"
      onkeydown={handleDialogKeydown}
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
