<script lang="ts">
  import type { JobStatus } from '@pocket-career/core';
  import { Button } from '@pocket-career/ui';
  import { onMount } from 'svelte';
  import { type Draft, isDraftValid } from '@/lib/draft';
  import DuplicateWarning from './DuplicateWarning.svelte';

  let {
    draft = $bindable(),
    saving,
    onsave,
  }: {
    draft: Draft;
    saving: boolean;
    onsave: (status: JobStatus) => void;
  } = $props();

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
    if (valid && !saving) onsave('saved');
  }
</script>

<form class="flex flex-col gap-3" onsubmit={submit} novalidate>
  <p class="text-ink-muted truncate text-xs" title={draft.url}>{host}</p>

  <div>
    <label class="label" for="title">Job title <span class="text-accent">*</span></label>
    <input
      id="title"
      class="field"
      bind:this={titleInput}
      bind:value={draft.title}
      required
      placeholder="e.g. Frontend Engineer"
    />
  </div>

  <div>
    <label class="label" for="company">Company <span class="text-accent">*</span></label>
    <input
      id="company"
      class="field"
      bind:this={companyInput}
      bind:value={draft.company}
      required
      placeholder="e.g. Acme"
    />
    <DuplicateWarning company={draft.company} />
  </div>

  <div class="grid grid-cols-[1fr_7.5rem] gap-2">
    <div>
      <label class="label" for="location">Location</label>
      <input id="location" class="field" bind:value={draft.location} placeholder="City, country" />
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
    <legend class="label">Salary</legend>
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
    <textarea id="notes" class="field resize-none" rows="2" bind:value={draft.notes}></textarea>
  </div>

  <div class="grid grid-cols-2 gap-2 pt-1">
    <Button type="submit" variant="secondary" disabled={!valid || saving}>Save</Button>
    <Button variant="primary" disabled={!valid || saving} onclick={() => onsave('applied')}>
      Mark applied
    </Button>
  </div>
</form>
