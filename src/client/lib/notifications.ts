import { writable } from "svelte/store";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface Notification {
  id: number;
  type: NotificationType;
  message: string;
  title?: string | null;
  duration: number;
  dismissible: boolean;
}

let idCounter = 0;

function createNotificationStore() {
  const { subscribe, update } = writable<Notification[]>([]);

  function removeNotification(id: number) {
    update((list) => list.filter((n) => n.id !== id));
  }

  function addNotification(opts: {
    type?: NotificationType;
    message: string;
    title?: string | null;
    duration?: number;
    dismissible?: boolean;
  }): number {
    const id = ++idCounter;
    const entry: Notification = {
      id,
      type: opts.type || "info",
      message: opts.message,
      title: opts.title || null,
      duration: opts.duration ?? 4000,
      dismissible: opts.dismissible ?? true,
    };
    update((list) => [...list, entry]);
    if (entry.duration > 0) {
      setTimeout(() => removeNotification(id), entry.duration);
    }
    return id;
  }

  return {
    subscribe,
    addNotification,
    removeNotification,
    success: (message: string, title?: string) => addNotification({ type: "success", message, title }),
    error: (message: string, title?: string) => addNotification({ type: "error", message, title }),
    warning: (message: string, title?: string) => addNotification({ type: "warning", message, title }),
    info: (message: string, title?: string) => addNotification({ type: "info", message, title }),
  };
}

export const notifications = createNotificationStore();
