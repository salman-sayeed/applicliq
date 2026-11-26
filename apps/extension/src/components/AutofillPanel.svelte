<script lang="ts">
  import {
    type AutofillProfile,
    type Job,
    PLATFORM_NAMES,
    type SavedAnswer,
    type Settings,
    isJobBoardPlatform,
    isProfileEmpty,
  } from '@applicliq/core';
  import {
    type ControlKind,
    type FillPlan,
    type PlanItem,
    UNFILLED_REASONS,
    buildPlan,
  } from '@applicliq/core/autofill';
  import { slide } from '@applicliq/ui';
  import { onMount } from 'svelte';
  import {
    type FrameQuestion,
    type TabScan,
    canWatchConfirmation,
    fillTab,
    requestFrameAccess,
    scanTab,
    undoTab,
  } from '@/lib/autofill';
  import { openSettings } from '@/lib/config';
  import { repo } from '@/lib/db';
  import {
    type AutofillFilledMessage,
    type AutofillPageMessage,
    notifyJobsChanged,
  } from '@/lib/messages';

  /**
   * "Autofill this form" in the popup and sidebar: reads the form in the tab (every frame),
   * previews what it would put where (values editable, guesses marked "Suggested"), fills on
   * "Fill", and offers Undo. Links the application to a saved job so "Mark as applied?" can
   * follow. Never submits anything.
   */
  let {
    tabId,
    settings,
    job,
    jobs,
    onensurejob,
    onlinkjob,
    oncreatejob,
  }: {
    tabId: number;
    settings: Settings;
    /** The saved job for this page, if there is one. */
    job?: Job;
    /** Every saved job, for "Link to a saved job". */
    jobs: Job[];
    /** Job boards: saves the job from the form above (undefined if it lacks a title/company). */
    onensurejob: () => Promise<Job | undefined>;
    /** Forms: links this page to a saved job. */
    onlinkjob: (job: Job) => Promise<void>;
    /** Forms: puts the form's title in the save form above. */
    oncreatejob: (title: string) => void;
  } = $props();

  type Row = PlanItem & { include: boolean; edited: string };
  type Phase =
    | { kind: 'idle' }
    | { kind: 'scanning' }
    | { kind: 'empty'; blocked: string[] }
    | { kind: 'preview' }
    | { kind: 'filling' }
    | {
        kind: 'filled';
        count: number;
        failed: string[];
        undone?: { restored: number; notRestorable: string[] };
      }
    | { kind: 'error'; message: string };

  let phase = $state<Phase>({ kind: 'idle' });
  let scan = $state.raw<TabScan>();
  let plan = $state.raw<FillPlan>();
  let rows = $state<Row[]>([]);
  let overwrite = $state(false);
  let newPage = $state(false);
  let profile = $state.raw<AutofillProfile>();
  let answers = $state.raw<SavedAnswer[]>([]);
  let linkQuery = $state('');
  let linking = $state(false);
  let filledFrames: number[] = [];

  const platform = $derived(scan?.platform);
  const platformName = $derived(platform ? PLATFORM_NAMES[platform] : undefined);
  const chosen = $derived(rows.filter((r) => r.include && (!r.hasValue || overwrite)));
  const isForm = $derived(platform === 'googleForms' || platform === 'microsoftForms');
  const matches = $derived(
    linkQuery.trim()
      ? jobs
          .filter((j) =>
            `${j.title} ${j.company}`.toLowerCase().includes(linkQuery.trim().toLowerCase()),
          )
          .slice(0, 5)
      : jobs.slice(0, 5),
  );

  onMount(() => {
    void repo.getAutofillProfile().then((p) => (profile = p));
    void repo.getSavedAnswers().then((a) => (answers = a));
    // The form showed its next page (single-page apps tell us; full page loads show up as a tab
    // update): offer "Fill this page".
    const onMessage = (message: unknown, sender: { tab?: { id?: number } }) => {
      const m = message as AutofillPageMessage | undefined;
      if (
        m?.type === 'applicliq:autofill-page' &&
        sender.tab?.id === tabId &&
        phase.kind === 'filled'
      ) {
        newPage = true;
      }
    };
    const onUpdated = (id: number, change: { status?: string }) => {
      if (id === tabId && change.status === 'complete' && phase.kind === 'filled') newPage = true;
    };
    browser.runtime.onMessage.addListener(onMessage);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  });

  const empty = $derived(!!profile && isProfileEmpty(profile) && !answers.length);

  async function start() {
    newPage = false;
    phase = { kind: 'scanning' };
    try {
      const [p, a] = await Promise.all([repo.getAutofillProfile(), repo.getSavedAnswers()]);
      profile = p;
      answers = a;
      scan = await scanTab(tabId);
    } catch {
      phase = { kind: 'error', message: "Can't read this page. Reload it and try again." };
      return;
    }
    if (!scan.questions.length) {
      phase = { kind: 'empty', blocked: scan.blockedOrigins };
      return;
    }
    plan = buildPlan(scan.questions, { profile: profile!, answers, eeo: settings.autofill.eeo });
    rows = plan.items.map((item) => ({
      ...item,
      include: item.confidence === 'high',
      edited: item.value,
    }));
    overwrite = false;
    if (settings.autofill.skipPreview) await fill();
    else phase = { kind: 'preview' };
  }

  function grant(origin: string) {
    // The permission prompt needs the click: ask before any await.
    requestFrameAccess(origin).then(
      (granted) => granted && void start(),
      () => {},
    );
  }

  /** Questions left for the user that can offer "Save this answer for next time?". */
  function offerSaveFor(): FrameQuestion[] {
    if (!settings.autofill.offerToSaveAnswers || !plan || !scan) return [];
    const ids = new Set(
      plan.unfilled
        .filter((u) => (u.kind === 'text' || u.kind === 'textarea') && u.reason.startsWith('no-'))
        .map((u) => `${u.frameId}:${u.questionId}`),
    );
    return scan.questions.filter((q) => ids.has(`${q.frameId}:${q.id}`));
  }

  async function fill() {
    if (!scan) return;
    phase = { kind: 'filling' };
    let target = job;
    try {
      if (!target && isJobBoardPlatform(platform)) target = await onensurejob();
      const items = chosen.map((r) => ({
        frameId: r.frameId ?? 0,
        questionId: r.questionId,
        value: r.edited,
        ...(r.kind === 'checkbox' ? { values: [r.edited] } : {}),
        ...(r.optionKind && r.edited === r.value ? { optionKind: r.optionKind } : {}),
      }));
      const report = await fillTab(tabId, items, {
        offerSaveFor: offerSaveFor(),
        savedQuestions: answers.map((a) => a.question),
      });
      filledFrames = [...new Set(items.map((i) => i.frameId))];
      const message: AutofillFilledMessage = {
        type: 'applicliq:autofill-filled',
        tabId,
        jobId: target?.id,
      };
      await browser.runtime.sendMessage(message).catch(() => {});
      // Without a way to see the page after submitting, "Mark as applied when I click Fill".
      if (
        settings.autofill.markAppliedOnFill &&
        target?.status === 'saved' &&
        !(settings.autofill.showButton && (await canWatchConfirmation(scan.url)))
      ) {
        await repo.updateJob(target.id, { status: 'applied' });
        notifyJobsChanged();
      }
      const labels = new Map(rows.map((r) => [`${r.frameId ?? 0}:${r.questionId}`, r.label]));
      phase = {
        kind: 'filled',
        count: report.filled.length,
        failed: report.failed.map((f) => f.label || labels.get(f.questionId) || 'A question'),
      };
    } catch {
      phase = { kind: 'error', message: "Couldn't fill this page. Reload it and try again." };
    }
  }

  async function undo() {
    if (phase.kind !== 'filled') return;
    try {
      const undone = await undoTab(tabId, filledFrames.length ? filledFrames : [0]);
      phase = { ...phase, undone };
    } catch {
      phase = { kind: 'error', message: "Couldn't undo: the page changed." };
    }
  }

  async function link(target: Job) {
    linking = true;
    try {
      await onlinkjob(target);
    } finally {
      linking = false;
    }
  }

  function setSkipPreview(on: boolean) {
    void repo.updateSettings({ autofill: { skipPreview: on } }).then(() => notifyJobsChanged());
  }

  const CHOICE: readonly ControlKind[] = ['select', 'radio', 'checkbox', 'yesno', 'dropdown'];
  const fileCount = $derived(plan?.unfilled.filter((u) => u.reason === 'file').length ?? 0);
  const btn =
    'border-line text-ink hover:bg-surface-muted focus-visible:ring-accent rounded-md border px-2.5 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50';
  const primary =
    'bg-accent text-accent-ink focus-visible:ring-accent rounded-md px-3 py-1.5 text-sm font-medium transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50';
  const linkClass =
    'text-accent focus-visible:ring-accent rounded font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none';
  const field =
    'border-line bg-surface text-ink focus:border-accent focus:ring-accent/25 w-full min-w-0 rounded-md border px-2 py-1 text-xs focus:ring-2 focus:outline-none';
</script>

<section class="flex flex-col gap-2" aria-label="Autofill">
  {#if phase.kind === 'idle' || phase.kind === 'error'}
    <div class="flex items-center justify-between gap-2">
      <button type="button" class={primary} onclick={() => void start()} disabled={empty}>
        Autofill this form
      </button>
      {#if empty}
        <button type="button" class="{linkClass} text-xs" onclick={() => openSettings('autofill')}>
          Add your details first →
        </button>
      {/if}
    </div>
    {#if phase.kind === 'error'}
      <p role="alert" class="text-status-rejected text-xs">{phase.message}</p>
    {/if}
  {:else if phase.kind === 'scanning' || phase.kind === 'filling'}
    <p class="text-ink-muted text-xs" aria-busy="true">
      {phase.kind === 'scanning' ? 'Reading the form…' : 'Filling…'}
    </p>
  {:else if phase.kind === 'empty'}
    {#if phase.blocked.length}
      <p class="text-ink-muted text-xs leading-relaxed">
        The form is inside a frame from {phase.blocked.map((o) => new URL(o).host).join(', ')}.
        AppliCliq needs your permission to read it.
      </p>
      <div class="flex flex-wrap gap-2">
        {#each phase.blocked as origin (origin)}
          <button type="button" class={btn} onclick={() => grant(origin)}>
            Allow {new URL(origin).host}
          </button>
        {/each}
      </div>
    {:else}
      <p class="text-ink-muted text-xs">No application form on this page.</p>
    {/if}
    <button type="button" class="{linkClass} self-start text-xs" onclick={() => void start()}>
      Try again
    </button>
  {:else if phase.kind === 'preview' && plan}
    <div class="flex items-baseline justify-between gap-2">
      <h2 class="text-sm font-medium">
        I can fill {chosen.length} of {plan.total} questions
      </h2>
      {#if platformName}<span class="text-ink-muted text-[11px]">{platformName}</span>{/if}
    </div>

    {#if !job && isForm}
      <div class="bg-surface-muted flex flex-col gap-1.5 rounded-md px-2.5 py-2 text-xs">
        <p>Track this application:</p>
        <input
          class={field}
          placeholder="Link to a saved job: search…"
          aria-label="Search saved jobs"
          bind:value={linkQuery}
        />
        {#if matches.length}
          <ul class="flex flex-col">
            {#each matches as candidate (candidate.id)}
              <li>
                <button
                  type="button"
                  disabled={linking}
                  class="hover:bg-surface w-full truncate rounded px-1.5 py-1 text-left"
                  onclick={() => void link(candidate)}
                >
                  {candidate.title} <span class="text-ink-muted">· {candidate.company}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        <button
          type="button"
          class="{linkClass} self-start"
          onclick={() => oncreatejob(scan?.title || '')}
        >
          Or create a new job{scan?.title ? ` (“${scan.title}”)` : ''} above
        </button>
      </div>
    {:else if !job && isJobBoardPlatform(platform)}
      <p class="text-ink-muted text-xs">Filling also saves this job to AppliCliq.</p>
    {/if}

    <ul class="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
      {#each rows as row (`${row.frameId}:${row.questionId}`)}
        {@const disabled = row.hasValue && !overwrite}
        <li class="flex flex-col gap-1 {disabled ? 'opacity-60' : ''}">
          <label class="flex items-start gap-1.5 text-xs">
            <input type="checkbox" class="mt-0.5" bind:checked={row.include} {disabled} />
            <span class="min-w-0 flex-1">
              <span class="line-clamp-2">{row.label || 'Untitled question'}</span>
              {#if row.confidence === 'medium'}
                <span class="bg-surface-muted text-ink-muted ml-1 rounded px-1 text-[10px]">
                  Suggested
                </span>
              {/if}
              {#if row.source === 'answer'}
                <span class="bg-surface-muted text-ink-muted ml-1 rounded px-1 text-[10px]">
                  Saved answer
                </span>
              {/if}
              {#if row.hasValue}
                <span class="text-ink-muted ml-1 text-[10px]">Already answered</span>
              {/if}
            </span>
          </label>
          {#if CHOICE.includes(row.kind) && row.options.length}
            <select
              class="{field} ml-5 w-auto"
              bind:value={row.edited}
              aria-label="Answer to {row.label}"
            >
              {#each row.options as option (option)}<option value={option}>{option}</option>{/each}
            </select>
          {:else if row.kind === 'textarea'}
            <textarea
              class="{field} ml-5 w-auto"
              rows="2"
              bind:value={row.edited}
              aria-label="Answer to {row.label}"></textarea>
          {:else}
            <input
              class="{field} ml-5 w-auto"
              bind:value={row.edited}
              aria-label="Answer to {row.label}"
            />
          {/if}
        </li>
      {/each}
    </ul>

    {#if plan.unfilled.length}
      <details class="text-xs">
        <summary class="text-ink-muted cursor-pointer">
          Couldn’t fill {plan.unfilled.length}
        </summary>
        <ul class="mt-1 flex flex-col gap-1">
          {#each plan.unfilled as u (`${u.frameId}:${u.questionId}`)}
            <li>
              <span class="line-clamp-1">{u.label || 'Untitled question'}</span>
              <span class="text-ink-muted">{UNFILLED_REASONS[u.reason]}</span>
            </li>
          {/each}
        </ul>
      </details>
    {/if}

    <div class="flex flex-col gap-1 text-xs">
      {#if rows.some((r) => r.hasValue)}
        <label class="flex items-center gap-1.5">
          <input type="checkbox" bind:checked={overwrite} /> Overwrite existing values
        </label>
      {/if}
      <label class="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={settings.autofill.skipPreview}
          onchange={(e) => setSkipPreview(e.currentTarget.checked)}
        />
        Skip preview next time
      </label>
    </div>
    <div class="flex items-center gap-2">
      <button type="button" class={primary} disabled={!chosen.length} onclick={() => void fill()}>
        Fill
      </button>
      <button type="button" class={btn} onclick={() => (phase = { kind: 'idle' })}>Cancel</button>
    </div>
    <p class="text-ink-muted text-[11px]">You review and submit the form yourself.</p>
  {:else if phase.kind === 'filled'}
    <div class="flex items-center gap-2 text-sm" role="status">
      <span>Filled {phase.count} {phase.count === 1 ? 'field' : 'fields'}</span>
      {#if !phase.undone && phase.count}
        <span aria-hidden="true">·</span>
        <button type="button" class="{linkClass} text-sm" onclick={() => void undo()}>Undo</button>
      {/if}
    </div>
    {#if phase.undone}
      <p class="text-ink-muted text-xs" transition:slide={{ duration: 150 }}>
        Undone{phase.undone.notRestorable.length
          ? `. Change these back yourself: ${phase.undone.notRestorable.join(', ')}`
          : ''}.
      </p>
    {/if}
    {#if phase.failed.length}
      <p class="text-ink-muted text-xs">Couldn’t fill: {phase.failed.join(', ')}</p>
    {/if}
    {#if fileCount}
      <p class="text-ink-muted text-xs">Attach your resume on the page yourself.</p>
    {/if}
    {#if newPage}
      <div
        class="bg-surface-muted flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs"
      >
        <span>The form moved to a new page.</span>
        <button type="button" class={btn} onclick={() => void start()}>Fill this page</button>
      </div>
    {:else}
      <button type="button" class="{linkClass} self-start text-xs" onclick={() => void start()}>
        Fill again
      </button>
    {/if}
  {/if}
</section>
