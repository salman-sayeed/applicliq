<script lang="ts">
  import {
    type Job,
    MAX_RESUME_TEXT,
    type Resume,
    isFeatureEnabled,
    resumeSyncEnabled,
    wordCount,
  } from '@applicliq/core';
  import { onDestroy } from 'svelte';
  import type { DashboardAdapter } from '../../dashboard/adapter';
  import { slide } from '../../motion';
  import { getPrefs } from '../../prefs.svelte';
  import Field from '../Field.svelte';
  import Toggle from '../Toggle.svelte';
  import { button, danger, input, link, primary } from '../styles';
  import type { SectionProps } from '../types';

  /** Settings → Resumes: the resumes Resume match compares with, and its options. */
  let {
    settings,
    save,
    adapter,
    jobs,
    notify,
    ondata,
  }: SectionProps & {
    adapter: DashboardAdapter;
    jobs: Job[];
    notify: (message: string, tone?: 'info' | 'error') => void;
    /** Opens Sync & data (encryption). */
    ondata: () => void;
  } = $props();

  const prefs = getPrefs();
  let resumes = $state.raw<Resume[]>([]);
  let selectedId = $state<string>();
  let loaded = $state(false);

  $effect(() =>
    adapter.watchResumes(
      (next) => {
        resumes = next;
        loaded = true;
        if (!next.some((r) => r.id === selectedId)) selectedId = next[0]?.id;
      },
      (error) => notify(`Could not load resumes: ${String(error)}`, 'error'),
    ),
  );

  const selected = $derived(resumes.find((r) => r.id === selectedId));
  const syncOn = $derived(resumeSyncEnabled(settings));
  const encrypted = $derived(isFeatureEnabled(settings, 'encryptedSync'));
  const defaultId = $derived(settings.resumes.defaultResumeId);

  /** Old free-text labels on jobs that no resume matches yet. */
  const oldLabels = $derived([
    ...new Set(
      jobs
        .filter((j) => j.resumeVersion?.trim() && !j.resumeId)
        .map((j) => j.resumeVersion!.trim()),
    ),
  ]);

  // --- Editing: the text saves as you type (debounced) and when the field loses focus. ----------

  let name = $state('');
  let text = $state('');
  let editingId: string | undefined;
  let textTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const current = selected;
    // Load the selected resume; a change from elsewhere replaces fields only when not typing.
    if (current?.id !== editingId) {
      void flushText();
      editingId = current?.id;
      name = current?.name ?? '';
      text = current?.text ?? '';
    } else if (current && !textTimer && document.activeElement?.id !== 'resume-text') {
      text = current.text;
      if (document.activeElement?.id !== 'resume-name') name = current.name;
    }
  });

  async function act<T>(task: () => Promise<T>, failure: string): Promise<T | undefined> {
    try {
      return await task();
    } catch (error) {
      notify(`${failure}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      return undefined;
    }
  }

  function onTextInput() {
    clearTimeout(textTimer);
    textTimer = setTimeout(() => void flushText(), 600);
  }

  async function flushText() {
    clearTimeout(textTimer);
    textTimer = undefined;
    const id = editingId;
    const current = resumes.find((r) => r.id === id);
    if (!id || !current || current.text === text) return;
    if (await act(() => adapter.updateResume(id, { text }), 'Could not save')) notify('Saved');
  }

  onDestroy(() => void flushText());

  async function rename() {
    const id = editingId;
    const current = resumes.find((r) => r.id === id);
    if (!id || !current) return;
    if (!name.trim()) {
      name = current.name;
      return;
    }
    if (name.trim() === current.name) return;
    if (await act(() => adapter.updateResume(id, { name }), 'Could not rename')) notify('Saved');
  }

  async function add(label?: string) {
    const used = new Set(resumes.map((r) => r.name.toLowerCase()));
    let base = label ?? 'My resume';
    for (let n = 2; !label && used.has(base.toLowerCase()); n++) base = `My resume ${n}`;
    // The first resume (or one added while the default is gone) becomes the default.
    const makeDefault = !resumes.some((r) => r.id === defaultId);
    const created = await act(() => adapter.addResume({ name: base }), 'Could not add');
    if (!created) return;
    selectedId = created.id;
    if (makeDefault) void save({ resumes: { defaultResumeId: created.id } });
    queueMicrotask(() => document.getElementById(label ? 'resume-text' : 'resume-name')?.focus());
  }

  async function duplicate() {
    if (!selected) return;
    await flushText();
    const copy = await act(() => adapter.duplicateResume(selected!.id), 'Could not duplicate');
    if (copy) {
      selectedId = copy.id;
      notify('Duplicated');
    }
  }

  /** The last deleted resume, for undo. */
  let deleted = $state.raw<Resume>();
  let deletedTimer: ReturnType<typeof setTimeout> | undefined;

  async function remove() {
    if (!selected) return;
    await flushText();
    const resume = resumes.find((r) => r.id === selected!.id)!;
    if (!(await act(() => adapter.deleteResume(resume.id), 'Could not delete'))) return;
    deleted = resume;
    clearTimeout(deletedTimer);
    deletedTimer = setTimeout(() => (deleted = undefined), 10_000);
  }

  async function undoDelete() {
    const resume = deleted;
    if (!resume) return;
    deleted = undefined;
    const restored = await act(() => adapter.restoreResume(resume), 'Could not restore');
    if (restored) selectedId = restored.id;
  }

  // --- Ignore list -------------------------------------------------------------------------------

  let ignoreText = $state('');
  const ignored = $derived(settings.resumes.ignoredSkills);

  function addIgnored(event: SubmitEvent) {
    event.preventDefault();
    const skill = ignoreText.trim();
    ignoreText = '';
    if (!skill || ignored.some((s) => s.toLowerCase() === skill.toLowerCase())) return;
    void save({ resumes: { ignoredSkills: [...ignored, skill] } });
  }

  const sub = 'text-ink-muted mb-1 text-xs font-semibold tracking-wide uppercase';
</script>

<section class="py-4" aria-labelledby="resumes-list-heading">
  <h3 id="resumes-list-heading" class={sub}>Your resumes</h3>
  <p class="text-ink-muted mb-3 text-xs leading-relaxed">
    Paste the text of your resume. Resume match compares it with job descriptions to show which
    skills you mention and which are missing, on this device only: no AI, nothing sent anywhere.
  </p>

  {#if deleted}
    <div
      transition:slide={{ duration: 150 }}
      role="status"
      class="bg-surface-muted mb-3 flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
    >
      <span>Deleted “{deleted.name}”.</span>
      <button type="button" class={link} onclick={undoDelete}>Undo</button>
    </div>
  {/if}

  {#if !loaded}
    <div class="bg-surface-muted h-24 animate-pulse rounded-md"></div>
  {:else if !resumes.length}
    <div class="border-line rounded-lg border border-dashed px-4 py-6 text-center">
      <p class="mb-3 text-sm">No resumes yet.</p>
      <button type="button" class={primary} onclick={() => add()}>Add your resume</button>
    </div>
  {:else}
    <div class="flex flex-col gap-4 md:flex-row">
      <ul class="flex shrink-0 flex-col gap-1 md:w-52" aria-label="Resumes">
        {#each resumes as resume (resume.id)}
          <li>
            <button
              type="button"
              aria-current={resume.id === selectedId}
              onclick={() => (selectedId = resume.id)}
              class="focus-visible:ring-accent w-full rounded-md px-3 py-2 text-left transition focus-visible:ring-2 focus-visible:outline-none {resume.id ===
              selectedId
                ? 'bg-surface-muted'
                : 'hover:bg-surface-muted/60'}"
            >
              <span class="flex items-center gap-2 text-sm font-medium">
                <span class="truncate">{resume.name}</span>
                {#if resume.id === defaultId}
                  <span class="bg-accent/15 text-accent rounded px-1.5 text-[10px] font-semibold">
                    Default
                  </span>
                {/if}
              </span>
              <span class="text-ink-muted block text-xs">
                {wordCount(resume.text)} words · {prefs.date(resume.updatedAt)}
              </span>
            </button>
          </li>
        {/each}
        <li>
          <button type="button" class="{button} mt-1 w-full" onclick={() => add()}>
            + Add resume
          </button>
        </li>
      </ul>

      {#if selected}
        <div class="min-w-0 flex-1 space-y-3">
          <div>
            <label for="resume-name" class="text-ink-muted mb-1 block text-xs font-medium">
              Name
            </label>
            <input
              id="resume-name"
              class="{input} w-full"
              maxlength="60"
              bind:value={name}
              onchange={rename}
            />
          </div>
          <div>
            <label for="resume-text" class="text-ink-muted mb-1 block text-xs font-medium">
              Resume text
            </label>
            <textarea
              id="resume-text"
              rows="16"
              maxlength={MAX_RESUME_TEXT}
              class="{input} w-full resize-y font-mono text-xs leading-relaxed"
              placeholder="Paste your resume here (copy everything from your PDF or document)."
              bind:value={text}
              oninput={onTextInput}
              onblur={() => void flushText()}></textarea>
            <p class="text-ink-muted mt-1 text-xs">
              {wordCount(text)} words · Last updated {prefs.dateTime(selected.updatedAt)}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            {#if selected.id === defaultId}
              <span class="text-ink-muted self-center text-xs">The default resume</span>
            {:else}
              <button
                type="button"
                class={button}
                onclick={() => save({ resumes: { defaultResumeId: selected!.id } })}
              >
                Make default
              </button>
            {/if}
            <button type="button" class={button} onclick={duplicate}>Duplicate</button>
            <button type="button" class={danger} onclick={remove}>Delete</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if oldLabels.length}
    <div class="bg-surface-muted mt-4 rounded-md px-3 py-2 text-xs leading-relaxed">
      <p>
        Some jobs have a resume label from before resumes were added. Add a resume with the same
        name to link them:
      </p>
      <ul class="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {#each oldLabels as label (label)}
          <li>
            “{label}” ·
            <button type="button" class={link} onclick={() => add(label)}>Add</button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>

<section aria-labelledby="resumes-sync-heading">
  <h3 id="resumes-sync-heading" class="sr-only">Sync</h3>
  <Field
    label="Sync resumes to Google Drive"
    id="resume-sync"
    hint="Keep your resumes on your other devices. Off: they stay in this browser (backups you export still include them)."
  >
    <Toggle
      id="resume-sync"
      label="Sync resumes to Google Drive"
      checked={syncOn}
      onchange={(on) => save({ resumes: { sync: on } })}
    />
  </Field>
  {#if syncOn && !encrypted}
    <p
      transition:slide={{ duration: 150 }}
      class="-mt-2 mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
    >
      Your resume text will be stored in your Google Drive.
      <button type="button" class={link} onclick={ondata}>Turn on encryption</button> to protect it.
    </p>
  {/if}
</section>

<section class="py-4" aria-labelledby="ignored-heading">
  <h3 id="ignored-heading" class={sub}>Skills to ignore</h3>
  <p class="text-ink-muted mb-3 text-xs">
    Never flagged by Resume match (e.g. “Communication”). Synced with your settings.
  </p>
  {#if ignored.length}
    <ul class="mb-3 flex flex-wrap gap-2">
      {#each ignored as skill (skill)}
        <li
          class="border-line inline-flex items-center gap-1 rounded-md border py-0.5 pr-1 pl-2 text-sm"
        >
          {skill}
          <button
            type="button"
            aria-label="Stop ignoring {skill}"
            onclick={() => save({ resumes: { ignoredSkills: ignored.filter((s) => s !== skill) } })}
            class="text-ink-muted hover:text-ink focus-visible:ring-accent rounded px-1 focus-visible:ring-2 focus-visible:outline-none"
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <form class="flex gap-2" onsubmit={addIgnored}>
    <input
      class="{input} w-48"
      placeholder="e.g. Communication"
      aria-label="Skill to ignore"
      maxlength="80"
      bind:value={ignoreText}
    />
    <button type="submit" class={button} disabled={!ignoreText.trim()}>Ignore</button>
  </form>
</section>
