<script lang="ts">
  import type { Job, JobStatus } from '@career-pocket/core';
  import { Prefs, applyAppearance, setPrefs } from '@career-pocket/ui';
  import { onMount } from 'svelte';
  import { fly, slide } from 'svelte/transition';
  import { getSaveShortcut, openDashboard, openSettings } from '@/lib/config';
  import { repo } from '@/lib/db';
  import { type Draft, draftFrom, isDraftValid, toNewJob } from '@/lib/draft';
  import { takePendingLink } from '@/lib/pending-link';
  import { showGoalBadge } from '@/lib/badge';
  import { notifyJobsChanged, requestSync } from '@/lib/messages';
  import { extractFromTab, getActiveTab, isSavableUrl } from '@/lib/tabs';
  import JobForm from './JobForm.svelte';
  import RecentJobs from './RecentJobs.svelte';
  import SavedJob from './SavedJob.svelte';

  type View =
    | { kind: 'loading' }
    | { kind: 'unsupported' }
    | { kind: 'form'; notice?: string }
    | { kind: 'saved'; job: Job; justSaved: boolean };

  const RECENT_COUNT = 5;

  const prefs = setPrefs(new Prefs());

  let view = $state<View>({ kind: 'loading' });
  let draft = $state<Draft>(draftFrom({}, ''));
  let saving = $state(false);
  let error = $state<string>();
  let recent = $state<Job[]>([]);
  let shortcut = $state<string>();

  const currentId = $derived(view.kind === 'saved' ? view.job.id : undefined);
  const recentShown = $derived(recent.filter((j) => j.id !== currentId).slice(0, RECENT_COUNT));

  async function loadRecent() {
    recent = (await repo.getJobs()).slice(0, RECENT_COUNT + 1);
  }

  async function load() {
    const settings = await repo.getSettings();
    prefs.settings = settings;
    applyAppearance(settings.appearance);
    void showGoalBadge(undefined, settings);
    const link = await takePendingLink();
    let url: string;
    let fallbackTitle: string;
    let extracted;

    if (link) {
      url = link.url;
      fallbackTitle = link.title;
    } else {
      const tab = await getActiveTab();
      if (!tab?.id || !isSavableUrl(tab.url)) {
        view = { kind: 'unsupported' };
        return;
      }
      extracted = await extractFromTab(tab.id);
      url = extracted?.job.url ?? tab.url;
      fallbackTitle = tab.title ?? '';
    }

    const existing = await repo.getJobByUrl(url);
    if (existing) {
      view = { kind: 'saved', job: existing, justSaved: false };
      return;
    }

    draft = draftFrom(extracted?.job ?? { title: fallbackTitle }, url, settings.regional);
    view = {
      kind: 'form',
      notice: link
        ? 'Saving a link: add the company, then save.'
        : !extracted
          ? "Couldn't read this page. Fill in the details."
          : extracted.confidence < 0.5
            ? 'This page had little job info. Check the details.'
            : undefined,
    };
  }

  async function save(status: JobStatus) {
    if (saving || !isDraftValid(draft)) return;
    saving = true;
    error = undefined;
    try {
      const keep = prefs.settings.automation.saveDescriptionSnapshot;
      const job = await repo.addJob({ ...toNewJob(draft, keep), status });
      notifyJobsChanged();
      view = { kind: 'saved', job, justSaved: true };
      await loadRecent();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not save the job.';
    } finally {
      saving = false;
    }
  }

  async function setStatus(status: JobStatus) {
    if (view.kind !== 'saved') return;
    const job = await repo.updateJob(view.job.id, { status });
    notifyJobsChanged();
    view = { ...view, job };
    await loadRecent();
  }

  function onkeydown(event: KeyboardEvent) {
    // Alt+Shift+S (the save shortcut) or Ctrl/Cmd+Enter saves from inside the popup.
    const shortcutKey = event.altKey && event.shiftKey && event.code === 'KeyS';
    const submitKey = (event.metaKey || event.ctrlKey) && event.key === 'Enter';
    if ((shortcutKey || submitKey) && view.kind === 'form') {
      event.preventDefault();
      void save(prefs.settings.automation.defaultSaveStatus);
    }
  }

  onMount(() => {
    // Opening the popup pulls changes from other devices (no-op when signed out).
    requestSync();
    void loadRecent();
    void load().catch(() => (view = { kind: 'unsupported' }));
    void getSaveShortcut().then((value) => (shortcut = value));
  });
</script>

<svelte:window {onkeydown} />

<main class="flex flex-col gap-4 p-4">
  <header class="flex items-center justify-between">
    <h1 class="flex items-center gap-2 text-sm font-semibold">
      <img src="/icon/32.png" alt="" class="size-5" />
      Career Pocket
    </h1>
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => openDashboard()}
        class="text-accent focus-visible:ring-accent rounded px-1 text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        Open dashboard ↗
      </button>
      <button
        type="button"
        onclick={() => openSettings()}
        aria-label="Settings"
        title="Settings"
        class="text-ink-muted hover:text-ink hover:bg-surface-muted focus-visible:ring-accent rounded-md p-1 transition focus-visible:ring-2 focus-visible:outline-none"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="size-4" aria-hidden="true">
          <path
            fill-rule="evenodd"
            d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </div>
  </header>

  {#key view.kind}
    <div in:fly={{ y: 6, duration: 150 }}>
      {#if view.kind === 'loading'}
        <div class="flex flex-col gap-3" aria-busy="true" aria-label="Reading this page">
          <div class="bg-surface-muted h-3 w-24 animate-pulse rounded"></div>
          <div class="bg-surface-muted h-8 animate-pulse rounded-md"></div>
          <div class="bg-surface-muted h-8 animate-pulse rounded-md"></div>
        </div>
      {:else if view.kind === 'unsupported'}
        <p class="text-ink-muted text-sm">
          Open a job posting in this tab, then click Career Pocket to save it.
        </p>
      {:else if view.kind === 'form'}
        {#if view.notice}
          <p class="bg-surface-muted text-ink-muted mb-3 rounded-md px-2.5 py-1.5 text-xs">
            {view.notice}
          </p>
        {/if}
        <JobForm
          bind:draft
          {saving}
          defaultStatus={prefs.settings.automation.defaultSaveStatus}
          duplicateWarning={prefs.settings.jobPages.duplicateWarning}
          onsave={save}
        />
        {#if error}
          <p
            transition:slide={{ duration: 150 }}
            role="alert"
            class="text-status-rejected mt-2 text-xs"
          >
            {error}
          </p>
        {/if}
      {:else}
        <SavedJob
          job={view.job}
          justSaved={view.justSaved}
          onstatus={setStatus}
          onopen={() => openDashboard(view.kind === 'saved' ? view.job.id : undefined)}
        />
      {/if}
    </div>
  {/key}

  <RecentJobs jobs={recentShown} />

  {#if shortcut}
    <p class="text-ink-muted -mt-1 text-center text-[11px]">
      <kbd class="font-sans">{shortcut}</kbd> saves the job on any page
    </p>
  {/if}
</main>
