<script lang="ts">
  import {
    type Goals,
    type Job,
    type Settings,
    WEEK_START_INDEX,
    applicationFunnel,
    applicationHeatmap,
    applicationStreak,
    breakdownBy,
    goalProgress,
  } from '@applicliq/core';
  import { slide } from '../../motion';
  import { WORK_TYPE_LABELS } from '../../status';
  import Breakdown from './Breakdown.svelte';
  import Funnel from './Funnel.svelte';
  import GoalsForm from './GoalsForm.svelte';
  import Heatmap from './Heatmap.svelte';
  import ProgressRing from './ProgressRing.svelte';
  import StreakCard from './StreakCard.svelte';

  let {
    jobs,
    settings,
    onsavegoals,
  }: {
    jobs: Job[];
    /** Undefined until settings have loaded. */
    settings?: Settings;
    onsavegoals: (goals: Goals) => Promise<void>;
  } = $props();

  // Recomputed whenever the jobs change; `now` refreshes with them.
  const now = $derived((void jobs, Date.now()));
  const goals = $derived(settings?.goals);
  const weekStartsOn = $derived(WEEK_START_INDEX[goals?.weekStartsOn ?? 'mon']);
  const progress = $derived(
    goals && goalProgress(jobs, goals, now, weekStartsOn, goals.countStatuses),
  );
  const streak = $derived(goals && applicationStreak(jobs, goals.daily, now, goals.countStatuses));
  const heatmap = $derived(
    applicationHeatmap(jobs, now, { weekStartsOn, countStatuses: goals?.countStatuses }),
  );
  const funnel = $derived(applicationFunnel(jobs));
  const bySource = $derived(breakdownBy(jobs, 'source'));
  const byWorkType = $derived(breakdownBy(jobs, 'workType'));

  let editing = $state(false);

  async function save(next: Goals) {
    await onsavegoals(next);
    editing = false;
  }

  const card = 'border-line bg-surface rounded-lg border p-4';
  const heading = 'text-sm font-semibold';
</script>

<div class="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-2">
  <section class="{card} lg:col-span-2" aria-labelledby="goals-heading">
    <div class="mb-4 flex items-center justify-between gap-3">
      <h2 id="goals-heading" class={heading}>Goals</h2>
      {#if goals && !editing}
        <button
          type="button"
          onclick={() => (editing = true)}
          class="text-accent focus-visible:ring-accent rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          Edit goals
        </button>
      {/if}
    </div>

    {#if editing && goals}
      <div transition:slide={{ duration: 150 }} class="mb-5">
        <GoalsForm {goals} onsave={save} oncancel={() => (editing = false)} />
      </div>
    {/if}

    {#if progress && streak && goals}
      <div class="flex flex-wrap items-center justify-around gap-6">
        <ProgressRing label="Today" count={progress.daily.count} goal={progress.daily.goal} />
        <ProgressRing label="This week" count={progress.weekly.count} goal={progress.weekly.goal} />
        <ProgressRing
          label="This month"
          count={progress.monthly.count}
          goal={progress.monthly.goal}
        />
        <div
          class="border-line w-full border-t pt-4 sm:w-auto sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6"
        >
          <StreakCard {streak} dailyGoal={goals.daily ?? 0} todayCount={progress.daily.count} />
        </div>
      </div>
    {:else}
      <div class="bg-surface-muted h-28 animate-pulse rounded-md" aria-label="Loading goals"></div>
    {/if}
  </section>

  <section class="{card} lg:col-span-2" aria-labelledby="activity-heading">
    <h2 id="activity-heading" class="{heading} mb-3">Applications per day</h2>
    <Heatmap {heatmap} {now} />
  </section>

  <section class={card} aria-labelledby="funnel-heading">
    <h2 id="funnel-heading" class="{heading} mb-3">Funnel</h2>
    <Funnel {funnel} />
  </section>

  <section class="{card} space-y-6" aria-label="Breakdowns">
    {#if jobs.length}
      <Breakdown title="Source" rows={bySource} />
      <Breakdown
        title="Work type"
        rows={byWorkType}
        labelFor={(key) =>
          key ? (WORK_TYPE_LABELS[key as keyof typeof WORK_TYPE_LABELS] ?? key) : 'Not set'}
      />
    {:else}
      <p class="text-ink-muted text-sm">Breakdowns appear once you've saved some jobs.</p>
    {/if}
  </section>
</div>
