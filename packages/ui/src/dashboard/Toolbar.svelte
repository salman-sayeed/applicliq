<script lang="ts">
  import { JOB_STATUSES, type JobFilter } from '@pocket-career/core';
  import { STATUS_LABELS, WORK_TYPE_LABELS } from '../status';
  import type { DashboardView } from './types';

  let {
    filter = $bindable(),
    view = $bindable(),
    facets,
    shown,
    total,
    searchInput = $bindable(),
  }: {
    filter: JobFilter;
    view: DashboardView;
    facets: { tags: string[]; sources: string[] };
    shown: number;
    total: number;
    searchInput?: HTMLInputElement;
  } = $props();

  const active = $derived(
    !!(filter.query?.trim() || filter.status || filter.tag || filter.source || filter.workType),
  );

  function clear() {
    filter = {};
  }

  const selectClass =
    'border-line bg-surface text-ink focus:border-accent focus:ring-accent/25 rounded-md border py-1.5 pr-7 pl-2.5 text-sm transition focus:ring-2 focus:outline-none';
</script>

<div class="flex flex-wrap items-center gap-2">
  <!-- Goals and stats always cover every job, so filters only apply to the list and board. -->
  {#if view !== 'stats'}
    <div class="relative min-w-48 flex-1 sm:max-w-xs">
      <svg
        class="text-ink-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z"
          clip-rule="evenodd"
        />
      </svg>
      <input
        bind:this={searchInput}
        bind:value={filter.query}
        type="search"
        placeholder="Search jobs  ( / )"
        aria-label="Search jobs"
        class="border-line bg-surface text-ink placeholder:text-ink-muted/70 focus:border-accent focus:ring-accent/25 w-full rounded-md border py-1.5 pr-2.5 pl-8 text-sm transition focus:ring-2 focus:outline-none"
      />
    </div>

    <select bind:value={filter.status} class={selectClass} aria-label="Filter by status">
      <option value={undefined}>All statuses</option>
      {#each JOB_STATUSES as status (status)}
        <option value={status}>{STATUS_LABELS[status]}</option>
      {/each}
    </select>

    <select bind:value={filter.workType} class={selectClass} aria-label="Filter by work type">
      <option value={undefined}>Any work type</option>
      {#each Object.entries(WORK_TYPE_LABELS) as [value, label] (value)}
        <option {value}>{label}</option>
      {/each}
    </select>

    {#if facets.tags.length}
      <select bind:value={filter.tag} class={selectClass} aria-label="Filter by tag">
        <option value={undefined}>All tags</option>
        {#each facets.tags as tag (tag)}
          <option value={tag}>#{tag}</option>
        {/each}
      </select>
    {/if}

    {#if facets.sources.length}
      <select bind:value={filter.source} class={selectClass} aria-label="Filter by source">
        <option value={undefined}>All sources</option>
        {#each facets.sources as source (source)}
          <option value={source}>{source}</option>
        {/each}
      </select>
    {/if}

    {#if active}
      <button
        type="button"
        onclick={clear}
        class="text-accent focus-visible:ring-accent rounded px-1 text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        Clear
      </button>
    {/if}

    <span class="text-ink-muted ml-auto text-sm tabular-nums" aria-live="polite">
      {shown === total ? `${total} jobs` : `${shown} of ${total}`}
    </span>
  {/if}

  <div
    class="border-line flex rounded-md border p-0.5 {view === 'stats' ? 'ml-auto' : ''}"
    role="group"
    aria-label="View"
  >
    {#each [['list', 'List'], ['board', 'Board'], ['stats', 'Stats']] as const as [value, label] (value)}
      <button
        type="button"
        aria-pressed={view === value}
        onclick={() => (view = value)}
        class="focus-visible:ring-accent rounded px-2.5 py-1 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none {view ===
        value
          ? 'bg-surface-muted text-ink'
          : 'text-ink-muted hover:text-ink'}"
      >
        {label}
      </button>
    {/each}
  </div>
</div>
