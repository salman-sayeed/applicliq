<script lang="ts">
  import {
    type Job,
    MIN_REPLY_SAMPLES,
    type Settings,
    overallResponse,
    replyTimes,
    responseStatsBy,
    sourceName,
  } from '@applicliq/core';
  import { WORK_TYPE_LABELS } from '../../status';
  import { percent } from '../stats/percent';
  import RateBars from './RateBars.svelte';
  import ShareCard from './ShareCard.svelte';

  /**
   * The Insights tab: where replies come from, how long they take, and a card to share. Loaded on
   * demand, so the rest of the dashboard (and the popup) stay small.
   */
  let { jobs, settings, logoUrl }: { jobs: Job[]; settings?: Settings; logoUrl?: string } =
    $props();

  const overall = $derived(overallResponse(jobs));
  const bySource = $derived(responseStatsBy(jobs, 'source'));
  const byWorkType = $derived(responseStatsBy(jobs, 'workType'));
  const replies = $derived(replyTimes(jobs));
  const maxMedian = $derived(Math.max(1, ...replies.bySource.map((r) => r.medianDays ?? 0)));

  const sourceLabel = (key: string | undefined) =>
    key ? sourceName({ source: key, url: '' }) : 'No source';
  const workTypeLabel = (key: string | undefined) =>
    key ? (WORK_TYPE_LABELS[key as keyof typeof WORK_TYPE_LABELS] ?? key) : 'Not set';
  const days = (value: number | undefined) =>
    value === undefined ? '—' : value < 1 ? 'under a day' : `${Math.round(value)} days`;

  const card = 'border-line bg-surface rounded-lg border p-4';
  const heading = 'text-sm font-semibold';
</script>

<div class="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-2">
  <section class="{card} lg:col-span-2" aria-labelledby="overall-heading">
    <h2 id="overall-heading" class="{heading} mb-3">All applications</h2>
    <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {#each [['Applied', String(overall.applied)], ['Response rate', percent(overall.responseRate)], ['Interview rate', percent(overall.interviewRate)], ['Offer rate', percent(overall.offerRate)]] as [label, value] (label)}
        <div class="bg-surface-muted/60 rounded-md px-3 py-2">
          <dt class="text-ink-muted text-xs">{label}</dt>
          <dd class="text-xl font-semibold tabular-nums">{value}</dd>
        </div>
      {/each}
    </dl>
    <p class="text-ink-muted mt-3 text-xs leading-relaxed">
      A response is any reply after applying: an assessment, an interview, an offer or a rejection.
      Ghosted and withdrawn applications don't count. Imported applications are included.
      {#if !overall.enoughData}Rates get meaningful after a few more applications.{/if}
    </p>
  </section>

  <section class={card}>
    <RateBars title="By source" rows={bySource} labelFor={sourceLabel} />
  </section>
  <section class={card}>
    <RateBars title="By work type" rows={byWorkType} labelFor={workTypeLabel} />
  </section>

  <section class="{card} lg:col-span-2" aria-labelledby="reply-heading">
    <h2 id="reply-heading" class={heading}>Reply time</h2>
    <p class="mt-2 text-sm">
      {#if replies.overall.samples === 0}
        No replies yet.
      {:else}
        Median: <strong class="tabular-nums">{days(replies.overall.medianDays)}</strong>
        <span class="text-ink-muted">
          from {replies.overall.samples}
          {replies.overall.samples === 1 ? 'reply' : 'replies'}
        </span>
      {/if}
    </p>
    {#if replies.bySource.length}
      <ul class="mt-3 space-y-2">
        {#each replies.bySource as row (row.key ?? '')}
          <li class="grid grid-cols-[8rem_1fr_6rem] items-center gap-2 text-sm">
            <span class="truncate">{sourceLabel(row.key)}</span>
            {#if row.enoughData}
              <span class="bg-surface-muted h-2 overflow-hidden rounded-full">
                <span
                  class="bg-accent block h-full rounded-full"
                  style:width="{((row.medianDays ?? 0) / maxMedian) * 100}%"
                ></span>
              </span>
              <span class="text-right tabular-nums">{days(row.medianDays)}</span>
            {:else}
              <span class="text-ink-muted col-span-2 text-xs">
                Not enough data ({row.samples} of {MIN_REPLY_SAMPLES} replies)
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <p class="text-ink-muted mt-3 text-xs leading-relaxed">
      How it's worked out: for each job, the days from when you marked it applied to the first reply
      after that. The median is the middle value, so one very slow reply doesn't skew it. Replies
      that came in through an import don't count, since the file didn't say when they happened.
    </p>
  </section>

  <section class="{card} lg:col-span-2" aria-labelledby="share-heading">
    <h2 id="share-heading" class="{heading} mb-3">Share your progress</h2>
    {#if settings}
      <ShareCard {jobs} {settings} {logoUrl} />
    {/if}
  </section>
</div>
