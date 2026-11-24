<script lang="ts">
  import { type Job, sourceName } from '@applicliq/core';
  import { getPrefs, slide } from '@applicliq/ui';

  /**
   * Asked on save when the job looks like one already saved from another site (Smart helpers →
   * Same job on two sites). The user picks which one to keep, or says it's a different job.
   */
  let {
    match,
    busy,
    onmerge,
    onseparate,
    oncancel,
  }: {
    match: Job;
    busy: boolean;
    /** `keep`: which job stays ('saved' = the one already saved, 'new' = this page's). */
    onmerge: (keep: 'saved' | 'new') => void;
    onseparate: () => void;
    oncancel: () => void;
  } = $props();

  const prefs = getPrefs();
  const button =
    'border-line hover:bg-surface-muted focus-visible:ring-accent rounded-md border px-2 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50';
</script>

<div
  transition:slide={{ duration: 150 }}
  role="alertdialog"
  aria-labelledby="dupe-title"
  aria-describedby="dupe-job"
  class="border-accent/40 bg-accent/5 mt-3 rounded-md border p-2.5 text-xs"
>
  <p id="dupe-title" class="font-semibold">
    This looks like a job you saved from {sourceName(match)}. Merge?
  </p>
  <p id="dupe-job" class="text-ink-muted mt-0.5 truncate">
    {match.title} · {match.company} · {prefs.status(match.status)}
  </p>
  <div class="mt-2 flex flex-wrap gap-1.5">
    <button type="button" class={button} disabled={busy} onclick={() => onmerge('saved')}>
      Merge, keep the saved one
    </button>
    <button type="button" class={button} disabled={busy} onclick={() => onmerge('new')}>
      Merge, keep this page
    </button>
    <button type="button" class={button} disabled={busy} onclick={onseparate}>
      Not a duplicate
    </button>
    <button
      type="button"
      class="text-ink-muted hover:text-ink rounded px-1 text-xs"
      disabled={busy}
      onclick={oncancel}
    >
      Cancel
    </button>
  </div>
</div>
