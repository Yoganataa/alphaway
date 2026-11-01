<script lang="ts">
  import { notifications, type NotificationType } from "../notifications";

  function toastStyle(type: NotificationType): { wrapper: string; icon: string; iconColor: string } {
    if (type === "success") {
      return {
        wrapper: "border-emerald-500/30 bg-surface text-text-main shadow-lg",
        icon: "check_circle",
        iconColor: "text-emerald-500",
      };
    }
    if (type === "error") {
      return {
        wrapper: "border-red-500/30 bg-surface text-text-main shadow-lg",
        icon: "error",
        iconColor: "text-red-500",
      };
    }
    if (type === "warning") {
      return {
        wrapper: "border-amber-500/30 bg-surface text-text-main shadow-lg",
        icon: "warning",
        iconColor: "text-amber-500",
      };
    }
    return {
      wrapper: "border-brand-500/30 bg-surface text-text-main shadow-lg",
      icon: "info",
      iconColor: "text-brand-500",
    };
  }
</script>

<div class="fixed top-4 right-4 z-[999] flex w-[min(92vw,360px)] flex-col gap-2.5 pointer-events-none">
  {#each $notifications as n (n.id)}
    {@const style = toastStyle(n.type)}
    <div class="pointer-events-auto rounded-[10px] border px-3.5 py-2.5 backdrop-blur-[2px] transition-all duration-150 animate-in fade-in slide-in-from-top-2 {style.wrapper}">
      <div class="flex items-start gap-2.5">
        <span class="material-symbols-outlined text-[18px] leading-5 shrink-0 {style.iconColor}">{style.icon}</span>
        <div class="min-w-0 flex-1">
          {#if n.title}<p class="text-xs font-semibold mb-0.5 tracking-tight text-text-main">{n.title}</p>{/if}
          <p class="text-xs text-text-muted whitespace-pre-wrap break-words">{n.message}</p>
        </div>
        {#if n.dismissible}
          <button
            type="button"
            onclick={() => notifications.removeNotification(n.id)}
            class="text-text-muted hover:text-text-main p-0.5 rounded cursor-pointer transition-colors"
            aria-label="Dismiss notification"
          >
            <span class="material-symbols-outlined text-[16px]">close</span>
          </button>
        {/if}
      </div>
    </div>
  {/each}
</div>
