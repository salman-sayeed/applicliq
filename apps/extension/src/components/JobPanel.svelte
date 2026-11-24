<script lang="ts">
  import {
    type Job,
    type JobStatus,
    type PostingDates,
    draftKey,
    findDuplicates,
    isHelperEnabled,
    redFlags,
  } from '@applicliq/core';
  import { Prefs, applyAppearance, fly, setPrefs, slide } from '@applicliq/ui';
  import { onMount, untrack } from 'svelte';
  import { showGoalBadge } from '@/lib/badge';
  import { getSaveShortcut, openDashboard, openSettings } from '@/lib/config';
  import { SYNC_STATUS_KEY, type SyncStatus, isLocked, readSyncStatus } from '@/lib/sync-status';
  import { repo } from '@/lib/db';
  import {
    DRAFT_AREA,
    type Draft,
    type DraftField,
    clearDraftBadge,
    draftFrom,
    drafts,
    isDraftValid,
    showDraftBadge,
    toNewJob,
  } from '@/lib/draft';
  import { notifyJobsChanged, requestSync } from '@/lib/messages';
  import { openSidebar, sidebarSupported } from '@/lib/open-in';
  import { requestPageAccess } from '@/lib/page-access';
  import { takePendingLink } from '@/lib/pending-link';
  import { extractFromTab, getActiveTab, isSavableUrl, startPicker } from '@/lib/tabs';
  import DuplicatePrompt from './DuplicatePrompt.svelte';
  import HeadsUp from './HeadsUp.svelte';
  import JobForm from './JobForm.svelte';
  import RecentJobs from './RecentJobs.svelte';
  import SavedJob from './SavedJob.svelte';

  /**
   * The save-job panel: reads the current tab, shows the form (or the saved job) and keeps the
   * unsaved form as a per-page draft. The popup and the sidebar both mount it; the sidebar
   * follows the active tab.
   */
  let { surface }: { surface: 'popup' | 'sidebar' } = $props();

  type View =
    | { kind: 'loading' }
    | { kind: 'unsupported' }
    /** Sidebar without access to the tab (the user switched tabs or navigated). */
    | { kind: 'needs-access' }
    | { kind: 'form'; notice?: string; restored: boolean }
    | { kind: 'saved'; job: Job; justSaved: boolean };

  const RECENT_COUNT = 5;
  const AUTOSAVE_MS = 150;

  const prefs = setPrefs(new Prefs());

  let view = $state<View>({ kind: 'loading' });
  let draft = $state<Draft>(draftFrom({}, ''));
  let saving = $state(false);
  let error = $state<string>();
  let recent = $state<Job[]>([]);
  /** Every saved job, for the "Heads up" notes and the duplicate check. */
  let allJobs = $state.raw<Job[]>([]);
  /** The posting's dates as read from the page (for a saved job; the form keeps its own). */
  let posting = $state.raw<PostingDates>();
  /** The page was read (not a bare link), so "no salary" means the page shows none. */
  let pageRead = $state(false);
  /** A saved job that looks like this one, asked about on save. */
  let duplicate = $state.raw<{ match: Job; status: JobStatus }>();
  let shortcut = $state<string>();
  let windowId = $state<number>();
  /** Encrypted sync waits for this device to be unlocked. */
  let syncLocked = $state(false);

  /** The page the form belongs to: its URL keys the draft. */
  let page = $state.raw<{ url: string; tabId?: number }>();
  /** The form as loaded / last written, to save only real edits and skip our own echoes. */
  let baseline = '';
  let lastWritten = '';
  let loadRun = 0;

  const currentId = $derived(view.kind === 'saved' ? view.job.id : undefined);
  const recentShown = $derived(recent.filter((j) => j.id !== currentId).slice(0, RECENT_COUNT));

  async function loadRecent() {
    allJobs = await repo.getJobs();
    recent = allJobs.slice(0, RECENT_COUNT + 1);
  }

  const flags = $derived.by(() => {
    const settings = prefs.settings;
    if (!isHelperEnabled(settings, 'redFlags')) return [];
    const options = {
      jobs: allJobs,
      oldPostingDays: settings.helpers.oldPostingDays,
      appliedBeforeDays: settings.helpers.appliedBeforeDays,
      pageRead,
    };
    if (view.kind === 'form') {
      const { salary } = toNewJob(draft);
      return redFlags({
        ...options,
        posting: draft.posting,
        job: { company: draft.company, salary },
      });
    }
    if (view.kind === 'saved') return redFlags({ ...options, posting, job: view.job });
    return [];
  });

  // --- Draft autosave -------------------------------------------------------------------------

  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: (() => Promise<void>) | undefined;

  function flushDraft(): Promise<void> {
    clearTimeout(timer);
    const write = pending;
    pending = undefined;
    return write?.() ?? Promise.resolve();
  }

  function cancelDraft() {
    clearTimeout(timer);
    pending = undefined;
  }

  function writeDraft(target: NonNullable<typeof page>, json: string) {
    lastWritten = json;
    if (target.tabId !== undefined) void showDraftBadge(target.tabId);
    return drafts.save(target.url, JSON.parse(json) as Draft);
  }

  $effect(() => {
    // Only form edits trigger a save; the page is read untracked, so switching pages doesn't
    // write the previous page's form under the new page's key.
    const target = untrack(() => page);
    if (view.kind !== 'form' || !target) return;
    const json = JSON.stringify(draft);
    if (json === baseline || json === lastWritten) return cancelDraft();
    clearTimeout(timer);
    pending = () => writeDraft(target, json);
    timer = setTimeout(() => void flushDraft(), AUTOSAVE_MS);
  });

  // --- Loading --------------------------------------------------------------------------------

  async function load({ reset = false } = {}) {
    const run = ++loadRun;
    await flushDraft();
    error = undefined;
    const settings = await repo.getSettings();
    prefs.settings = settings;
    applyAppearance(settings.appearance);
    void showGoalBadge(undefined, settings);

    const link = surface === 'popup' ? await takePendingLink() : undefined;
    const tab = link ? undefined : await getActiveTab();
    if (run !== loadRun) return;
    if (!link && (!tab?.id || !isSavableUrl(tab.url))) {
      page = undefined;
      // Without access the tab's URL is hidden; in the sidebar that's fixable.
      const hidden = tab?.id !== undefined && tab.url === undefined;
      view = { kind: hidden && surface === 'sidebar' ? 'needs-access' : 'unsupported' };
      return;
    }
    const target = link ? { url: link.url } : { url: tab!.url!, tabId: tab!.id! };
    if (!page || draftKey(page.url) !== draftKey(target.url)) view = { kind: 'loading' };
    page = target;
    lastWritten = '';

    if (reset) {
      await drafts.remove(target.url);
      if (target.tabId !== undefined) await clearDraftBadge(target.tabId);
    }
    const stored = await drafts.get(target.url);
    const extracted = stored || !target.tabId ? undefined : await extractFromTab(target.tabId);
    const url = stored?.url ?? extracted?.job.url ?? target.url;
    const existing = await repo.getJobByUrl(url);
    if (run !== loadRun) return;
    posting = stored?.posting ?? extracted?.posting;
    pageRead = !link && !!(stored || extracted);
    duplicate = undefined;

    if (existing) {
      if (stored) await forgetDraft();
      view = { kind: 'saved', job: existing, justSaved: false };
      return;
    }

    draft = stored ?? {
      ...draftFrom(
        extracted?.job ?? { title: link?.title ?? tab?.title ?? '' },
        url,
        settings.regional,
      ),
      ...(extracted?.posting ? { posting: extracted.posting } : {}),
    };
    baseline = JSON.stringify(draft);
    view = {
      kind: 'form',
      restored: !!stored,
      notice: stored
        ? undefined
        : link
          ? 'Saving a link: add the company, then save.'
          : !extracted
            ? "Couldn't read this page. Fill in the details."
            : extracted.confidence < 0.5
              ? 'This page had little job info. Check the details.'
              : undefined,
    };
  }

  /** Drops the current page's draft and its toolbar mark. */
  async function forgetDraft() {
    cancelDraft();
    if (!page) return;
    await drafts.remove(page.url);
    if (page.tabId !== undefined) await clearDraftBadge(page.tabId);
  }

  // --- Actions --------------------------------------------------------------------------------

  /**
   * Saves the form. With "Same job on two sites" on, a job that looks like a saved one is asked
   * about first (`duplicate`); `then` runs after the save (merge, or remember "not a duplicate").
   */
  async function save(status: JobStatus, then?: (job: Job) => Promise<Job | void>) {
    if (saving || !isDraftValid(draft)) return;
    if (!then && isHelperEnabled(prefs.settings, 'duplicates')) {
      const [match] = findDuplicates(
        { company: draft.company, title: draft.title },
        await repo.getJobs(),
        { notDuplicates: prefs.settings.helpers.notDuplicatePairs },
      );
      if (match) {
        duplicate = { match, status };
        return;
      }
    }
    saving = true;
    error = undefined;
    try {
      const keep = prefs.settings.automation.saveDescriptionSnapshot;
      let job = await repo.addJob({ ...toNewJob(draft, keep), status });
      await forgetDraft();
      job = (await then?.(job)) ?? job;
      duplicate = undefined;
      notifyJobsChanged();
      view = { kind: 'saved', job, justSaved: true };
      await loadRecent();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not save the job.';
    } finally {
      saving = false;
    }
  }

  function mergeDuplicate(keep: 'saved' | 'new') {
    if (!duplicate) return;
    const { match, status } = duplicate;
    void save(status, (job) =>
      keep === 'saved'
        ? repo.mergeDuplicates(match.id, job.id)
        : repo.mergeDuplicates(job.id, match.id),
    );
  }

  function saveSeparately() {
    if (!duplicate) return;
    const { match, status } = duplicate;
    void save(status, (job) => repo.markNotDuplicate(job.id, match.id));
  }

  async function setStatus(status: JobStatus) {
    if (view.kind !== 'saved') return;
    const job = await repo.updateJob(view.job.id, { status });
    notifyJobsChanged();
    view = { ...view, job };
    await loadRecent();
  }

  /** "Pick from page": store the form as it is, start the picker, get out of the way. */
  async function pick(field: DraftField) {
    if (!page?.tabId) return;
    cancelDraft();
    await writeDraft(page, JSON.stringify(draft));
    if (!(await startPicker(page.tabId, field))) {
      error = "Can't pick from this page. Reload it and try again.";
      return;
    }
    if (surface === 'popup') window.close();
  }

  function moveToSidebar() {
    // Open first: the browser allows it only inside the click. The draft write is already
    // queued before the sidebar reads it.
    if (view.kind === 'form' && page) void writeDraft(page, JSON.stringify(draft));
    openSidebar(windowId).then(
      () => window.close(),
      () => (error = "Couldn't open the sidebar."),
    );
  }

  function grantAccess() {
    // The permission prompt needs the click's user gesture: ask before any await.
    requestPageAccess().then(
      (granted) => granted && void load(),
      () => {},
    );
  }

  function onkeydown(event: KeyboardEvent) {
    // Alt+Shift+S (the save shortcut) or Ctrl/Cmd+Enter saves from inside the panel.
    const shortcutKey = event.altKey && event.shiftKey && event.code === 'KeyS';
    const submitKey = (event.metaKey || event.ctrlKey) && event.key === 'Enter';
    if ((shortcutKey || submitKey) && view.kind === 'form') {
      event.preventDefault();
      void save(prefs.settings.automation.defaultSaveStatus);
    }
  }

  // --- Following the tab (sidebar) and draft changes from the page ----------------------------

  let reloadTimer: ReturnType<typeof setTimeout> | undefined;

  /** Reloads when the active tab shows another page (or the last load couldn't read it). */
  function checkTab() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      const tab = await getActiveTab();
      const stale = view.kind === 'unsupported' || view.kind === 'needs-access';
      const moved =
        tab?.id !== page?.tabId ||
        (tab?.url !== undefined && page && draftKey(tab.url) !== draftKey(page.url));
      if (stale || moved) await load();
    }, 250);
  }

  /** The background wrote this page's draft (context menu, picker): show it. */
  function onStorageChanged(changes: Record<string, { newValue?: unknown }>, area: string) {
    if (area === 'local' && SYNC_STATUS_KEY in changes) {
      syncLocked = isLocked(changes[SYNC_STATUS_KEY]!.newValue as SyncStatus | undefined);
    }
    if (area !== DRAFT_AREA || !page || view.kind === 'saved') return;
    const stored = changes[draftKey(page.url)]?.newValue as { draft?: Draft } | undefined;
    if (!stored?.draft) return;
    const json = JSON.stringify(stored.draft);
    if (json === lastWritten || json === JSON.stringify(draft)) return;
    cancelDraft();
    draft = stored.draft;
    baseline = lastWritten = json;
    view = { kind: 'form', restored: true };
  }

  onMount(() => {
    // Opening the panel pulls changes from other devices (no-op when signed out).
    requestSync();
    void readSyncStatus().then((status) => (syncLocked = isLocked(status)));
    void loadRecent();
    void load().catch(() => (view = { kind: 'unsupported' }));
    void getSaveShortcut().then((value) => (shortcut = value));
    void browser.windows.getCurrent().then((w) => (windowId = w.id));

    browser.storage.onChanged.addListener(onStorageChanged);
    // The popup closes as soon as the page gets focus: write what's pending first.
    const onBlur = () => void flushDraft();
    window.addEventListener('blur', onBlur);

    const onActivated = (info: { windowId: number }) => {
      if (info.windowId === windowId) checkTab();
    };
    const onUpdated = (tabId: number, change: { url?: string; status?: string }) => {
      if (tabId === page?.tabId || page === undefined) {
        if (change.url !== undefined || change.status === 'complete') checkTab();
      }
    };
    if (surface === 'sidebar') {
      browser.tabs.onActivated.addListener(onActivated);
      browser.tabs.onUpdated.addListener(onUpdated);
    }
    return () => {
      browser.storage.onChanged.removeListener(onStorageChanged);
      window.removeEventListener('blur', onBlur);
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  });
</script>

<svelte:window {onkeydown} />

<main class="flex flex-col gap-4 p-4">
  <header class="flex items-center justify-between">
    <h1 class="flex items-center gap-2 text-sm font-semibold">
      <img src="/icon/32.png" alt="" class="size-5" />
      AppliCliq
    </h1>
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => openDashboard()}
        class="text-accent focus-visible:ring-accent rounded px-1 text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        Open dashboard ↗
      </button>
      {#if surface === 'popup' && sidebarSupported}
        <button
          type="button"
          onclick={moveToSidebar}
          aria-label="Open in sidebar"
          title="Open in sidebar"
          class="text-ink-muted hover:text-ink hover:bg-surface-muted focus-visible:ring-accent rounded-md p-1 transition focus-visible:ring-2 focus-visible:outline-none"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            class="size-4"
            aria-hidden="true"
          >
            <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
            <path d="M12.5 3.5v13" />
          </svg>
        </button>
      {/if}
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

  {#if syncLocked}
    <button
      type="button"
      onclick={() => openSettings('data')}
      class="bg-surface-muted text-ink hover:bg-line/60 focus-visible:ring-accent flex items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition focus-visible:ring-2 focus-visible:outline-none"
    >
      <span aria-hidden="true">🔒</span>
      <span>Sync paused · <span class="text-accent font-medium">Unlock</span></span>
    </button>
  {/if}

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
          {surface === 'sidebar'
            ? 'Open a job posting in this window to save it.'
            : 'Open a job posting in this tab, then click AppliCliq to save it.'}
        </p>
      {:else if view.kind === 'needs-access'}
        <div class="flex flex-col items-start gap-2 text-sm">
          <p class="text-ink-muted">
            To follow your tabs, the sidebar needs to read the job pages you open. It reads a page
            only while the sidebar is open, and nothing leaves this browser.
          </p>
          <button
            type="button"
            onclick={grantAccess}
            class="text-accent focus-visible:ring-accent rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Allow reading pages
          </button>
        </div>
      {:else if view.kind === 'form'}
        {#if view.notice}
          <p class="bg-surface-muted text-ink-muted mb-3 rounded-md px-2.5 py-1.5 text-xs">
            {view.notice}
          </p>
        {/if}
        {#if view.restored}
          <p class="text-ink-muted mb-2 text-xs">
            Draft restored ·
            <button
              type="button"
              onclick={() => void load({ reset: true })}
              class="text-accent focus-visible:ring-accent rounded font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              Reset
            </button>
          </p>
        {/if}
        {#if flags.length}
          <div class="mb-3"><HeadsUp {flags} onopen={(id) => openDashboard(id)} /></div>
        {/if}
        <JobForm
          bind:draft
          {saving}
          defaultStatus={prefs.settings.automation.defaultSaveStatus}
          duplicateWarning={prefs.settings.jobPages.duplicateWarning}
          showAppliedWarning={!isHelperEnabled(prefs.settings, 'redFlags')}
          onsave={(status) => save(status)}
          onpick={page?.tabId !== undefined ? pick : undefined}
        />
        {#if duplicate}
          <DuplicatePrompt
            match={duplicate.match}
            busy={saving}
            onmerge={mergeDuplicate}
            onseparate={saveSeparately}
            oncancel={() => (duplicate = undefined)}
          />
        {/if}
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
        {#if flags.length}
          <div class="mb-3"><HeadsUp {flags} onopen={(id) => openDashboard(id)} /></div>
        {/if}
        <SavedJob
          job={view.job}
          justSaved={view.justSaved}
          onstatus={setStatus}
          onopen={() => openDashboard(view.kind === 'saved' ? view.job.id : undefined)}
        />
      {/if}
    </div>
  {/key}

  {#if error && view.kind !== 'form'}
    <p role="alert" class="text-status-rejected -mt-2 text-xs">{error}</p>
  {/if}

  <RecentJobs jobs={recentShown} />

  {#if shortcut}
    <p class="text-ink-muted -mt-1 text-center text-[11px]">
      <kbd class="font-sans">{shortcut}</kbd> saves the job on any page
    </p>
  {/if}
</main>
