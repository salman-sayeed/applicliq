<script lang="ts">
  import { JOB_STATUSES, type Job, type JobStatus } from '@career-pocket/core';
  import { flip } from '../motion';
  import { crossfade } from '../motion';
  import { getPrefs } from '../prefs.svelte';
  import { STATUS_DOT } from '../status';
  import { formatSalary } from './format';

  let {
    jobs,
    selectedId,
    onselect,
    onmove,
  }: {
    jobs: Job[];
    selectedId?: string;
    onselect: (id: string) => void;
    onmove: (id: string, status: JobStatus) => void;
  } = $props();

  // Cards glide from one column to the other when their status changes.
  const [send, receive] = crossfade({ duration: 150 });

  const prefs = getPrefs();

  /** Hidden statuses get no column, unless some job is still in one. */
  const columns = $derived(
    JOB_STATUSES.filter(
      (status) =>
        !prefs.settings.labels.hiddenStatuses.includes(status) ||
        jobs.some((j) => j.status === status),
    ).map((status) => ({ status, jobs: jobs.filter((j) => j.status === status) })),
  );

  let draggingId = $state<string>();
  let overStatus = $state<JobStatus>();

  function drop(event: DragEvent, status: JobStatus) {
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/plain') || draggingId;
    overStatus = undefined;
    draggingId = undefined;
    const job = id && jobs.find((j) => j.id === id);
    if (job && job.status !== status) onmove(job.id, status);
  }

  /** Keyboard alternative to dragging: Alt+← / Alt+→ moves a card to the next column. */
  function onkeydown(event: KeyboardEvent, job: Job) {
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const order = columns.map((c) => c.status);
    const index = order.indexOf(job.status) + (event.key === 'ArrowRight' ? 1 : -1);
    const next = order[index];
    if (next) onmove(job.id, next);
  }
</script>

<div class="-mx-4 flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-2">
  {#each columns as column (column.status)}
    <section
      aria-label={prefs.status(column.status)}
      ondragover={(e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        overStatus = column.status;
      }}
      ondragleave={(e) => {
        if (!(e.currentTarget as Element).contains(e.relatedTarget as Node)) overStatus = undefined;
      }}
      ondrop={(e) => drop(e, column.status)}
      class="bg-surface-muted/50 flex w-64 shrink-0 flex-col rounded-lg border transition {overStatus ===
      column.status
        ? 'border-accent bg-accent/5'
        : 'border-transparent'}"
    >
      <header class="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <span class="size-2 rounded-full {STATUS_DOT[column.status]}" aria-hidden="true"></span>
        <h2 class="text-sm font-semibold">{prefs.status(column.status)}</h2>
        <span class="text-ink-muted ml-auto text-xs tabular-nums">{column.jobs.length}</span>
      </header>
      <ul class="flex min-h-16 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto px-2 pb-2">
        {#each column.jobs as job (job.id)}
          <li
            animate:flip={{ duration: 150 }}
            in:receive={{ key: job.id }}
            out:send={{ key: job.id }}
          >
            <button
              type="button"
              draggable="true"
              ondragstart={(e) => {
                draggingId = job.id;
                e.dataTransfer?.setData('text/plain', job.id);
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
              }}
              ondragend={() => {
                draggingId = undefined;
                overStatus = undefined;
              }}
              onclick={() => onselect(job.id)}
              onkeydown={(e) => onkeydown(e, job)}
              aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
              title="Drag to another column, or Alt+← / Alt+→"
              class="bg-surface border-line hover:border-ink-muted/40 focus-visible:ring-accent compact:p-1.5 block w-full cursor-grab rounded-md border p-2.5 text-left shadow-sm transition focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing {draggingId ===
              job.id
                ? 'opacity-40'
                : ''} {selectedId === job.id ? 'ring-accent ring-2' : ''}"
            >
              <span class="block truncate text-sm font-medium">{job.title}</span>
              <span class="text-ink-muted block truncate text-xs">{job.company}</span>
              {#if job.interviewAt || job.salary || job.tags?.length}
                <span class="mt-2 flex flex-wrap gap-1 text-[11px]">
                  {#if job.interviewAt}
                    <span
                      class="bg-status-interview/15 text-status-interview rounded px-1.5 py-0.5 font-medium"
                    >
                      {prefs.dateTime(job.interviewAt)}
                    </span>
                  {/if}
                  {#if formatSalary(job.salary)}
                    <span class="bg-surface-muted text-ink-muted rounded px-1.5 py-0.5">
                      {formatSalary(job.salary)}
                    </span>
                  {/if}
                  {#each (job.tags ?? []).slice(0, 3) as tag (tag)}
                    <span class="rounded px-1.5 py-0.5 {prefs.tagClass(tag)}">#{tag}</span>
                  {/each}
                </span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>
