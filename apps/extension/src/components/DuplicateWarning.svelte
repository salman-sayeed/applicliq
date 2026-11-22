<script lang="ts">
  import {
    type Job,
    type RecentApplication,
    daysAgoLabel,
    mostRecentApplication,
  } from '@career-pocket/core';
  import { slide } from '@career-pocket/ui';
  import { repo } from '@/lib/db';

  let { company }: { company: string } = $props();

  let applied = $state<RecentApplication>();
  let others = $state<Job[]>([]);

  $effect(() => {
    const name = company.trim();
    let cancelled = false;
    // Debounced so typing a company name doesn't query on every keystroke.
    const timer = setTimeout(async () => {
      const jobs = name ? await repo.findSameCompany(name) : [];
      if (cancelled) return;
      others = jobs;
      applied = mostRecentApplication(jobs);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });
</script>

{#if applied}
  <div
    transition:slide={{ duration: 150 }}
    role="status"
    class="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300"
  >
    <p class="font-medium">
      You applied to {applied.job.company}
      {daysAgoLabel(applied.days)}
    </p>
    <p class="truncate opacity-80">{applied.job.title}</p>
  </div>
{:else if others.length}
  <p transition:slide={{ duration: 150 }} class="text-ink-muted mt-1.5 text-xs">
    You've saved {others.length} other {others.length === 1 ? 'job' : 'jobs'} at {others[0]!
      .company}.
  </p>
{/if}
