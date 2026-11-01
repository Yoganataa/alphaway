<script lang="ts">
  /**
   * Native SVG Usage Trend Chart ported from 9router-go / 10router.
   * Renders multi-series stacked area trends without any external chart dependencies.
   */
  import { fetchUsageChart } from "../../lib/api";
  import type { ChartBucket } from "../../lib/types";

  interface Props {
    period?: string;
  }

  let { period = "7d" }: Props = $props();

  let buckets = $state<ChartBucket[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let hovered = $state<number | null>(null);
  let focusedPoint = $state(0);
  let tableOpen = $state(false);
  let hourly = $state(false);
  let viewMode = $state<"tokens" | "cost">("tokens");

  const WIDTH = 680;
  const HEIGHT = 200;
  const MAX_SERIES = 6;
  const FAMILY_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f43f5e", "#84cc16"];
  const OTHER_COLOR = "#64748b";

  function fmtTokens(n: number | undefined): string {
    if (!n) return "0";
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toLocaleString();
  }

  interface Series {
    family: string;
    color: string;
    total: number;
  }

  $effect(() => {
    const wanted = period;
    let cancelled = false;
    loading = true;
    failed = false;

    fetchUsageChart(wanted)
      .then((data) => {
        if (cancelled) return;
        buckets = Array.isArray(data) ? data : [];
        hourly = /^\d\d:\d\d$/.test(buckets[0]?.label || "");
        loading = false;
      })
      .catch(() => {
        if (cancelled) return;
        buckets = [];
        failed = true;
        loading = false;
      });

    return () => {
      cancelled = true;
    };
  });

  // Rank families by period total
  const families = $derived.by((): Series[] => {
    const totals = new Map<string, number>();
    for (const b of buckets) {
      for (const [family, tokens] of Object.entries(b.byModel || {})) {
        totals.set(family, (totals.get(family) || 0) + (tokens || 0));
      }
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const kept = ranked.slice(0, MAX_SERIES);
    const tail = ranked.slice(MAX_SERIES);
    const series: Series[] = kept.map(([family, total], i) => ({
      family,
      total,
      color: FAMILY_COLORS[i % FAMILY_COLORS.length],
    }));
    if (tail.length > 0) {
      series.push({
        family: "other",
        total: tail.reduce((sum, [, t]) => sum + t, 0),
        color: OTHER_COLOR,
      });
    }
    return series;
  });

  const keptFamilies = $derived(families.slice(0, MAX_SERIES).map((s) => s.family));

  // Per-bucket stack: cumulative height of each series
  const stack = $derived(
    buckets.map((b) => {
      const values = families.map((s) =>
        s.family === "other"
          ? Object.entries(b.byModel || {})
              .filter(([family]) => !keptFamilies.includes(family))
              .reduce((sum, [, t]) => sum + (t || 0), 0)
          : b.byModel?.[s.family] || 0
      );
      const cumulative: number[] = [];
      let acc = 0;
      for (const v of values) {
        acc += v;
        cumulative.push(acc);
      }
      return { bucket: b, cumulative, total: acc };
    })
  );

  const maxTotal = $derived(Math.max(1, ...stack.map((s) => s.total)));
  const hasData = $derived(stack.some((s) => s.total > 0));
  const step = $derived(buckets.length > 1 ? WIDTH / (buckets.length - 1) : WIDTH);

  function xAt(index: number): number {
    return buckets.length > 1 ? index * step : WIDTH / 2;
  }

  function yAt(value: number): number {
    return HEIGHT - (value / maxTotal) * (HEIGHT - 20) - 10;
  }

  function areaPath(band: number): string {
    if (stack.length === 0) return "";
    const top = stack.map((s, i) => `${xAt(i)},${yAt(s.cumulative[band] || 0)}`).join(" L ");
    const bottom = stack
      .map((s, i) => {
        const idx = stack.length - 1 - i;
        const lower = band === 0 ? 0 : s.cumulative[band - 1] || 0;
        return `${xAt(idx)},${yAt(lower)}`;
      })
      .join(" L ");
    return `M ${top} L ${bottom} Z`;
  }

  function handlePointKey(event: KeyboardEvent) {
    const index = focusedPoint;
    let next = index;
    if (event.key === "ArrowRight") next = index + 1;
    else if (event.key === "ArrowLeft") next = index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = stack.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      hovered = null;
      return;
    } else return;

    event.preventDefault();
    next = Math.max(0, Math.min(stack.length - 1, next));
    focusedPoint = next;
    hovered = next;
  }
</script>

<div class="bg-surface border border-border-subtle rounded-[14px] p-5 shadow-[var(--shadow-soft)] flex flex-col gap-4">
  <!-- Chart Header with Mode Toggle -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border-subtle">
    <div>
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px] text-brand-400">stacked_line_chart</span>
        <h3 class="font-bold text-text-main text-sm">Token Ingestion Trends</h3>
      </div>
      <p class="text-[11px] text-text-muted">
        {hourly ? "Hourly" : "Daily"} breakdown by model family · Period: <span class="uppercase font-mono font-bold text-text-main">{period}</span>
      </p>
    </div>

    <!-- Toggle Tokens / Est Cost -->
    <div class="flex items-center gap-1 bg-surface-2 p-0.5 rounded-[8px] border border-border-subtle self-start sm:self-auto">
      <button
        type="button"
        onclick={() => (viewMode = "tokens")}
        class="px-2.5 py-1 text-xs font-semibold rounded-[6px] transition-colors {viewMode === 'tokens' ? 'bg-surface text-brand-400 shadow-sm' : 'text-text-muted hover:text-text-main'}"
      >
        Tokens
      </button>
      <button
        type="button"
        onclick={() => (viewMode = "cost")}
        class="px-2.5 py-1 text-xs font-semibold rounded-[6px] transition-colors {viewMode === 'cost' ? 'bg-surface text-amber-400 shadow-sm' : 'text-text-muted hover:text-text-main'}"
      >
        Est. Value
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-16 text-text-muted text-xs">
      <span class="material-symbols-outlined animate-spin text-[20px] mr-2 text-brand-400">progress_activity</span>
      Computing usage series...
    </div>
  {:else if failed}
    <div class="py-12 text-center text-xs text-text-muted">
      Usage trends could not be loaded. Please refresh or try again.
    </div>
  {:else if !hasData}
    <div class="py-14 text-center text-xs text-text-muted flex flex-col items-center gap-2">
      <span class="material-symbols-outlined text-[28px] text-text-subtle">query_stats</span>
      <span>No request activity recorded in this period ({period}).</span>
      <span class="text-[11px] text-text-subtle">Send requests via Playground or OpenAI SDK to generate telemetry.</span>
    </div>
  {:else}
    <div class="relative min-w-0">
      <!-- Native SVG Graph -->
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        class="w-full h-auto overflow-visible select-none"
        role="img"
        aria-label="Usage trend chart"
      >
        <defs>
          <linearGradient id="chartGrid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.1" />
            <stop offset="100%" stop-color="currentColor" stop-opacity="0.0" />
          </linearGradient>
        </defs>

        <!-- Horizontal baseline grid -->
        <line x1="0" y1={HEIGHT - 10} x2={WIDTH} y2={HEIGHT - 10} stroke="currentColor" stroke-opacity="0.1" stroke-width="1" />
        <line x1="0" y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} stroke="currentColor" stroke-opacity="0.06" stroke-dasharray="4 4" stroke-width="1" />

        <!-- Area paths per family -->
        {#each families as s, band (s.family)}
          <path
            d={areaPath(band)}
            fill={s.color}
            fill-opacity="0.4"
            stroke={s.color}
            stroke-width="1.5"
            class="transition-opacity hover:fill-opacity-60"
          />
        {/each}

        <!-- Interactive invisible vertical slices for pointer events -->
        {#each stack as _point, i}
          <rect
            role="button"
            tabindex={i === focusedPoint ? 0 : -1}
            aria-label="{stack[i].bucket.label}: {fmtTokens(stack[i].bucket.tokens)} tokens"
            x={xAt(i) - step / 2}
            y="0"
            width={step}
            height={HEIGHT}
            fill="transparent"
            class="cursor-pointer focus:outline-none"
            onmouseenter={() => (hovered = i)}
            onmouseleave={() => (hovered = null)}
            onfocus={() => {
              focusedPoint = i;
              hovered = i;
            }}
            onblur={() => (hovered = null)}
            onkeydown={handlePointKey}
          />
        {/each}

        <!-- Hover Guideline -->
        {#if hovered !== null && stack[hovered]}
          <line
            x1={xAt(hovered)}
            x2={xAt(hovered)}
            y1="0"
            y2={HEIGHT - 10}
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="3 3"
            class="text-brand-400"
            opacity="0.75"
          />
          <circle
            cx={xAt(hovered)}
            cy={yAt(stack[hovered].total)}
            r="4"
            class="fill-brand-400 stroke-surface stroke-2"
          />
        {/if}
      </svg>

      <!-- Hover Tooltip Card -->
      {#if hovered !== null && stack[hovered]}
        <div
          role="status"
          aria-live="polite"
          class="mt-3 rounded-[10px] border border-border-subtle bg-surface-2 p-3 text-xs text-text-main shadow-lg max-w-sm"
        >
          <div class="flex items-center justify-between pb-1.5 border-b border-border-subtle">
            <span class="font-bold text-text-main">{stack[hovered].bucket.label}</span>
            <span class="font-mono text-[11px] text-text-muted">{period} window</span>
          </div>

          <div class="mt-2 space-y-1.5">
            <div class="flex items-center justify-between gap-4 font-mono">
              <span class="text-text-muted">Total Ingested:</span>
              <span class="font-bold text-brand-400">{fmtTokens(stack[hovered].bucket.tokens)} tokens</span>
            </div>
            <div class="flex items-center justify-between gap-4 font-mono">
              <span class="text-text-muted">Est. Saved:</span>
              <span class="font-bold text-amber-400">${(stack[hovered].bucket.cost ?? 0).toFixed(4)}</span>
            </div>

            {#if families.length > 0}
              <div class="pt-2 mt-2 border-t border-border-subtle/80 space-y-1">
                {#each families as s, band (s.family)}
                  {@const val = stack[hovered].cumulative[band] - (band > 0 ? stack[hovered].cumulative[band - 1] : 0)}
                  {#if val > 0}
                    <div class="flex items-center justify-between gap-3 text-[11px] font-mono">
                      <span class="flex items-center gap-1.5 truncate max-w-[160px]">
                        <span class="w-2 h-2 rounded-full shrink-0" style="background: {s.color}"></span>
                        <span class="truncate">{s.family}</span>
                      </span>
                      <span class="font-semibold text-text-main">{fmtTokens(val)}</span>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Chart Legend & Peak Indicator -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted pt-3 border-t border-border-subtle">
      {#each families as s (s.family)}
        <span class="flex items-center gap-1.5 font-mono text-[11px]">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background: {s.color}"></span>
          <span class="truncate max-w-[120px]">{s.family}</span>
        </span>
      {/each}
      <span class="ml-auto font-mono text-[11px] text-text-main font-semibold bg-surface-2 px-2 py-0.5 rounded border border-border-subtle">
        Peak: {fmtTokens(maxTotal)} tokens
      </span>
    </div>

    <!-- Axis Range Labels -->
    <div class="flex justify-between text-[11px] font-mono text-text-subtle">
      <span>{buckets[0]?.label || ""}</span>
      <span>{buckets[buckets.length - 1]?.label || ""}</span>
    </div>

    <!-- Accessible Collapsible Table Fallback -->
    <details class="text-xs text-text-muted" bind:open={tableOpen}>
      <summary class="cursor-pointer select-none font-semibold hover:text-text-main flex items-center gap-1">
        <span class="material-symbols-outlined text-[14px]">{tableOpen ? "expand_less" : "expand_more"}</span>
        <span>View raw data table</span>
      </summary>
      {#if tableOpen}
        <div class="mt-2 overflow-x-auto max-h-48">
          <table class="w-full border-collapse text-left text-xs" aria-label="Usage trend table">
            <thead>
              <tr class="border-b border-border-subtle text-text-subtle uppercase text-[10px]">
                <th scope="col" class="py-1.5 pr-2 font-medium">{hourly ? "Hour" : "Day"}</th>
                <th scope="col" class="py-1.5 pr-2 text-right font-medium">Tokens</th>
                <th scope="col" class="py-1.5 text-right font-medium">Est. Value</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-subtle/60 font-mono text-[11px]">
              {#each stack as point, i (i)}
                <tr class="hover:bg-surface-2/40">
                  <th scope="row" class="py-1 pr-2 font-normal text-text-main">{point.bucket.label}</th>
                  <td class="py-1 pr-2 text-right text-emerald-400 font-semibold">{fmtTokens(point.bucket.tokens)}</td>
                  <td class="py-1 text-right text-amber-400">${(point.bucket.cost ?? 0).toFixed(4)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </details>
  {/if}
</div>
