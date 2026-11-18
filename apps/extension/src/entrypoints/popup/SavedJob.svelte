<script lang="ts">
  import { type Job, type JobStatus, daysAgoLabel, daysSince } from '@pocket-career/core';
  import { Button, StatusBadge, getPrefs } from '@pocket-career/ui';
  import { fade } from 'svelte/transition';

  let {
    job,
    justSaved,
    onstatus,
    onopen,
  }: {
    job: Job;
    justSaved: boolean;
    onstatus: (status: JobStatus) => Promise<void>;
    /** Opens the job in the dashboard to edit everything else. */
    onopen: () => void;
  } = $props();

  const prefs = getPrefs();

  let updating = $state(false);
  let updated = $state(false);
  let updatedTimer: ReturnType<typeof setTimeout> | undefined;

  async function change(status: JobStatus) {
    if (status === job.status) return;
    updating = true;
    try {
      await onstatus(status);
      updated = true;
      clearTimeout(updatedTimer);
      updatedTimer = setTimeout(() => (updated = false), 1500);
    } finally {
      updating = false;
    }
  }
</script>

<section class="flex flex-col gap-3">
  <p class="text-ink-muted flex items-center gap-1.5 text-xs">
    {#if justSaved}
      <span class="text-status-offer" aria-hidden="true">✓</span> Saved to Pocket Career
    {:else}
      Already saved {daysAgoLabel(daysSince(job.createdAt))}
    {/if}
  </p>

  <div class="border-line bg-surface-muted/50 rounded-lg border p-3">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h2 class="truncate text-sm font-semibold" title={job.title}>{job.title}</h2>
        <p class="text-ink-muted truncate text-sm">
          {job.company}{job.location ? ` · ${job.location}` : ''}
        </p>
      </div>
      <StatusBadge status={job.status} />
    </div>
  </div>

  <div>
    <div class="flex items-center justify-between">
      <label class="label" for="status">Status</label>
      {#if updated}
        <span transition:fade={{ duration: 120 }} class="text-status-offer mb-1 text-xs">
          Updated
        </span>
      {/if}
    </div>
    <select
      id="status"
      class="field"
      value={job.status}
      disabled={updating}
      onchange={(e) => change(e.currentTarget.value as JobStatus)}
    >
      {#each prefs.statuses(job.status) as status (status)}
        <option value={status}>{prefs.status(status)}</option>
      {/each}
    </select>
  </div>

  {#if job.status === 'saved'}
    <Button variant="primary" disabled={updating} onclick={() => change('applied')}>
      Mark {prefs.status('applied').toLowerCase()}
    </Button>
  {/if}

  <button
    type="button"
    onclick={onopen}
    class="text-accent focus-visible:ring-accent self-start rounded text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
  >
    Edit details, notes and dates in the dashboard ↗
  </button>
</section>
