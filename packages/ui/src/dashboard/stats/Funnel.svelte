<script lang="ts">
  import type { Funnel } from '@applicliq/core';
  import { percent } from './percent';

  let { funnel }: { funnel: Funnel } = $props();

  const stages = $derived([
    { label: 'Applied', count: funnel.applied, color: 'bg-status-applied' },
    {
      label: 'Interview',
      count: funnel.interview,
      color: 'bg-status-interview',
      rate: funnel.interviewRate,
    },
    { label: 'Offer', count: funnel.offer, color: 'bg-status-offer', rate: funnel.offerRate },
  ]);
  const width = (count: number) =>
    funnel.applied ? Math.max(2, (count / funnel.applied) * 100) : 0;
</script>

{#if funnel.applied === 0}
  <p class="text-ink-muted text-sm">Mark jobs as applied to see how far they get.</p>
{:else}
  <ol class="space-y-1">
    {#each stages as stage, i (stage.label)}
      {#if i > 0}
        <li class="text-ink-muted flex items-center gap-1.5 py-0.5 pl-1 text-xs" aria-hidden="true">
          <span>↓</span>
          <span class="tabular-nums">{percent(stage.rate)}</span>
          <span>of {stages[i - 1]!.label.toLowerCase()}</span>
        </li>
      {/if}
      <li class="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3 text-sm">
        <span class="font-medium">{stage.label}</span>
        <span class="bg-surface-muted h-6 overflow-hidden rounded">
          <span
            class="block h-full rounded {stage.color} transition-[width]"
            style:width="{width(stage.count)}%"
          ></span>
        </span>
        <span class="text-right font-semibold tabular-nums">{stage.count}</span>
        {#if i > 0}
          <span class="sr-only">
            ({percent(stage.rate)} of {stages[i - 1]!.label.toLowerCase()})
          </span>
        {/if}
      </li>
    {/each}
  </ol>
  <p class="text-ink-muted mt-3 text-xs">
    {percent(funnel.overallRate)} of applications led to an offer.
  </p>
{/if}
