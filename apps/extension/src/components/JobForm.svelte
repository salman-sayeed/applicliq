<script lang="ts">
  import type { JobStatus } from '@applicliq/core';
  import { Button, getPrefs } from '@applicliq/ui';
  import { onMount } from 'svelte';
  import { DRAFT_FIELD_LABELS, type Draft, type DraftField, isDraftValid } from '@/lib/draft';
  import DuplicateWarning from './DuplicateWarning.svelte';

  let {
    draft = $bindable(),
    saving,
    defaultStatus = 'saved',
    duplicateWarning = true,
    showAppliedWarning = true,
    onsave,
    onpick,
  }: {
    draft: Draft;
    saving: boolean;
    /** What "Save" sets (the default status setting). */
    defaultStatus?: JobStatus;
    /** Mention other jobs at the same company (setting). */
    duplicateWarning?: boolean;
    /** Off when the "Heads up" row says it instead. */
    showAppliedWarning?: boolean;
    onsave: (status: JobStatus) => void;
    /** "Pick from page" for a field; left out where the page can't be picked from. */
    onpick?: (field: DraftField) => void;
  } = $props();

  const prefs = getPrefs();

  const valid = $derived(isDraftValid(draft));
  const host = $derived.by(() => {
    try {
      return new URL(draft.url).hostname.replace(/^www\./, '');
    } catch {
      return draft.url;
    }
  });

  let titleInput = $state<HTMLInputElement>();
  let companyInput = $state<HTMLInputElement>();

  // Focus the first required field that still needs input.
  onMount(() => {
    if (!draft.title) titleInput?.focus();
    else if (!draft.company) companyInput?.focus();
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (valid && !saving) onsave(defaultStatus);
  }
</script>

{#snippet pickButton(field: DraftField, placement = 'absolute top-1/2 right-1 -translate-y-1/2')}
  {#if onpick}
    <button
      type="button"
      onclick={() => onpick(field)}
      aria-label="Pick {DRAFT_FIELD_LABELS[field].toLowerCase()} from the page"
      title="Pick from the page"
      class="{placement} text-ink-muted hover:text-accent hover:bg-surface-muted focus-visible:ring-accent rounded p-1 transition focus-visible:ring-2 focus-visible:outline-none"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        class="size-3.5"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="5.5" />
        <circle cx="10" cy="10" r="1" fill="currentColor" />
        <path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" />
      </svg>
    </button>
  {/if}
{/snippet}

<form class="flex flex-col gap-3" onsubmit={submit} novalidate>
  <p class="text-ink-muted truncate text-xs" title={draft.url}>{host}</p>

  <div>
    <label class="label" for="title">Job title <span class="text-accent">*</span></label>
    <div class="relative">
      <input
        id="title"
        class="field {onpick ? 'pr-8' : ''}"
        bind:this={titleInput}
        bind:value={draft.title}
        required
        placeholder="e.g. Frontend Engineer"
      />
      {@render pickButton('title')}
    </div>
  </div>

  <div>
    <label class="label" for="company">Company <span class="text-accent">*</span></label>
    <div class="relative">
      <input
        id="company"
        class="field {onpick ? 'pr-8' : ''}"
        bind:this={companyInput}
        bind:value={draft.company}
        required
        placeholder="e.g. Acme"
      />
      {@render pickButton('company')}
    </div>
    {#if duplicateWarning}<DuplicateWarning
        company={draft.company}
        showApplied={showAppliedWarning}
      />{/if}
  </div>

  <div class="grid grid-cols-[1fr_7.5rem] gap-2">
    <div>
      <label class="label" for="location">Location</label>
      <div class="relative">
        <input
          id="location"
          class="field {onpick ? 'pr-8' : ''}"
          bind:value={draft.location}
          placeholder="City, country"
        />
        {@render pickButton('location')}
      </div>
    </div>
    <div>
      <label class="label" for="workType">Work type</label>
      <select id="workType" class="field" bind:value={draft.workType}>
        <option value="">—</option>
        <option value="remote">Remote</option>
        <option value="hybrid">Hybrid</option>
        <option value="onsite">On-site</option>
      </select>
    </div>
  </div>

  <fieldset>
    <legend class="label flex w-full items-center justify-between">
      Salary
      {@render pickButton('salary', '-my-1')}
    </legend>
    <div class="grid grid-cols-[1fr_1fr_4rem_5.5rem] gap-2">
      <input
        class="field"
        bind:value={draft.salaryMin}
        inputmode="numeric"
        placeholder="Min"
        aria-label="Minimum salary"
      />
      <input
        class="field"
        bind:value={draft.salaryMax}
        inputmode="numeric"
        placeholder="Max"
        aria-label="Maximum salary"
      />
      <input
        class="field uppercase"
        bind:value={draft.currency}
        maxlength="3"
        placeholder="USD"
        aria-label="Currency"
      />
      <select class="field" bind:value={draft.period} aria-label="Salary period">
        <option value="">—</option>
        <option value="year">/ year</option>
        <option value="month">/ month</option>
        <option value="hour">/ hour</option>
      </select>
    </div>
  </fieldset>

  <div>
    <label class="label" for="notes">Notes</label>
    <div class="relative">
      <textarea
        id="notes"
        class="field resize-none {onpick ? 'pr-8' : ''}"
        rows="2"
        bind:value={draft.notes}></textarea>
      {@render pickButton('notes', 'absolute top-1 right-1')}
    </div>
  </div>

  <div class="grid grid-cols-2 gap-2 pt-1 {defaultStatus === 'applied' ? 'grid-cols-1' : ''}">
    <Button
      type="submit"
      variant={defaultStatus === 'applied' ? 'primary' : 'secondary'}
      disabled={!valid || saving}
    >
      {defaultStatus === 'saved' ? 'Save' : `Save as ${prefs.status(defaultStatus)}`}
    </Button>
    {#if defaultStatus !== 'applied'}
      <Button variant="primary" disabled={!valid || saving} onclick={() => onsave('applied')}>
        Mark {prefs.status('applied').toLowerCase()}
      </Button>
    {/if}
  </div>
</form>
