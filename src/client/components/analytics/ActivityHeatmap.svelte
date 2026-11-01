<script lang="ts">
  /**
   * Trailing Activity Heatmap ported from 9router-go.
   * Visualizes daily request frequency with GitHub-style contribution squares.
   */
  import { onMount } from "svelte";
  import { fetchActivityHeatmap } from "../../lib/api";
  import type { UsageDailyPoint } from "../../lib/types";

  let daily = $state<UsageDailyPoint[]>([]);
  let streak = $state<number>(0);
  let loading = $state(true);

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  onMount(async () => {
    try {
      const res = await fetchActivityHeatmap(84);
      daily = res.daily || [];
      streak = res.streak || 0;
    } catch {
      daily = [];
      streak = 0;
    } finally {
      loading = false;
    }
  });

  const byDate = $derived(new Map(daily.map((d) => [d.date, d])));
  const maxRequests = $derived(Math.max(1, ...daily.map((d) => d.requests)));

  interface Week {
    month: string;
    cells: (UsageDailyPoint | null)[];
  }

  const weeks = $derived.by((): Week[] => {
    if (daily.length === 0) return [];
    const keys = [...byDate.keys()].sort();
    const start = new Date(keys[0] + "T00:00:00Z");
    const end = new Date(keys[keys.length - 1] + "T00:00:00Z");
    // Walk back to Monday
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const out: Week[] = [];
    const cursor = new Date(start);
    let lastMonth = -1;

    function monthName(m: number): string {
      return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m];
    }

    while (cursor <= end) {
      const cells: (UsageDailyPoint | null)[] = [];
      let month = "";
      for (let dow = 0; dow < 7; dow++) {
        const key = cursor.toISOString().slice(0, 10);
        cells.push(byDate.get(key) || null);
        const m = cursor.getUTCMonth();
        if (m !== lastMonth) {
          if (month === "") month = monthName(m);
          lastMonth = m;
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      out.push({ month, cells });
    }
    return out;
  });

  function levelOf(p: UsageDailyPoint | null): number {
    if (!p || p.requests === 0) return 0;
    return Math.min(4, Math.ceil((p.requests / maxRequests) * 4));
  }

  const LEVEL_CLASS = [
    "bg-surface-2 border border-border-subtle/40",
    "bg-emerald-500/25 border border-emerald-500/30",
    "bg-emerald-500/50 border border-emerald-500/50",
    "bg-emerald-500/75 border border-emerald-500/70",
    "bg-emerald-500 border border-emerald-400",
  ];

  function tooltip(p: UsageDailyPoint | null): string {
    if (!p) return "No activity";
    return `${p.date}: ${p.requests.toLocaleString()} requests, ${p.tokens.toLocaleString()} tokens`;
  }
</script>

<div class="bg-surface border border-border-subtle rounded-[14px] p-5 shadow-[var(--shadow-soft)] flex flex-col gap-3">
  <div class="flex items-center justify-between pb-2 border-b border-border-subtle">
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px] text-brand-400">calendar_month</span>
      <h3 class="font-bold text-text-main text-sm">Activity Heatmap</h3>
    </div>
    <div class="flex items-center gap-2 text-xs font-mono">
      <span class="px-2 py-0.5 rounded bg-surface-2 border border-border-subtle text-text-main font-semibold">
        {streak > 0 ? `${streak}-Day Streak 🔥` : "No active streak"}
      </span>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-8 text-xs text-text-muted">
      <span class="material-symbols-outlined animate-spin text-[18px] mr-2 text-brand-400">progress_activity</span>
      Loading heatmap...
    </div>
  {:else if weeks.length === 0}
    <p class="py-6 text-center text-xs text-text-muted">No activity records found.</p>
  {:else}
    <div class="min-w-0 overflow-x-auto py-2">
      <div class="flex gap-[3.5px] min-w-max">
        <!-- Weekday Labels -->
        <div class="flex flex-col gap-[3.5px] pt-[15px] text-[9px] font-mono text-text-subtle w-7 shrink-0 select-none">
          {#each WEEKDAYS as wd, i}
            <div class="h-[12px] leading-[12px]">{i % 2 === 0 ? wd : ""}</div>
          {/each}
        </div>

        <!-- Weekly Columns -->
        {#each weeks as week}
          <div class="flex flex-col gap-[3.5px]">
            <div class="h-[12px] text-[9px] font-mono leading-[12px] text-text-subtle select-none whitespace-nowrap">
              {week.month}
            </div>
            {#each week.cells as cell}
              <div
                class="w-[12px] h-[12px] rounded-[2.5px] transition-transform hover:scale-125 hover:z-10 cursor-pointer {LEVEL_CLASS[levelOf(cell)]}"
                title={tooltip(cell)}
              ></div>
            {/each}
          </div>
        {/each}
      </div>
    </div>

    <!-- Heatmap Legend Footer -->
    <div class="flex items-center justify-between text-[11px] font-mono text-text-subtle pt-2 border-t border-border-subtle">
      <span>Trailing 12-week request cadence</span>
      <div class="flex items-center gap-1.5">
        <span>Less</span>
        {#each LEVEL_CLASS as cls}
          <span class="w-[10px] h-[10px] rounded-[2px] {cls}"></span>
        {/each}
        <span>More</span>
      </div>
    </div>
  {/if}
</div>
