<script lang="ts">
  import type { Job, JobSortKey, SortDirection } from '@pocket-career/core';
  import StatusBadge from '../components/StatusBadge.svelte';
  import { WORK_TYPE_LABELS } from '../status';
  import { formatAgo, formatDateTime, formatSalary } from './format';

  let {
    jobs,
    sortKey = $bindable(),
    sortDir = $bindable(),
    selectedId,
    onselect,
  }: {
    jobs: Job[];
    sortKey: JobSortKey;
    sortDir: SortDirection;
    selectedId?: string;
    onselect: (id: string) => void;
  } = $props();

  const columns: { key: JobSortKey; label: string; class?: string }[] = [
    { key: 'title', label: 'Job' },
    { key: 'status', label: 'Status' },
    { key: 'company', label: 'Location', class: 'hidden md:table-cell' },
    { key: 'salary', label: 'Salary', class: 'hidden lg:table-cell' },
    { key: 'interviewAt', label: 'Interview', class: 'hidden lg:table-cell' },
    { key: 'updatedAt', label: 'Updated', class: 'text-right' },
  ];

  function sortBy(key: JobSortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      // Dates read best newest first; text A→Z.
      sortDir = key === 'updatedAt' || key === 'salary' ? 'desc' : 'asc';
    }
  }

  /** "Berlin · Hybrid"; the work type is left out when the location already says it. */
  function placeLabel(job: Job): string {
    const work = job.workType && WORK_TYPE_LABELS[job.workType];
    if (!work || job.location?.toLowerCase().includes(work.toLowerCase()))
      return job.location ?? '';
    return job.location ? `${job.location} · ${work}` : work;
  }

  const ariaSort = (key: JobSortKey) =>
    sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
</script>

<div class="border-line overflow-hidden rounded-lg border">
  <table class="w-full text-left text-sm">
    <thead class="bg-surface-muted/60 text-ink-muted text-xs">
      <tr>
        {#each columns as column (column.label)}
          <th
            scope="col"
            aria-sort={ariaSort(column.key)}
            class="px-3 py-2 font-medium {column.class ?? ''}"
          >
            <button
              type="button"
              onclick={() => sortBy(column.key)}
              class="hover:text-ink focus-visible:ring-accent inline-flex items-center gap-1 rounded focus-visible:ring-2 focus-visible:outline-none"
            >
              {column.label}
              <span class="w-3 text-[10px]" aria-hidden="true">
                {sortKey === column.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
              </span>
            </button>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody class="divide-line divide-y">
      {#each jobs as job (job.id)}
        <tr
          onclick={() => onselect(job.id)}
          class="hover:bg-surface-muted/60 cursor-pointer transition {selectedId === job.id
            ? 'bg-accent/5'
            : ''}"
        >
          <td class="max-w-0 px-3 py-2.5 sm:w-2/5">
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                onselect(job.id);
              }}
              class="block w-full truncate text-left font-medium focus-visible:underline focus-visible:outline-none"
            >
              {job.title}
            </button>
            <span class="text-ink-muted block truncate text-xs">
              {job.company}{#if job.tags?.length}
                <span class="ml-1">· {job.tags.map((t) => `#${t}`).join(' ')}</span>
              {/if}
            </span>
          </td>
          <td class="px-3 py-2.5"><StatusBadge status={job.status} /></td>
          <td class="text-ink-muted hidden max-w-48 truncate px-3 py-2.5 md:table-cell">
            {placeLabel(job)}
          </td>
          <td
            class="text-ink-muted hidden px-3 py-2.5 whitespace-nowrap tabular-nums lg:table-cell"
          >
            {formatSalary(job.salary)}
          </td>
          <td class="hidden px-3 py-2.5 whitespace-nowrap lg:table-cell">
            {#if job.interviewAt}
              <span
                class={job.interviewAt > Date.now()
                  ? 'text-status-interview font-medium'
                  : 'text-ink-muted'}
              >
                {formatDateTime(job.interviewAt)}
              </span>
            {/if}
          </td>
          <td class="text-ink-muted px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
            {formatAgo(job.updatedAt)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
