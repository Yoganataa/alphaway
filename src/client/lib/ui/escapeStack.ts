export type EscapeHandler = () => void;

interface KeydownTarget {
  addEventListener(type: "keydown", listener: (e: KeyboardEvent) => void): void;
  removeEventListener(type: "keydown", listener: (e: KeyboardEvent) => void): void;
}

export interface EscapeStack {
  push(handler: EscapeHandler): () => void;
}

export function createEscapeStack(target: KeydownTarget): EscapeStack {
  const handlers: EscapeHandler[] = [];

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || handlers.length === 0) return;
    handlers[handlers.length - 1]();
  };

  return {
    push(handler) {
      if (handlers.length === 0) target.addEventListener("keydown", onKeydown);
      handlers.push(handler);
      return () => {
        const i = handlers.lastIndexOf(handler);
        if (i === -1) return;
        handlers.splice(i, 1);
        if (handlers.length === 0) target.removeEventListener("keydown", onKeydown);
      };
    },
  };
}

let shared: EscapeStack | null = null;

export function pushEscapeHandler(handler: EscapeHandler): () => void {
  if (typeof document === "undefined") return () => {};
  shared ??= createEscapeStack(document);
  return shared.push(handler);
}
