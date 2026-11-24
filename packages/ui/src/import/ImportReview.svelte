<script lang="ts">
  import type { ImportDraft, ImportRow } from '@applicliq/core';
  import { SvelteSet } from 'svelte/reactivity';
  import StatusBadge from '../components/StatusBadge.svelte';
  import { getPrefs } from '../prefs.svelte';
  import { button, primary } from '../settings/styles';

  let {
    rows,
    busy = false,
    onimport,
    oncancel,
  }: {
    rows: ImportRow[];
    busy?: boolean;
    onimport: (drafts: ImportDraft[]) => void;
    oncancel: () => void;
  } = $props();

  const prefs = getPrefs();

  /** Rows drawn at first; long files show the rest on request, so the page stays quick. */
  const PAGE = 200;

  type Tab = 'new' | 'duplicate' | 'error';
  const counts = $derived({
    new: rows.filter((r) => r.kind === 'new').length,
    duplicate: rows.filter((r) => r.kind === 'duplicate').length,
    error: rows.filter((r) => r.kind === 'error').length,
  });

  // New rows start ticked, duplicates unticked; errors can't be imported.
  // svelte-ignore state_referenced_locally
  const picked = new SvelteSet(rows.filter((r) => r.kind === 'new').map((r) => r.index));
  // svelte-ignore state_referenced_locally
  let tab = $state<Tab>(counts.new ? 'new' : counts.duplicate ? 'duplicate' : 'error');
  let limit = $state(PAGE);

  const listed = $derived(rows.filter((r) => r.kind === tab));
  const shown = $derived(listed.slice(0, limit));
  const allPicked = $derived(tab !== 'error' && listed.every((r) => picked.has(r.index)));

  function toggle(index: number, on: boolean) {
    if (on) picked.add(index);
    else picked.delete(index);
  }

  function toggleAll(on: boolean) {
    for (const r of listed) {
      if (on) picked.add(r.index);
      else picked.delete(r.index);
    }
  }

  function submit() {
    const drafts = rows.filter((r) => r.draft && picked.has(r.index)).map((r) => r.draft!);
    onimport(drafts);
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'new', label: 'To add' },
    { id: 'duplicate', label: 'Duplicates' },
    { id: 'error', label: 'Errors' },
  ];
</script>

<div class="space-y-4 py-4">
  <div role="tablist" aria-label="Rows" class="flex flex-wrap gap-1">
    {#each TABS as t (t.id)}
      <button
        type="button"
        role="tab"
        aria-selected={tab === t.id}
        onclick={() => {
          tab = t.id;
          limit = PAGE;
        }}
        class="focus-visible:ring-accent rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none {tab ===
        t.id
          ? 'bg-surface-muted text-ink'
          : 'text-ink-muted hover:text-ink'}"
      >
        {t.label}
        <span class="tabular-nums">{counts[t.id]}</span>
      </button>
    {/each}
  </div>

  {#if tab === 'duplicate' && counts.duplicate}
    <p class="text-ink-muted text-xs">
      Same link, or same company and title within 3 days, as a job you have or an earlier row. Tick
      any you want anyway.
    </p>
  {:else if tab === 'error' && counts.error}
    <p class="text-ink-muted text-xs">
      These rows can't be imported. Fix them in the file and import it again, or go back and match
      the columns differently.
    </p>
  {/if}

  {#if listed.length === 0}
    <p class="text-ink-muted py-6 text-center text-sm">Nothing here.</p>
  {:else}
    <div class="border-line overflow-x-auto rounded-md border">
      <table class="w-full text-left text-sm">
        <thead class="bg-surface-muted text-xs">
          <tr>
            {#if tab !== 'error'}
              <th scope="col" class="w-8 px-2 py-1.5">
                <input
                  type="checkbox"
                  class="accent-accent"
                  aria-label="Select all"
                  checked={allPicked}
                  onchange={(e) => toggleAll(e.currentTarget.checked)}
                />
              </th>
            {/if}
            <th scope="col" class="px-2 py-1.5 font-medium">Row</th>
            <th scope="col" class="px-2 py-1.5 font-medium">Job</th>
            {#if tab === 'error'}
              <th scope="col" class="px-2 py-1.5 font-medium">Problem</th>
            {:else}
              <th scope="col" class="px-2 py-1.5 font-medium">Status</th>
              <th scope="col" class="px-2 py-1.5 font-medium whitespace-nowrap">Date applied</th>
              {#if tab === 'duplicate'}
                <th scope="col" class="px-2 py-1.5 font-medium">Matches</th>
              {/if}
            {/if}
          </tr>
        </thead>
        <tbody class="divide-line divide-y">
          {#each shown as row (row.index)}
            <tr>
              {#if tab !== 'error'}
                <td class="px-2 py-1.5">
                  <input
                    type="checkbox"
                    class="accent-accent"
                    aria-label="Import row {row.index + 1}"
                    checked={picked.has(row.index)}
                    onchange={(e) => toggle(row.index, e.currentTarget.checked)}
                  />
                </td>
              {/if}
              <td class="text-ink-muted px-2 py-1.5 tabular-nums">{row.index + 1}</td>
              <td class="max-w-72 px-2 py-1.5">
                {#if row.draft}
                  <p class="truncate font-medium">{row.draft.title}</p>
                  <p class="text-ink-muted truncate text-xs">{row.draft.company}</p>
                {:else}
                  <span class="text-ink-muted">—</span>
                {/if}
              </td>
              {#if tab === 'error'}
                <td class="text-status-rejected px-2 py-1.5 text-xs">{row.problem}</td>
              {:else if row.draft}
                <td class="px-2 py-1.5"><StatusBadge status={row.draft.status} /></td>
                <td class="px-2 py-1.5 text-xs whitespace-nowrap tabular-nums">
                  {row.draft.appliedAt ? prefs.date(row.draft.appliedAt) : '—'}
                </td>
                {#if tab === 'duplicate'}
                  <td class="text-ink-muted max-w-56 truncate px-2 py-1.5 text-xs">
                    {#if row.duplicateOf?.row !== undefined}
                      Row {row.duplicateOf.row + 1}
                    {:else}
                      Saved: {row.duplicateOf?.title}
                    {/if}
                  </td>
                {/if}
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if listed.length > shown.length}
      <button type="button" class="{button} text-xs" onclick={() => (limit = listed.length)}>
        Show all {listed.length} rows
      </button>
    {/if}
  {/if}

  <div class="flex flex-wrap items-center gap-2">
    <button type="button" class={primary} disabled={busy || picked.size === 0} onclick={submit}>
      {busy ? 'Importing…' : `Import ${picked.size} ${picked.size === 1 ? 'job' : 'jobs'}`}
    </button>
    <button type="button" class={button} disabled={busy} onclick={oncancel}>Back</button>
  </div>
</div>
