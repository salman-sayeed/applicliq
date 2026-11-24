<script lang="ts">
  import {
    type Goals,
    type Job,
    type Resume,
    type Settings,
    type JobFilter,
    type JobPatch,
    type JobSortKey,
    type JobStatus,
    type SortDirection,
    filterJobs,
    jobFacets,
    sortJobs,
  } from '@applicliq/core';
  import type { DuplicatePair } from '@applicliq/core';
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
  import HelpersPanel from './smart/HelpersPanel.svelte';
  import Toolbar from './Toolbar.svelte';
  import type { DashboardView, ToastMessage } from './types';

  let {
    adapter,
    initialJobId,
    header,
    emptyHint,
    onboarding = false,
    onboardingSync,
    onimport,
    initialView,
    logoUrl,
    onsettings,
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
    /** Opens Settings → Import; the empty state offers it while the Import feature is on. */
    onimport?: () => void;
    /** Opens on this view (the weekly recap notification opens Insights). */
    initialView?: DashboardView;
    /** The AppliCliq logo, drawn on the share card. */
    logoUrl?: string;
    /** Opens a settings section (e.g. 'helpers' to edit follow-up templates). */
    onsettings?: (section: string) => void;
  } = $props();

  const TOAST_MS = 6000;

  const prefs = setPrefs(new Prefs());

  // Plain objects, not deep proxies: they are replaced wholesale on every change and are handed
  // back to the adapter (IndexedDB cannot store proxies).
  let jobs = $state.raw<Job[]>([]);
  let resumes = $state.raw<Resume[]>([]);
  let loaded = $state(false);
  let loadError = $state<string>();
  let settings = $state.raw<Settings>();
  // svelte-ignore state_referenced_locally
  let view = $state<DashboardView>(initialView ?? 'list');
  /** The view follows the "default view" setting until the user picks one here. */
  // svelte-ignore state_referenced_locally
  let viewPicked = initialView !== undefined;
  /** The job whose follow-up dialog is open. */
  let followUpId = $state<string>();
  /** The offer comparison is open, starting with these jobs. */
  let comparing = $state<string[]>();
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

  $effect(() => adapter.watchResumes((next) => (resumes = next)));

  /** Resume match → "Ignore this skill": added to the synced ignore list. */
  function ignoreSkill(skill: string) {
    const list = settings?.resumes.ignoredSkills ?? [];
    if (list.some((s) => s.toLowerCase() === skill.toLowerCase())) return;
    adapter
      .updateSettings({ resumes: { ignoredSkills: [...list, skill] } })
      .then(() =>
        showToast({
          message: `“${skill}” won't be flagged again.`,
          action: {
            label: 'Undo',
            run: () =>
              void adapter
                .updateSettings({ resumes: { ignoredSkills: list } })
                .catch((error: unknown) => reportError('update the ignore list', error)),
          },
        }),
      )
      .catch((error: unknown) => reportError('update the ignore list', error));
  }

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
  /** Insights is a feature: with it off, its tab falls back to the list. */
  const shownView = $derived(view === 'insights' && !prefs.feature('insights') ? 'list' : view);
  const followUpJob = $derived(jobs.find((j) => j.id === followUpId));
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

  async function mergeDuplicates(keep: Job, other: Job) {
    try {
      const merged = await adapter.mergeDuplicates(keep.id, other.id);
      showToast({ message: `Merged into “${merged.title}”` });
      selectedId = merged.id;
    } catch (error) {
      reportError('merge the jobs', error);
    }
  }

  function notDuplicate({ a, b }: DuplicatePair) {
    adapter.markNotDuplicate(a.id, b.id).then(
      () => showToast({ message: 'Got it. They won’t be suggested again.' }),
      (error) => reportError('save that', error),
    );
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
      view={shownView}
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
    {:else if shownView === 'stats'}
      <StatsView {jobs} {settings} onsavegoals={saveGoals} />
    {:else if shownView === 'insights'}
      <!-- Loaded on demand: the charts and the share card stay out of the first load. -->
      {#await import('./insights/InsightsView.svelte')}
        <div class="bg-surface-muted mx-auto h-40 w-full max-w-5xl animate-pulse rounded-lg"></div>
      {:then { default: InsightsView }}
        <InsightsView {jobs} {settings} {logoUrl} />
      {:catch}
        <p role="alert" class="text-status-rejected text-sm">
          Could not load Insights. Reload and try again.
        </p>
      {/await}
    {:else if jobs.length === 0}
      <div class="text-ink-muted mx-auto mt-16 max-w-sm text-center text-sm">
        <p class="text-ink mb-1 text-base font-semibold">No jobs yet</p>
        {#if emptyHint}{@render emptyHint()}{:else}<p>Saved jobs will show up here.</p>{/if}
        {#if onimport && prefs.feature('import')}
          <p class="mt-4">Already tracking applications somewhere else?</p>
          <button
            type="button"
            onclick={onimport}
            class="border-line text-ink hover:bg-surface-muted focus-visible:ring-accent mt-2 rounded-md border px-3 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none"
          >
            Import jobs
          </button>
        {/if}
      </div>
    {:else}
      <HelpersPanel
        {jobs}
        onselect={(id) => (selectedId = id)}
        onfollowup={(id) => (followUpId = id)}
        onmerge={mergeDuplicates}
        onnotduplicate={notDuplicate}
        oncompare={() => (comparing = [])}
      />
      {#if shownView === 'board'}
        <KanbanBoard
          jobs={visible}
          {selectedId}
          onselect={(id) => (selectedId = id)}
          onmove={move}
        />
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
      onfollowup={() => (followUpId = selected.id)}
      oncompare={() => (comparing = [selected.id])}
      {resumes}
      onignore={ignoreSkill}
      onresumes={onsettings && (() => onsettings('resumes'))}
    />
  {/key}
{/if}

{#if followUpJob}
  {#await import('./smart/FollowUpDialog.svelte') then { default: FollowUpDialog }}
    <FollowUpDialog
      job={followUpJob}
      onupdate={(patch) => update(followUpJob.id, patch)}
      onclose={() => (followUpId = undefined)}
      onsettings={onsettings && (() => onsettings('helpers'))}
    />
  {/await}
{/if}

{#if comparing}
  {#await import('./smart/CompareOffers.svelte') then { default: CompareOffers }}
    <CompareOffers
      {jobs}
      initial={comparing}
      onopen={(id) => {
        comparing = undefined;
        selectedId = id;
      }}
      onclose={() => (comparing = undefined)}
    />
  {/await}
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
