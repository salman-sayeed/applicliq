<script lang="ts">
  import type { Job, JobStatus } from '@pocket-career/core';
  import { onMount } from 'svelte';
  import { fly, slide } from 'svelte/transition';
  import { SAVE_SHORTCUT_COMMAND, openDashboard } from '@/lib/config';
  import { repo } from '@/lib/db';
  import { type Draft, draftFrom, isDraftValid, toNewJob } from '@/lib/draft';
  import { takePendingLink } from '@/lib/pending-link';
  import { clearBadge, extractFromTab, getActiveTab, isSavableUrl } from '@/lib/tabs';
  import JobForm from './JobForm.svelte';
  import RecentJobs from './RecentJobs.svelte';
  import SavedJob from './SavedJob.svelte';

  type View =
    | { kind: 'loading' }
    | { kind: 'unsupported' }
    | { kind: 'form'; notice?: string }
    | { kind: 'saved'; job: Job; justSaved: boolean };

  const RECENT_COUNT = 5;

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
    void clearBadge();
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

    draft = draftFrom(extracted?.job ?? { title: fallbackTitle }, url);
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
      const job = await repo.addJob({ ...toNewJob(draft), status });
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
    view = { ...view, job };
    await loadRecent();
  }

  function onkeydown(event: KeyboardEvent) {
    // Alt+Shift+S (the save shortcut) or Ctrl/Cmd+Enter saves from inside the popup.
    const shortcutKey = event.altKey && event.shiftKey && event.code === 'KeyS';
    const submitKey = (event.metaKey || event.ctrlKey) && event.key === 'Enter';
    if ((shortcutKey || submitKey) && view.kind === 'form') {
      event.preventDefault();
      void save('saved');
    }
  }

  onMount(() => {
    void loadRecent();
    void load().catch(() => (view = { kind: 'unsupported' }));
    void browser.commands
      .getAll()
      .then((all) => (shortcut = all.find((c) => c.name === SAVE_SHORTCUT_COMMAND)?.shortcut));
  });
</script>

<svelte:window {onkeydown} />

<main class="flex flex-col gap-4 p-4">
  <header class="flex items-center justify-between">
    <h1 class="flex items-center gap-2 text-sm font-semibold">
      <img src="/icon/32.png" alt="" class="size-5" />
      Pocket Career
    </h1>
    <button
      type="button"
      onclick={() => openDashboard()}
      class="text-accent focus-visible:ring-accent rounded text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
    >
      Open dashboard ↗
    </button>
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
          Open a job posting in this tab, then click Pocket Career to save it.
        </p>
      {:else if view.kind === 'form'}
        {#if view.notice}
          <p class="bg-surface-muted text-ink-muted mb-3 rounded-md px-2.5 py-1.5 text-xs">
            {view.notice}
          </p>
        {/if}
        <JobForm bind:draft {saving} onsave={save} />
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
