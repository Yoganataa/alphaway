<script lang="ts">
  import Modal from "./Modal.svelte";
  import Button from "./Button.svelte";

  let {
    isOpen = false,
    title = "Confirm Action",
    message = "Are you sure you want to proceed?",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
    onConfirm,
    onClose,
  }: {
    isOpen?: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm?: () => void;
    onClose?: () => void;
  } = $props();
</script>

<Modal {isOpen} {onClose} {title} size="sm" icon={danger ? "warning" : "help"}>
  <p class="text-text-muted text-sm leading-relaxed">{message}</p>

  {#snippet footer()}
    <Button variant="secondary" size="sm" onclick={onClose}>{cancelLabel}</Button>
    <Button
      variant={danger ? "danger" : "primary"}
      size="sm"
      onclick={() => {
        onConfirm?.();
        onClose?.();
      }}
    >
      {confirmLabel}
    </Button>
  {/snippet}
</Modal>
