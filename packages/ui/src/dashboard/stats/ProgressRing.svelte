<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { Tween, prefersReducedMotion } from 'svelte/motion';

  let {
    label,
    count,
    goal,
  }: {
    label: string;
    count: number;
    /** 0 = goal turned off. */
    goal: number;
  } = $props();

  const SIZE = 104;
  const STROKE = 9;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const off = $derived(goal <= 0);
  const met = $derived(!off && count >= goal);
  const target = $derived(off ? 0 : Math.min(count / goal, 1));

  // Fills from empty on first render, then glides between values; under 200ms, and instant
  // with reduced motion.
  const progress = new Tween(0, { duration: 180, easing: cubicOut });
  $effect(() => {
    void progress.set(target, { duration: prefersReducedMotion.current ? 0 : 180 });
  });
</script>

<div
  class="flex flex-col items-center gap-2"
  role="progressbar"
  aria-label="{label} applications"
  aria-valuemin={0}
  aria-valuemax={off ? undefined : goal}
  aria-valuenow={count}
  aria-valuetext={off ? `${count} sent, no goal set` : `${count} of ${goal}`}
>
  <svg width={SIZE} height={SIZE} viewBox="0 0 {SIZE} {SIZE}" class="block" aria-hidden="true">
    <circle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={RADIUS}
      fill="none"
      stroke="var(--color-surface-muted)"
      stroke-width={STROKE}
    />
    <circle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={RADIUS}
      fill="none"
      stroke={met ? 'var(--color-status-offer)' : 'var(--color-accent)'}
      stroke-width={STROKE}
      stroke-linecap="round"
      stroke-dasharray={CIRCUMFERENCE}
      stroke-dashoffset={CIRCUMFERENCE * (1 - progress.current)}
      transform="rotate(-90 {SIZE / 2} {SIZE / 2})"
      opacity={progress.current > 0.001 ? 1 : 0}
    />
    <text
      x="50%"
      y="47%"
      text-anchor="middle"
      dominant-baseline="middle"
      class="fill-ink text-2xl font-semibold tabular-nums"
    >
      {count}
    </text>
    <text
      x="50%"
      y="68%"
      text-anchor="middle"
      dominant-baseline="middle"
      class="fill-ink-muted text-[11px]"
    >
      {off ? 'no goal' : met ? 'goal met ✓' : `of ${goal}`}
    </text>
  </svg>
  <span class="text-ink-muted text-sm font-medium">{label}</span>
</div>
