/**
 * Svelte action to portal an element to document.body or a target selector.
 */
export function portal(node: HTMLElement, target: HTMLElement | string = "body") {
  let targetEl: HTMLElement | null;

  function update(newTarget: HTMLElement | string) {
    if (typeof newTarget === "string") {
      targetEl = document.querySelector(newTarget);
    } else {
      targetEl = newTarget;
    }
    if (targetEl) {
      targetEl.appendChild(node);
      node.hidden = false;
    }
  }

  function destroy() {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  update(target);

  return {
    update,
    destroy,
  };
}
