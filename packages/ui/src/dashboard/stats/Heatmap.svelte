<script lang="ts">
  import { type Heatmap, dayKey } from '@pocket-career/core';

  let { heatmap, now = Date.now() }: { heatmap: Heatmap; now?: number } = $props();

  const CELL = 11;
  const GAP = 3;
  const STEP = CELL + GAP;
  const LEFT = 30; // weekday labels
  const TOP = 18; // month labels

  const width = $derived(LEFT + heatmap.weeks.length * STEP - GAP);
  const height = TOP + 7 * STEP - GAP;
  const todayKey = $derived(dayKey(now));

  const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'short' });
  const dayFormat = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

  /** A month label over the first column that contains the 1st of that month. */
  const months = $derived(
    heatmap.weeks.flatMap((week, i) => {
      const first = week.find((d) => new Date(d.date).getDate() === 1);
      // Skip a label too close to the right edge to fit.
      if (!first || i > heatmap.weeks.length - 2) return [];
      return [{ x: LEFT + i * STEP, label: monthFormat.format(first.date) }];
    }),
  );

  /** Label rows 1, 3 and 5 (Tue/Thu/Sat with Monday-first weeks), like GitHub. */
  const weekdays = $derived(
    [1, 3, 5].map((row) => ({
      y: TOP + row * STEP + CELL / 2,
      label: weekdayFormat.format(heatmap.weeks[0]?.[row]?.date ?? 0),
    })),
  );

  // Level 0 is the empty cell; 1–4 deepen the accent colour.
  const OPACITY = [1, 0.3, 0.5, 0.75, 1] as const;

  const describe = (count: number, date: number) =>
    `${count === 0 ? 'No' : count} application${count === 1 ? '' : 's'} on ${dayFormat.format(date)}`;
</script>

<div class="overflow-x-auto pb-1">
  <svg
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    role="img"
    aria-label="{heatmap.total} applications in the last 12 months"
    class="block"
  >
    {#each months as month (month.x)}
      <text x={month.x} y={TOP - 7} class="fill-ink-muted text-[10px]">{month.label}</text>
    {/each}
    {#each weekdays as weekday (weekday.y)}
      <text x={0} y={weekday.y} dominant-baseline="middle" class="fill-ink-muted text-[10px]">
        {weekday.label}
      </text>
    {/each}
    {#each heatmap.weeks as week, w (week[0]?.key)}
      {#each week as day, d (day.key)}
        {#if !day.future}
          <rect
            x={LEFT + w * STEP}
            y={TOP + d * STEP}
            width={CELL}
            height={CELL}
            rx="2"
            fill={day.level === 0 ? 'var(--color-surface-muted)' : 'var(--color-accent)'}
            fill-opacity={OPACITY[day.level]}
            stroke={day.key === todayKey ? 'var(--color-ink-muted)' : 'none'}
            stroke-width="1"
          >
            <title>{describe(day.count, day.date)}</title>
          </rect>
        {/if}
      {/each}
    {/each}
  </svg>
</div>

<div class="text-ink-muted mt-2 flex items-center justify-between gap-4 text-xs">
  <span>{heatmap.total} applications in the last 12 months</span>
  <span class="flex items-center gap-1" aria-hidden="true">
    Less
    {#each [0, 1, 2, 3, 4] as level (level)}
      <svg width={CELL} height={CELL}>
        <rect
          width={CELL}
          height={CELL}
          rx="2"
          fill={level === 0 ? 'var(--color-surface-muted)' : 'var(--color-accent)'}
          fill-opacity={OPACITY[level as 0 | 1 | 2 | 3 | 4]}
        />
      </svg>
    {/each}
    More
  </span>
</div>
