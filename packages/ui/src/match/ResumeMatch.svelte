<script lang="ts">
  import { type Resume, pickResume } from '@applicliq/core';
  import type { MatchResult } from '@applicliq/core/match';
  import { slide } from '../motion';
  import { runResumeMatch } from './run-match';

  /**
   * "Resume match": which skills in a job description are on a resume and which are missing.
   * Worked out on this device by plain text matching (`@applicliq/core/match`). Load this
   * component with a dynamic `import()`: the matcher and its dictionary come with it.
   */
  let {
    description,
    resumes,
    jobResumeId,
    defaultResumeId,
    ignored,
    onignore,
    onaddresume,
    emptyText = 'No job description found on this page',
    open = $bindable(false),
    compact = false,
  }: {
    /** The job description (the saved snapshot, or the page's text). */
    description: string | undefined;
    resumes: Resume[];
    /** The resume linked to the job, picked first. */
    jobResumeId?: string;
    defaultResumeId?: string;
    /** The user's ignore list (Settings → Resumes). */
    ignored: string[];
    onignore: (skill: string) => void;
    /** Opens Settings → Resumes. */
    onaddresume: () => void;
    /** Shown when there is no description. */
    emptyText?: string;
    open?: boolean;
    /** Smaller type, for the popup. */
    compact?: boolean;
  } = $props();

  let chosenId = $state<string | undefined>(undefined);
  const resume = $derived(
    resumes.find((r) => r.id === chosenId) ??
      pickResume(resumes, { jobResumeId, defaultId: defaultResumeId }),
  );
  const text = $derived(description?.trim() ?? '');

  let result = $state.raw<MatchResult>();
  let failed = $state(false);
  let run = 0;

  $effect(() => {
    if (!open || !text || !resume) return;
    const id = ++run;
    const resumeText = resume.text;
    const ignoredNow = [...ignored];
    failed = false;
    runResumeMatch(text, resumeText, ignoredNow).then(
      (next) => {
        if (id === run) result = next;
      },
      () => {
        if (id === run) failed = true;
      },
    );
  });

  const missingRequired = $derived(result?.required.missing ?? []);
  const missingNice = $derived(result?.niceToHave.missing ?? []);
  const matched = $derived([
    ...(result?.required.matched ?? []).map((s) => s.name),
    ...(result?.niceToHave.matched ?? []).map((s) => s.name),
  ]);

  /** The chip whose actions are showing. */
  let selected = $state<{ name: string; group: string }>();
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  function select(name: string, group: string) {
    copied = false;
    selected = selected?.name === name && selected.group === group ? undefined : { name, group };
  }

  async function copy(name: string) {
    try {
      await navigator.clipboard.writeText(name);
      copied = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = false), 1200);
    } catch {
      // Clipboard blocked: nothing to do, the text is on screen.
    }
  }

  function ignore(name: string) {
    selected = undefined;
    onignore(name);
  }

  const size = $derived(compact ? 'text-xs' : 'text-sm');
  const chip =
    'focus-visible:ring-accent inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none';
  const groupTitle = 'text-ink-muted mb-1 text-[11px] font-semibold tracking-wide uppercase';
</script>

{#snippet chips(names: string[], group: string, tone: string)}
  <ul class="flex flex-wrap gap-1.5">
    {#each names as name (name)}
      <li>
        <button
          type="button"
          class="{chip} {tone}"
          aria-expanded={selected?.name === name && selected.group === group}
          onclick={() => select(name, group)}
        >
          {name}
        </button>
      </li>
    {/each}
  </ul>
  {#if selected && selected.group === group && names.includes(selected.name)}
    {@const name = selected.name}
    <div
      transition:slide={{ duration: 120 }}
      class="bg-surface-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2.5 py-1.5 text-xs"
    >
      <span class="font-medium">“{name}”</span>
      <button
        type="button"
        class="text-accent focus-visible:ring-accent rounded font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
        onclick={() => copy(name)}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        type="button"
        class="text-accent focus-visible:ring-accent rounded font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
        onclick={() => ignore(name)}
      >
        Ignore this skill
      </button>
    </div>
  {/if}
{/snippet}

<details class="group" bind:open>
  <summary
    class="text-ink flex cursor-pointer list-none items-center justify-between gap-2 font-semibold select-none {compact
      ? 'text-xs'
      : 'text-xs tracking-wide uppercase'} [&::-webkit-details-marker]:hidden"
  >
    <span class={compact ? '' : 'text-ink-muted'}>Resume match</span>
    <span aria-hidden="true" class="text-ink-muted transition group-open:rotate-90">›</span>
  </summary>

  <div class="mt-2 flex flex-col gap-3 {size}">
    {#if !text}
      <p class="text-ink-muted">{emptyText}</p>
    {:else if !resumes.length}
      <p class="text-ink-muted">
        <button
          type="button"
          class="text-accent focus-visible:ring-accent rounded font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
          onclick={onaddresume}
        >
          Add your resume
        </button>
        to see which skills match.
      </p>
    {:else}
      {#if resumes.length > 1}
        <label class="flex items-center gap-2">
          <span class="text-ink-muted text-xs">Resume</span>
          <select
            class="border-line bg-surface focus:border-accent focus:ring-accent/25 min-w-0 flex-1 rounded-md border px-2 py-1 text-xs focus:ring-2 focus:outline-none"
            value={resume?.id}
            onchange={(e) => (chosenId = e.currentTarget.value)}
          >
            {#each resumes as option (option.id)}
              <option value={option.id}>{option.name}</option>
            {/each}
          </select>
        </label>
      {:else}
        <p class="text-ink-muted text-xs">Compared with “{resume?.name}”</p>
      {/if}

      {#if failed}
        <p role="alert" class="text-status-rejected text-xs">
          Could not compare. Reload and try again.
        </p>
      {:else if !result}
        <div class="bg-surface-muted h-10 animate-pulse rounded-md" aria-busy="true"></div>
      {:else}
        <p class="font-medium" aria-live="polite">{result.summary}</p>
        {#if !resume?.text.trim()}
          <p class="text-ink-muted text-xs">
            “{resume?.name}” has no text yet.
            <button
              type="button"
              class="text-accent focus-visible:ring-accent rounded font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
              onclick={onaddresume}
            >
              Paste it in Settings
            </button>
          </p>
        {/if}

        {#if missingRequired.length}
          <div>
            <p class={groupTitle}>Missing · required</p>
            {@render chips(
              missingRequired.map((s) => s.name),
              'required',
              'border-amber-500/40 bg-amber-500/10 text-amber-900 hover:bg-amber-500/20 dark:text-amber-200',
            )}
          </div>
        {/if}
        {#if missingNice.length}
          <div>
            <p class={groupTitle}>Missing · nice to have</p>
            {@render chips(
              missingNice.map((s) => s.name),
              'nice',
              'border-line text-ink hover:bg-surface-muted',
            )}
          </div>
        {/if}
        {#if result.keywords.missing.length}
          <div>
            <p class={groupTitle}>Other keywords not on your resume</p>
            {@render chips(
              result.keywords.missing,
              'keywords',
              'border-line text-ink-muted hover:bg-surface-muted border-dashed',
            )}
          </div>
        {/if}
        {#if matched.length || result.keywords.found.length}
          <details>
            <summary class="text-accent cursor-pointer text-xs font-medium select-none">
              On your resume ({matched.length + result.keywords.found.length})
            </summary>
            <div class="mt-1.5">
              {@render chips(
                [...matched, ...result.keywords.found],
                'matched',
                'border-status-offer/40 bg-status-offer/10 text-ink hover:bg-status-offer/20',
              )}
            </div>
          </details>
        {/if}
        {#if result.ignored.length}
          <p class="text-ink-muted text-[11px]">
            Ignoring {result.ignored.length}
            {result.ignored.length === 1 ? 'skill' : 'skills'} from your list ({result.ignored.join(
              ', ',
            )}).
          </p>
        {/if}
        <p class="text-ink-muted text-[11px]">
          Plain keyword matching on this device. A missing skill may just be worded differently on
          your resume.
        </p>
      {/if}
    {/if}
  </div>
</details>
