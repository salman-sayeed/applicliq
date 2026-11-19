<script lang="ts">
  import {
    type Goals,
    type Job,
    type Settings,
    type JobFilter,
    type JobPatch,
    type JobSortKey,
    type JobStatus,
    type SortDirection,
    filterJobs,
    jobFacets,
    sortJobs,
  } from '@career-pocket/core';
  import type { Snippet } from 'svelte';
  import { applyAppearance } from '../appearance';
  import { Prefs, setPrefs } from '../prefs.svelte';
  import type { DashboardAdapter } from './adapter';
  import JobDetail from './JobDetail.svelte';
  import Onboarding from './Onboarding.svelte';
  import JobTable from './JobTable.svelte';
  import KanbanBoard from './KanbanBoard.svelte';
  import Toast from './Toast.svelte';
  import StatsView from './stats/StatsView.svelte';
  import Toolbar from './Toolbar.svelte';
  import type { DashboardView, ToastMessage } from './types';

  let {
    adapter,
    initialJobId,
    header,
    emptyHint,
    onboarding = false,
    onboardingSync,
  }: {
    adapter: DashboardAdapter;
    /** Opens this job's detail panel on load (e.g. from a `#job=` link). */
    initialJobId?: string;
    /** Rendered at the left of the top bar (logo, app name). */
    header?: Snippet;
    /** Shown when there are no jobs at all (how to save the first one). */
    emptyHint?: Snippet;
    /** Show the introduction even if it was seen before ("Replay onboarding"). */
    onboarding?: boolean;
    /** Sign-in control shown in the last onboarding step (optional Drive sync). */
    onboardingSync?: Snippet;
  } = $props();

  const TOAST_MS = 6000;

  const prefs = setPrefs(new Prefs());

  // Plain objects, not deep proxies: they are replaced wholesale on every change and are handed
  // back to the adapter (IndexedDB cannot store proxies).
  let jobs = $state.raw<Job[]>([]);
  let loaded = $state(false);
  let loadError = $state<string>();
  let settings = $state.raw<Settings>();
  let view = $state<DashboardView>('list');
  /** The view follows the "default view" setting until the user picks one here. */
  let viewPicked = false;
  // svelte-ignore state_referenced_locally
  let showIntro = $state(onboarding);
  let filter = $state<JobFilter>({});
  let sortKey = $state<JobSortKey>('updatedAt');
  let sortDir = $state<SortDirection>('desc');
  // svelte-ignore state_referenced_locally
  let selectedId = $state<string | undefined>(initialJobId);
  let toast = $state<ToastMessage>();
  let searchInput = $state<HTMLInputElement>();

  $effect(() =>
    adapter.watchJobs(
      (next) => {
        jobs = next;
        loaded = true;
      },
      (error) => {
        loadError = error instanceof Error ? error.message : 'Could not load your jobs.';
        loaded = true;
      },
    ),
  );

  $effect(() =>
    adapter.watchSettings(
      (next) => {
        settings = next;
        prefs.settings = next;
        applyAppearance(next.appearance);
        if (!viewPicked) view = next.appearance.defaultDashboardView;
      },
      (error) => reportError('load your settings', error),
    ),
  );

  // First run: introduce the app once, while there's nothing saved yet.
  $effect(() => {
    if (!loaded || jobs.length > 0) return;
    adapter.getLocalState().then(
      (state) => {
        if (!state.onboardingDone) showIntro = true;
      },
      () => {},
    );
  });

  function closeIntro() {
    showIntro = false;
    adapter.setLocalState({ onboardingDone: true }).catch(() => {});
  }

  function pickView(next: DashboardView) {
    viewPicked = true;
    view = next;
  }

  async function saveGoals(next: Goals) {
    try {
      await adapter.updateSettings({ goals: next });
      showToast({ message: 'Goals saved' });
    } catch (error) {
      reportError('save your goals', error);
      throw error;
    }
  }

  const facets = $derived(jobFacets(jobs));
  const visible = $derived(sortJobs(filterJobs(jobs, filter), sortKey, sortDir));
  const selected = $derived(jobs.find((j) => j.id === selectedId));

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function showToast(message: Omit<ToastMessage, 'id'>) {
    clearTimeout(toastTimer);
    toast = { ...message, id: Date.now() };
    toastTimer = setTimeout(() => (toast = undefined), TOAST_MS);
  }

  function reportError(action: string, error: unknown) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    showToast({ message: `Could not ${action}${detail}`, tone: 'error' });
  }

  async function update(id: string, patch: JobPatch) {
    try {
      return await adapter.updateJob(id, $state.snapshot(patch) as JobPatch);
    } catch (error) {
      reportError('save the change', error);
      throw error;
    }
  }

  function move(id: string, status: JobStatus) {
    const job = jobs.find((j) => j.id === id);
    update(id, { status }).then(
      () => job && showToast({ message: `Moved “${job.title}” to ${prefs.status(status)}` }),
      () => {},
    );
  }

  async function remove(job: Job) {
    try {
      await adapter.deleteJob(job.id);
    } catch (error) {
      reportError('delete the job', error);
      return;
    }
    selectedId = undefined;
    showToast({
      message: `Deleted “${job.title}”`,
      action: {
        label: 'Undo',
        run: () => {
          adapter.restoreJob(job).then(
            (restored) => (selectedId = restored.id),
            (error) => reportError('restore the job', error),
          );
        },
      },
    });
  }

  function onkeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const typing = target?.closest('input, textarea, select, [contenteditable]');
    if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      searchInput?.focus();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="flex h-dvh flex-col">
  <header class="border-line flex flex-col gap-3 border-b px-4 py-3">
    <div class="flex items-center gap-3">
      {#if header}{@render header()}{/if}
    </div>
    <Toolbar
      bind:filter
      {view}
      onview={pickView}
      bind:searchInput
      {facets}
      shown={visible.length}
      total={jobs.length}
    />
  </header>

  <main class="flex min-h-0 flex-1 flex-col overflow-auto p-4">
    {#if !loaded}
      <div class="space-y-2" aria-busy="true" aria-label="Loading jobs">
        {#each [0, 1, 2, 3] as i (i)}
          <div class="bg-surface-muted h-12 animate-pulse rounded-md"></div>
        {/each}
      </div>
    {:else if loadError}
      <p role="alert" class="text-status-rejected text-sm">{loadError}</p>
    {:else if view === 'stats'}
      <StatsView {jobs} {settings} onsavegoals={saveGoals} />
    {:else if jobs.length === 0}
      <div class="text-ink-muted mx-auto mt-16 max-w-sm text-center text-sm">
        <p class="text-ink mb-1 text-base font-semibold">No jobs yet</p>
        {#if emptyHint}{@render emptyHint()}{:else}<p>Saved jobs will show up here.</p>{/if}
      </div>
    {:else if view === 'board'}
      <KanbanBoard jobs={visible} {selectedId} onselect={(id) => (selectedId = id)} onmove={move} />
    {:else if visible.length === 0}
      <div class="text-ink-muted mt-16 text-center text-sm">
        <p>No jobs match these filters.</p>
        <button
          type="button"
          onclick={() => (filter = {})}
          class="text-accent focus-visible:ring-accent mt-1 font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          Clear filters
        </button>
      </div>
    {:else}
      <JobTable
        jobs={visible}
        bind:sortKey
        bind:sortDir
        {selectedId}
        onselect={(id) => (selectedId = id)}
      />
    {/if}
  </main>
</div>

{#if selected}
  {#key selected.id}
    <JobDetail
      job={selected}
      {facets}
      onupdate={(patch) => update(selected.id, patch)}
      ondelete={() => remove(selected)}
      onclose={() => (selectedId = undefined)}
    />
  {/key}
{/if}

<Toast {toast} ondismiss={() => (toast = undefined)} />

{#if showIntro}
  <Onboarding
    goals={settings?.goals}
    onsavegoals={saveGoals}
    sync={onboardingSync}
    onclose={closeIntro}
  />
{/if}
