<script lang="ts">
  let theme = $state<"light" | "dark">("dark");

  $effect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("alphaway-theme") || localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") {
        theme = stored;
      } else {
        theme = document.documentElement.classList.contains("dark") ? "dark" : "dark";
      }
      apply(theme);
    }
  });

  function apply(t: "light" | "dark") {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.classList.toggle("light", t === "light");
    localStorage.setItem("alphaway-theme", t);
  }

  function toggle() {
    theme = theme === "dark" ? "light" : "dark";
    apply(theme);
  }
</script>

<button
  type="button"
  onclick={toggle}
  class="w-8 h-8 rounded-[8px] flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface-2 border border-border-subtle transition-colors cursor-pointer"
  aria-label="Toggle theme"
  title="Toggle dark/light theme"
>
  {#if theme === "dark"}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-amber-400">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  {:else}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-slate-700">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  {/if}
</button>
