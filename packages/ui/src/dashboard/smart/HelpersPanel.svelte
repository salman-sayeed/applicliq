<script lang="ts">
  import {
    type DuplicatePair,
    type Job,
    duplicatePairs,
    hasOffer,
    jobsNeedingFollowUp,
    sourceName,
  } from '@applicliq/core';
  import { slide } from '../../motion';
  import { getPrefs } from '../../prefs.svelte';
  import { btnSmall, linkBtn } from './styles';

  /**
   * Above the job list: applications that need a follow-up, jobs that look saved twice, and the
   * offer comparison (each part only while its Smart helper is on).
   */
  let {
    jobs,
    onselect,
    onfollowup,
    onmerge,
    onnotduplicate,
    oncompare,
  }: {
    jobs: Job[];
    onselect: (id: string) => void;
    onfollowup: (id: string) => void;
    onmerge: (keep: Job, other: Job) => void;
    onnotduplicate: (pair: DuplicatePair) => void;
    oncompare: () => void;
  } = $props();

  const prefs = getPrefs();
  const helpers = $derived(prefs.settings.helpers);
  const on = $derived(prefs.feature('smartHelpers'));

  const now = $derived((void jobs, Date.now()));
  const followUps = $derived(
    on && helpers.followUps ? jobsNeedingFollowUp(jobs, helpers.followUpAfterDays, now) : [],
  );
  const duplicates = $derived(
    on && helpers.duplicates
      ? duplicatePairs(jobs, { notDuplicates: helpers.notDuplicatePairs })
      : [],
  );
  const offerCount = $derived(on && helpers.offers ? jobs.filter(hasOffer).length : 0);

  let open = $state<'followUps' | 'duplicates' | undefined>();
  const SHOWN = 8;

  const chip =
    'border-line hover:bg-surface-muted focus-visible:ring-accent inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition focus-visible:ring-2 focus-visible:outline-none';
  const count = 'bg-accent/15 text-accent rounded-full px-1.5 text-xs font-semibold tabular-nums';
</script>

{#if followUps.length || duplicates.length || offerCount >= 2}
  <div class="mb-3" aria-label="Smart helpers">
    <div class="flex flex-wrap gap-2">
      {#if followUps.length}
        <button
          type="button"
          class={chip}
          aria-expanded={open === 'followUps'}
          onclick={() => (open = open === 'followUps' ? undefined : 'followUps')}
        >
          Needs follow-up <span class={count}>{followUps.length}</span>
        </button>
      {/if}
      {#if duplicates.length}
        <button
          type="button"
          class={chip}
          aria-expanded={open === 'duplicates'}
          onclick={() => (open = open === 'duplicates' ? undefined : 'duplicates')}
        >
          Possible duplicates <span class={count}>{duplicates.length}</span>
        </button>
      {/if}
      {#if offerCount >= 2}
        <button type="button" class={chip} onclick={oncompare}>
          Compare offers <span class={count}>{offerCount}</span>
        </button>
      {/if}
    </div>

    {#if open === 'followUps' && followUps.length}
      <section
        transition:slide={{ duration: 150 }}
        class="border-line bg-surface mt-2 rounded-lg border"
        aria-label="Needs follow-up"
      >
        <p class="text-ink-muted border-line border-b px-3 py-2 text-xs">
          {prefs.status('applied')} for {helpers.followUpAfterDays}+ days, with no follow-up
          reminder set.
        </p>
        <ul class="divide-line divide-y">
          {#each followUps.slice(0, SHOWN) as { job, days } (job.id)}
            <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <button
                type="button"
                class="focus-visible:ring-accent min-w-0 flex-1 truncate rounded text-left hover:underline focus-visible:ring-2 focus-visible:outline-none"
                onclick={() => onselect(job.id)}
              >
                <span class="font-medium">{job.title}</span>
                <span class="text-ink-muted"> · {job.company}</span>
              </button>
              <span class="text-ink-muted text-xs tabular-nums">{days} days</span>
              <button type="button" class={btnSmall} onclick={() => onfollowup(job.id)}>
                Follow up
              </button>
            </li>
          {/each}
        </ul>
        {#if followUps.length > SHOWN}
          <p class="text-ink-muted px-3 py-2 text-xs">And {followUps.length - SHOWN} more.</p>
        {/if}
      </section>
    {/if}

    {#if open === 'duplicates' && duplicates.length}
      <section
        transition:slide={{ duration: 150 }}
        class="border-line bg-surface mt-2 rounded-lg border"
        aria-label="Possible duplicates"
      >
        <p class="text-ink-muted border-line border-b px-3 py-2 text-xs">
          Same company and a similar title, saved within 60 days. Merging keeps the other link,
          notes, tags and history.
        </p>
        <ul class="divide-line divide-y">
          {#each duplicates as pair (`${pair.a.id}|${pair.b.id}`)}
            <li class="space-y-2 px-3 py-2.5 text-sm">
              <div class="grid gap-1 sm:grid-cols-2 sm:gap-3">
                {#each [pair.a, pair.b] as job (job.id)}
                  {@const other = job === pair.a ? pair.b : pair.a}
                  <div class="flex min-w-0 items-start gap-2">
                    <div class="min-w-0 flex-1">
                      <button
                        type="button"
                        class="{linkBtn} block max-w-full truncate"
                        onclick={() => onselect(job.id)}
                      >
                        {job.title}
                      </button>
                      <p class="text-ink-muted truncate text-xs">
                        {job.company} · {sourceName(job)} · {prefs.status(job.status)} ·
                        {prefs.date(job.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      class="{btnSmall} shrink-0"
                      aria-label="Keep {job.title} from {sourceName(
                        job,
                      )} and merge the other into it"
                      onclick={() => onmerge(job, other)}
                    >
                      Keep this
                    </button>
                  </div>
                {/each}
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="text-ink-muted hover:text-ink rounded px-2 text-xs"
                  onclick={() => onnotduplicate(pair)}
                >
                  Not a duplicate
                </button>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
{/if}
